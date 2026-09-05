// ============================================================
// Purga de filas «fantasma» de `cuentas_cliente`: pies de archivo sin código.
//
// En cargues de julio de 2026 (antes de `reclasificarNoImputables`,
// src/lib/balance/extraccion/transformar.ts) el pie del archivo («Total general»,
// «Totales», «Procesado en: …») entraba al detalle como movimiento con código
// VACÍO y el volcado del PUC lo escribía en `cuentas_cliente` como una cuenta
// más (código "", nivel 2, sin estándar). El volcado nunca borra filas viejas,
// así que quedaron para siempre: 10 clientes al 4-sep-2026. Son inertes para la
// homologación pero aparecen como «N0» en /config/mapeo e inflan los contadores.
//
// Borra SOLO filas cuyo código no es numérico (`esCodigoCuentaCliente`) Y que no
// tienen estándar ni opción de conciliación: nada que alguien haya parametrizado.
// El detalle de balances viejos con el mismo defecto se LISTA pero no se toca.
//
// Ejecutar:
//   npm run db:purgar:cuentas-sin-codigo                # dry-run (no escribe)
//   npm run db:purgar:cuentas-sin-codigo -- --aplicar   # borra + snapshot + bitácora
//   npm run db:purgar:cuentas-sin-codigo -- --revertir scripts/.snapshots/cuentas-sin-codigo-<ts>.json
// ============================================================

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { esCodigoCuentaCliente } from "../src/lib/balance/mapeo-cliente-config";

const APLICAR = process.argv.includes("--aplicar");
const HAY_REVERTIR = process.argv.includes("--revertir");
const REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type FilaSnapshot = {
  id: number; clientName: string; clienteId: number | null; nit: string | null; code: string; level: number; name: string;
  order: number; cuenta6Russell: string | null; coincidencia: number | null; origenMapeo: string | null;
  actualizadoPor: string | null; actualizadoEn: string | null;
};
type Snapshot = { creadoEn: string; filas: FilaSnapshot[] };

async function revertir(ruta: string) {
  const snap = JSON.parse(readFileSync(ruta, "utf8")) as Snapshot;
  console.log(`↩️  Revirtiendo ${ruta} (${snap.filas.length} fila(s))`);
  await prisma.$transaction(async (tx) => {
    for (const f of snap.filas) {
      await tx.clientAccount.create({
        data: {
          id: f.id, clientName: f.clientName, clienteId: f.clienteId, nit: f.nit, code: f.code, level: f.level, name: f.name,
          order: f.order, cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia, origenMapeo: f.origenMapeo,
          actualizadoPor: f.actualizadoPor, actualizadoEn: f.actualizadoEn ? new Date(f.actualizadoEn) : null,
        },
      });
    }
    await tx.auditEntry.create({
      data: { user: "Sistema (script purgar-cuentas-cliente-sin-codigo)", action: "REVIRTIÓ PURGA CUENTAS SIN CÓDIGO", entity: "cuentas_cliente", detail: `Snapshot ${ruta} · ${snap.filas.length} fila(s) restaurada(s)` },
    });
  });
  console.log("✔ Revertido.");
}

async function main() {
  if (HAY_REVERTIR) {
    if (!REVERTIR) throw new Error("Falta la ruta del snapshot tras --revertir.");
    await revertir(REVERTIR);
    return;
  }
  console.log(`🧹 Purga de cuentas_cliente sin código ${APLICAR ? "(APLICANDO)" : "(dry-run: usa --aplicar para ejecutar)"}\n`);

  // Prisma no filtra por regex: se traen todas las filas y se decide con la misma
  // guarda que usa el volcado del PUC.
  const todas = await prisma.clientAccount.findMany({
    select: { id: true, clientName: true, clienteId: true, nit: true, code: true, level: true, name: true, order: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, russellOptionId: true, actualizadoPor: true, actualizadoEn: true },
  });
  const invalidas = todas.filter((f) => !esCodigoCuentaCliente(f.code));
  const borrables = invalidas.filter((f) => !f.cuenta6Russell && f.russellOptionId == null);
  const protegidas = invalidas.filter((f) => !borrables.includes(f));

  console.log(`  ${todas.length} fila(s) en cuentas_cliente · ${invalidas.length} con código no numérico · ${borrables.length} borrable(s)`);
  for (const f of borrables) {
    console.log(`  - #${f.id} cliente ${f.clienteId} ${f.clientName} · código "${f.code}" · nivel ${f.level} · «${f.name}» · ${f.origenMapeo ?? "—"} · ${f.actualizadoPor ?? "—"} ${f.actualizadoEn?.toISOString().slice(0, 10) ?? ""}`);
  }
  if (protegidas.length > 0) {
    console.log(`\n  ⚠ ${protegidas.length} fila(s) con código no numérico PERO con estándar u opción de conciliación: NO se tocan.`);
    for (const f of protegidas) console.log(`  - #${f.id} cliente ${f.clienteId} · "${f.code}" · «${f.name}» · std ${f.cuenta6Russell ?? "—"} · opción ${f.russellOptionId ?? "—"}`);
  }

  // Solo informativo: el detalle de cargues viejos con el mismo defecto.
  const detalle = await prisma.$queryRaw<{ encabezado_id: number; nombre_cliente: string; periodo: string; version: string; es_oficial: boolean; filas: number }[]>`
    select e.id as encabezado_id, e.nombre_cliente, e.periodo, e.version, e.es_oficial, count(*)::int as filas
    from balance_prueba_detalle d join balance_prueba_encabezado e on e.id = d.encabezado_id
    where d.cuenta_8 !~ '^[0-9]+$' group by e.id, e.nombre_cliente, e.periodo, e.version, e.es_oficial order by e.id`;
  if (detalle.length > 0) {
    console.log(`\n  ℹ ${detalle.length} cargue(s) viejo(s) conservan filas de detalle sin código (no se tocan):`);
    for (const d of detalle) console.log(`  - balance #${d.encabezado_id} ${d.nombre_cliente} · ${d.periodo} ${d.version}${d.es_oficial ? " (oficial)" : ""} · ${d.filas} fila(s)`);
  }

  if (!APLICAR || borrables.length === 0) {
    console.log(borrables.length === 0 ? "\n  Nada que borrar." : "\n  Dry-run: no se escribió nada.");
    return;
  }

  mkdirSync("scripts/.snapshots", { recursive: true });
  const ruta = `scripts/.snapshots/cuentas-sin-codigo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const snapshot: Snapshot = {
    creadoEn: new Date().toISOString(),
    filas: borrables.map((f) => ({
      id: f.id, clientName: f.clientName, clienteId: f.clienteId, nit: f.nit, code: f.code, level: f.level, name: f.name, order: f.order,
      cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia == null ? null : Number(f.coincidencia), origenMapeo: f.origenMapeo,
      actualizadoPor: f.actualizadoPor, actualizadoEn: f.actualizadoEn?.toISOString() ?? null,
    })),
  };
  writeFileSync(ruta, JSON.stringify(snapshot, null, 2));
  console.log(`\n  💾 Snapshot para revertir: ${ruta}`);

  const ids = borrables.map((f) => f.id);
  await prisma.$transaction(async (tx) => {
    const res = await tx.clientAccount.deleteMany({ where: { id: { in: ids } } });
    await tx.auditEntry.create({
      data: {
        user: "Sistema (script purgar-cuentas-cliente-sin-codigo)",
        action: "PURGÓ CUENTAS SIN CÓDIGO",
        entity: "cuentas_cliente",
        detail: `${res.count} fila(s) con código no numérico borradas (${borrables.map((f) => `#${f.id} cliente ${f.clienteId} «${f.name}»`).join(", ")}) · snapshot ${ruta}`,
      },
    });
    console.log(`\n✔ Borradas ${res.count} fila(s).`);
  });
}

main()
  .catch((e) => { console.error("✖", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
