// ============================================================
// ESTADO de los balances abiertos con la regla del 20/Oct/2026.
//
// «En proceso con alertas» ya no se fija al cargar con cualquier validación en alerta (variaciones
// > 25% incluidas, que casi todo balance tiene): lo deciden las alertas PENDIENTES —saldos contrarios
// a la naturaleza sin «Dar OK» y cuentas sin mapeo— y se recalcula tras cada cambio
// (`src/lib/balance/alertas-balance-datos.ts`). Este script pone al día la columna `estado` de los
// balances abiertos que ya existían; el índice de /balance la lee. Los cerrados no se tocan.
//
// Orden: despliegue del código → este script (antes el índice sigue mostrando el estado viejo; el
// detalle de cada balance ya lo calcula al leer).
//
//   npx tsx scripts/recalcular-estado-balances.ts                 # simulación (solo lectura)
//   npx tsx scripts/recalcular-estado-balances.ts --aplicar       # escribe, con snapshot
//   npx tsx scripts/recalcular-estado-balances.ts --revertir scripts/.snapshots/<archivo>.json
//
// `.env` apunta a PRODUCCIÓN.
// ============================================================
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import { idsBalancesAbiertos, recalcularEstadoBalances, type ContextoAlertas } from "../src/lib/balance/alertas-balance-datos";
import { ESTADO_EN_PROCESO, ESTADO_EN_PROCESO_CON_ALERTAS } from "../src/lib/balance/estado-balance";
import { UMBRALES_ALERTAS_DEFECTO, UMBRALES_CATALOGO, type UmbralesAlertas } from "../src/lib/balance/umbrales-alertas";

const APLICAR = process.argv.includes("--aplicar");
const HAY_REVERTIR = process.argv.includes("--revertir");
const RUTA_REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];
const ACTOR = "Sistema · estado de balances 20/Oct/2026";

type Snapshot = { creadoEn: string; estados: { id: number; estado: string }[] };

/** Plan estándar y umbrales leídos sin la caché de Next (el script corre fuera de la app). */
async function contexto(): Promise<ContextoAlertas> {
  const [cuentasEstandar, filas] = await Promise.all([
    prisma.standardAccount.findMany({ select: { code: true, name: true, nature: true, critical: true } }),
    prisma.umbralAlerta.findMany({ select: { clave: true, valor: true } }),
  ]);
  const umbrales: UmbralesAlertas = { ...UMBRALES_ALERTAS_DEFECTO };
  for (const def of UMBRALES_CATALOGO) {
    const valor = Number(filas.find((f) => f.clave === def.clave)?.valor);
    if (Number.isFinite(valor) && valor >= 0) umbrales[def.clave] = valor;
  }
  return { cuentasEstandar, umbrales };
}

async function revertir(ruta: string) {
  const snap = JSON.parse(readFileSync(ruta, "utf8")) as Snapshot;
  await prisma.$transaction(async (tx) => {
    for (const e of snap.estados) {
      await tx.balancePruebaEncabezado.updateMany({ where: { id: e.id, estaCongelado: false }, data: { estado: e.estado } });
    }
    await tx.auditEntry.create({ data: { user: ACTOR, action: "REVIRTIÓ ESTADO DE BALANCES", entity: "Balances", detail: `${snap.estados.length} balance(s) · snapshot ${ruta}` } });
  });
  console.log(`Revertidos ${snap.estados.length} balance(s) desde ${ruta}.`);
}

(async () => {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${HAY_REVERTIR ? "REVERTIR" : APLICAR ? "APLICAR" : "simulación"}`);
  if (HAY_REVERTIR) { await revertir(RUTA_REVERTIR); return; }

  const ctx = await contexto();
  const ids = await idsBalancesAbiertos(prisma);
  const antes = await prisma.balancePruebaEncabezado.findMany({ where: { id: { in: ids } }, select: { id: true, estado: true } });
  const { conAlertas, enProceso } = await recalcularEstadoBalances(prisma, ids, ctx, { aplicar: false });
  const estadoAntes = new Map(antes.map((b) => [b.id, b.estado]));
  const cambian = [
    ...conAlertas.filter((id) => estadoAntes.get(id) !== ESTADO_EN_PROCESO_CON_ALERTAS),
    ...enProceso.filter((id) => estadoAntes.get(id) !== ESTADO_EN_PROCESO),
  ];
  console.log(`Umbral de saldos contrarios: ${ctx.umbrales.naturaleza}`);
  console.log(`Abiertos: ${ids.length} · quedan «${ESTADO_EN_PROCESO_CON_ALERTAS}»: ${conAlertas.length} · «${ESTADO_EN_PROCESO}»: ${enProceso.length} · cambian: ${cambian.length}`);
  if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Corre con --aplicar para ejecutar."); return; }

  const snapshot: Snapshot = { creadoEn: new Date().toISOString(), estados: antes.filter((b) => cambian.includes(b.id)) };
  mkdirSync("scripts/.snapshots", { recursive: true });
  const ruta = `scripts/.snapshots/estado-balances-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json`;
  writeFileSync(ruta, JSON.stringify(snapshot, null, 1));
  await prisma.$transaction(async (tx) => {
    await recalcularEstadoBalances(tx, ids, ctx);
    await tx.auditEntry.create({ data: { user: ACTOR, action: "RECALCULÓ ESTADO DE BALANCES", entity: "Balances", detail: `${conAlertas.length} con alertas · ${enProceso.length} en proceso · ${cambian.length} cambiaron · snapshot ${ruta}` } });
  }, { timeout: 120_000 });
  console.log(`Aplicado. Snapshot: ${ruta}`);
})()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
