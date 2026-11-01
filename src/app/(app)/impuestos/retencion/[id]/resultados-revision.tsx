"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { fmt, fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { cerrarRevisionRetencion, desbloquearRevisionRetencion } from "@/app/actions/impuestos-retencion";
import type { ActionState } from "@/lib/definitions";
import { MIN_JUSTIFICACION_DESBLOQUEO } from "@/lib/conciliacion/cuentas-bloqueo";
import { ETIQUETA_OPORTUNIDAD, type EstadoOportunidad, type FilaOportunidad } from "@/lib/impuestos/retencion/oportunidad";
import { alertaSinRecibo, conceptosSinRecibo, ETIQUETA_PAGO, type FilaPagos, type ResultadoPagos } from "@/lib/impuestos/retencion/pagos";
import type { EvaluacionCierreRetencion, TipoPendiente } from "@/lib/impuestos/retencion/cierre";
import type { CierreRetencionVista } from "@/lib/impuestos/retencion/resultados-servidor";
import { CeldaMarca, MarcaModal } from "./marca-modal";
import type { TabRevisionRetencion } from "./tabs";

// Oportunidad, pagos efectuados, novedades (qué falta para cerrar) y la barra de cierre en firme.

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const NUM = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const TONO_OPORTUNIDAD: Record<EstadoOportunidad, "ok" | "warn" | "err" | "ink"> = {
  oportuno: "ok", extemporaneo: "err", sin_formulario: "ink", falta_350: "err", falta_original: "warn", sin_fecha: "warn", sin_calendario: "warn", sin_pago: "err", nada_que_pagar: "ink",
};

function EstadoOportunidadChip({ estado, dias }: { estado: EstadoOportunidad; dias: number | null }) {
  return <Chip label={dias ? `${ETIQUETA_OPORTUNIDAD[estado]} · ${dias} ${dias === 1 ? "día" : "días"}` : ETIQUETA_OPORTUNIDAD[estado]} tone={TONO_OPORTUNIDAD[estado]} />;
}

function ObservacionesMarcas({ filas, etiqueta, puedeEditar, onEditar }: {
  filas: { clave: string; titulo: string; marca: NonNullable<FilaOportunidad["marca"]>; hoy?: number }[];
  etiqueta: string;
  puedeEditar: boolean;
  onEditar: (clave: string) => void;
}) {
  if (filas.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-2 py-2">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Observaciones · {etiqueta}</h3>
      </div>
      <ul className="divide-y divide-ink-100">
        {filas.map(({ clave, titulo, marca: m, hoy }) => (
          <li key={clave} id={`marca-retencion-${m.numero}`} className="flex flex-col gap-0.5 px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${m.vigente ? "border-navy-700 text-navy-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>{m.numero}</span>
              <span className="font-semibold text-ink-800">{titulo}</span>
              {hoy !== undefined && <span className="tabular-nums text-ink-500">diferencia {fmt(m.diferencia)}</span>}
              {!m.vigente && <Chip label={hoy !== undefined ? `Desactualizada · hoy ${fmt(hoy)}` : "Ya no hace falta"} tone="warn" />}
              {puedeEditar && <button type="button" onClick={() => onEditar(clave)} className={`ml-auto ${BOTON_SECUNDARIO}`}>Editar</button>}
            </div>
            <p className="whitespace-pre-line text-ink-700">{m.nota}</p>
            <p className="text-[11px] text-ink-400">{m.referenciaAnexo ? `Ref. ${m.referenciaAnexo} · ` : ""}{m.marcadoPor ?? "—"} · {fmtDateTime(m.marcadoEn)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function VistaOportunidad({
  filas,
  calendario,
  anio,
  etiquetaPeriodo,
  revisionId,
  puedeEditar,
}: {
  filas: FilaOportunidad[];
  calendario: { cargado: boolean; aplica: boolean };
  anio: number;
  etiquetaPeriodo: (p: number) => string;
  revisionId: number;
  puedeEditar: boolean;
}) {
  const [marcando, setMarcando] = useState<string | null>(null);
  const fila = filas.find((f) => f.clave === marcando) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1 p-4 text-[12px] text-ink-500">
        <p>
          Vencimiento según el calendario tributario del año, el período y el último dígito del NIT (sin el dígito de verificación). La presentación es la del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección); el pago, la del último recibo 490 del concepto 61. Igual o antes del vencimiento es «Oportuno».
        </p>
        {!calendario.aplica && <p className="text-warn-700">La periodicidad del cliente no es mensual: el calendario no tiene una fecha límite por período.</p>}
        {calendario.aplica && !calendario.cargado && (
          <p className="text-warn-700">
            No hay calendario tributario de {anio}. Impórtalo en <Link href={`/config/calendario-tributario?anio=${anio}`} className="font-semibold underline">Calendario tributario</Link>.
          </p>
        )}
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[960px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-2 py-2">Período</th>
              <th className="px-2 py-2">350 · autoadhesivo</th>
              <th className="px-2 py-2">Pago · autoadhesivo</th>
              <th className="px-2 py-2">Vence</th>
              <th className="px-2 py-2">Presentó</th>
              <th className="px-2 py-2">Presentación</th>
              <th className="px-2 py-2">Pagó</th>
              <th className="px-2 py-2">Pago</th>
              <th className="px-3 py-2 text-center">Marca</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.periodo} className="border-b border-ink-100 align-top last:border-0">
                <td className="px-2 py-1.5 font-semibold text-navy-800">{etiquetaPeriodo(f.periodo)}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  <div>{f.numero350 ?? "—"}</div>
                  <div className="text-[11px] text-ink-400">{f.autoadhesivo350 ?? ""}</div>
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  <div>{f.numeroPago ?? "—"}{f.conceptoPago ? <span className="ml-1 text-[11px] text-ink-400">({f.conceptoPago})</span> : null}</div>
                  <div className="text-[11px] text-ink-400">{f.autoadhesivoPago ?? ""}</div>
                  {f.pagoSinConcepto61 && <div className="text-[11px] text-warn-700">Sin recibo del 61</div>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{fecha(f.vencimiento)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fecha(f.presentacion)}</td>
                <td className="px-2 py-1.5"><EstadoOportunidadChip estado={f.estadoPresentacion} dias={f.diasPresentacion} /></td>
                <td className="px-2 py-1.5 tabular-nums">{fecha(f.pago)}</td>
                <td className="px-2 py-1.5"><EstadoOportunidadChip estado={f.estadoPago} dias={f.diasPago} /></td>
                <td className="px-2 py-1.5 text-center">
                  <CeldaMarca marca={f.marca} requiereMarca={f.requiereMarca} admiteMarca={f.requiereMarca} puedeEditar={puedeEditar} ancla={`marca-retencion-${f.marca?.numero ?? ""}`} onMarcar={() => setMarcando(f.clave)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ObservacionesMarcas
        etiqueta="marcas de oportunidad"
        puedeEditar={puedeEditar}
        onEditar={setMarcando}
        filas={filas.filter((f) => f.marca).map((f) => ({ clave: f.clave, titulo: `${etiquetaPeriodo(f.periodo)} · falta el original`, marca: f.marca! }))}
      />
      {fila && (
        <MarcaModal
          key={fila.clave}
          revisionId={revisionId}
          clave={fila.clave}
          titulo={`${etiquetaPeriodo(fila.periodo)} · oportunidad`}
          marca={fila.marca}
          conCifra={false}
          diferencia={0}
          placeholder="Ej.: el cliente no entregó el 350 original; se presentó a tiempo según la DIAN (consulta del …)."
          resumen={<>La corrección de {etiquetaPeriodo(fila.periodo).toLowerCase()} llegó sin el 350 original: no se puede medir la presentación. Explica por qué falta o cómo se verificó.</>}
          onClose={() => setMarcando(null)}
        />
      )}
    </div>
  );
}

export function VistaPagos({
  resultado,
  etiquetaPeriodo,
  revisionId,
  puedeEditar,
}: {
  resultado: ResultadoPagos;
  etiquetaPeriodo: (p: number) => string;
  revisionId: number;
  puedeEditar: boolean;
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set());
  const [marcando, setMarcando] = useState<string | null>(null);
  const fila = resultado.filas.find((f) => f.clave === marcando) ?? null;
  const alternar = (p: number) => setAbiertas((prev) => {
    const sig = new Set(prev);
    if (sig.has(p)) sig.delete(p);
    else sig.add(p);
    return sig;
  });
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 text-[12px] text-ink-500">
        Por período, el 350 vigente contra los recibos 490 de su cadena. Diferencia = (136 − impuesto pagado) + (137 − sanción pagada); los intereses de mora se muestran y no generan diferencia. Se compara al peso: toda diferencia exige marca para cerrar. Despliega un período para ver qué falta por concepto (130 contra el 61, 134 contra el 62 y 135 contra el 63). La columna Alerta dice qué recibo 490 falta adjuntar.
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-2 py-2">Período</th>
              <th className="px-3 py-2 text-right">Retenciones (136)</th>
              <th className="px-3 py-2 text-right">Sanciones (137)</th>
              <th className="px-3 py-2 text-right">Total (138)</th>
              <th className="px-3 py-2 text-right">Impuesto pagado</th>
              <th className="px-3 py-2 text-right">Sanción pagada</th>
              <th className="px-3 py-2 text-right">Intereses</th>
              <th className="px-3 py-2 text-right">Total pagado</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Alerta</th>
              <th className="px-3 py-2 text-center">Marca</th>
            </tr>
          </thead>
          <tbody>
            {resultado.filas.map((f) => (
              <FilaPago key={f.periodo} f={f} etiqueta={etiquetaPeriodo(f.periodo)} abierta={abiertas.has(f.periodo)} onAlternar={() => alternar(f.periodo)} puedeEditar={puedeEditar} onMarcar={() => setMarcando(f.clave)} />
            ))}
            <tr className="bg-navy-50 font-semibold text-navy-800">
              <td className="px-2 py-1.5">Total</td>
              <td className={NUM}>{fmt(resultado.total.retenciones)}</td>
              <td className={NUM}>{fmt(resultado.total.sanciones)}</td>
              <td className={NUM}>{fmt(resultado.total.totalDeclarado)}</td>
              <td className={NUM}>{fmt(resultado.total.impuestoPagado)}</td>
              <td className={NUM}>{fmt(resultado.total.sancionPagada)}</td>
              <td className={NUM}>{fmt(resultado.total.intereses)}</td>
              <td className={NUM}>{fmt(resultado.total.totalPagado)}</td>
              <td className={NUM}>{fmt(resultado.total.diferencia)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </Card>
      <ObservacionesMarcas
        etiqueta="marcas de pagos"
        puedeEditar={puedeEditar}
        onEditar={setMarcando}
        filas={resultado.filas.filter((f) => f.marca).map((f) => ({ clave: f.clave, titulo: `${etiquetaPeriodo(f.periodo)} · pagos`, marca: f.marca!, hoy: f.diferencia }))}
      />
      {fila && (
        <MarcaModal
          key={fila.clave}
          revisionId={revisionId}
          clave={fila.clave}
          titulo={`${etiquetaPeriodo(fila.periodo)} · pagos`}
          marca={fila.marca}
          diferencia={fila.diferencia}
          placeholder="Ej.: el recibo del reteIVA (concepto 62) se pagó en el mes siguiente; ver anexo."
          resumen={<>Diferencia en el pago: <span className="font-semibold tabular-nums text-ink-800">{fmt(fila.diferencia)}</span> (declarado {fmt(fila.retenciones + fila.sanciones)} − pagado {fmt(fila.impuestoPagado + fila.sancionPagada)}).</>}
          onClose={() => setMarcando(null)}
        />
      )}
    </div>
  );
}

function FilaPago({ f, etiqueta, abierta, onAlternar, puedeEditar, onMarcar }: { f: FilaPagos; etiqueta: string; abierta: boolean; onAlternar: () => void; puedeEditar: boolean; onMarcar: () => void }) {
  const conFormulario = f.estado === "completo" || f.estado === "diferencia";
  return (
    <Fragment>
      <tr className="border-b border-ink-100 align-top">
        <td className="px-2 py-1.5">
          {conFormulario ? (
            <button type="button" onClick={onAlternar} aria-expanded={abierta} className="flex items-center gap-1.5 font-semibold text-navy-800">
              <Icon name={chevronDivulgacion(abierta)} size={13} className="text-ink-400" />
              {etiqueta}
            </button>
          ) : (
            <span className="pl-5 font-semibold text-navy-800">{etiqueta}</span>
          )}
        </td>
        {conFormulario ? (
          <>
            <td className={NUM}>{fmt(f.retenciones)}</td>
            <td className={NUM}>{fmt(f.sanciones)}</td>
            <td className={NUM}>{fmt(f.totalDeclarado)}</td>
            <td className={NUM}>{fmt(f.impuestoPagado)}</td>
            <td className={NUM}>{fmt(f.sancionPagada)}</td>
            <td className={NUM}>{fmt(f.intereses)}</td>
            <td className={NUM}>{fmt(f.totalPagado)}</td>
            <td className={`${NUM} font-semibold ${f.diferencia === 0 ? "text-ok-700" : "text-err-700"}`}>{fmt(f.diferencia)}</td>
          </>
        ) : (
          <td colSpan={8} className="px-2 py-1.5 text-ink-400">—</td>
        )}
        <td className="px-2 py-1.5">
          <Chip label={f.estado === "diferencia" && f.marca?.vigente ? "Marcada" : ETIQUETA_PAGO[f.estado]} tone={f.estado === "completo" ? "ok" : f.estado === "diferencia" ? (f.marca?.vigente ? "blue" : "warn") : f.estado === "falta_350" ? "err" : "ink"} />
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-[11.5px] font-semibold leading-5 text-err-700">
          {conceptosSinRecibo(f).map((d) => (
            <div key={d.concepto} title={`Paga el renglón ${d.renglon}: ${fmt(d.declarado)}`}>{alertaSinRecibo(d)}</div>
          ))}
        </td>
        <td className="px-2 py-1.5 text-center">
          <CeldaMarca
            marca={f.marca}
            requiereMarca={f.requiereMarca}
            admiteMarca={f.requiereMarca}
            puedeEditar={puedeEditar}
            ancla={`marca-retencion-${f.marca?.numero ?? ""}`}
            tituloDesactualizada={f.marca ? `Marca ${f.marca.numero} · la diferencia era ${fmt(f.marca.diferencia)} y hoy es ${fmt(f.diferencia)}` : undefined}
            onMarcar={onMarcar}
          />
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-ink-100 bg-ink-50/40">
          <td colSpan={12} className="px-6 py-2">
            <table className="text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                  <th className="py-1 pr-6">Concepto</th>
                  <th className="py-1 pr-6 text-right">Declarado</th>
                  <th className="py-1 pr-6 text-right">Pagado (36)</th>
                  <th className="py-1 pr-6 text-right">Diferencia</th>
                  <th className="py-1">Recibos</th>
                </tr>
              </thead>
              <tbody>
                {f.desglose.map((d) => (
                  <tr key={d.concepto}>
                    <td className="py-0.5 pr-6 text-ink-700">{d.renglon} contra el concepto {d.concepto}</td>
                    <td className="py-0.5 pr-6 text-right tabular-nums">{fmt(d.declarado)}</td>
                    <td className="py-0.5 pr-6 text-right tabular-nums">{fmt(d.pagado)}</td>
                    <td className={`py-0.5 pr-6 text-right tabular-nums ${d.diferencia === 0 ? "text-ink-500" : "font-semibold text-err-700"}`}>{fmt(d.diferencia)}</td>
                    <td className="py-0.5 tabular-nums text-ink-500">{d.recibos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

const ETIQUETA_PENDIENTE: Record<TipoPendiente, { titulo: string; tab: TabRevisionRetencion }> = {
  formularios: { titulo: "Formularios", tab: "formularios" },
  cruce: { titulo: "Cruce contable", tab: "cruce" },
  pagos: { titulo: "Pagos efectuados", tab: "pagos" },
  oportunidad: { titulo: "Oportunidad", tab: "oportunidad" },
};

export function VistaNovedades({ evaluacion, enFirme, onIr }: { evaluacion: EvaluacionCierreRetencion; enFirme: boolean; onIr: (tab: TabRevisionRetencion) => void }) {
  const tipos = (Object.keys(ETIQUETA_PENDIENTE) as TipoPendiente[]).filter((t) => evaluacion.pendientes.some((p) => p.tipo === t));
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 text-[12.5px]">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Para cerrar en firme</h3>
        {enFirme ? (
          <p className="mt-1 text-ink-500">La revisión está en firme.</p>
        ) : evaluacion.pendientes.length === 0 ? (
          <p className="mt-1 text-ok-700">No falta nada: el senior o el gerente asignado puede cerrarla en firme.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {tipos.map((t) => (
              <div key={t}>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">{ETIQUETA_PENDIENTE[t].titulo}</span>
                  <button type="button" onClick={() => onIr(ETIQUETA_PENDIENTE[t].tab)} className="text-[11.5px] font-semibold text-blue-700 hover:underline">Ir →</button>
                </div>
                <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-700">
                  {evaluacion.pendientes.filter((p) => p.tipo === t).map((p, i) => <li key={i}>{p.texto}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-4 text-[12.5px]">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Avisos</h3>
        {evaluacion.avisos.length === 0 ? (
          <p className="mt-1 text-ink-400">Sin avisos.</p>
        ) : (
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-700">
            {evaluacion.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] text-ink-400">Los avisos no impiden cerrar. Las alertas de la carga y del cruce aún no están diseñadas.</p>
      </Card>
    </div>
  );
}

/** Estado del cierre en firme con «Cerrar en firme» o «Desbloquear». */
export function BarraCierre({
  revisionId,
  enFirme,
  cierre,
  pendientes,
  puedeCerrar,
  puedeDesbloquear,
  onVerNovedades,
}: {
  revisionId: number;
  enFirme: boolean;
  cierre: CierreRetencionVista | null;
  pendientes: number;
  puedeCerrar: boolean;
  puedeDesbloquear: boolean;
  onVerNovedades: () => void;
}) {
  const [panel, setPanel] = useState<"cerrar" | "desbloquear" | null>(null);
  if (enFirme && cierre) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-300 bg-navy-50 px-3 py-2 text-[12px] text-ink-800">
        <Icon name="shield" size={13} className="text-navy-700" />
        <span>
          <b className="text-navy-800">En firme</b> · cerró {cierre.cerradoPor} el {fmtDateTime(cierre.cerradoEn)} · {cierre.cuentasBloqueadas} cuenta(s) del balance {cierre.balancePeriodo} bloqueada(s)
          {cierre.huella ? <span className="text-ink-500"> · copia congelada {cierre.huella.slice(0, 12)}</span> : null}
        </span>
        {puedeDesbloquear && <button type="button" onClick={() => setPanel("desbloquear")} className={`ml-auto ${BOTON_SECUNDARIO}`}>Desbloquear</button>}
        {panel === "desbloquear" && <PanelDesbloquear revisionId={revisionId} onClose={() => setPanel(null)} />}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {pendientes > 0 ? (
        <button type="button" onClick={onVerNovedades} className="font-semibold text-warn-700 hover:underline">
          {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"} para cerrar
        </button>
      ) : (
        <span className="font-semibold text-ok-700">Lista para cerrar en firme</span>
      )}
      {cierre?.estado === "desbloqueado" && (
        <span className="text-ink-500">· desbloqueada por {cierre.desbloqueadoPor} el {fmtDateTime(cierre.desbloqueadoEn)}</span>
      )}
      {puedeCerrar && (
        <button type="button" disabled={pendientes > 0} onClick={() => setPanel("cerrar")} className={BOTON_PRIMARIO} title={pendientes > 0 ? "Resuelve los pendientes de Novedades" : undefined}>
          Cerrar en firme
        </button>
      )}
      {panel === "cerrar" && <PanelCerrar revisionId={revisionId} onClose={() => setPanel(null)} />}
    </div>
  );
}

function PanelCerrar({ revisionId, onClose }: { revisionId: number; onClose: () => void }) {
  const [state, action, cerrando] = useActionState<ActionState, FormData>(cerrarRevisionRetencion, {});
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión en firme.", error: "No se pudo cerrar la revisión." });
  }, [state]);
  return (
    <Modal open onClose={onClose} title="Cerrar en firme" size="lg" footer={
      <button type="submit" form="cerrar-revision" disabled={cerrando} className={BOTON_PRIMARIO}>
        {cerrando ? <EstadoProcesando>Cerrando</EstadoProcesando> : "Sí, cerrar en firme"}
      </button>
    }>
      <form id="cerrar-revision" action={action} className="flex flex-col gap-2 text-[12.5px] text-ink-700">
        <input type="hidden" name="revisionId" value={revisionId} />
        <p>Al cerrar en firme:</p>
        <ul className="list-disc pl-5">
          <li>La revisión queda de solo lectura y guarda una copia congelada de sus resultados.</li>
          <li>Queda bloqueado el saldo final y la homologación de las cuentas del cliente que entraron al cruce, en el balance del corte.</li>
          <li>Para cambiar algo después, el senior o el gerente asignado la desbloquea con una justificación.</li>
        </ul>
      </form>
    </Modal>
  );
}

function PanelDesbloquear({ revisionId, onClose }: { revisionId: number; onClose: () => void }) {
  const [state, action, desbloqueando] = useActionState<ActionState, FormData>(desbloquearRevisionRetencion, {});
  const [justificacion, setJustificacion] = useState("");
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión desbloqueada.", error: "No se pudo desbloquear la revisión." });
  }, [state]);
  return (
    <Modal open onClose={onClose} title="Desbloquear la revisión" size="lg" footer={
      <button type="submit" form="desbloquear-revision" disabled={desbloqueando || justificacion.trim().length < MIN_JUSTIFICACION_DESBLOQUEO} className={BOTON_PRIMARIO}>
        {desbloqueando ? <EstadoProcesando>Desbloqueando</EstadoProcesando> : "Desbloquear"}
      </button>
    }>
      <form id="desbloquear-revision" action={action} className="flex flex-col gap-2 text-[12.5px]">
        <input type="hidden" name="revisionId" value={revisionId} />
        <p className="text-ink-600">La revisión vuelve a estar en proceso y se liberan las cuentas bloqueadas. La justificación queda en la bitácora.</p>
        <textarea
          name="justificacion"
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Ej.: llegó la corrección del 350 de marzo."
          aria-label="Justificación"
          className="rounded-md border border-ink-200 bg-white px-2 py-1.5"
        />
      </form>
    </Modal>
  );
}
