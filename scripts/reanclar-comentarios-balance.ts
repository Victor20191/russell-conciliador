// ============================================================
// CONVERSACIONES POR NIVEL en los balances cargados (20/Oct/2026).
//
// La conversación de una fila del detalle se anclaba por su código, así que la subcuenta Russell
// 110505 y la cuenta del cliente 110505 compartían hilo. Desde el 20/Oct/2026 cada agrupadora tiene
// el suyo (`n2:11`, `n4:1105`, `n6:110505`, `anclaConversacion` en `alertas-naturaleza.ts`) y la
// cuenta del cliente conserva su código. Este script mueve los comentarios que ya existían:
//  - un ancla que es el código de una cuenta del cliente del balance SE QUEDA (decisión del usuario:
//    lo compartido queda en la cuenta del cliente, que es donde se dan los OK);
//  - un ancla que solo coincide con una agrupadora del árbol (`agruparJerarquia`) pasa a la suya;
//  - el resto (la conversación general, una cuenta que ya no está) no se toca.
// Las validaciones viejas de tipo «saldo_contrario» quedan en la BD sin efecto; sus comentarios se
// mueven con la misma regla.
//
// Orden: despliegue del código → este script (antes, las agrupadoras muestran su hilo vacío).
//
//   npx tsx scripts/reanclar-comentarios-balance.ts                 # simulación (solo lectura)
//   npx tsx scripts/reanclar-comentarios-balance.ts --aplicar       # escribe, con snapshot
//   npx tsx scripts/reanclar-comentarios-balance.ts --revertir scripts/.snapshots/<archivo>.json
//
// `.env` apunta a PRODUCCIÓN.
// ============================================================
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import { agruparJerarquia, type NodoBalance } from "../src/lib/balance/calcular";
import { anclaReubicada } from "../src/lib/balance/alertas-naturaleza";

const APLICAR = process.argv.includes("--aplicar");
const HAY_REVERTIR = process.argv.includes("--revertir");
const RUTA_REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];
const ACTOR = "Sistema · conversaciones por nivel 20/Oct/2026";

type Movimiento = { id: number; balanceId: number; antes: string; despues: string };
type Snapshot = { creadoEn: string; movimientos: Movimiento[] };

async function analizar(): Promise<Movimiento[]> {
  const plan = await prisma.standardAccount.findMany({ select: { code: true, name: true, nature: true, critical: true } });
  const comentarios = await prisma.comment.findMany({
    where: { entityType: "balance", anchor: { not: null } },
    select: { id: true, entityId: true, anchor: true },
  });
  const porBalance = new Map<number, { id: number; anchor: string }[]>();
  for (const c of comentarios) (porBalance.get(c.entityId) ?? porBalance.set(c.entityId, []).get(c.entityId)!).push({ id: c.id, anchor: c.anchor! });

  const movimientos: Movimiento[] = [];
  for (const [balanceId, lista] of porBalance) {
    const filas = await prisma.balancePruebaDetalle.findMany({
      where: { encabezadoId: balanceId },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
    });
    const arbol = agruparJerarquia(
      filas.map((f) => ({ ...f, saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal) })),
      plan,
      new Map(),
    );
    const agrupadoras: Pick<NodoBalance, "nivel" | "code">[] = [];
    const walk = (n: NodoBalance) => { if (n.nivel !== 8) { agrupadoras.push(n); n.hijos.forEach(walk); } };
    arbol.forEach(walk);
    const cuentasCliente = new Set(filas.map((f) => f.cuenta8));
    for (const c of lista) {
      const despues = anclaReubicada(c.anchor, cuentasCliente, agrupadoras);
      if (despues !== c.anchor) movimientos.push({ id: c.id, balanceId, antes: c.anchor, despues });
    }
  }
  return movimientos;
}

async function escribir(movimientos: Movimiento[], campo: "antes" | "despues") {
  const porAncla = new Map<string, number[]>();
  for (const m of movimientos) (porAncla.get(m[campo]) ?? porAncla.set(m[campo], []).get(m[campo])!).push(m.id);
  await prisma.$transaction(async (tx) => {
    for (const [anchor, ids] of porAncla) {
      await tx.comment.updateMany({ where: { id: { in: ids }, entityType: "balance" }, data: { anchor } });
    }
  }, { timeout: 120_000 });
}

(async () => {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${HAY_REVERTIR ? "REVERTIR" : APLICAR ? "APLICAR" : "simulación"}`);
  if (HAY_REVERTIR) {
    const snap = JSON.parse(readFileSync(RUTA_REVERTIR, "utf8")) as Snapshot;
    await escribir(snap.movimientos, "antes");
    await prisma.auditEntry.create({ data: { user: ACTOR, action: "REVIRTIÓ CONVERSACIONES POR NIVEL", entity: "Balances", detail: `${snap.movimientos.length} comentario(s) · snapshot ${RUTA_REVERTIR}` } });
    console.log(`Revertidos ${snap.movimientos.length} comentario(s).`);
    return;
  }

  const movimientos = await analizar();
  const balances = new Set(movimientos.map((m) => m.balanceId));
  const porNivel = (n: string) => movimientos.filter((m) => m.despues.startsWith(`${n}:`)).length;
  console.log(`Comentarios a mover: ${movimientos.length} en ${balances.size} balance(s) · a grupo ${porNivel("n2")} · a cuenta ${porNivel("n4")} · a subcuenta ${porNivel("n6")}`);
  for (const m of movimientos.slice(0, 10)) console.log(`  balance ${m.balanceId} · comentario ${m.id}: ${m.antes} → ${m.despues}`);
  if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Corre con --aplicar para ejecutar."); return; }

  const snapshot: Snapshot = { creadoEn: new Date().toISOString(), movimientos };
  mkdirSync("scripts/.snapshots", { recursive: true });
  const ruta = `scripts/.snapshots/conversaciones-por-nivel-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json`;
  writeFileSync(ruta, JSON.stringify(snapshot, null, 1));
  await escribir(movimientos, "despues");
  await prisma.auditEntry.create({ data: { user: ACTOR, action: "MOVIÓ CONVERSACIONES POR NIVEL", entity: "Balances", detail: `${movimientos.length} comentario(s) en ${balances.size} balance(s) · snapshot ${ruta}` } });
  console.log(`Aplicado. Snapshot: ${ruta}`);
})()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
