// ============================================================
// RESUMEN DEL CUADRE de los borradores de balance existentes (18/Oct/2026;
// migración 20261019180000_resumen_cuadre_borrador).
//
// La lista de /balance/borradores dice «Cuadrado / Descuadrado» con cuatro condiciones —ecuación,
// partida doble, clases vs archivo y agrupadoras que no cuadran con su desglose— evaluadas al leer
// con los umbrales vigentes sobre `balance_importacion_lote.resumen_cuadre`. El resumen se escribe al
// crear y al guardar un borrador; los que ya existían no lo tienen y la lista los muestra «Sin
// verificar». Este script lo calcula desde su staging, con la misma función que la app.
//
// Solo escribe `resumen_cuadre`, y solo si el borrador no cambió mientras se calculaba
// (`revision_contenido` igual al leído). No toca el staging, el veredicto anterior (`cuadrado`) ni
// ningún balance cargado.
//
//   npx tsx scripts/recalcular-cuadre-borradores.ts             # simulación (solo lectura)
//   npx tsx scripts/recalcular-cuadre-borradores.ts --aplicar   # escribe el resumen
//   npx tsx scripts/recalcular-cuadre-borradores.ts --revertir --aplicar  # lo borra (vuelven a «Sin verificar»)
//
// Orden: migración → este script (el código que lo lee puede desplegarse antes o después: sin el
// resumen la lista muestra «Sin verificar»). `.env` apunta a PRODUCCIÓN.
// ============================================================
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import {
  evaluarCuadreBorrador,
  filasBorradorDeStaging,
  reubicacionesAprobadasDeStaging,
  resumenCuadreDeFilas,
  SELECT_STAGING_CUADRE,
  type VeredictoCuadreBorrador,
} from "../src/lib/balance/cuadre-borrador";
import { UMBRALES_ALERTAS_DEFECTO, type UmbralesAlertas } from "../src/lib/balance/umbrales-alertas";

const APLICAR = process.argv.includes("--aplicar");
const REVERTIR = process.argv.includes("--revertir");

/** Umbrales vigentes de la BD (misma regla que el cargador de la app; sin caché). */
async function umbralesVigentes(): Promise<UmbralesAlertas> {
  const filas = await prisma.umbralAlerta.findMany({ select: { clave: true, valor: true } });
  const resuelto = { ...UMBRALES_ALERTAS_DEFECTO };
  for (const f of filas) {
    const n = Number(f.valor);
    if (f.clave in resuelto && Number.isFinite(n) && n >= 0) resuelto[f.clave as keyof UmbralesAlertas] = n;
  }
  return resuelto;
}

function describir(v: VeredictoCuadreBorrador): string {
  if (v.estado !== "descuadrado") return v.estado === "cuadrado" ? "Cuadrado" : "Sin verificar";
  return `Descuadrado (${v.motivos.map((m) => {
    switch (m.tipo) {
      case "ecuacion": return `ecuación ${m.monto}`;
      case "partida_doble": return `partida doble ${m.monto}`;
      case "clases": return `clases ${m.clases.map((c) => `${c.clase} ${c.diff}`).join(", ")}`;
      case "agrupadoras": return `${m.masDe ? "más de " : ""}${m.cantidad} agrupadora(s)`;
    }
  }).join(" · ")})`;
}

async function revertir() {
  const conResumen = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "balance_importacion_lote" WHERE "resumen_cuadre" IS NOT NULL`;
  console.log(`Borradores con resumen: ${conResumen[0]?.n ?? 0}`);
  if (!APLICAR) {
    console.log("Simulación: no se borró nada. Corre con --revertir --aplicar para borrarlos.");
    return;
  }
  const r = await prisma.balanceImportacionLote.updateMany({
    where: { NOT: { resumenCuadre: { equals: Prisma.DbNull } } },
    data: { resumenCuadre: Prisma.DbNull },
  });
  console.log(`REVERTIDO: ${r.count} resumen(es) borrado(s).`);
}

async function main() {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${REVERTIR ? "REVERTIR " : ""}${APLICAR ? "APLICAR" : "simulación"}`);
  if (REVERTIR) return revertir();

  const umbrales = await umbralesVigentes();
  console.log(`Umbrales vigentes: cuadre contable ${umbrales.cuadre_contable} · descuadres ${umbrales.descuadre}`);
  const lotes = await prisma.balanceImportacionLote.findMany({
    select: { loteId: true, archivoNombre: true, revisionContenido: true, cuadrado: true },
    orderBy: { creadoEn: "asc" },
  });
  console.log(`Borradores: ${lotes.length}\n`);

  const conteo = { cuadrado: 0, descuadrado: 0, sin_verificar: 0 };
  let cambianDeVeredicto = 0;
  let escritos = 0;
  let saltados = 0;
  for (const lote of lotes) {
    const staged = await prisma.balanceImportacionStaging.findMany({
      where: { loteId: lote.loteId },
      orderBy: { filaNum: "asc" },
      select: SELECT_STAGING_CUADRE,
    });
    if (staged.length === 0) {
      console.log(`  ·  ${lote.archivoNombre} (${lote.loteId}): sin filas en el staging, se omite`);
      saltados++;
      continue;
    }
    const resumen = resumenCuadreDeFilas(filasBorradorDeStaging(staged), reubicacionesAprobadasDeStaging(staged), lote.revisionContenido);
    const veredicto = evaluarCuadreBorrador(resumen, umbrales);
    conteo[veredicto.estado]++;
    const antes = lote.cuadrado ? "Cuadrado" : "Descuadrado";
    const ahora = veredicto.estado === "cuadrado" ? "Cuadrado" : "Descuadrado";
    if (antes !== ahora) cambianDeVeredicto++;
    console.log(`  ${antes === ahora ? " " : "≠"}  ${lote.archivoNombre} (${lote.loteId}, ${staged.length} filas): antes ${antes} → ${describir(veredicto)}`);

    if (!APLICAR) continue;
    // Solo si nadie guardó el borrador entretanto: el resumen lleva la revisión leída.
    const r = await prisma.balanceImportacionLote.updateMany({
      where: { loteId: lote.loteId, revisionContenido: lote.revisionContenido },
      data: { resumenCuadre: resumen },
    });
    if (r.count === 1) escritos++;
    else console.log(`     ↳ cambió mientras se calculaba: no se escribió (se recalcula al guardarlo)`);
  }

  console.log(`\nResultado con los umbrales vigentes: ${conteo.cuadrado} cuadrado(s) · ${conteo.descuadrado} descuadrado(s) · ${saltados} sin filas.`);
  console.log(`Cambian de veredicto respecto a la lista anterior: ${cambianDeVeredicto}.`);
  console.log(APLICAR ? `APLICADO: ${escritos} resumen(es) escrito(s).` : "Simulación: no se escribió nada. Corre con --aplicar para guardarlo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
