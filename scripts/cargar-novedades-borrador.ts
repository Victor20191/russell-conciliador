// ============================================================
// Carga cambios de Novedades en versiones en BORRADOR, desde un JSON.
//
// Sirve para documentar de una vez lo que se construyó y quedó sin contar en
// /novedades: el reporte de uso solo muestra cambios de versiones PUBLICADAS, y
// una versión en borrador sin cambios no le dice nada a nadie.
//
// Reglas:
//   · NUNCA publica ni toca una versión publicada: eso lo hace un administrador
//     desde /novedades, después de revisar los textos.
//   · Idempotente: un cambio con el mismo título en la misma versión se omite.
//   · El resumen de la versión solo se escribe si estaba vacío.
//   · `crear` en una versión la crea en borrador si no existe (p. ej. una
//     release que quedó en git pero no en la base).
//   · `modulosDeCambiosExistentes` completa el módulo de cambios ya cargados SIN
//     módulo: sin él, el reporte los descarta (no sabe a qué módulo pertenecen).
//
// Ejecutar:
//   npx tsx scripts/cargar-novedades-borrador.ts <archivo.json>             # dry-run
//   npx tsx scripts/cargar-novedades-borrador.ts <archivo.json> --aplicar
// ============================================================

import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MODULOS_PLATAFORMA_KEYS } from "../src/lib/rbac/modulos-plataforma";

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--"));
const ACTOR = "Sistema (script cargar-novedades-borrador)";

const Modulo = z.string().refine((m) => MODULOS_PLATAFORMA_KEYS.has(m), { error: "Módulo desconocido" });
const Entrada = z.object({
  modulosDeCambiosExistentes: z.record(z.string(), z.record(z.string(), Modulo)).default({}),
  versiones: z.array(z.object({
    numero: z.string().min(1),
    crear: z.object({ titulo: z.string().min(1), orden: z.number().int() }).optional(),
    resumen: z.string().min(1).optional(),
    cambios: z.array(z.object({
      tipo: z.enum(["nueva", "mejora", "correccion", "seguridad"]),
      titulo: z.string().min(1).max(180),
      descripcion: z.string().min(1),
      modulo: Modulo,
      ruta: z.string().startsWith("/").optional(),
      comoOperar: z.string().optional(),
      ejemplo: z.string().optional(),
    })),
  })),
});

// Sin `-c timezone`: la sesión hereda la zona de la base, como la aplicación.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  if (!ARCHIVO) throw new Error("Indica el archivo JSON con los cambios.");
  const datos = Entrada.parse(JSON.parse(readFileSync(ARCHIVO, "utf8")));
  console.log(`Base de datos: ${new URL(process.env.DATABASE_URL!).hostname} · ${APLICAR ? "APLICAR" : "dry-run"}\n`);

  let creados = 0;
  let omitidos = 0;
  let modulos = 0;
  const lineas: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [numero, porTitulo] of Object.entries(datos.modulosDeCambiosExistentes)) {
      const version = await tx.platformVersion.findUnique({ where: { number: numero }, include: { changes: true } });
      if (!version) throw new Error(`No existe la versión ${numero}.`);
      if (version.status !== "borrador") throw new Error(`La versión ${numero} está ${version.status}: no se toca.`);
      for (const [titulo, modulo] of Object.entries(porTitulo)) {
        const cambio = version.changes.find((c) => c.title === titulo);
        if (!cambio) throw new Error(`${numero}: no existe el cambio «${titulo}».`);
        if (cambio.moduleKey) continue;
        modulos += 1;
        if (APLICAR) await tx.versionChange.update({ where: { id: cambio.id }, data: { moduleKey: modulo } });
      }
    }

    for (const v of datos.versiones) {
      let version = await tx.platformVersion.findUnique({ where: { number: v.numero }, include: { changes: true } });
      if (!version) {
        if (!v.crear) throw new Error(`No existe la versión ${v.numero} y no se indicó «crear».`);
        lineas.push(`${v.numero}: se CREA en borrador · ${v.crear.titulo}`);
        if (APLICAR) {
          version = await tx.platformVersion.create({
            data: { number: v.numero, title: v.crear.titulo, status: "borrador", order: v.crear.orden },
            include: { changes: true },
          });
        }
      } else if (version.status !== "borrador") {
        throw new Error(`La versión ${v.numero} está ${version.status}: no se toca.`);
      }

      const existentes = new Set((version?.changes ?? []).map((c) => c.title));
      let orden = Math.max(0, ...(version?.changes ?? []).map((c) => c.order));
      const nuevos = v.cambios.filter((c) => !existentes.has(c.titulo));
      omitidos += v.cambios.length - nuevos.length;
      creados += nuevos.length;
      lineas.push(`${v.numero}: ${nuevos.length} cambio(s) nuevos · ${v.cambios.length - nuevos.length} ya estaban`);

      if (!APLICAR || !version) continue;
      if (v.resumen && !version.summary?.trim()) {
        await tx.platformVersion.update({ where: { id: version.id }, data: { summary: v.resumen } });
      }
      for (const c of nuevos) {
        orden += 10;
        await tx.versionChange.create({
          data: {
            versionId: version.id, type: c.tipo, title: c.titulo, description: c.descripcion,
            moduleKey: c.modulo, route: c.ruta ?? null, howTo: c.comoOperar ?? null, example: c.ejemplo ?? null,
            featureStatus: "disponible", order: orden,
          },
        });
      }
    }

    if (APLICAR && creados + modulos > 0) {
      await tx.auditEntry.create({
        data: {
          user: ACTOR, action: "CARGÓ NOVEDADES EN BORRADOR", entity: "versiones_plataforma",
          detail: `${creados} cambio(s) en ${datos.versiones.length} versión(es) en borrador; módulo completado en ${modulos} cambio(s). Nada se publicó.`,
        },
      });
    }
  }, { timeout: 120_000 });

  console.log(lineas.join("\n"));
  console.log(`\nCambios ${APLICAR ? "creados" : "por crear"}: ${creados} · ya existentes: ${omitidos} · módulos completados: ${modulos}`);
  console.log(APLICAR ? "✔ Cargado en borrador. Publica cada versión desde /novedades." : "Nada se escribió: usa --aplicar.");
}

main()
  .catch((e) => {
    console.error("✖", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
