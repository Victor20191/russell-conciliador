// ============================================================
// Re-homologación masiva de balances YA cargados cuyo detalle tiene cuentas
// homologadas FUERA DE CLASE contable (p. ej. `72053305` costo → `261010`
// pasivo). Reproduce, balance por balance, la Server Action
// `reaplicarMapeoBalance` (src/app/actions/balance.ts): memoria del cliente →
// cascada determinista (exacto + descripción, que respeta la clase) → si nada
// resuelve, se conserva el mapeo salvo que cruce de clase, en cuyo caso se
// retira. NUNCA usa IA ni escribe memoria; lo `manual`/`manual_cuenta` manda.
//
// Ejecutar:
//   npx tsx scripts/rehomologar-fuera-de-clase.ts             # dry-run (no escribe)
//   npx tsx scripts/rehomologar-fuera-de-clase.ts --aplicar   # ejecuta
//   … --cliente 122 --cliente 65                              # limita por cliente_id
//   … --todas          # además re-homologa las filas NO cruzadas cuya memoria/cascada
//                      # cambió (comportamiento exacto del botón de la UI); por defecto
//                      # SOLO se tocan las filas fuera de clase (alcance de la novedad)
//   … --revertir scripts/.snapshots/rehomologar-<ts>.json   # restaura el snapshot
//
// Al aplicar, ANTES de escribir guarda un snapshot JSON (id, cuenta_6_russell,
// coincidencia de cada fila que cambia + contadores del encabezado) para poder
// revertir. Los balances CONGELADOS se listan pero no se tocan (igual que la acción).
// ============================================================

import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mapearCuenta, tokenizarPlan, type CuentaEstandar } from "../src/lib/balance/calcular";
import { construirConfigMapeoCliente, resolverMapeoCliente, esMapeoManual } from "../src/lib/balance/mapeo-cliente-config";
import { cruzaClaseContable } from "../src/lib/balance/clase-contable";

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const TODAS = process.argv.includes("--todas");
const REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];
const HAY_REVERTIR = process.argv.includes("--revertir");
const CLIENTES = process.argv.flatMap((a, i, arr) => (a === "--cliente" && arr[i + 1] ? [Number(arr[i + 1])] : []));

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Mismo candado que `tomarCandadoTransaccion` (src/lib/concurrency.ts).
const LOCK_NAMESPACE = 1_382_240_781;
function advisoryKey(recurso: string): number {
  return createHash("sha256").update(recurso).digest().readInt32BE(0);
}

type Cambio = { std: string | null; coincidencia: number | null; ids: number[] };
type Snapshot = {
  creadoEn: string;
  encabezados: { id: number; mapeadas: number; sinMapear: number; completitud: number }[];
  filas: { id: number; encabezadoId: number; cuenta6Russell: string | null; coincidencia: number | null }[];
};

async function revertir(ruta: string) {
  const snap = JSON.parse(readFileSync(ruta, "utf8")) as Snapshot;
  console.log(`↩️  Revirtiendo snapshot ${ruta} (${snap.filas.length} filas, ${snap.encabezados.length} encabezados)`);
  await prisma.$transaction(
    async (tx) => {
      for (const f of snap.filas) {
        await tx.balancePruebaDetalle.update({ where: { id: f.id }, data: { cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia } });
      }
      for (const e of snap.encabezados) {
        await tx.balancePruebaEncabezado.update({ where: { id: e.id }, data: { mapeadas: e.mapeadas, sinMapear: e.sinMapear, completitud: e.completitud } });
        await tx.auditEntry.create({
          data: { user: "Sistema (script rehomologar-fuera-de-clase)", action: "REVIRTIÓ RE-HOMOLOGACIÓN", entity: String(e.id), detail: `Snapshot ${ruta}` },
        });
      }
    },
    { timeout: 600_000 },
  );
  console.log("✅ Revertido.");
}

async function main() {
  if (HAY_REVERTIR) return revertir(REVERTIR);
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1];
  console.log(`${APLICAR ? "🔴 MODO APLICAR" : "🟢 DRY-RUN (no escribe)"} · ${TODAS ? "TODAS las filas" : "SOLO filas fuera de clase"} · BD ${host}${CLIENTES.length ? ` · clientes ${CLIENTES.join(",")}` : ""}`);

  const cuentasEstandar: CuentaEstandar[] = await prisma.standardAccount.findMany({
    select: { code: true, name: true, nature: true, critical: true, russellAccount: true, possibleAccounts: true },
  });
  const stdByCode = new Map(cuentasEstandar.map((s) => [s.code, s]));
  const hayDescripcion = cuentasEstandar.some((s) => s.possibleAccounts || s.name);
  const planTok = tokenizarPlan(cuentasEstandar);

  // Encabezados con al menos una fila fuera de clase.
  const encabezados = await prisma.$queryRaw<{ id: number; cliente_id: number; nombre_cliente: string; periodo: string; version: string; esta_congelado: boolean }[]>(Prisma.sql`
    SELECT e.id, e.cliente_id, e.nombre_cliente, e.periodo, e.version, e.esta_congelado
    FROM balance_prueba_encabezado e
    WHERE EXISTS (
      SELECT 1 FROM balance_prueba_detalle d
      WHERE d.encabezado_id = e.id AND d.cuenta_6_russell IS NOT NULL
        AND left(d.cuenta_8, 1) <> left(d.cuenta_6_russell, 1)
    )
    ${CLIENTES.length ? Prisma.sql`AND e.cliente_id IN (${Prisma.join(CLIENTES)})` : Prisma.empty}
    ORDER BY e.cliente_id, e.periodo, e.id`);
  console.log(`Balances con homologación fuera de clase: ${encabezados.length}\n`);

  const totales = { balances: 0, congelados: 0, retiradas: 0, rehomologadasCruzadas: 0, manualesConservadas: 0, otrasRehomologadas: 0 };
  const ejemplos: string[] = [];
  const snapshot: Snapshot = { creadoEn: new Date().toISOString(), encabezados: [], filas: [] };
  const rutaSnapshot = `scripts/.snapshots/rehomologar-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json`;

  for (const e of encabezados) {
    if (e.esta_congelado) {
      totales.congelados++;
      console.log(`⏭  #${e.id} ${e.nombre_cliente} · ${e.periodo} ${e.version} — CONGELADO, no se toca`);
      continue;
    }
    const [configRows, detalles] = await Promise.all([
      prisma.clientAccount.findMany({
        where: { clienteId: e.cliente_id, cuenta6Russell: { not: null } },
        select: { id: true, code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
      }),
      prisma.balancePruebaDetalle.findMany({
        where: { encabezadoId: e.id },
        select: { id: true, cuenta8: true, nombreCuenta: true, cuenta6Russell: true, coincidencia: true },
      }),
    ]);
    const configCliente = construirConfigMapeoCliente(configRows);
    const memoriaExacta = new Map(configRows.map((r) => [r.code, r]));

    const porDestino = new Map<string, Cambio>();
    let retiradas = 0;
    let rehomologadasCruzadas = 0;
    let manualesConservadas = 0;
    let otrasRehomologadas = 0;

    for (const d of detalles) {
      const cruzada = cruzaClaseContable(d.cuenta8, d.cuenta6Russell);
      const cfg = resolverMapeoCliente(configCliente, d.cuenta8);
      let std: string | null;
      let coincidencia: number | null;
      if (cfg?.std) {
        std = cfg.std;
        coincidencia = cfg.coincidencia ?? 100;
      } else {
        const mp = mapearCuenta(d.cuenta8, d.nombreCuenta, stdByCode, cuentasEstandar, hayDescripcion, planTok);
        if (mp.mapped) {
          std = mp.std;
          coincidencia = mp.coincidencia;
        } else if (cruzada) {
          std = null;
          coincidencia = null;
        } else {
          continue;
        }
      }
      if (std === d.cuenta6Russell) {
        if (cruzada) {
          manualesConservadas++; // la memoria manual manda: cruce deliberado
          const m = memoriaExacta.get(d.cuenta8) ?? memoriaExacta.get(d.cuenta8.slice(0, 6));
          if (!esMapeoManual(m?.origenMapeo)) {
            ejemplos.push(`   ⚠ #${e.id} ${d.cuenta8} → ${d.cuenta6Russell} se conserva cruzada sin memoria manual (origen ${m?.origenMapeo ?? "—"})`);
          }
        }
        continue;
      }
      if (cruzada) {
        if (std == null) retiradas++;
        else rehomologadasCruzadas++;
        if (ejemplos.length < 400) ejemplos.push(`   #${e.id} ${d.cuenta8} ${d.nombreCuenta.slice(0, 38).padEnd(38)} ${d.cuenta6Russell} → ${std ?? "(sin mapeo)"}`);
      } else {
        if (!TODAS) continue; // fuera del alcance de la novedad
        otrasRehomologadas++;
      }
      snapshot.filas.push({ id: d.id, encabezadoId: e.id, cuenta6Russell: d.cuenta6Russell, coincidencia: d.coincidencia == null ? null : Number(d.coincidencia) });
      const clave = `${std ?? ""}|${coincidencia ?? ""}`;
      const g = porDestino.get(clave);
      if (g) g.ids.push(d.id);
      else porDestino.set(clave, { std, coincidencia, ids: [d.id] });
    }

    totales.balances++;
    totales.retiradas += retiradas;
    totales.rehomologadasCruzadas += rehomologadasCruzadas;
    totales.manualesConservadas += manualesConservadas;
    totales.otrasRehomologadas += otrasRehomologadas;
    console.log(
      `${APLICAR ? "✏️ " : "·  "}#${String(e.id).padStart(3)} ${e.nombre_cliente.slice(0, 44).padEnd(44)} ${e.periodo.padEnd(28)} ${e.version.padEnd(3)} ` +
        `cruzadas→retiradas ${retiradas} · cruzadas→re-homologadas ${rehomologadasCruzadas} · cruzadas manuales conservadas ${manualesConservadas} · otras re-homologadas ${otrasRehomologadas}`,
    );

    if (!APLICAR || porDestino.size === 0) continue;

    // Serializable con reintento ante conflictos de escritura (P2034/P2002),
    // igual que `transaccionSerializable`: producción tiene tráfico concurrente.
    for (let intento = 1; ; intento++) {
      try {
        await aplicarBalance(e, porDestino, snapshot, rutaSnapshot, { retiradas, rehomologadasCruzadas, otrasRehomologadas });
        break;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if ((code === "P2034" || code === "P2002") && intento < 5) {
          console.log(`   ↻ conflicto de escritura en #${e.id}, reintento ${intento}`);
          await new Promise((r) => setTimeout(r, 200 * intento));
          continue;
        }
        throw err;
      }
    }
  }
  await finalizar();

  async function finalizar() {
    console.log("\nDetalle de cuentas cruzadas que cambian (muestra):");
    for (const l of ejemplos) console.log(l);
    console.log("\nTOTALES", totales);
    if (APLICAR) console.log(`\nSnapshot para revertir: ${rutaSnapshot} (npx tsx scripts/rehomologar-fuera-de-clase.ts --revertir ${rutaSnapshot})`);
    if (!APLICAR) console.log("\nDry-run: nada se escribió. Repite con --aplicar para ejecutar.");
  }

  async function aplicarBalance(
    e: (typeof encabezados)[number],
    porDestino: Map<string, Cambio>,
    snapshot: Snapshot,
    rutaSnapshot: string,
    n: { retiradas: number; rehomologadasCruzadas: number; otrasRehomologadas: number },
  ) {
    const { retiradas, rehomologadasCruzadas, otrasRehomologadas } = n;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${advisoryKey(`balance-oficial:${e.cliente_id}:${e.periodo}`)})`);
        const enc = await tx.balancePruebaEncabezado.findUnique({ where: { id: e.id }, select: { estaCongelado: true, mapeadas: true, sinMapear: true, completitud: true } });
        if (!enc || enc.estaCongelado) return;
        if (!snapshot.encabezados.some((h) => h.id === e.id)) snapshot.encabezados.push({ id: e.id, mapeadas: enc.mapeadas, sinMapear: enc.sinMapear, completitud: enc.completitud });
        mkdirSync("scripts/.snapshots", { recursive: true });
        writeFileSync(rutaSnapshot, JSON.stringify(snapshot)); // se reescribe tras cada balance: siempre refleja lo ya aplicado
        for (const { std, coincidencia, ids } of porDestino.values()) {
          await tx.balancePruebaDetalle.updateMany({ where: { id: { in: ids } }, data: { cuenta6Russell: std, coincidencia } });
        }
        const [total, mapeadas] = await Promise.all([
          tx.balancePruebaDetalle.count({ where: { encabezadoId: e.id } }),
          tx.balancePruebaDetalle.count({ where: { encabezadoId: e.id, cuenta6Russell: { not: null } } }),
        ]);
        await tx.balancePruebaEncabezado.update({
          where: { id: e.id },
          data: { mapeadas, sinMapear: total - mapeadas, completitud: total > 0 ? Math.round((mapeadas / total) * 100) : 100 },
        });
        await tx.auditEntry.create({
          data: {
            user: "Sistema (script rehomologar-fuera-de-clase)",
            action: "RE-HOMOLOGÓ BALANCE",
            entity: String(e.id),
            detail: `${rehomologadasCruzadas + otrasRehomologadas} re-homologada(s) · ${retiradas} mapeo(s) fuera de clase retirado(s)`,
            clientId: e.cliente_id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 60_000 },
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
