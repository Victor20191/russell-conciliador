/**
 * Prevalidador: pasa Ingresos (41) y Nómina (5105, 5205, 7205, 7305) de MOVIMIENTO a SALDO FINAL
 * sin que ninguna aprobación vigente pierda su validez (28/Sep/2026).
 *
 * Hasta hoy la huella de una aprobación incluía el catálogo vigente COMPLETO: cambiar una fila
 * dejaba desactualizadas las aprobaciones de todos los balances. El código nuevo hace que cada
 * aprobación conserve el catálogo con que se aprobó (`prevalidador_catalogos_revision`,
 * `src/lib/balance/prevalidador/contexto.ts`). Las aprobaciones anteriores no lo tienen: este
 * script se lo RESPALDA, solo si su huella, recalculada con el catálogo actual, coincide con la
 * guardada (eso prueba que es el catálogo con que se aprobaron). Después cambia la base.
 *
 * SIMULACIÓN (por defecto, no escribe). Para cada balance con revisión calcula:
 *   A = hoy, lógica anterior (siempre el catálogo vigente)
 *   B = hoy, lógica nueva (con el catálogo congelado, o el que se respaldaría)
 *   C = con Ingresos y Nómina en saldo, lógica nueva
 *   D = con Ingresos y Nómina en saldo, lógica anterior (lo que pasaría sin el catálogo congelado)
 * Exige que toda aprobación vigente en A lo siga en B, y toda vigente en B lo siga en C.
 *
 * --aplicar. En UNA transacción serializable con el candado `prevalidador-catalogo` (el mismo de
 * la app): respalda los catálogos, pasa las 5 filas a saldo, vuelve a calcular y exige el MISMO
 * conjunto de aprobaciones vigentes —si no, deshace todo— y deja la auditoría. Idempotente.
 *
 * ORDEN: correr --aplicar SOLO con el código nuevo ya desplegado. El código anterior ignora el
 * catálogo congelado y, con la base cambiada, dejaría desactualizadas todas las aprobaciones.
 *
 * Uso:
 *   npm run db:prevalidador:base-saldo                # simulación
 *   npm run db:prevalidador:base-saldo -- --aplicar   # respalda y cambia la base
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { tomarCandadoTransaccion } from "../src/lib/candados";
import {
  leerDatosPrevalidador,
  resolverContextoPrevalidador,
  type ContextoPrevalidador,
  type DatosPrevalidador,
  type DbPrevalidador,
} from "../src/lib/balance/prevalidador/contexto";
import type { FilaCatalogoCruda } from "../src/lib/balance/prevalidador/catalogo";

const APLICAR = process.argv.includes("--aplicar");
const ACTOR = "Sistema · prevalidador-base-saldo";
const CANDADO = "prevalidador-catalogo";

/** Las filas que pasan a saldo final. */
const OBJETIVO: readonly { modulo: string; cuenta: string }[] = [
  { modulo: "ING", cuenta: "41" },
  { modulo: "NOM", cuenta: "5105" },
  { modulo: "NOM", cuenta: "5205" },
  { modulo: "NOM", cuenta: "7205" },
  { modulo: "NOM", cuenta: "7305" },
];
const esObjetivo = (f: FilaCatalogoCruda) =>
  OBJETIVO.some((o) => o.modulo === f.module.code && o.cuenta === f.cuentaRussell.replace(/\D/g, ""));

/** El catálogo como quedará: las filas objetivo en saldo. */
const conBaseSaldo = (datos: DatosPrevalidador): DatosPrevalidador => ({
  ...datos,
  catalogoVigente: datos.catalogoVigente.map((f) => (esObjetivo(f) ? { ...f, baseCalculo: "saldo" } : f)),
});

/** La última revisión, con el catálogo que el respaldo le guardaría (pasado por JSON como en la BD). */
function conRespaldo(datos: DatosPrevalidador, anterior: ContextoPrevalidador): { datos: DatosPrevalidador; respaldar: boolean } {
  const ultima = datos.ultimaRevision;
  const respaldar = ultima?.estado === "aprobada" && anterior.revision.vigente && !ultima.catalogoCongelado;
  if (!respaldar || !ultima) return { datos, respaldar: false };
  return {
    respaldar: true,
    datos: {
      ...datos,
      ultimaRevision: {
        ...ultima,
        catalogoCongelado: { catalogo: JSON.parse(JSON.stringify(datos.catalogoVigente)), origen: "respaldo", creadoEn: new Date() },
      },
    },
  };
}

type Fila = {
  balanceId: number;
  etiqueta: string;
  ultima: string;
  congelado: "sí" | "a respaldar" | "no";
  A: boolean;
  B: boolean;
  C: boolean;
  D: boolean;
  informeConSaldo: string;
  /** El mismo resumen con la base de hoy (movimiento), para ver si la diferencia la trae el cambio. */
  informeHoy: string;
};

/** Qué verá quien re-apruebe un balance sin aprobación vigente: el estado de ING y NOM con saldo final. */
function resumenIngNom(ctx: ContextoPrevalidador): string {
  const p = ctx.prevalidador;
  if (p.estado !== "listo") return p.estado;
  return p.modulos
    .filter((m) => m.codigo === "ING" || m.codigo === "NOM")
    .map((m) => `${m.codigo} ${m.coincide ? "coincide" : `dif ${Math.round(m.diferenciaTotal).toLocaleString("es-CO")}`}`)
    .join(" · ") || "sin ING/NOM";
}

async function evaluar(db: DbPrevalidador, balanceIds: number[], conTabla: boolean): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (const balanceId of balanceIds) {
    const datos = await leerDatosPrevalidador(db, balanceId, { conCatalogoCongelado: conTabla });
    const A = resolverContextoPrevalidador(datos, { ignorarCatalogoCongelado: true });
    const { datos: datosB, respaldar } = conRespaldo(datos, A);
    const B = resolverContextoPrevalidador(datosB);
    const C = resolverContextoPrevalidador(conBaseSaldo(datosB));
    const D = resolverContextoPrevalidador(conBaseSaldo(datos), { ignorarCatalogoCongelado: true });
    const b = datos.balance;
    filas.push({
      balanceId,
      etiqueta: `${b.nombreCliente} · ${b.periodo} · ${b.version}`,
      ultima: datos.ultimaRevision?.estado ?? "—",
      congelado: datos.ultimaRevision?.catalogoCongelado ? "sí" : respaldar ? "a respaldar" : "no",
      A: A.revision.vigente,
      B: B.revision.vigente,
      C: C.revision.vigente,
      D: D.revision.vigente,
      informeConSaldo: C.revision.vigente ? "(conserva su catálogo)" : resumenIngNom(C),
      informeHoy: C.revision.vigente ? "" : resumenIngNom(A),
    });
  }
  return filas;
}

function imprimir(titulo: string, filas: Fila[]): string[] {
  const s = (v: boolean) => (v ? "vigente" : "   —   ");
  console.log(`\n${titulo}`);
  console.log("balance | A (hoy, lógica anterior) | B (hoy, lógica nueva) | C (saldo, nueva) | D (saldo, anterior) | catálogo congelado | última revisión | ING/NOM con saldo");
  for (const f of filas) {
    console.log(`#${f.balanceId} ${f.etiqueta}\n        ${s(f.A)} | ${s(f.B)} | ${s(f.C)} | ${s(f.D)} | ${f.congelado} | ${f.ultima} | ${f.informeConSaldo}${f.informeHoy ? `  (hoy con movimiento: ${f.informeHoy})` : ""}`);
  }
  const cuenta = (k: "A" | "B" | "C" | "D") => filas.filter((f) => f[k]).length;
  console.log(`\nVigentes → A ${cuenta("A")} · B ${cuenta("B")} · C ${cuenta("C")} · D ${cuenta("D")} (de ${filas.length} balances con revisión)`);
  console.log(`Catálogos a respaldar: ${filas.filter((f) => f.congelado === "a respaldar").length} · ya congelados: ${filas.filter((f) => f.congelado === "sí").length}`);
  const fallas: string[] = [];
  for (const f of filas) {
    if (f.A && !f.B) fallas.push(`#${f.balanceId}: vigente con la lógica anterior y no con la nueva`);
    if (f.B && !f.C) fallas.push(`#${f.balanceId}: perdería su aprobación al cambiar la base`);
  }
  if (fallas.length) console.log(`\nFALLAS:\n  ${fallas.join("\n  ")}`);
  else console.log(`OK: ninguna aprobación vigente se pierde (sin esto se perderían ${cuenta("B") - cuenta("D")}).`);
  return fallas;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://x");
  console.log(`Destino: ${url.hostname}`);
  console.log(APLICAR ? "Modo: APLICAR (escribe)" : "Modo: simulación (no escribe; usa --aplicar)");

  const [{ existe: conTabla }] = await prisma.$queryRaw<{ existe: boolean }[]>`
    SELECT to_regclass('public.prevalidador_catalogos_revision') IS NOT NULL AS existe`;
  console.log(conTabla ? "Tabla del catálogo congelado: presente" : "Tabla del catálogo congelado: AUSENTE (migración sin aplicar)");

  const catalogo = await prisma.prevalidadorCuenta.findMany({
    select: { id: true, cuentaRussell: true, baseCalculo: true, activa: true, module: { select: { code: true, name: true } } },
  });
  const objetivo = catalogo.filter((f) => esObjetivo({ ...f, etiqueta: null, orden: 0 }));
  const faltan = OBJETIVO.filter((o) => !objetivo.some((f) => f.module.code === o.modulo && f.cuentaRussell.replace(/\D/g, "") === o.cuenta));
  if (faltan.length) throw new Error(`No están en el catálogo: ${faltan.map((f) => `${f.modulo} ${f.cuenta}`).join(", ")}.`);
  console.log(`Filas objetivo: ${objetivo.map((f) => `${f.module.code} ${f.cuentaRussell} (${f.baseCalculo}${f.activa ? "" : ", inactiva"})`).join(" · ")}`);

  const balanceIds = (await prisma.$queryRaw<{ id: number }[]>`
    SELECT DISTINCT "balance_id" AS id FROM "prevalidador_revisiones_balance" ORDER BY 1`).map((r) => Number(r.id));

  const antes = await evaluar(prisma, balanceIds, conTabla);
  const fallas = imprimir("ESTADO ACTUAL", antes);
  if (fallas.length) process.exit(1);
  if (!APLICAR) return;

  if (!conTabla) throw new Error("Aplica primero la migración 20260928180000_prevalidador_catalogo_congelado.");
  const pendientes = objetivo.filter((f) => f.baseCalculo !== "saldo");

  const resultado = await prisma.$transaction(
    async (tx) => {
      await tomarCandadoTransaccion(tx, CANDADO);

      // 1) Respaldo: las aprobaciones vigentes sin catálogo congelado guardan el actual. Solo
      //    las que siguen vigentes calculadas con él: esa coincidencia de huella es la prueba.
      let respaldados = 0;
      for (const balanceId of balanceIds) {
        const datos = await leerDatosPrevalidador(tx, balanceId);
        const ultima = datos.ultimaRevision;
        if (ultima?.estado !== "aprobada" || ultima.catalogoCongelado) continue;
        const actual = resolverContextoPrevalidador(datos, { ignorarCatalogoCongelado: true });
        if (!actual.revision.vigente) continue;
        await tx.prevalidadorCatalogoRevision.create({
          data: { revisionId: ultima.id, catalogo: datos.catalogoVigente as Prisma.InputJsonValue, origen: "respaldo" },
        });
        respaldados += 1;
      }

      // 2) Vigentes ANTES del cambio, con la lógica nueva.
      const vigentesAntes = new Set<number>();
      for (const balanceId of balanceIds) {
        if (resolverContextoPrevalidador(await leerDatosPrevalidador(tx, balanceId)).revision.vigente) vigentesAntes.add(balanceId);
      }

      // 3) El cambio de base.
      for (const fila of pendientes) {
        await tx.prevalidadorCuenta.update({ where: { id: fila.id }, data: { baseCalculo: "saldo", actualizadoPor: ACTOR } });
      }

      // 4) Vigentes DESPUÉS: tiene que ser exactamente el mismo conjunto.
      const perdidas: number[] = [];
      for (const balanceId of vigentesAntes) {
        if (!resolverContextoPrevalidador(await leerDatosPrevalidador(tx, balanceId)).revision.vigente) perdidas.push(balanceId);
      }
      if (perdidas.length) {
        throw new Error(`Se perderían las aprobaciones de los balances ${perdidas.join(", ")}: no se aplica nada.`);
      }

      // 5) Auditoría, dentro de la misma transacción.
      for (const fila of pendientes) {
        await tx.auditEntry.create({
          data: {
            user: ACTOR,
            action: "EDITÓ CUENTA DEL PREVALIDADOR",
            entity: `${fila.module.name} · ${fila.cuentaRussell}`,
            detail: "Base: Saldo final · antes: Movimiento del período · script prevalidador-base-saldo",
          },
        });
      }
      if (respaldados > 0 || pendientes.length > 0) {
        await tx.auditEntry.create({
          data: {
            user: ACTOR,
            action: "CONGELÓ CATÁLOGO DE APROBACIONES DEL PREVALIDADOR",
            entity: "Prevalidador de homologación",
            detail: `${respaldados} aprobación(es) respaldada(s) con su catálogo · ${pendientes.length} fila(s) a saldo final · ${vigentesAntes.size} aprobación(es) vigente(s) intactas`,
          },
        });
      }
      return { respaldados, cambiadas: pendientes.length, vigentes: vigentesAntes.size };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 600_000, maxWait: 30_000 },
  );

  console.log(`\nAPLICADO: ${resultado.respaldados} catálogo(s) respaldado(s) · ${resultado.cambiadas} fila(s) a saldo final · ${resultado.vigentes} aprobación(es) vigente(s) intactas.`);
  imprimir("ESTADO FINAL", await evaluar(prisma, balanceIds, true));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
