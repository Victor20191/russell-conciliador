"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useAnunciarPestanaAyuda } from "@/components/ayuda/contexto";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmt, fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import {
  confirmarFormulariosDian,
  eliminarRevisionRetencion,
  importarFormularioDian,
  quitarPeriodoSinFormulario,
  registrarPeriodoSinFormulario,
} from "@/app/actions/impuestos-retencion";
import type { ActionState } from "@/lib/definitions";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { etiquetaConceptoPago } from "@/lib/impuestos/formularios/f490";
import { lecturaConErrores } from "@/lib/impuestos/retencion/lectura";
import {
  avisoFaltaOriginal,
  avisoFueraDeCadena,
  avisoReciboDeOtro350,
  avisoRecibosSin350,
  ETIQUETA_ESTADO_PERIODO,
  recibosSin350,
  type EstadoPeriodo,
  type PeriodoRevision,
} from "@/lib/impuestos/retencion/periodos-revision";
import { alertaRecibosSin350, alertaSinRecibo } from "@/lib/impuestos/retencion/pagos";
import type { FormularioVista, RevisionVista } from "@/lib/impuestos/retencion/revision-servidor";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
import { ControlesModal } from "./controles-modal";
import { FormularioModal } from "./formulario-modal";
import { VistaAcumulada, VistaPorMeses } from "./vistas-revision";
import { CruceRevision } from "./cruce-revision";
import { BarraCierre, VistaNovedades, VistaOportunidad, VistaPagos } from "./resultados-revision";
import type { ResultadosPantalla } from "@/lib/impuestos/retencion/resultados-servidor";
import { etiquetaPeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
import type { TabRevisionRetencion } from "./tabs";

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const ENLACE = "tabular-nums font-semibold text-blue-700 hover:underline";
const TONO_ESTADO: Record<EstadoPeriodo, "ok" | "warn" | "err" | "ink" | "blue"> = {
  completo: "ok", por_confirmar: "warn", falta_350: "err", sin_formulario: "ink", falta_original: "warn", faltan_pagos: "warn",
};
const CONCURRENCIA_LECTURA = 2;
const mes = (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`;

type EnCola = { nombre: string; estado: "pendiente" | "leyendo" | "ok" | "error"; mensaje?: string };

export default function RevisionClient({
  revision,
  resultados,
  puedeCargar,
  puedeEditar,
  puedeEliminar,
  puedeCerrar,
  puedeDesbloquear,
}: {
  revision: RevisionVista;
  resultados: ResultadosPantalla;
  puedeCargar: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  puedeCerrar: boolean;
  puedeDesbloquear: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [causalDe, setCausalDe] = useState<number | null>(null);
  const formularioAbierto = revision.formularios.find((f) => f.id === abierto) ?? null;
  const porConfirmar = revision.formularios.filter((f) => f.estado === "por_confirmar");
  const contexto = { revisionId: revision.id, nitCliente: revision.nitCliente, anio: revision.anio, mesCorte: revision.mesCorte };
  const porId = new Map(revision.formularios.map((f) => [f.id, f]));
  const [tab, setTab] = useState<TabRevisionRetencion>("formularios");
  useAnunciarPestanaAyuda(tab);
  // En firme, los períodos salen de la copia congelada del cierre.
  const periodos = resultados.periodos;
  const vista = useMemo(() => vistasRevision(periodos), [periodos]);
  const enFirme = revision.estado === "en_firme";
  const etiquetaPeriodo = (p: number) => etiquetaPeriodoRevision(revision.periodicidad, p);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 text-[12.5px]">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Dato etiqueta="NIT" valor={revision.nitCliente} />
            <Dato etiqueta="Año" valor={String(revision.anio)} />
            <Dato etiqueta="Corte" valor={`${mes(revision.mesCorte)}${revision.mesCorte === 9 ? " · precierre" : revision.mesCorte === 12 ? " · cierre" : ""}`} />
            <Dato etiqueta="Periodicidad" valor={revision.periodicidad} />
            <Dato etiqueta="Estado" valor={revision.estado === "en_firme" ? "En firme" : "En proceso"} />
          </div>
          {puedeEliminar && <EliminarRevision id={revision.id} />}
        </div>
        <div className="mt-3">
          <BarraCierre
            revisionId={revision.id}
            enFirme={enFirme}
            cierre={resultados.cierre}
            pendientes={resultados.evaluacion.pendientes.length}
            puedeCerrar={puedeCerrar}
            puedeDesbloquear={puedeDesbloquear}
            onVerNovedades={() => setTab("novedades")}
            balanceId={resultados.cruce.balance?.id ?? null}
          />
        </div>
        {enFirme && resultados.desdeCopia && (
          <p className="mt-2 text-[11.5px] text-ink-500">Las vistas y los resultados son los de la copia congelada del cierre: una corrección importada después no los cambia.</p>
        )}
        <p className="mt-2 text-[11.5px] text-ink-400">Creada {fmtDateTime(revision.creadoEn)}{revision.creadoPor ? ` · ${revision.creadoPor}` : ""}. Los formularios son del cliente y el año: los comparten el precierre y el cierre.</p>
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Vistas de la revisión">
        <TabBtn on={tab === "formularios"} onClick={() => setTab("formularios")} label="Formularios" />
        <TabBtn on={tab === "meses"} onClick={() => setTab("meses")} label="Por meses" />
        <TabBtn on={tab === "acumulado"} onClick={() => setTab("acumulado")} label="Acumulado" />
        <TabBtn on={tab === "cruce"} onClick={() => setTab("cruce")} label="Cruce contable" />
        <TabBtn on={tab === "oportunidad"} onClick={() => setTab("oportunidad")} label="Oportunidad" />
        <TabBtn on={tab === "pagos"} onClick={() => setTab("pagos")} label="Pagos efectuados" />
        <TabBtn on={tab === "novedades"} onClick={() => setTab("novedades")} label={`Novedades${!enFirme && resultados.evaluacion.pendientes.length > 0 ? ` (${resultados.evaluacion.pendientes.length})` : ""}`} />
        <a href={`/api/impuestos/revisiones/${revision.id}/excel`} download className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
          <Icon name="download" size={13} /> Exportar a Excel
        </a>
      </div>

      {tab === "meses" && <VistaPorMeses vista={vista} onAbrir={setAbierto} />}
      {tab === "acumulado" && <VistaAcumulada vista={vista} />}
      {tab === "cruce" && <CruceRevision cruce={resultados.cruce} revisionId={revision.id} puedeEditar={puedeEditar} />}
      {tab === "oportunidad" && (
        <VistaOportunidad filas={resultados.oportunidad} calendario={resultados.calendario} anio={revision.anio} etiquetaPeriodo={etiquetaPeriodo} revisionId={revision.id} puedeEditar={puedeEditar} />
      )}
      {tab === "pagos" && <VistaPagos resultado={resultados.pagos} etiquetaPeriodo={etiquetaPeriodo} revisionId={revision.id} puedeEditar={puedeEditar} />}
      {tab === "novedades" && (
        <VistaNovedades
          evaluacion={resultados.evaluacion}
          enFirme={enFirme}
          onIr={setTab}
          saldoInicial={resultados.saldoInicialRestado}
          revisionId={revision.id}
          puedeEditar={puedeEditar}
        />
      )}

      {tab === "formularios" && puedeCargar && <Importador revisionId={revision.id} onTerminar={() => router.refresh()} />}

      {tab === "formularios" && porConfirmar.length > 0 && (
        <ListaPorConfirmar revisionId={revision.id} formularios={porConfirmar} puedeConfirmar={puedeCargar && !enFirme} onAbrir={setAbierto} />
      )}

      {tab === "formularios" && <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">Formularios por período</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Formulario 350</th>
                <th className="px-3 py-2">Pagos (490)</th>
                <th className="px-3 py-2">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <FilaPeriodo key={p.periodo} p={p} porId={porId} puedeCargar={puedeCargar} revisionId={revision.id} onAbrir={setAbierto} onCausal={setCausalDe} />
              ))}
            </tbody>
          </table>
        </Card>
      </section>}

      {formularioAbierto && (
        <FormularioModal
          key={formularioAbierto.id}
          formulario={formularioAbierto}
          contexto={contexto}
          puedeCargar={puedeCargar}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onClose={() => setAbierto(null)}
        />
      )}
      {causalDe != null && <CausalModal revisionId={revision.id} periodo={causalDe} onClose={() => setCausalDe(null)} />}
    </div>
  );
}

function TabBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
    </button>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{etiqueta}</div>
      <div className="tabular-nums font-semibold text-ink-800">{valor}</div>
    </div>
  );
}

function FilaPeriodo({
  p,
  porId,
  puedeCargar,
  revisionId,
  onAbrir,
  onCausal,
}: {
  p: PeriodoRevision;
  porId: Map<number, FormularioVista>;
  puedeCargar: boolean;
  revisionId: number;
  onAbrir: (id: number) => void;
  onCausal: (periodo: number) => void;
}) {
  const { vigente, cadena, faltaOriginal } = p.cadena;
  // La columna de pagos muestra lo que hay (confirmado o por confirmar); lo que falta va en Alertas.
  const lineasPago = p.pagos.filter((x) => x.formularios.length > 0 || x.porConfirmar > 0);
  return (
    <tr className="border-b border-ink-100 align-top last:border-0">
      <td className="px-3 py-2 font-semibold text-navy-800">{mes(p.periodo)}</td>
      <td className="px-3 py-2"><Chip label={ETIQUETA_ESTADO_PERIODO[p.estado]} tone={TONO_ESTADO[p.estado]} /></td>
      <td className="px-3 py-2">
        {vigente ? (
          <div className="flex flex-col gap-0.5">
            <span>
              <button type="button" onClick={() => onAbrir(vigente.id)} className={ENLACE}>{vigente.numero}</button>
              <span className="ml-1.5 text-[11.5px] text-ink-500">presentado {vigente.fechaPresentacion ?? "—"}</span>
            </span>
            {cadena.length > 1 && (
              <span className="text-[11.5px] text-ink-500">
                Corrige a {cadena.slice(0, -1).map((f, i) => (
                  <span key={f.id}>{i > 0 && " → "}<button type="button" onClick={() => onAbrir(f.id)} className={ENLACE}>{f.numero}</button> ({porId.get(f.id)?.fechaSello ?? "—"})</span>
                ))}
              </span>
            )}
            {faltaOriginal && <span className="text-[11.5px] text-warn-700">Corrección del {faltaOriginal}, que no está cargado</span>}
            <span className="text-[11.5px] text-ink-500">Total retenciones (136): {fmt(vigente.valores[136] ?? 0)}</span>
            {p.porConfirmar350 > 0 && <span className="text-[11.5px] text-warn-700">Hay otro 350 por confirmar</span>}
          </div>
        ) : p.causal ? (
          <span className="text-[12px] text-ink-600">Sin formulario: {p.causal}</span>
        ) : (
          <span className="text-[12px] text-ink-400">{p.porConfirmar350 ? "Hay un formulario por confirmar" : "Sin cargar"}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {lineasPago.map((x) => (
            <span key={x.concepto} className="text-[12px]">
              <span className="inline-block min-w-[14.5rem] font-semibold text-ink-700">{etiquetaConceptoPago(x.concepto)}</span>
              {x.formularios.length === 0 ? (
                <span className="ml-1.5 text-warn-700">por confirmar{x.esperado ? ` (paga el ${x.renglon}: ${fmt(x.declarado)})` : ""}</span>
              ) : (
                <span className="ml-1.5 text-ink-600">
                  {x.formularios.map((f, i) => (
                    <span key={f.id}>{i > 0 && ", "}<button type="button" onClick={() => onAbrir(f.id)} className={ENLACE}>{f.numero}</button> {f.fechaPago ?? ""}</span>
                  ))}
                  <span className="ml-1 text-ink-500">· pagó {fmt(x.impuesto)}</span>
                  {x.porConfirmar > 0 && <span className="ml-1 text-warn-700">· {x.porConfirmar} más por confirmar</span>}
                </span>
              )}
            </span>
          ))}
          {p.recibosSinConcepto > 0 && <span className="text-[12px] text-warn-700">{p.recibosSinConcepto} {p.recibosSinConcepto === 1 ? "recibo" : "recibos"} por confirmar, sin concepto</span>}
          {lineasPago.length === 0 && !p.recibosSinConcepto && <span className="text-[12px] text-ink-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1.5">
          <AlertasPeriodo p={p} />
          {puedeCargar && !vigente && (p.causal ? <QuitarCausal revisionId={revisionId} periodo={p.periodo} /> : (
            <button type="button" onClick={() => onCausal(p.periodo)} className={BOTON_SECUNDARIO}>No hubo formulario</button>
          ))}
        </div>
      </td>
    </tr>
  );
}

type AlertaPeriodo = { clave: string; texto: string; detalle: string; tono: "err" | "warn"; nota?: string };

/**
 * Lo que hay que resolver en el mes, en texto corto; al pasar el mouse, el detalle. La nota dice qué
 * pide para cerrar (cargar el original o una marca, y en qué pestaña). Mismos textos que la columna
 * Alerta de Pagos efectuados.
 */
function AlertasPeriodo({ p }: { p: PeriodoRevision }) {
  const sin350 = recibosSin350(p).map((f) => f.numero);
  const alertas: AlertaPeriodo[] = [
    ...p.pagos
      .filter((x) => x.esperado && x.formularios.length === 0 && x.porConfirmar === 0)
      .map((x): AlertaPeriodo => ({ clave: `falta-${x.concepto}`, texto: alertaSinRecibo(x), detalle: `Paga el renglón ${x.renglon}: ${fmt(x.declarado)}`, tono: "err" })),
    ...(p.cadena.faltaOriginal
      ? [{ clave: "original", texto: "Falta el 350 original", detalle: avisoFaltaOriginal(p.cadena.faltaOriginal), tono: "err", nota: "hay que cargarlo para cerrar" } satisfies AlertaPeriodo]
      : []),
    ...p.cadena.fueraDeCadena.map((f): AlertaPeriodo => ({ clave: `fuera-${f.numero}`, texto: "350 fuera de la cadena", detalle: avisoFueraDeCadena(f.numero), tono: "warn" })),
    ...(p.recibosDeOtro350 ?? []).map((r): AlertaPeriodo => ({ clave: `otro-${r.numero}`, texto: "Recibo de otro 350", detalle: avisoReciboDeOtro350(r), tono: "err", nota: "exige marca en Pagos" })),
    ...(sin350.length > 0 ? [{ clave: "sin350", texto: alertaRecibosSin350(sin350), detalle: avisoRecibosSin350(sin350), tono: "err", nota: "exige marca en Pagos" } satisfies AlertaPeriodo] : []),
  ];
  if (alertas.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-[11.5px] leading-5">
      {alertas.map((a) => (
        <li key={a.clave} title={a.detalle} className={`font-semibold ${a.tono === "err" ? "text-err-700" : "text-warn-700"}`}>
          {a.texto}
          {a.nota && <span className="font-normal text-ink-500"> · {a.nota}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Formularios leídos sin confirmar. Los que pasan todos los controles se pueden confirmar de a varios;
 * los que tienen algo por corregir se abren con «Revisar».
 */
function ListaPorConfirmar({ revisionId, formularios, puedeConfirmar, onAbrir }: {
  revisionId: number;
  formularios: FormularioVista[];
  puedeConfirmar: boolean;
  onAbrir: (id: number) => void;
}) {
  const [state, action, confirmando] = useActionState<ActionState, FormData>(confirmarFormulariosDian, {});
  const [marcados, setMarcados] = useState<ReadonlySet<number>>(new Set());
  const [preguntando, setPreguntando] = useState(false);
  const [viendoControles, setViendoControles] = useState(false);
  const elegibles = formularios.filter((f) => !lecturaConErrores(f.controles));
  const seleccionable = puedeConfirmar && elegibles.length > 0;
  // Derivados: un formulario que se confirmó o se descartó deja de contar aunque siga marcado.
  const seleccionados = elegibles.filter((f) => marcados.has(f.id));
  const todos = elegibles.length > 0 && seleccionados.length === elegibles.length;
  const cuantos = seleccionados.length === 1 ? "1 formulario" : `${seleccionados.length} formularios`;

  const [ultimo, setUltimo] = useState(state);
  if (state !== ultimo) {
    setUltimo(state);
    setPreguntando(false);
    setMarcados(new Set());
  }
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Formularios confirmados.", error: "No se pudieron confirmar los formularios." });
  }, [state]);

  const alternar = (id: number) => setMarcados((prev) => {
    const sig = new Set(prev);
    if (sig.has(id)) sig.delete(id);
    else sig.add(id);
    return sig;
  });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">Por confirmar ({formularios.length})</h2>
      <Card className="divide-y divide-ink-100 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-ink-50 px-4 py-2 text-[12.5px]">
          {seleccionable && (
            <label className="flex items-center gap-2 font-semibold text-ink-700">
              <input
                type="checkbox"
                checked={todos}
                ref={(el) => { if (el) el.indeterminate = seleccionados.length > 0 && !todos; }}
                onChange={() => setMarcados(todos ? new Set() : new Set(elegibles.map((f) => f.id)))}
              />
              Seleccionar todos ({elegibles.length})
            </label>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setViendoControles(true)} className={`inline-flex items-center gap-1.5 bg-white ${BOTON_SECUNDARIO}`}>
              <Icon name="help-circle" size={13} />
              ¿Qué revisa el sistema?
            </button>
            {seleccionable && (
              <button type="button" disabled={seleccionados.length === 0} onClick={() => setPreguntando(true)} className={BOTON_PRIMARIO}>
                Confirmar seleccionados ({seleccionados.length})
              </button>
            )}
          </div>
        </div>
        {formularios.map((f) => {
          const pendientes = f.controles.filter((c) => c.bloquea && !c.ok).length;
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px]">
              {puedeConfirmar && (
                <input
                  type="checkbox"
                  aria-label={`Seleccionar F${f.formulario} ${mes(f.periodo)} ${f.numero}`}
                  title={pendientes ? "Tiene controles por corregir: ábrelo con «Revisar»." : undefined}
                  disabled={pendientes > 0}
                  checked={pendientes === 0 && marcados.has(f.id)}
                  onChange={() => alternar(f.id)}
                />
              )}
              <span className="font-semibold text-navy-800">F{f.formulario} · {mes(f.periodo)}</span>
              <span className="tabular-nums text-ink-600">{f.numero}</span>
              {f.formulario === "490" && f.concepto && <Chip label={`Concepto ${f.concepto}`} tone="blue" />}
              {f.codigoCorreccion === 1 && <Chip label="Corrección" tone="warn" />}
              {pendientes ? (
                <span className="text-err-700">{pendientes} por corregir</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-ok-700">
                  <Icon name="check" size={13} stroke={2.4} />
                  Cuadrado
                </span>
              )}
              <span className="text-[11.5px] text-ink-400">{f.nombreArchivo}</span>
              <button type="button" onClick={() => onAbrir(f.id)} className={`ml-auto ${BOTON_SECUNDARIO}`}>Revisar</button>
            </div>
          );
        })}
      </Card>
      {viendoControles && <ControlesModal onClose={() => setViendoControles(false)} />}
      {preguntando && (
        <Modal
          open
          onClose={() => setPreguntando(false)}
          title={`Confirmar ${cuantos}`}
          size="md"
          footer={
            <form action={action} className="flex justify-end">
              <input type="hidden" name="revisionId" value={revisionId} />
              {seleccionados.map((f) => <input key={f.id} type="hidden" name="id" value={f.id} />)}
              <button type="submit" disabled={confirmando || seleccionados.length === 0} className={BOTON_PRIMARIO}>
                {confirmando ? <EstadoProcesando>Confirmando</EstadoProcesando> : `Confirmar ${cuantos}`}
              </button>
            </form>
          }
        >
          <div className="flex flex-col gap-2 text-[12.5px] text-ink-700">
            <p>Quedan confirmados tal como los leyó la IA, sin revisarlos uno por uno, y empiezan a contar en el cruce, la oportunidad y los pagos.</p>
            <ul className="max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-150">
              {seleccionados.map((f) => (
                <li key={f.id} className="px-2.5 py-1.5">
                  <span className="font-semibold text-navy-800">F{f.formulario} · {mes(f.periodo)}</span> <span className="tabular-nums text-ink-600">{f.numero}</span>
                  {f.controles.filter((c) => !c.bloquea && !c.ok).map((c) => <div key={c.clave} className="text-[11.5px] text-warn-700">{c.mensaje}</div>)}
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Importador({ revisionId, onTerminar }: { revisionId: number; onTerminar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [cola, setCola] = useState<EnCola[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  async function importar(archivos: File[]) {
    if (archivos.length === 0) return;
    setTrabajando(true);
    setCola(archivos.map((a) => ({ nombre: a.name, estado: "pendiente" })));
    const actualizar = (i: number, cambio: Partial<EnCola>) => setCola((c) => c.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
    let siguiente = 0;
    // De a pocos a la vez: cada lectura con IA tarda unos segundos y un fallo no detiene los demás.
    const trabajador = async () => {
      while (siguiente < archivos.length) {
        const i = siguiente++;
        actualizar(i, { estado: "leyendo" });
        const datos = new FormData();
        datos.set("revisionId", String(revisionId));
        datos.set("archivo", archivos[i]);
        try {
          const r = await importarFormularioDian(datos);
          actualizar(i, { estado: r.ok ? "ok" : "error", mensaje: r.message });
          // Cada formulario leído aparece de una vez en «Por confirmar» y en la tabla.
          if (r.ok) onTerminar();
        } catch {
          actualizar(i, { estado: "error", mensaje: `${archivos[i].name}: no se pudo importar.` });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_LECTURA, archivos.length) }, trabajador));
    setTrabajando(false);
    if (entrada.current) entrada.current.value = "";
    onTerminar();
  }

  const leidos = cola.filter((c) => c.estado === "ok" || c.estado === "error").length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-navy-800">Importar formularios</h2>
          <p className="mt-0.5 text-[12px] text-ink-500">PDF de los formularios 350 y 490 tal como salen de la DIAN; puedes elegir varios a la vez. La IA los lee y quedan por confirmar.</p>
        </div>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={trabajando}
          onChange={(e) => importar(Array.from(e.target.files ?? []))}
          aria-label="PDF de formularios 350 y 490"
          className="max-w-[280px] text-[12px] text-ink-600 file:mr-2 file:rounded-md file:border-0 file:bg-navy-700 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
        />
      </div>
      {cola.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 text-[12px]">
          {trabajando && <span className="text-ink-500"><EstadoProcesando>Leyendo {leidos} de {cola.length}</EstadoProcesando></span>}
          {cola.map((c, i) => (
            <div key={`${c.nombre}-${i}`} className={c.estado === "error" ? "text-err-700" : c.estado === "ok" ? "text-ok-700" : "text-ink-500"}>
              {c.estado === "pendiente" ? `${c.nombre}: en espera` : c.estado === "leyendo" ? `${c.nombre}: leyendo…` : c.mensaje}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CausalModal({ revisionId, periodo, onClose }: { revisionId: number; periodo: number; onClose: () => void }) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(registrarPeriodoSinFormulario, {});
  const [causal, setCausal] = useState("");
  // Cerrar cambia el estado de la pantalla que abrió el panel: en un efecto, no al dibujar.
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: "Causal registrada.", error: "No se pudo registrar la causal." });
  }, [state]);
  return (
    <Modal open onClose={onClose} title={`${mes(periodo)}: no hubo formulario 350`} size="lg" footer={
      <button type="submit" form="causal-periodo" disabled={guardando || causal.trim().length < 10} className={BOTON_PRIMARIO}>
        {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Registrar causal"}
      </button>
    }>
      <form id="causal-periodo" action={action} className="flex flex-col gap-2 text-[12.5px]">
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="periodo" value={periodo} />
        <p className="text-ink-600">Un mes sin retenciones que declarar no es un error. Confirma que no vas a importar el 350 de {mes(periodo).toLowerCase()} y escribe por qué.</p>
        <textarea
          name="causal"
          value={causal}
          onChange={(e) => setCausal(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ej.: en el mes no hubo pagos sujetos a retención."
          aria-label="Causal"
          className="rounded-md border border-ink-200 bg-white px-2 py-1.5"
        />
      </form>
    </Modal>
  );
}

function QuitarCausal({ revisionId, periodo }: { revisionId: number; periodo: number }) {
  const [state, action, quitando] = useActionState<ActionState, FormData>(quitarPeriodoSinFormulario, {});
  useEffect(() => {
    notifyActionState(state, { success: "Causal quitada.", error: "No se pudo quitar la causal." });
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="periodo" value={periodo} />
      <button type="submit" disabled={quitando} className={BOTON_SECUNDARIO}>{quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Quitar causal"}</button>
    </form>
  );
}

function EliminarRevision({ id }: { id: number }) {
  const router = useRouter();
  const [state, action, eliminando] = useActionState<ActionState, FormData>(eliminarRevisionRetencion, {});
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    notifyActionState(state, { success: "Revisión eliminada.", error: "No se pudo eliminar la revisión." });
    if (state.ok) router.push("/impuestos/retencion");
  }, [state, router]);
  return confirmar ? (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="text-[11.5px] text-ink-500">¿Eliminar la revisión? Los formularios del año se conservan.</span>
      <button type="submit" disabled={eliminando} className="rounded-md border border-err-100 px-2.5 py-1 text-[12px] font-semibold text-err-700 hover:bg-err-100 disabled:opacity-60">
        {eliminando ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Sí, eliminar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className={BOTON_SECUNDARIO}>Cancelar</button>
    </form>
  ) : (
    <button type="button" onClick={() => setConfirmar(true)} className={BOTON_SECUNDARIO}>Eliminar revisión</button>
  );
}
