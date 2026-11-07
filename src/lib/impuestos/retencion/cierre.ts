import { alcanceSaldoInicial, etiquetaFilaCruce, type CruceRetencionVista } from "./cruce";
import type { FilaOportunidad } from "./oportunidad";
import type { ResultadoPagos } from "./pagos";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Qué falta para cerrar en firme una revisión de Retención en la fuente (puro). Exige: cada período
 * del corte con su 350 confirmado o su causal, el 350 original cargado cuando llegó una corrección
 * (una marca no lo reemplaza), ningún formulario por confirmar en esos períodos, el cruce contable
 * disponible y marca en cada fila desde el umbral, marca en lo restado como saldo inicial (si se
 * restó), y marca en cada mes con «Diferencia en el pago», con un recibo que paga un 350 de otro
 * período o con recibos 490 sin 350 (también con la causal de que no hubo formulario). Los avisos no
 * impiden cerrar.
 */

export type TipoPendiente = "formularios" | "cruce" | "pagos" | "saldo_inicial";

export type PendienteCierre = { tipo: TipoPendiente; texto: string };

export type EvaluacionCierreRetencion = { pendientes: PendienteCierre[]; avisos: string[] };

const pesos = (n: number) => `${n < 0 ? "-" : ""}$ ${Math.abs(n).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;

export function evaluarCierreRetencion(e: {
  periodos: readonly PeriodoRevision[];
  cruce: CruceRetencionVista;
  pagos: ResultadoPagos;
  oportunidad: readonly FilaOportunidad[];
  etiquetaPeriodo: (periodo: number) => string;
}): EvaluacionCierreRetencion {
  const pendientes: PendienteCierre[] = [];
  const avisos: string[] = [];
  const etq = e.etiquetaPeriodo;

  for (const p of e.periodos) {
    if (!p.cadena.vigente && !p.causal) pendientes.push({ tipo: "formularios", texto: `${etq(p.periodo)}: falta el 350 o la causal de que no hubo formulario.` });
    if (p.cadena.vigente && p.cadena.faltaOriginal) {
      pendientes.push({ tipo: "formularios", texto: `${etq(p.periodo)}: falta el 350 original ${p.cadena.faltaOriginal}; hay que cargarlo para cerrar en firme.` });
    }
    if (p.porConfirmar > 0) {
      pendientes.push({ tipo: "formularios", texto: `${etq(p.periodo)}: ${p.porConfirmar} ${p.porConfirmar === 1 ? "formulario" : "formularios"} por confirmar.` });
    }
    for (const a of p.avisos) avisos.push(`${etq(p.periodo)}: ${a}`);
  }

  if (e.cruce.estado !== "listo") {
    pendientes.push({ tipo: "cruce", texto: `Cruce contable: ${e.cruce.mensaje}` });
  } else {
    for (const f of e.cruce.resultado.grupos.flatMap((g) => g.filas)) {
      if (!f.requiereMarca || f.marca?.vigente) continue;
      pendientes.push({
        tipo: "cruce",
        texto: `Cruce contable · ${etiquetaFilaCruce(f)}: la diferencia de ${pesos(f.diferencia)} ${f.marca ? "tiene la marca desactualizada" : "exige marca"}.`,
      });
    }
    if (e.cruce.resultado.grupos.some((g) => g.filas.some((f) => f.posiblesDian.length > 0))) {
      avisos.push("Cruce contable: hay terceros sin NIT con nombre de la DIAN que no se restaron.");
    }
    // Lo restado como saldo inicial se documenta con una marca en Novedades: sin ella (o si el total
    // cambió) es pendiente; con ella queda como aviso. Una copia antigua sin el dato no lo menciona.
    const inicial = e.cruce.resultado.saldoInicial;
    if (inicial?.restado) {
      const marca = e.cruce.resultado.marcaSaldoInicial;
      const texto = `se restó el saldo inicial de ${alcanceSaldoInicial(inicial)}, por ${pesos(inicial.monto)}`;
      if (marca?.vigente) avisos.push(`Cruce contable: ${texto} (marca ${marca.numero}).`);
      else pendientes.push({ tipo: "saldo_inicial", texto: `Saldo inicial restado: ${texto}, ${marca ? "con la marca desactualizada" : "sin marca"}.` });
    }
  }

  for (const f of e.pagos.filas) {
    if (!f.requiereMarca || f.marca?.vigente) continue;
    const sin350 = f.recibosSin350 ?? [];
    const motivos = [
      ...(sin350.length > 0
        ? [`el mes no tiene 350 y tiene ${sin350.length === 1 ? "un recibo 490" : `${sin350.length} recibos 490`} por ${pesos(f.totalPagado)}`]
        : f.diferencia !== 0 ? [`diferencia en el pago de ${pesos(f.diferencia)}`] : []),
      ...(f.recibosDeOtro350 ?? []).map((r) => `el recibo ${r.numero} paga el formulario ${r.numeroPagado}, que no es un 350 de este período`),
    ];
    pendientes.push({
      tipo: "pagos",
      texto: `${etq(f.periodo)}: ${motivos.join("; ")} ${f.marca ? "con la marca desactualizada" : "sin marca"}.`,
    });
  }

  return { pendientes, avisos };
}
