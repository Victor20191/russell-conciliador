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
  eliminarRevisionRetencion,
  importarFormularioDian,
  quitarPeriodoSinFormulario,
  registrarPeriodoSinFormulario,
} from "@/app/actions/impuestos-retencion";
import type { ActionState } from "@/lib/definitions";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { ETIQUETA_ESTADO_PERIODO, type EstadoPeriodo, type PeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
import type { FormularioVista, RevisionVista } from "@/lib/impuestos/retencion/revision-servidor";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
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
      {tab === "novedades" && <VistaNovedades evaluacion={resultados.evaluacion} enFirme={enFirme} onIr={setTab} />}

      {tab === "formularios" && puedeCargar && <Importador revisionId={revision.id} onTerminar={() => router.refresh()} />}

      {tab === "formularios" && porConfirmar.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">Por confirmar ({porConfirmar.length})</h2>
          <Card className="divide-y divide-ink-100 p-0">
            {porConfirmar.map((f) => {
              const pendientes = f.controles.filter((c) => c.bloquea && !c.ok).length;
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px]">
                  <span className="font-semibold text-navy-800">F{f.formulario} · {mes(f.periodo)}</span>
                  <span className="tabular-nums text-ink-600">{f.numero}</span>
                  {f.formulario === "490" && f.concepto && <Chip label={`Concepto ${f.concepto}`} tone="blue" />}
                  {f.codigoCorreccion === 1 && <Chip label="Corrección" tone="warn" />}
                  <span className={pendientes ? "text-err-700" : "text-ok-700"}>{pendientes ? `${pendientes} por corregir` : "Todo cuadra"}</span>
                  <span className="text-[11.5px] text-ink-400">{f.nombreArchivo}</span>
                  <button type="button" onClick={() => setAbierto(f.id)} className={`ml-auto ${BOTON_SECUNDARIO}`}>Revisar</button>
                </div>
              );
            })}
          </Card>
        </section>
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
                <th className="px-3 py-2" />
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
          </div>
        ) : p.causal ? (
          <span className="text-[12px] text-ink-600">Sin formulario: {p.causal}</span>
        ) : (
          <span className="text-[12px] text-ink-400">{p.porConfirmar ? "Hay un formulario por confirmar" : "Sin cargar"}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {p.pagos.filter((x) => x.esperado || x.formularios.length > 0).map((x) => (
            <span key={x.concepto} className="text-[12px]">
              <span className="font-semibold text-ink-700">{x.concepto}</span>
              {x.formularios.length === 0 ? (
                <span className="ml-1.5 text-err-700">falta el recibo (paga el {x.renglon}: {fmt(x.declarado)})</span>
              ) : (
                <span className="ml-1.5 text-ink-600">
                  {x.formularios.map((f, i) => (
                    <span key={f.id}>{i > 0 && ", "}<button type="button" onClick={() => onAbrir(f.id)} className={ENLACE}>{f.numero}</button> {f.fechaPago ?? ""}</span>
                  ))}
                  <span className="ml-1 text-ink-500">· pagó {fmt(x.impuesto)}</span>
                </span>
              )}
            </span>
          ))}
          {!vigente && p.pagos.every((x) => x.formularios.length === 0) && <span className="text-[12px] text-ink-400">—</span>}
        </div>
        {p.avisos.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11.5px] text-warn-700">{p.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      </td>
      <td className="px-3 py-2 text-right">
        {puedeCargar && !vigente && (p.causal ? <QuitarCausal revisionId={revisionId} periodo={p.periodo} /> : (
          <button type="button" onClick={() => onCausal(p.periodo)} className={BOTON_SECUNDARIO}>No hubo formulario</button>
        ))}
      </td>
    </tr>
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
