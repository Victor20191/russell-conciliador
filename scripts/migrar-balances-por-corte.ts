// ============================================================
// Balances por fecha de corte (18/Oct/2026): deja los datos como exige la regla nueva.
//
//  1. Un balance solo queda CERRADO si es la versión vigente de su línea (texto del período +
//     apertura) y todos los vigentes de su corte coinciden con él en saldos finales. Se ABREN:
//      (a) los cerrados vigentes con diferencias de saldo final contra otro vigente del corte;
//      (b) las versiones anteriores que siguen cerradas («no debe haber versiones viejas cerradas»).
//     Un balance que es la base de una conciliación de módulo EN FIRME no se toca: se reporta para
//     que un senior lo resuelva (reemplazarlo o desbloquear la conciliación).
//  2. Se recalculan las comparaciones de todos los cortes con dos o más vigentes
//     (`balance_comparacion_corte`), así el listado y los paneles no quedan «Sin comparar».
//
// Abrir es lo mismo que «Abrir balance»: baja la bandera, deja el estado «En proceso» (con alertas
// si su validación las tiene hoy) y registra quién y por qué. No toca `es_oficial` (sin uso).
//
// Orden: migración 20261019120000 → despliegue del código → este script.
//
//   npx tsx scripts/migrar-balances-por-corte.ts                 # simulación (solo lectura)
//   npx tsx scripts/migrar-balances-por-corte.ts --aplicar       # ejecuta, con snapshot
//   npx tsx scripts/migrar-balances-por-corte.ts --revertir scripts/.snapshots/<archivo>.json
// ============================================================
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { tomarCandadoTransaccion } from "../src/lib/candados";
import { agruparPorCorte, fechaCorteISO, lineasDelCorte, nombreLinea, paresEsperados } from "../src/lib/balance/corte";
import { compararSaldosFinales } from "../src/lib/balance/comparacion-corte";
import { recalcularComparacionesDelCorteEn, saldosFinalesDe } from "../src/lib/balance/comparacion-corte-datos";
import { reconstruirBalance } from "../src/lib/balance/calcular";
import { estadoEnProceso } from "../src/lib/balance/estado-balance";
import { UMBRALES_ALERTAS_DEFECTO, UMBRALES_CATALOGO, type UmbralesAlertas } from "../src/lib/balance/umbrales-alertas";
import { ESTADO_CIERRE_FIRME } from "../src/lib/conciliacion/cuentas-bloqueo";

const APLICAR = process.argv.includes("--aplicar");
const HAY_REVERTIR = process.argv.includes("--revertir");
const RUTA_REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];
const ACTOR = "Sistema · migración 18/Oct/2026";
const MOTIVO_INCONSISTENTE = "Inconsistente con otro balance del corte (migración 18/Oct/2026)";
const motivoAnterior = (vigente: string) => `Versión anterior; la vigente es ${vigente} (migración 18/Oct/2026)`;

type Db = Prisma.TransactionClient | typeof prisma;

const SELECT = {
  id: true, clienteId: true, nombreCliente: true, periodo: true, periodoFin: true, aperturaBalance: true,
  creadoEn: true, estaCongelado: true, version: true, estado: true,
  congeladoPor: true, congeladoEn: true, descongeladoPor: true, descongeladoPorId: true, descongeladoEn: true, motivoDescongelado: true,
} as const;
type Encabezado = Prisma.BalancePruebaEncabezadoGetPayload<{ select: typeof SELECT }>;

type AAbrir = { balance: Encabezado; motivo: string; detalle: string };
type Analisis = {
  cortes: number;
  cortesAComparar: { clienteId: number; periodoFin: Date }[];
  pares: { corte: string; a: Encabezado; b: Encabezado; cuentas: number }[];
  abrir: AAbrir[];
  /** Cerrados que habría que abrir pero son la base de una conciliación en firme. */
  bloqueados: (AAbrir & { cierres: string[] })[];
};

const nombre = (b: Encabezado) => `#${b.id} ${b.nombreCliente} · ${nombreLinea(b)} ${b.version}`;

async function analizar(db: Db): Promise<Analisis> {
  const encabezados = await db.balancePruebaEncabezado.findMany({ select: SELECT, orderBy: { id: "asc" } });
  const cierres = await db.conciliacionModuloCierre.findMany({
    where: { estado: ESTADO_CIERRE_FIRME },
    select: { balanceEncabezadoId: true, moduloCodigo: true, periodo: true },
  });
  const cierresDe = new Map<number, string[]>();
  for (const c of cierres) cierresDe.set(c.balanceEncabezadoId, [...(cierresDe.get(c.balanceEncabezadoId) ?? []), `${c.moduloCodigo} · ${c.periodo}`]);

  const grupos = [...agruparPorCorte(encabezados).values()];
  const analisis: Analisis = { cortes: grupos.length, cortesAComparar: [], pares: [], abrir: [], bloqueados: [] };
  const motivos = new Map<number, AAbrir>();

  for (const delCorte of grupos) {
    const lineas = lineasDelCorte(delCorte);
    const vigentes = lineas.map((l) => l.vigente);
    const corte = `${delCorte[0].nombreCliente} · ${fechaCorteISO(delCorte[0].periodoFin)}`;
    // (b) Versiones anteriores que siguen cerradas.
    for (const l of lineas) {
      for (const v of l.versiones) {
        if (v.id !== l.vigente.id && v.estaCongelado) {
          motivos.set(v.id, { balance: v, motivo: motivoAnterior(l.vigente.version), detalle: `versión anterior (la vigente es ${l.vigente.version})` });
        }
      }
    }
    if (vigentes.length < 2) continue;
    analisis.cortesAComparar.push({ clienteId: delCorte[0].clienteId, periodoFin: delCorte[0].periodoFin });
    // (a) Pares de vigentes con diferencias: se abren los cerrados de cada par.
    const saldos = await saldosFinalesDe(db, vigentes.map((v) => v.id));
    const porId = new Map(vigentes.map((v) => [v.id, v]));
    for (const par of paresEsperados(vigentes)) {
      const r = compararSaldosFinales(saldos.get(par.balanceAId) ?? [], saldos.get(par.balanceBId) ?? []);
      if (r.coincide) continue;
      const a = porId.get(par.balanceAId)!;
      const b = porId.get(par.balanceBId)!;
      analisis.pares.push({ corte, a, b, cuentas: r.diferencias.length });
      for (const [este, otro] of [[a, b], [b, a]] as const) {
        if (!este.estaCongelado || motivos.has(este.id)) continue;
        motivos.set(este.id, { balance: este, motivo: MOTIVO_INCONSISTENTE, detalle: `difiere en ${r.diferencias.length} cuenta(s) de ${nombreLinea(otro)} ${otro.version} (#${otro.id})` });
      }
    }
  }
  for (const m of [...motivos.values()].sort((x, y) => x.balance.id - y.balance.id)) {
    const enFirme = cierresDe.get(m.balance.id);
    if (enFirme) analisis.bloqueados.push({ ...m, cierres: enFirme });
    else analisis.abrir.push(m);
  }
  return analisis;
}

function imprimir(a: Analisis) {
  console.log(`\nCortes: ${a.cortes} · con dos o más balances vigentes (se comparan): ${a.cortesAComparar.length}`);
  console.log(`Pares de vigentes con saldos finales distintos: ${a.pares.length}`);
  for (const p of a.pares) console.log(`  ${p.corte}: ${nombreLinea(p.a)} ${p.a.version} (#${p.a.id}${p.a.estaCongelado ? ", cerrado" : ""}) ≠ ${nombreLinea(p.b)} ${p.b.version} (#${p.b.id}${p.b.estaCongelado ? ", cerrado" : ""}) · ${p.cuentas} cuenta(s)`);
  console.log(`\nBalances que se ABREN: ${a.abrir.length}`);
  for (const m of a.abrir) console.log(`  ${nombre(m.balance)} · ${m.detalle}`);
  console.log(`\nNo se tocan (base de una conciliación en firme): ${a.bloqueados.length}`);
  for (const m of a.bloqueados) console.log(`  ${nombre(m.balance)} · ${m.detalle} · en firme: ${m.cierres.join(", ")}`);
}

/** Plan estándar y umbrales leídos sin la caché de Next (el script corre fuera de la app). */
async function insumosAlertas(db: Db): Promise<{ plan: { code: string; name: string; nature: string; critical: boolean }[]; umbrales: UmbralesAlertas }> {
  const [plan, filas] = await Promise.all([
    db.standardAccount.findMany({ select: { code: true, name: true, nature: true, critical: true } }),
    db.umbralAlerta.findMany({ select: { clave: true, valor: true } }),
  ]);
  const umbrales: UmbralesAlertas = { ...UMBRALES_ALERTAS_DEFECTO };
  for (const def of UMBRALES_CATALOGO) {
    const valor = Number(filas.find((f) => f.clave === def.clave)?.valor);
    if (Number.isFinite(valor) && valor >= 0) umbrales[def.clave] = valor;
  }
  return { plan, umbrales };
}

async function alertasDe(db: Db, balanceId: number, insumos: Awaited<ReturnType<typeof insumosAlertas>>): Promise<number> {
  const detalle = await db.balancePruebaDetalle.findMany({
    where: { encabezadoId: balanceId },
    select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
  });
  return reconstruirBalance(
    detalle.map((f) => ({
      cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    })),
    insumos.plan,
    insumos.umbrales,
  ).validations.filter((v) => v.status === "warn").length;
}

type Snapshot = {
  creadoEn: string;
  abiertos: Pick<Encabezado, "id" | "estado" | "congeladoPor" | "congeladoEn" | "descongeladoPor" | "descongeladoPorId" | "descongeladoEn" | "motivoDescongelado">[];
};

async function aplicar() {
  const previo = await analizar(prisma);
  const resultado = await prisma.$transaction(async (tx) => {
    // Mismos candados, en el mismo orden, que «Abrir balance»; el del corte lo toma el recálculo.
    await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
    const periodos = [...new Set(previo.abrir.map((m) => `balance-oficial:${m.balance.clienteId}:${m.balance.periodo}`))].sort();
    for (const recurso of periodos) await tomarCandadoTransaccion(tx, recurso);
    const analisis = await analizar(tx);
    const ids = (a: Analisis) => a.abrir.map((m) => m.balance.id).join(",");
    if (ids(analisis) !== ids(previo)) throw new Error("Los balances cambiaron mientras se preparaba la migración: vuelve a correrla.");

    const snapshot: Snapshot = {
      creadoEn: new Date().toISOString(),
      abiertos: analisis.abrir.map(({ balance: b }) => ({
        id: b.id, estado: b.estado, congeladoPor: b.congeladoPor, congeladoEn: b.congeladoEn,
        descongeladoPor: b.descongeladoPor, descongeladoPorId: b.descongeladoPorId, descongeladoEn: b.descongeladoEn, motivoDescongelado: b.motivoDescongelado,
      })),
    };
    mkdirSync("scripts/.snapshots", { recursive: true });
    const ruta = `scripts/.snapshots/balances-por-corte-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json`;
    writeFileSync(ruta, JSON.stringify(snapshot, null, 1));

    const insumos = await insumosAlertas(tx);
    const ahora = new Date();
    for (const m of analisis.abrir) {
      const alertas = await alertasDe(tx, m.balance.id, insumos);
      await tx.balancePruebaEncabezado.update({
        where: { id: m.balance.id },
        data: {
          estaCongelado: false,
          estado: estadoEnProceso(alertas),
          descongeladoPor: ACTOR,
          descongeladoPorId: null,
          descongeladoEn: ahora,
          motivoDescongelado: m.motivo,
        },
      });
      await tx.auditEntry.create({
        data: {
          user: ACTOR,
          action: "ABRIÓ BALANCE",
          entity: `${m.balance.nombreCliente} · ${m.balance.periodo}`,
          detail: `Versión ${m.balance.version} · corte ${fechaCorteISO(m.balance.periodoFin)} · ${m.detalle} · Justificación: ${m.motivo} · snapshot ${ruta}`,
          clientId: m.balance.clienteId,
        },
      });
    }
    let pares = 0;
    for (const c of analisis.cortesAComparar) pares += (await recalcularComparacionesDelCorteEn(tx, c.clienteId, c.periodoFin)).pares;
    return { ruta, abiertos: analisis.abrir.length, pares };
  }, { timeout: 600_000, maxWait: 60_000 });
  console.log(`\nAPLICADO: ${resultado.abiertos} balance(s) abiertos · ${resultado.pares} comparación(es) guardadas. Snapshot: ${resultado.ruta}`);
}

async function revertir(ruta: string) {
  const snap = JSON.parse(readFileSync(ruta, "utf8")) as Snapshot;
  await prisma.$transaction(async (tx) => {
    await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
    for (const b of snap.abiertos) {
      // Solo si sigue abierto por esta migración (nadie lo cerró ni lo volvió a abrir después).
      const actual = await tx.balancePruebaEncabezado.findUnique({ where: { id: b.id }, select: { estaCongelado: true, descongeladoPor: true } });
      if (!actual || actual.estaCongelado || actual.descongeladoPor !== ACTOR) {
        console.log(`  #${b.id}: se omite (ya no está abierto por la migración)`);
        continue;
      }
      await tx.balancePruebaEncabezado.update({
        where: { id: b.id },
        data: {
          estaCongelado: true, estado: b.estado, congeladoPor: b.congeladoPor, congeladoEn: b.congeladoEn ? new Date(b.congeladoEn) : null,
          descongeladoPor: b.descongeladoPor, descongeladoPorId: b.descongeladoPorId, descongeladoEn: b.descongeladoEn ? new Date(b.descongeladoEn) : null, motivoDescongelado: b.motivoDescongelado,
        },
      });
    }
    await tx.auditEntry.create({ data: { user: ACTOR, action: "REVIRTIÓ MIGRACIÓN DE BALANCES POR CORTE", entity: "Balances", detail: `snapshot ${ruta}` } });
  }, { timeout: 600_000, maxWait: 60_000 });
  console.log("Revertido. Las comparaciones del corte se recalculan con la próxima mutación o con «Revisar comparación».");
}

(async () => {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${HAY_REVERTIR ? "REVERTIR" : APLICAR ? "APLICAR" : "simulación"}`);
  if (HAY_REVERTIR) { await revertir(RUTA_REVERTIR); return; }
  imprimir(await analizar(prisma));
  if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Corre con --aplicar para ejecutar."); return; }
  await aplicar();
})()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
