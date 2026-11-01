import "server-only";
import prisma from "@/lib/prisma";
import { agruparPorCorte, balancesVigentesDelCorte } from "@/lib/balance/corte";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import { esTotalDeCuentaComoTercero, filasEfectivasTercero } from "@/lib/balance/staging-tercero";
import { UMBRAL_IMPUESTOS_DIFERENCIA } from "@/lib/balance/umbrales-alertas";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import {
  cuentasAgrupadorasExcluidas,
  describirBalanceCruce,
  motivoSinBalanceCruce,
  seleccionarBalanceCruceModulo,
  validarCompuertaPrevalidador,
} from "@/lib/modulos/compuerta-cruce";
import { cargarMapeoDian } from "../configuracion-servidor";
import { cruceRetencion, prefijosRetencion, type BalanceCruceRetencion, type CruceRetencionVista } from "./cruce";
import type { RevisionVista } from "./revision-servidor";

/**
 * Cruce contable de una revisión de Retención en la fuente: elige el balance del corte (cerrado,
 * vigente, que termine en el mes de corte y CON detalle por tercero), exige la aprobación vigente
 * de su prevalidador (sin pedir que Retención esté en su catálogo) y cruza contra su detalle por
 * tercero ligado por \`loteId\`. Sin caché: la pantalla muestra siempre lo vigente.
 */

export const MODULO_RETENCION = "RET";

export async function cargarCruceRetencion(
  revision: Pick<RevisionVista, "clienteId" | "anio" | "periodo" | "periodos" | "restarSaldoInicial" | "saldoInicialRestadoPor" | "saldoInicialRestadoEn">,
): Promise<CruceRetencionVista> {
  const umbrales = await getUmbralesAlertas();
  const umbral = Number.isFinite(umbrales.impuestos_diferencia) ? umbrales.impuestos_diferencia : UMBRAL_IMPUESTOS_DIFERENCIA;

  const balances = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: revision.clienteId },
    select: { id: true, clienteId: true, periodo: true, periodoInicio: true, periodoFin: true, version: true, estaCongelado: true, loteId: true, aperturaBalance: true, creadoEn: true },
    orderBy: [{ periodoFin: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
  });
  const vigentes = new Set([...agruparPorCorte(balances).values()].flatMap((delCorte) => balancesVigentesDelCorte(delCorte).map((b) => b.id)));
  const lotes = balances.map((b) => b.loteId).filter((l): l is string => l != null);
  const capturas = lotes.length
    ? await prisma.balanceTerceroEncabezado.findMany({ where: { clienteId: revision.clienteId, loteId: { in: lotes } }, select: { id: true, loteId: true } })
    : [];
  const capturaPorLote = new Map(capturas.map((c) => [c.loteId as string, c.id]));
  const candidatos = balances.map((b) => ({ ...b, conDetalleTercero: b.loteId != null && capturaPorLote.has(b.loteId) }));
  const opciones = { exigirDetalleTercero: true, vigentes, modulo: "Retención en la fuente" };
  const elegido = seleccionarBalanceCruceModulo(candidatos, revision.periodo, opciones);
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
    return { estado: "bloqueado", mensaje: "No fue posible verificar de forma íntegra el prevalidador del balance del corte.", balance, umbral };
  }
  const bloqueo = validarCompuertaPrevalidador(contexto, revision.clienteId, null);
  if (bloqueo) return { estado: "bloqueado", mensaje: bloqueo, balance, umbral };

  const agrupadoras = cuentasAgrupadorasExcluidas(contexto.prevalidador);
  const capturaId = capturaPorLote.get(elegido.loteId as string) as number;
  const [crudas, mapeo, marcas] = await Promise.all([
    prisma.balanceTerceroDetalle.findMany({
      where: { encabezadoId: capturaId, OR: prefijosRetencion().map((p) => ({ cuenta6Russell: { startsWith: p } })) },
      select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, nitTercero: true, nombreTercero: true, saldoInicial: true, saldoFinal: true },
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
  const inicioEnero = balance.periodoInicio === `${revision.anio}-01-01`;
  const resultado = cruceRetencion({
    periodos: revision.periodos,
    mapeo: mapeo.filas,
    sinRestaDian: new Set(mapeo.cuentas.filter((c) => !c.restarTerceroDian).map((c) => c.cuenta)),
    tercerosDian: mapeo.terceros,
    nombresRussell: new Map(mapeo.cuentas.filter((c) => c.nombre).map((c) => [c.cuenta, c.nombre as string])),
    filasContables,
    inicioEnero,
    restarSaldoInicial: revision.restarSaldoInicial,
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
    estado: "listo", mensaje: null, balance, umbral, inicioEnero, resultado, huellaBalance: contexto.huella,
    restaSaldoInicial: revision.restarSaldoInicial ? { por: revision.saldoInicialRestadoPor, en: revision.saldoInicialRestadoEn } : null,
  };
}
