"use client";

// Panel «Envío automático» de /config/reportes-ejecutivos: la plataforma genera sola el
// reporte para gerencia cada semana y lo manda por correo (el mismo formato de «Copiar
// formato correo», en el cuerpo del mensaje, sin PDF adjunto) a la lista de destinatarios.
// Diseño y despliegue: docs/notificaciones/reporte-ejecutivo-programado.md.

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  agregarDestinatarioReporte,
  cambiarEstadoDestinatarioReporte,
  enviarPruebaDelReporte,
  enviarReporteAhoraALista,
  guardarProgramacionReporte,
  quitarDestinatarioReporte,
  type ResultadoPanelEnvio,
} from "@/app/actions/notificaciones-programadas";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { fmtCalendarDate, fmtDateTime, fmtNum } from "@/lib/format";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import { destinatariosDeEnvio, etiquetaDestinatario } from "@/lib/notificaciones/destinatarios";
import type { DestinatarioPanel, EjecucionPanel, PanelEnvioAutomatico, PeriodoProximoPanel } from "@/lib/notificaciones/panel";
import {
  DIAS_SEMANA,
  diaSemanaColombia,
  etiquetaDiaSemana,
  type EstadoEjecucion,
  type OrigenEjecucion,
} from "@/lib/notificaciones/programacion";

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_MINI =
  "shrink-0 rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_MINI_PELIGRO =
  "rounded-md border border-err-200 bg-err-100 px-2 py-1 text-[11px] font-semibold text-err-700 transition hover:bg-err-100 disabled:cursor-not-allowed disabled:opacity-60";
const CAMPO =
  "w-full rounded-md border border-ink-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800 placeholder:text-ink-400 disabled:opacity-60";

const ETIQUETA_ORIGEN: Record<OrigenEjecucion, string> = {
  programada: "Programado",
  manual: "A la lista",
  prueba: "Prueba",
};

const ETIQUETA_ESTADO: Record<EstadoEjecucion, { texto: string; tono: "ok" | "warn" | "err" | "ink" | "blue" }> = {
  en_curso: { texto: "En curso", tono: "blue" },
  ok: { texto: "Enviado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  error: { texto: "Con error", tono: "err" },
  omitida: { texto: "Omitido", tono: "ink" },
};

/** «lunes 30/Nov/2026 7:00 a. m.» en hora de Colombia. */
function fechaEnvio(iso: string): string {
  const fecha = new Date(iso);
  return `${etiquetaDiaSemana(diaSemanaColombia(fecha)).toLowerCase()} ${fmtDateTime(fecha)}`;
}

export function EnvioAutomatico({ resultado }: { resultado: ResultadoPanelEnvio }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-navy-700">
            <Icon name="send" size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-navy-800">Envío automático</h2>
            <p className="max-w-3xl text-[11.5px] text-ink-500">
              La plataforma genera sola el reporte para gerencia cada semana y lo envía por correo a la lista de
              destinatarios, con el mismo formato de «Copiar formato correo» dentro del mensaje (sin PDF adjunto).
              Cada reporte arranca donde terminó el último reporte enviado y llega hasta el día anterior al envío.
            </p>
          </div>
        </div>
      </div>
      {resultado.ok ? (
        <PanelEnvio panel={resultado.panel} />
      ) : (
        <p role="status" className="px-4 py-4 text-[12.5px] text-warn-700 lg:px-5">
          {resultado.message}
        </p>
      )}
    </Card>
  );
}

function Aviso({ children, tono = "warn" }: { children: React.ReactNode; tono?: "warn" | "err" }) {
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] ${
        tono === "err" ? "border-err-200 bg-err-100 text-err-700" : "border-warn-200 bg-warn-100 text-warn-700"
      }`}
    >
      <Icon name="warn" size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function PanelEnvio({ panel }: { panel: PanelEnvioAutomatico }) {
  const destinatariosActivos = destinatariosDeEnvio(panel.destinatarios);
  const activos = destinatariosActivos.length;
  return (
    <div className="flex flex-col gap-5 px-4 py-4 lg:px-5">
      <div className="flex flex-col gap-2">
        {panel.conexion.estado !== "lista" && (
          <Aviso>
            {panel.conexion.mensaje} Mientras tanto no se puede enviar el reporte.{" "}
            <Link href="/config/conexiones" className="font-semibold underline">
              Ir a Conexiones
            </Link>
            .
          </Aviso>
        )}
        {!panel.disparadorConfigurado && (
          <Aviso>
            El servidor todavía no tiene el disparador configurado (falta la variable CRON_SECRET): nada se enviará
            solo hasta que se configure. El envío manual y la prueba sí funcionan.
          </Aviso>
        )}
        {panel.atrasado && panel.proximaEjecucionEn && (
          <Aviso tono="err">
            El envío debía salir el {fechaEnvio(panel.proximaEjecucionEn)} y todavía no salió: el disparador del
            servidor no está llamando a la plataforma. Revisa el cron del servidor.
          </Aviso>
        )}
        {panel.activa && activos === 0 && (
          <Aviso tono="err">
            El envío está activo pero no hay destinatarios activos: la próxima ejecución quedará con error. Agrega
            o reactiva a alguien.
          </Aviso>
        )}
      </div>

      {/* La clave remonta el formulario cuando cambia lo guardado, para que muestre lo del servidor. */}
      <ProgramacionForm key={`${panel.activa}|${panel.diaSemana}|${panel.hora}`} panel={panel} destinatariosActivos={activos} />
      <Destinatarios panel={panel} activos={activos} />
      <Envios panel={panel} destinatariosActivos={destinatariosActivos} />
      <Historial ejecuciones={panel.ejecuciones} />
    </div>
  );
}

function ProgramacionForm({ panel, destinatariosActivos }: { panel: PanelEnvioAutomatico; destinatariosActivos: number }) {
  const [pendiente, startTransition] = useTransition();
  const [activa, setActiva] = useState(panel.activa);
  const [diaSemana, setDiaSemana] = useState(panel.diaSemana);
  const [hora, setHora] = useState(panel.hora);
  const [error, setError] = useState<string | null>(null);

  const cambios = activa !== panel.activa || diaSemana !== panel.diaSemana || hora !== panel.hora;

  const guardar = () => {
    setError(null);
    startTransition(async () => {
      const r = await guardarProgramacionReporte({ activa, diaSemana, hora });
      if (!r.ok) {
        setError(r.message ?? "No se pudo guardar.");
        notifyError("No se pudo guardar", r.message ?? "Revisa el día y la hora.");
        return;
      }
      notifySuccess("Envío automático guardado", r.message ?? "");
    });
  };

  return (
    <section aria-labelledby="envio-programacion" className="flex flex-col gap-3">
      <h3 id="envio-programacion" className="text-[12.5px] font-semibold text-navy-800">
        Cuándo se envía
      </h3>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-700">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            disabled={pendiente}
            className="h-4 w-4 rounded border-ink-300 accent-navy-700"
          />
          {activa ? "Envío automático activo" : "Envío automático en pausa"}
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">
          Día de la semana
          <select
            value={diaSemana}
            onChange={(e) => setDiaSemana(Number(e.target.value))}
            disabled={pendiente}
            className={`${CAMPO} min-w-[9rem]`}
          >
            {DIAS_SEMANA.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">
          Hora (Colombia)
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            disabled={pendiente}
            required
            className={`${CAMPO} w-[7.5rem]`}
          />
        </label>
        <button type="button" onClick={guardar} disabled={pendiente || !cambios || !hora} className={BTN_PRIMARIO}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11.5px] text-err-700">
          {error}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-700" aria-live="polite">
        <Icon name="calendar" size={14} className="shrink-0 text-ink-500" />
        {panel.activa && panel.proximaEjecucionEn ? (
          <>
            <span className="font-semibold">Próximo envío:</span>
            <span>{fechaEnvio(panel.proximaEjecucionEn)} (hora de Colombia)</span>
          </>
        ) : (
          <span>
            Sin próximo envío: está en pausa. {destinatariosActivos === 0 ? "Agrega destinatarios y " : "Actívalo y "}
            guarda para programarlo.
          </span>
        )}
        {cambios && <span className="text-warn-700">· Tienes cambios sin guardar.</span>}
      </p>
      {panel.activa && panel.proximaEjecucionEn && panel.periodoProximo && <PeriodoDelProximoEnvio periodo={panel.periodoProximo} />}
    </section>
  );
}

/** Qué cubrirá el próximo envío y de dónde sale ese período (calculado en el servidor). */
function PeriodoDelProximoEnvio({ periodo }: { periodo: PeriodoProximoPanel }) {
  if (periodo.estado === "cubierto") {
    return (
      <p className="flex items-start gap-1.5 text-[12.5px] text-warn-700" aria-live="polite">
        <Icon name="warn" size={14} className="mt-0.5 shrink-0" />
        <span>
          Ya está cubierto hasta el {fmtCalendarDate(periodo.cubiertoHasta)}: ese día no se enviará.
        </span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 text-[12.5px] text-ink-700" aria-live="polite">
      <p className="flex flex-wrap items-center gap-1.5">
        <Icon name="doc" size={14} className="shrink-0 text-ink-500" />
        <span className="font-semibold">Cubrirá:</span>
        <span>
          del {fmtCalendarDate(periodo.desde)} al {fmtCalendarDate(periodo.hasta)}
        </span>
      </p>
      <p className="pl-[21px] text-[11.5px] text-ink-500">
        {periodo.origen === "continua" && periodo.ultimoHasta
          ? `Continúa desde el último reporte enviado (del ${periodo.ultimoDesde ? fmtCalendarDate(periodo.ultimoDesde) : "—"} al ${fmtCalendarDate(periodo.ultimoHasta)}).`
          : "Primer envío: últimos 7 días."}
        {periodo.recortado &&
          ` Se recortó a 366 días (el tope): sin él habría arrancado el ${fmtCalendarDate(periodo.desdeSinRecorte)}.`}
      </p>
    </div>
  );
}

function Destinatarios({ panel, activos }: { panel: PanelEnvioAutomatico; activos: number }) {
  const [pendiente, startTransition] = useTransition();
  const [correo, setCorreo] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState<number | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const lleno = panel.destinatarios.length >= panel.topeDestinatarios;
  const pausados = panel.destinatarios.length - activos;

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await agregarDestinatarioReporte({ correo, nombre });
      if (!r.ok) {
        const mensaje = r.errors?.correo?.[0] ?? r.errors?.nombre?.[0] ?? r.message ?? "No se pudo agregar.";
        setError(mensaje);
        return;
      }
      setCorreo("");
      setNombre("");
      setModalAbierto(false);
      notifySuccess("Destinatario agregado", correo.trim().toLowerCase());
    });
  };

  const abrirModal = () => {
    setCorreo("");
    setNombre("");
    setError(null);
    setModalAbierto(true);
  };

  const alternar = (id: number, activo: boolean) => {
    startTransition(async () => {
      const r = await cambiarEstadoDestinatarioReporte(id, activo);
      if (!r.ok) notifyError("No se pudo cambiar", r.message ?? "Inténtalo de nuevo.");
    });
  };

  const quitar = (id: number) => {
    setConfirmarQuitar(null);
    startTransition(async () => {
      const r = await quitarDestinatarioReporte(id);
      if (!r.ok) {
        notifyError("No se pudo quitar", r.message ?? "Inténtalo de nuevo.");
        return;
      }
      notifyInfo("Destinatario quitado", "Ya no recibirá el reporte.");
    });
  };

  return (
    <section aria-labelledby="envio-destinatarios" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="envio-destinatarios" className="text-[12.5px] font-semibold text-navy-800">
          Destinatarios
          <span className="ml-2 rounded-full bg-ink-100 px-1.5 py-px text-[10.5px] font-semibold text-ink-600">
            {fmtNum(panel.destinatarios.length)} de {fmtNum(panel.topeDestinatarios)}
          </span>
        </h3>
        <button
          type="button"
          onClick={abrirModal}
          disabled={lleno}
          aria-label="Agregar destinatario"
          title={lleno ? "La lista llegó al tope" : "Agregar destinatario"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-150 bg-white text-navy-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="plus" size={15} />
        </button>
      </div>
      {lleno && <p className="text-[11.5px] text-warn-700">La lista llegó al tope. Quita a alguien para agregar otro correo.</p>}

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Agregar destinatario"
        size="md"
        footer={
          <button
            type="submit"
            form="form-destinatario"
            disabled={pendiente || lleno || !correo.trim()}
            className={BTN_PRIMARIO}
          >
            {pendiente ? <EstadoProcesando>Agregando</EstadoProcesando> : "Agregar"}
          </button>
        }
      >
        <form id="form-destinatario" onSubmit={agregar} className="flex flex-col gap-3">
          <p className="text-[11.5px] text-ink-500">Cualquier correo válido; no tiene que ser usuario de la plataforma.</p>
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">
            Correo
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="Ej.: gerencia@cliente.co"
              autoComplete="off"
              maxLength={254}
              required
              autoFocus
              disabled={pendiente}
              className={CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">
            Nombre (opcional)
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Ana Pérez"
              autoComplete="off"
              maxLength={100}
              disabled={pendiente}
              className={CAMPO}
            />
          </label>
          {error && (
            <p role="alert" className="text-[11.5px] text-err-700">
              {error}
            </p>
          )}
        </form>
      </Modal>

      {panel.destinatarios.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 px-3 py-2.5 text-[12.5px] text-ink-500">
          Aún no hay destinatarios. Usa el botón «+» para agregar el primer correo al que le llegará el reporte.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-ink-150">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[11.5px] text-ink-600">
            <span className="font-medium text-ink-700">
              Correos en la lista ({fmtNum(panel.destinatarios.length)})
            </span>
            <span className={activos === 0 ? "font-medium text-warn-700" : "text-ink-500"}>
              {activos === 0
                ? "Ninguno activo para envío"
                : `${fmtNum(activos)} ${activos === 1 ? "recibirá" : "recibirán"} el reporte`}
              {pausados > 0 ? ` · ${fmtNum(pausados)} en pausa` : ""}
            </span>
          </div>
          <ul className="divide-y divide-ink-100 bg-white">
            {panel.destinatarios.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.activo}
                    disabled={pendiente}
                    onChange={(e) => alternar(d.id, e.target.checked)}
                    aria-label={`Recibe el reporte: ${d.correo}`}
                    className="h-4 w-4 shrink-0 rounded border-ink-300 accent-navy-700"
                  />
                  <span className={`min-w-0 truncate ${d.activo ? "text-ink-800" : "text-ink-400 line-through"}`}>
                    {d.nombre ? <span className="font-medium">{d.nombre} · </span> : null}
                    {d.correo}
                  </span>
                  <Chip label={d.activo ? "Recibe el reporte" : "En pausa"} tone={d.activo ? "ok" : "ink"} />
                </label>
                {confirmarQuitar === d.id ? (
                  <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-ink-600">
                    ¿Quitar?
                    <button type="button" onClick={() => quitar(d.id)} disabled={pendiente} className={BTN_MINI_PELIGRO}>
                      Sí
                    </button>
                    <button type="button" onClick={() => setConfirmarQuitar(null)} className={BTN_MINI}>
                      No
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmarQuitar(d.id)} disabled={pendiente} className={BTN_MINI}>
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Envios({ panel, destinatariosActivos }: { panel: PanelEnvioAutomatico; destinatariosActivos: DestinatarioPanel[] }) {
  const [pendiente, setPendiente] = useState<"prueba" | "lista" | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const ocupado = pendiente !== null;
  const sinConexion = panel.conexion.estado !== "lista";
  const totalActivos = destinatariosActivos.length;

  const ejecutar = async (cual: "prueba" | "lista") => {
    if (ocupado) return;
    setConfirmar(false);
    setPendiente(cual);
    try {
      const r = cual === "prueba" ? await enviarPruebaDelReporte() : await enviarReporteAhoraALista();
      if (r.ok) notifySuccess(cual === "prueba" ? "Prueba enviada" : "Reporte enviado", r.message ?? "");
      else notifyError(cual === "prueba" ? "No se pudo enviar la prueba" : "No se pudo enviar el reporte", r.message ?? "Inténtalo de nuevo.");
    } catch {
      notifyError("No se pudo enviar", "La solicitud no terminó. Revisa el historial antes de reintentar.");
    } finally {
      setPendiente(null);
    }
  };

  return (
    <section aria-labelledby="envio-ahora" className="flex flex-col gap-3">
      <h3 id="envio-ahora" className="text-[12.5px] font-semibold text-navy-800">
        Enviar ahora
      </h3>
      {totalActivos > 0 ? (
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
          <p className="font-medium text-ink-800">
            El reporte llegará a {fmtNum(totalActivos)} {totalActivos === 1 ? "correo activo" : "correos activos"}:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Correos que recibirán el reporte">
            {destinatariosActivos.map((d) => (
              <li
                key={d.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-[11.5px] text-ink-700"
              >
                {d.nombre ? <span className="truncate font-medium text-ink-800">{d.nombre}</span> : null}
                {d.nombre ? <span className="text-ink-400">·</span> : null}
                <span className="truncate">{d.correo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-500">
          No hay correos activos para el envío. Agrega o activa al menos un destinatario arriba para habilitar el envío a la lista.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => ejecutar("prueba")}
          disabled={ocupado || sinConexion || !panel.correoPrueba}
          className={BTN_SECUNDARIO}
          title={panel.correoPrueba ? `Envía solo a ${panel.correoPrueba}` : "Tu cuenta no tiene correo registrado"}
        >
          <Icon name="send" size={13} />
          {pendiente === "prueba" ? "Enviando prueba…" : "Enviar prueba a mi correo"}
        </button>
        {!confirmar && (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={ocupado || sinConexion || totalActivos === 0}
            className={BTN_PRIMARIO}
          >
            <Icon name="send" size={13} />
            {pendiente === "lista" ? "Enviando a la lista…" : "Enviar ahora a la lista"}
          </button>
        )}
      </div>
      {confirmar && totalActivos > 0 && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] text-ink-700"
        >
          <p className="font-medium text-navy-800">
            ¿Enviar el reporte ahora a {fmtNum(totalActivos)} {totalActivos === 1 ? "destinatario" : "destinatarios"}?
          </p>
          <p className="break-words text-[11.5px] text-ink-700">
            {destinatariosActivos.map((d) => etiquetaDestinatario(d)).join(", ")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => ejecutar("lista")} className={BTN_PRIMARIO}>
              Sí, enviar
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className={BTN_SECUNDARIO}>
              No
            </button>
          </div>
        </div>
      )}
      <p className="text-[11.5px] text-ink-500">
        La prueba llega solo a tu correo{panel.correoPrueba ? ` (${panel.correoPrueba})` : ""} con «[Prueba]» en el asunto y no
        cuenta como entregada al cliente. El envío a la lista queda registrado en «Reportes enviados»: el siguiente
        reporte no repetirá esas novedades. Con un reporte grande puede tardar un momento.
      </p>
    </section>
  );
}

function Historial({ ejecuciones }: { ejecuciones: EjecucionPanel[] }) {
  return (
    <section aria-labelledby="envio-historial" className="flex flex-col gap-2">
      <h3 id="envio-historial" className="text-[12.5px] font-semibold text-navy-800">
        Últimos envíos
      </h3>
      {ejecuciones.length === 0 ? (
        <p className="text-[12.5px] text-ink-500">Aún no hay envíos. Aquí aparecerán los programados, los manuales y las pruebas.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-md border border-ink-150">
          {ejecuciones.map((e) => {
            const estado = ETIQUETA_ESTADO[e.estado];
            return (
              <li key={e.id} className="flex flex-col gap-1 px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums text-ink-800">{fmtDateTime(e.iniciadaEn)}</span>
                  <Chip label={ETIQUETA_ORIGEN[e.origen]} tone="blue" />
                  <Chip label={estado.texto} tone={estado.tono} />
                  {e.periodoDesde && e.periodoHasta && (
                    <span className="text-ink-500">
                      Período {fmtCalendarDate(e.periodoDesde)} → {fmtCalendarDate(e.periodoHasta)}
                    </span>
                  )}
                  {(e.aceptados > 0 || e.fallidos > 0) && (
                    <span className="text-ink-500">
                      {fmtNum(e.aceptados)} {e.aceptados === 1 ? "aceptado" : "aceptados"}
                      {e.fallidos > 0 ? ` · ${fmtNum(e.fallidos)} con error` : ""}
                    </span>
                  )}
                  {e.ejecutadoPor && <span className="ml-auto text-ink-400">{e.ejecutadoPor}</span>}
                </div>
                {e.mensaje && <p className="break-words text-[12px] text-ink-600">{e.mensaje}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
