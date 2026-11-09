import "server-only";
import prisma from "@/lib/prisma";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import { cargarCandidatosBalanceCruce, resolverBalanceCruceDelPeriodo } from "@/lib/modulos/balance-cruce-servidor";
import { esTotalDeCuentaComoTercero, filasEfectivasTercero } from "@/lib/balance/staging-tercero";
import { UMBRAL_IMPUESTOS_DIFERENCIA } from "@/lib/balance/umbrales-alertas";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import {
  cuentasAgrupadorasExcluidas,
  describirBalanceCruce,
  motivoSinBalanceCruce,
  validarCompuertaPrevalidador,
} from "@/lib/modulos/compuerta-cruce";
import { cargarMapeoDian } from "../configuracion-servidor";
import { impuestoPorClave, RETENCION } from "../impuestos-dian";
import { cuentasDeMapeo } from "../mapeo-dian";
import { cruceRetencion, type BalanceCruceRetencion, type CruceRetencionVista, type FilaCuentaContable, type FilaFueraDeRetencion } from "./cruce";
import type { RevisionVista } from "./revision-servidor";

/**
 * Cruce contable de una revisión de Impuestos · DIAN (Retención en la fuente o IVA): elige el balance
 * del corte (cerrado, vigente, que termine el último día del mes de corte y CON detalle por tercero; si
 * sirve más de uno, el escogido por el usuario o el de modificación más reciente), exige la aprobación
 * vigente de su prevalidador (sin pedir que el impuesto esté en su catálogo) y cruza contra su detalle
 * por tercero ligado por `loteId`. En IVA, los ingresos se leen del detalle por cuenta del balance y el
 * signo de cada cuenta sale de la naturaleza del plan Russell. Sin caché: la pantalla muestra siempre
 * lo vigente.
 */

export const MODULO_RETENCION = "RET";

const russell6 = (c: string) => c.replace(/\D/g, "").slice(0, 6);

export async function cargarCruceRetencion(
  revision: Pick<RevisionVista, "clienteId" | "anio" | "periodo" | "periodos"> & { impuesto?: string },
): Promise<CruceRetencionVista> {
  const impuesto = impuestoPorClave(revision.impuesto) ?? RETENCION;
  const umbrales = await getUmbralesAlertas();
  const umbral = Number.isFinite(umbrales.impuestos_diferencia) ? umbrales.impuestos_diferencia : UMBRAL_IMPUESTOS_DIFERENCIA;

  const { candidatos, vigentes, capturaPorLote } = await cargarCandidatosBalanceCruce(revision.clienteId, true);
  const opciones = { exigirDetalleTercero: true, vigentes, modulo: impuesto.nombre };
  // Si sirve más de un balance del corte, el escogido por el usuario o el de modificación más reciente.
  const { balance: elegido, eleccion: eleccionBalance } = await resolverBalanceCruceDelPeriodo({
    clienteId: revision.clienteId,
    moduloCodigo: impuesto.clave,
    periodo: revision.periodo,
    candidatos,
    opciones,
  });
  if (!elegido) {
    const motivo = motivoSinBalanceCruce(candidatos, revision.periodo, opciones);
    return { estado: "sin_balance", mensaje: motivo?.mensaje ?? `No hay un balance cerrado con corte en ${revision.periodo}.`, balance: null, umbral };
  }
  const balance: BalanceCruceRetencion = {
    id: elegido.id,
    periodo: elegido.periodo,
    descripcion: describirBalanceCruce(elegido),
    periodoInicio: elegido.periodoInicio.toISOString().slice(0, 10),
    periodoFin: elegido.periodoFin.toISOString().slice(0, 10),
  };

  let contexto: Awaited<ReturnType<typeof cargarContextoPrevalidadorBalance>>;
  try {
    contexto = await cargarContextoPrevalidadorBalance(elegido.id);
  } catch {
    return { estado: "bloqueado", mensaje: "No fue posible verificar de forma íntegra el prevalidador del balance del corte.", balance, umbral, eleccionBalance };
  }
  const bloqueo = validarCompuertaPrevalidador(contexto, revision.clienteId, null);
  if (bloqueo) return { estado: "bloqueado", mensaje: bloqueo, balance, umbral, eleccionBalance };

  const mapeo = await cargarMapeoDian(impuesto.declaracion.codigo);
  // Las cuentas Russell de las secciones que se leen por cuenta (los ingresos de IVA): del detalle por cuenta.
  const seccionesPorCuenta = new Set(impuesto.cruce.grupos.filter((g) => !g.porTercero).flatMap((g) => g.secciones));
  const cuentasPorCuenta = [...new Set(mapeo.filas.filter((f) => f.enCruce && seccionesPorCuenta.has(f.seccion)).flatMap((f) => cuentasDeMapeo(f)))];
  const todasLasCuentas = [...new Set(mapeo.filas.flatMap((f) => cuentasDeMapeo(f)))];
  const prefijosTercero = impuesto.cruce.prefijosTercero;
  const prefijosCliente = impuesto.cruce.prefijosCliente;

  const agrupadoras = cuentasAgrupadorasExcluidas(contexto.prevalidador);
  const capturaId = capturaPorLote.get(elegido.loteId as string) as number;
  const [crudas, crudasFuera, porCuenta, marcas, plan] = await Promise.all([
    prisma.balanceTerceroDetalle.findMany({
      where: { encabezadoId: capturaId, OR: prefijosTercero.map((p) => ({ cuenta6Russell: { startsWith: p } })) },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, nitTercero: true, nombreTercero: true, saldoInicial: true, saldoFinal: true },
    }),
    // Cuentas del cliente del impuesto (2365/2367 o 2408) que no llegan al cruce: homologadas a otro grupo o sin homologar.
    prisma.balanceTerceroDetalle.findMany({
      where: {
        encabezadoId: capturaId,
        OR: prefijosCliente.map((p) => ({ cuenta8: { startsWith: p } })),
        AND: [{ OR: [{ cuenta6Russell: null }, { NOT: { OR: prefijosCliente.map((p) => ({ cuenta6Russell: { startsWith: p } })) } }] }],
      },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, nitTercero: true, nombreTercero: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
    }),
    cuentasPorCuenta.length
      ? prisma.balancePruebaDetalle.findMany({
          // Por prefijo, como el detalle por tercero; la cuenta exacta se compara en código (`russell6`).
          where: { encabezadoId: elegido.id, OR: [...new Set(cuentasPorCuenta.map((c) => c.slice(0, 4)))].map((p) => ({ cuenta6Russell: { startsWith: p } })) },
          select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, saldoFinal: true },
        })
      : Promise.resolve([]),
    prisma.marcaCruceModulo.findMany({
      where: { clienteId: revision.clienteId, moduloCodigo: impuesto.clave, periodo: revision.periodo, dimension: "cuenta4" },
      orderBy: { numero: "asc" },
    }),
    impuesto.cruce.signoPorNaturaleza
      ? prisma.standardAccount.findMany({ where: { code: { in: todasLasCuentas } }, select: { code: true, nature: true } })
      : Promise.resolve([]),
  ]);
  // Sin agrupadoras ni el total de la cuenta leído como tercero (lo doblaría).
  const filasContables = filasEfectivasTercero(crudas.filter((d) => !agrupadoras.has(d.cuenta8.replace(/\D/g, "")) && !esTotalDeCuentaComoTercero(d)))
    .filter((d) => d.cuenta6Russell)
    .map((d) => ({
      cuentaCliente: d.cuenta8,
      nombreCuenta: d.nombreCuenta,
      cuentaRussell: russell6(d.cuenta6Russell as string),
      nit: d.nitTercero,
      nombreTercero: d.nombreTercero,
      saldoInicial: Number(d.saldoInicial),
      saldoFinal: Number(d.saldoFinal),
    }));
  const cuentasLeidasPorCuenta = new Set(cuentasPorCuenta);
  const filasContablesCuenta: FilaCuentaContable[] = porCuenta
    .filter((d) => d.cuenta6Russell && cuentasLeidasPorCuenta.has(russell6(d.cuenta6Russell)) && !agrupadoras.has(d.cuenta8.replace(/\D/g, "")))
    .map((d) => ({
      cuentaCliente: d.cuenta8,
      nombreCuenta: d.nombreCuenta,
      cuentaRussell: russell6(d.cuenta6Russell as string),
      saldoInicial: Number(d.saldoInicial),
      saldoFinal: Number(d.saldoFinal),
    }));
  const filasFueraDeRetencion: FilaFueraDeRetencion[] = filasEfectivasTercero(crudasFuera.filter((d) => !agrupadoras.has(d.cuenta8.replace(/\D/g, "")) && !esTotalDeCuentaComoTercero(d)))
    .map((d) => ({
      cuentaCliente: d.cuenta8,
      nombreCuenta: d.nombreCuenta,
      cuentaRussell: d.cuenta6Russell ? russell6(d.cuenta6Russell) : null,
      saldoFinal: Number(d.saldoFinal),
    }));
  const cuentasDestino = [...new Set(filasFueraDeRetencion.flatMap((f) => (f.cuentaRussell ? [f.cuentaRussell] : [])))];
  const planDestino = cuentasDestino.length
    ? await prisma.standardAccount.findMany({ where: { code: { in: cuentasDestino } }, select: { code: true, name: true } })
    : [];
  const inicioEnero = balance.periodoInicio === `${revision.anio}-01-01`;
  const resultado = cruceRetencion({
    impuesto: impuesto.clave,
    naturalezas: new Map(plan.map((c) => [c.code, c.nature === "D" ? "D" : "C"])),
    filasContablesCuenta,
    periodos: revision.periodos,
    mapeo: mapeo.filas,
    sinRestaDian: new Set(mapeo.cuentas.filter((c) => !c.restarTerceroDian).map((c) => c.cuenta)),
    tercerosDian: mapeo.terceros,
    nombresRussell: new Map(mapeo.cuentas.filter((c) => c.nombre).map((c) => [c.cuenta, c.nombre as string])),
    filasContables,
    filasFueraDeRetencion,
    nombresFueraDeRetencion: new Map(planDestino.map((c) => [c.code, c.name])),
    inicioEnero,
    // Con balance desde el 1 de enero se resta siempre el saldo inicial de los NITs que lo traen (7/Nov/2026).
    restarSaldoInicial: true,
    umbral,
    marcas: marcas
      .filter((m) => m.cuenta4)
      .map((m) => ({
        clave: m.cuenta4 as string,
        numero: m.numero,
        nota: m.nota,
        referenciaAnexo: m.referenciaAnexo,
        diferencia: Number(m.diferencia),
        marcadoPor: m.marcadoPor,
        marcadoEn: m.marcadoEn.toISOString(),
      })),
  });
  return {
    estado: "listo", mensaje: null, balance, umbral, inicioEnero, resultado, huellaBalance: contexto.huella, eleccionBalance,
  };
}
