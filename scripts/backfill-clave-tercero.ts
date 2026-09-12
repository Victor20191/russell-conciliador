/**
 * Backfill de `balance_tercero_detalle.clave_tercero` para los cargues por tercero ya
 * capturados. De aquí en adelante la escribe la propia captura; esto solo alcanza al
 * histórico.
 *
 * Por qué hace falta. `nit_tercero` se guarda SIEMPRE como núcleo de 9 dígitos
 * (`nucleoNit`). Eso funciona para un NIT de empresa —los 9 dígitos más el de
 * verificación—, pero fusiona cédulas de 10 dígitos que solo difieren en el último: en un
 * archivo real de un cliente hay 1.917, y en otro 448. Dos personas distintas caían en el
 * mismo renglón de la conciliación por tercero. `clave_tercero` conserva el documento
 * completo y solo retira el dígito de verificación cuando lo es de verdad
 * (`claveTerceroCanonica`, `src/lib/nit.ts`).
 *
 * Es ADITIVO y idempotente: escribe únicamente la columna nueva, nunca toca saldos,
 * homologaciones ni `nit_tercero`. Se puede volver a correr sin efecto.
 *
 * Uso:
 *   npx tsx scripts/backfill-clave-tercero.ts            # simulación (no escribe)
 *   npx tsx scripts/backfill-clave-tercero.ts --aplicar  # escribe
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { claveTerceroCanonica, nucleoNit } from "../src/lib/nit";

const APLICAR = process.argv.includes("--aplicar");
const LOTE = 5_000;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Identidad = { numeroDocumento?: unknown } | null;

/**
 * El documento MÁS completo disponible para la fila. `identidad_tercero.numeroDocumento`
 * lo conserva íntegro desde que se captura; los cargues anteriores solo tienen el núcleo de
 * 9 de `nit_tercero`, y de ahí no se puede recuperar lo que ya se truncó — esas filas
 * cruzarán por la segunda pasada (por núcleo), marcada como posible colisión.
 */
function documentoDe(fila: { nitTercero: string | null; identidadTercero: unknown }): string | null {
  const identidad = fila.identidadTercero as Identidad;
  const completo = identidad && typeof identidad === "object" ? identidad.numeroDocumento : null;
  if (typeof completo === "string" && completo.trim()) return completo;
  if (typeof completo === "number") return String(completo);
  return fila.nitTercero;
}

async function main() {
  const destino = new URL(process.env.DATABASE_URL ?? "postgres://sin-configurar").hostname;
  console.log(`Destino: ${destino}`);
  console.log(APLICAR ? "Modo: APLICAR (escribe)" : "Modo: simulación (no escribe; usa --aplicar)");

  const total = await prisma.balanceTerceroDetalle.count();
  const yaTienen = await prisma.balanceTerceroDetalle.count({ where: { claveTercero: { not: null } } });
  console.log(`Filas: ${total.toLocaleString("es-CO")} · con clave: ${yaTienen.toLocaleString("es-CO")}`);

  let revisadas = 0;
  let conClave = 0;
  let sinDocumento = 0;
  let difierenDelNucleo = 0; // las que el núcleo de 9 estaba truncando
  let cursor: number | undefined;

  for (;;) {
    const filas = await prisma.balanceTerceroDetalle.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      select: { id: true, nitTercero: true, identidadTercero: true },
      orderBy: { id: "asc" },
      take: LOTE,
    });
    if (filas.length === 0) break;
    cursor = filas[filas.length - 1].id;

    const escrituras: { id: number; clave: string }[] = [];
    for (const fila of filas) {
      revisadas++;
      const documento = documentoDe(fila);
      const clave = claveTerceroCanonica(documento);
      if (!clave) { sinDocumento++; continue; }
      conClave++;
      if (documento && clave !== nucleoNit(documento)) difierenDelNucleo++;
      escrituras.push({ id: fila.id, clave });
    }

    if (APLICAR && escrituras.length > 0) {
      // Una sentencia por lote: `UPDATE ... FROM (VALUES ...)` en vez de N updates.
      const valores = escrituras.map((e) => `(${e.id}, '${e.clave.replace(/'/g, "''")}')`).join(",");
      await prisma.$executeRawUnsafe(
        `UPDATE "balance_tercero_detalle" AS d SET "clave_tercero" = v.clave
         FROM (VALUES ${valores}) AS v(id, clave) WHERE d."id" = v.id`,
      );
    }
    if (revisadas % 50_000 === 0) console.log(`  … ${revisadas.toLocaleString("es-CO")} filas`);
  }

  console.log("");
  console.log(`Revisadas:              ${revisadas.toLocaleString("es-CO")}`);
  console.log(`Con clave:              ${conClave.toLocaleString("es-CO")}`);
  console.log(`Sin documento utilizable:${sinDocumento.toLocaleString("es-CO")} (filas «propias» de cuenta, sin tercero)`);
  console.log(`Clave ≠ núcleo de 9:    ${difierenDelNucleo.toLocaleString("es-CO")} (las que el truncamiento fusionaba)`);
  if (!APLICAR) console.log("\nSimulación: no se escribió nada. Repite con --aplicar.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
