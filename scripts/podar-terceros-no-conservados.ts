/**
 * Poda el detalle por tercero ya capturado de un balance: deja los terceros solo en las
 * cuentas de `PREFIJOS_TERCERO_CONSERVADOS` (13, 21, 22, 23, 28 y 41) y borra los de las
 * demás. Desde el 22/Sep/2026 la captura ya no los guarda; esto alcanza a lo cargado antes.
 *
 * Qué NO toca: la fila propia de cada cuenta (sin NIT ni nombre, el saldo oficial), el
 * balance oficial (`balance_prueba_detalle`) ni ninguna homologación. Los totales por cuenta
 * del visor y del cruce entre aperturas no cambian, porque una cuenta sin terceros se lee
 * por su fila propia (`filasEfectivasTercero`). Los cruces por tercero de Cartera, CxP e
 * Ingresos solo leen cuentas que se conservan.
 *
 * Antes de borrar guarda un snapshot de las filas en `scripts/.snapshots/` (gitignored).
 *
 * Uso (id del balance de /balance/[id], no del encabezado por tercero):
 *   npx tsx scripts/podar-terceros-no-conservados.ts 273            # simulación
 *   npx tsx scripts/podar-terceros-no-conservados.ts 273 --aplicar  # borra
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PREFIJOS_TERCERO_CONSERVADOS } from "../src/lib/balance/staging-tercero";

const APLICAR = process.argv.includes("--aplicar");
const balanceIds = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Fila de tercero (no propia) cuya cuenta del cliente no está en los prefijos conservados.
const condicion = Prisma.sql`
  (COALESCE(TRIM(nit_tercero), '') <> '' OR COALESCE(TRIM(nombre_tercero), '') <> '')
  AND NOT (${Prisma.join(PREFIJOS_TERCERO_CONSERVADOS.map((p) => Prisma.sql`cuenta_8 LIKE ${p + "%"}`), " OR ")})`;

async function main() {
  if (balanceIds.length === 0) throw new Error("Indica el id del balance, p. ej. 273.");
  console.log(`Destino: ${new URL(process.env.DATABASE_URL ?? "postgres://x").hostname}`);
  console.log(APLICAR ? "Modo: APLICAR (borra)" : "Modo: simulación (no escribe; usa --aplicar)");
  console.log(`Se conservan los terceros de: ${PREFIJOS_TERCERO_CONSERVADOS.join(", ")}`);

  for (const balanceId of balanceIds) {
    const bal = await prisma.balancePruebaEncabezado.findUnique({
      where: { id: balanceId },
      select: { id: true, loteId: true, clienteId: true, periodo: true, version: true },
    });
    if (!bal?.loteId) { console.log(`\nBalance ${balanceId}: no existe o no tiene lote.`); continue; }
    const enc = await prisma.balanceTerceroEncabezado.findUnique({
      where: { loteId: bal.loteId },
      select: { id: true, nombreCliente: true, filasTotales: true },
    });
    if (!enc) { console.log(`\nBalance ${balanceId}: sin captura por tercero ligada.`); continue; }

    const [{ total }] = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total FROM balance_tercero_detalle WHERE encabezado_id = ${enc.id}`;
    const porClase = await prisma.$queryRaw<{ clase: string; filas: bigint; cuentas: bigint }[]>`
      SELECT LEFT(cuenta_8, 2) AS clase, COUNT(*)::bigint AS filas, COUNT(DISTINCT cuenta_8)::bigint AS cuentas
      FROM balance_tercero_detalle WHERE encabezado_id = ${enc.id} AND ${condicion}
      GROUP BY 1 ORDER BY 1`;
    const aBorrar = porClase.reduce((s, r) => s + Number(r.filas), 0);

    console.log(`\nBalance ${balanceId} · ${enc.nombreCliente} · ${bal.periodo} · ${bal.version} (encabezado tercero ${enc.id})`);
    console.log(`Filas: ${Number(total).toLocaleString("es-CO")} · a borrar: ${aBorrar.toLocaleString("es-CO")} · quedan: ${(Number(total) - aBorrar).toLocaleString("es-CO")}`);
    for (const r of porClase) console.log(`  ${r.clase}: ${Number(r.filas).toLocaleString("es-CO")} filas en ${r.cuentas} cuentas`);
    if (!APLICAR || aBorrar === 0) continue;

    const filas = await prisma.$queryRaw<unknown[]>`
      SELECT * FROM balance_tercero_detalle WHERE encabezado_id = ${enc.id} AND ${condicion} ORDER BY id`;
    mkdirSync("scripts/.snapshots", { recursive: true });
    const ruta = `scripts/.snapshots/poda-terceros-balance-${balanceId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(ruta, JSON.stringify({ balanceId, encabezadoTerceroId: enc.id, filasTotalesAntes: enc.filasTotales, filas },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    console.log(`Snapshot: ${ruta}`);

    const borradas = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRaw`DELETE FROM balance_tercero_detalle WHERE encabezado_id = ${enc.id} AND ${condicion}`;
      await tx.balanceTerceroEncabezado.update({ where: { id: enc.id }, data: { filasTotales: Number(total) - n } });
      return n;
    }, { timeout: 10 * 60 * 1000 });
    console.log(`Borradas: ${borradas.toLocaleString("es-CO")}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
