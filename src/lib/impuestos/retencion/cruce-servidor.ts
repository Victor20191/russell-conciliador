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
import { cruceRetencion, prefijosRetencion, type BalanceCruceRetencion, type CruceRetencionVista, type FilaFueraDeRetencion } from "./cruce";
import type { RevisionVista } from "./revision-servidor";

/**
 * Cruce contable de una revisión de Retención en la fuente: elige el balance del corte (cerrado,
 * vigente, que termine el último día del mes de corte y CON detalle por tercero; si sirve más de uno,
 * el escogido por el usuario o el de modificación más reciente), exige la aprobación vigente
 * de su prevalidador (sin pedir que Retención esté en su catálogo) y cruza contra su detalle por
 * tercero ligado por \`loteId\`. Sin caché: la pantalla muestra siempre lo vigente.
 */

export const MODULO_RETENCION = "RET";

export async function cargarCruceRetencion(
  revision: Pick<RevisionVista, "clienteId" | "anio" | "periodo" | "periodos">,
): Promise<CruceRetencionVista> {
  const umbrales = await getUmbralesAlertas();
  const umbral = Number.isFinite(umbrales.impuestos_diferencia) ? umbrales.impuestos_diferencia : UMBRAL_IMPUESTOS_DIFERENCIA;

  const { candidatos, vigentes, capturaPorLote } = await cargarCandidatosBalanceCruce(revision.clienteId, true);
  const opciones = { exigirDetalleTercero: true, vigentes, modulo: "Retención en la fuente" };
  // Si sirve más de un balance del corte, el escogido por el usuario o el de modificación más reciente.
  const { balance: elegido, eleccion: eleccionBalance } = await resolverBalanceCruceDelPeriodo({
    clienteId: revision.clienteId,
    moduloCodigo: MODULO_RETENCION,
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

  const agrupadoras = cuentasAgrupadorasExcluidas(contexto.prevalidador);
  const capturaId = capturaPorLote.get(elegido.loteId as string) as number;
  const [crudas, crudasFuera, mapeo, marcas] = await Promise.all([
    prisma.balanceTerceroDetalle.findMany({
      where: { encabezadoId: capturaId, OR: prefijosRetencion().map((p) => ({ cuenta6Russell: { startsWith: p } })) },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, nitTercero: true, nombreTercero: true, saldoInicial: true, saldoFinal: true },
    }),
    // Cuentas del cliente en 2365/2367 que no llegan al cruce porque están homologadas a otro grupo o sin homologar.
    prisma.balanceTerceroDetalle.findMany({
      where: {
        encabezadoId: capturaId,
        OR: prefijosRetencion().map((p) => ({ cuenta8: { startsWith: p } })),
        AND: [{ OR: [{ cuenta6Russell: null }, { NOT: { OR: prefijosRetencion().map((p) => ({ cuenta6Russell: { startsWith: p } })) } }] }],
      },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, nitTercero: true, nombreTercero: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
    }),
    cargarMapeoDian("350"),
    prisma.marcaCruceModulo.findMany({
      where: { clienteId: revision.clienteId, moduloCodigo: MODULO_RETENCION, periodo: revision.periodo, dimension: "cuenta4" },
      orderBy: { numero: "asc" },
    }),
  ]);
  // Sin agrupadoras ni el total de la cuenta leído como tercero (lo doblaría).
  const filasContables = filasEfectivasTercero(crudas.filter((d) => !agrupadoras.has(d.cuenta8.replace(/\D/g, "")) && !esTotalDeCuentaComoTercero(d)))
    .filter((d) => d.cuenta6Russell)
    .map((d) => ({
      cuentaCliente: d.cuenta8,
      nombreCuenta: d.nombreCuenta,
      cuentaRussell: (d.cuenta6Russell as string).replace(/\D/g, "").slice(0, 6),
      nit: d.nitTercero,
      nombreTercero: d.nombreTercero,
      saldoInicial: Number(d.saldoInicial),
      saldoFinal: Number(d.saldoFinal),
    }));
  const filasFueraDeRetencion: FilaFueraDeRetencion[] = filasEfectivasTercero(crudasFuera.filter((d) => !agrupadoras.has(d.cuenta8.replace(/\D/g, "")) && !esTotalDeCuentaComoTercero(d)))
    .map((d) => ({
      cuentaCliente: d.cuenta8,
      nombreCuenta: d.nombreCuenta,
      cuentaRussell: d.cuenta6Russell ? d.cuenta6Russell.replace(/\D/g, "").slice(0, 6) : null,
      saldoFinal: Number(d.saldoFinal),
    }));
  const cuentasDestino = [...new Set(filasFueraDeRetencion.flatMap((f) => (f.cuentaRussell ? [f.cuentaRussell] : [])))];
  const planDestino = cuentasDestino.length
    ? await prisma.standardAccount.findMany({ where: { code: { in: cuentasDestino } }, select: { code: true, name: true } })
    : [];
  const inicioEnero = balance.periodoInicio === `${revision.anio}-01-01`;
  const resultado = cruceRetencion({
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
