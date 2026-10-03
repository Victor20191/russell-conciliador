// ============================================================
// Lista de cuentas de Nómina del 1/Oct/2026 («cuentas nomina.xlsx»): las que CONCILIAN y las SOLO
// VISIBLES, en `cuentas_conciliacion_modulo` (columna `categoria`, migración
// 20261001180000_categoria_cuentas_conciliacion).
//
//   concilia (60): 03, 05, 06, 15, 18, 24, 27, 42, 45, 48, 51, 54, 60, 86 y 95 en 5105, 5205, 7205 y 7305
//   visible  (52): 30, 33, 36, 39, 63, 68, 69, 70, 72, 75, 78 y 84 en esas cuatro clases, más los
//                  pasivos 251010, 251505, 252005 y 252505 (conciliaban desde el 16/Sep)
//
// Son los valores de fábrica del descriptor (`CUENTAS_RUSSELL_NOMINA`, `CUENTAS_VISIBLES_NOMINA`).
// Agrega las que faltan y cambia la categoría de las que ya están; no borra nada (una cuenta de
// Nómina fuera de estas dos listas se informa y se deja como está). Correr DESPUÉS de desplegar el
// código que lee la categoría: el anterior las conciliaría todas.
//
//   npx tsx scripts/nomina-cuentas-categorias-1oct.ts             # simulación (solo lectura)
//   npx tsx scripts/nomina-cuentas-categorias-1oct.ts --aplicar   # escribe, en una transacción
//
// Después, refrescar la caché del servidor desplegado: guardar cualquier fila en
// Filtros de cuentas › Nómina (la Server Action invalida `cuentas-conciliacion-modulo`).
// ============================================================
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { tomarCandadoTransaccion } from "../src/lib/candados";
import { CUENTAS_RUSSELL_NOMINA, CUENTAS_VISIBLES_NOMINA } from "../src/lib/modulos/descriptores";

const APLICAR = process.argv.includes("--aplicar");
const ACTOR = "Sistema · cuentas de Nómina (1/Oct/2026)";
const MODULO = "NOM";

type Categoria = "concilia" | "visible";

const OBJETIVO: ReadonlyMap<string, Categoria> = new Map<string, Categoria>([
  ...CUENTAS_RUSSELL_NOMINA.map((c) => [c, "concilia"] as const),
  ...CUENTAS_VISIBLES_NOMINA.map((c) => [c, "visible"] as const),
]);

async function main() {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${APLICAR ? "APLICAR" : "simulación"}`);
  if (OBJETIVO.size !== 112) throw new Error(`Se esperaban 112 cuentas y hay ${OBJETIVO.size}.`);

  const resultado = await prisma.$transaction(async (tx) => {
    await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${MODULO}`);
    const [actuales, plan] = await Promise.all([
      tx.cuentaConciliacionModulo.findMany({ where: { moduloCodigo: MODULO }, select: { id: true, cuenta: true, categoria: true } }),
      tx.standardAccount.findMany({ where: { code: { in: [...OBJETIVO.keys()] } }, select: { code: true, name: true } }),
    ]);
    const nombre = new Map(plan.map((p) => [p.code, p.name]));
    const faltanEnPlan = [...OBJETIVO.keys()].filter((c) => !nombre.has(c));
    if (faltanEnPlan.length > 0) throw new Error(`No están en el plan estándar: ${faltanEnPlan.join(", ")}.`);

    const porCuenta = new Map(actuales.map((a) => [a.cuenta, a]));
    const crear = [...OBJETIVO].filter(([c]) => !porCuenta.has(c));
    const cambiar = [...OBJETIVO].filter(([c, cat]) => porCuenta.has(c) && porCuenta.get(c)!.categoria !== cat);
    const iguales = [...OBJETIVO].filter(([c, cat]) => porCuenta.get(c)?.categoria === cat);
    const ajenas = actuales.filter((a) => !OBJETIVO.has(a.cuenta));

    console.log(`Hoy: ${actuales.length} cuenta(s) de Nómina · objetivo: ${OBJETIVO.size} (${CUENTAS_RUSSELL_NOMINA.length} concilian, ${CUENTAS_VISIBLES_NOMINA.length} solo visibles)`);
    console.log(`  agregar: ${crear.length} (${crear.filter(([, c]) => c === "concilia").length} concilian, ${crear.filter(([, c]) => c === "visible").length} solo visibles)`);
    console.log(`  cambiar de categoría: ${cambiar.length}${cambiar.length ? ` → ${cambiar.map(([c, cat]) => `${c} ${porCuenta.get(c)!.categoria}→${cat}`).join(", ")}` : ""}`);
    console.log(`  sin cambio: ${iguales.length}`);
    if (ajenas.length > 0) console.log(`  fuera de las dos listas (se dejan): ${ajenas.map((a) => `${a.cuenta} (${a.categoria})`).join(", ")}`);

    if (!APLICAR) return { aplicado: false };

    if (crear.length > 0) {
      await tx.cuentaConciliacionModulo.createMany({
        data: crear.map(([cuenta, categoria]) => ({ moduloCodigo: MODULO, cuenta, origen: null, categoria, actualizadoPor: ACTOR })),
      });
    }
    for (const [cuenta, categoria] of cambiar) {
      await tx.cuentaConciliacionModulo.update({ where: { id: porCuenta.get(cuenta)!.id }, data: { categoria, actualizadoPor: ACTOR } });
    }
    await tx.auditEntry.createMany({
      data: [
        ...crear.map(([cuenta, categoria]) => ({
          user: ACTOR,
          action: "AGREGÓ CUENTA DE CONCILIACIÓN",
          entity: `Nómina · ${cuenta}`,
          detail: `${nombre.get(cuenta)}${categoria === "visible" ? " · solo visible" : ""} (lista del 1/Oct/2026)`,
        })),
        ...cambiar.map(([cuenta, categoria]) => ({
          user: ACTOR,
          action: "EDITÓ CUENTA DE CONCILIACIÓN",
          entity: `Nómina · ${cuenta}`,
          detail: `categoría ${porCuenta.get(cuenta)!.categoria === "visible" ? "solo visible" : "concilia"} → ${categoria === "visible" ? "solo visible" : "concilia"} (lista del 1/Oct/2026)`,
        })),
        {
          user: ACTOR,
          action: "ACTUALIZÓ CUENTAS DE CONCILIACIÓN DE NÓMINA",
          entity: "Nómina",
          detail: `${CUENTAS_RUSSELL_NOMINA.length} concilian y ${CUENTAS_VISIBLES_NOMINA.length} solo visibles · ${crear.length} agregadas, ${cambiar.length} cambiaron de categoría`,
        },
      ],
    });
    const despues = await tx.cuentaConciliacionModulo.groupBy({ by: ["categoria"], where: { moduloCodigo: MODULO }, _count: { _all: true } });
    const cuenta = Object.fromEntries(despues.map((g) => [g.categoria, g._count._all]));
    if ((cuenta.concilia ?? 0) < CUENTAS_RUSSELL_NOMINA.length || (cuenta.visible ?? 0) < CUENTAS_VISIBLES_NOMINA.length) {
      throw new Error(`Verificación fallida: quedaron ${cuenta.concilia ?? 0} que concilian y ${cuenta.visible ?? 0} solo visibles.`);
    }
    return { aplicado: true, cuenta };
  }, { timeout: 120_000, maxWait: 30_000 });

  console.log(resultado.aplicado
    ? `APLICADO. Nómina: ${resultado.cuenta?.concilia ?? 0} concilian · ${resultado.cuenta?.visible ?? 0} solo visibles. Refresca la caché guardando una fila en Filtros de cuentas › Nómina.`
    : "Simulación: no se escribió nada. Corre con --aplicar para ejecutar.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
