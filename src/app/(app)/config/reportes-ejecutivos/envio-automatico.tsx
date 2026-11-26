"use client";

// Panel «Envío automático» de /config/reportes-ejecutivos: la plataforma genera sola el
// reporte para gerencia cada semana y lo manda por correo (el mismo formato de «Copiar
// formato correo», en el cuerpo del mensaje, sin PDF adjunto) a la lista de destinatarios.
// Diseño y despliegue: docs/notificaciones/reporte-ejecutivo-programado.md.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { GenerarReporteEjecutivoResult } from "@/app/actions/auditoria-reporte";
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
import { MAX_DIAS_RANGO, parseRangoReporte, periodoAnteriorEnFechas } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { fmtCalendarDate, fmtDateTime, fmtNum } from "@/lib/format";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import { destinatariosDeEnvio } from "@/lib/notificaciones/destinatarios";
import type {
  DestinatarioPanel,
  EjecucionPanel,
  PanelEnvioAutomatico,
  PeriodoProximoPanel,
} from "@/lib/notificaciones/panel";
import {
  calcularPeriodoEnvio,
  calcularProximaAlGuardar,
  DIAS_PERIODO_MAXIMO,
  DIAS_PERIODO_MINIMO,
  DIAS_PERIODO_POR_DEFECTO,
  DIAS_SEMANA,
  diasDelPeriodo,
  diaSemanaColombia,
  esHoraValida,
  etiquetaDiaSemana,
  fechaColombia,
  TOPE_DIAS_ENVIO_AUTOMATICO,
  type EstadoEjecucion,
  type ModoPeriodo,
  type OrigenEjecucion,
  type PeriodoEnvio,
  type ReglaPeriodo,
} from "@/lib/notificaciones/programacion";

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_MINI =
  "shrink-0 rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_MINI_PELIGRO =
  "rounded-md border border-err-200 bg-err-100 px-2 py-1 text-[11px] font-semibold text-err-700 transition hover:bg-err-100 disabled:cursor-not-allowed disabled:opacity-60";
/** Campo sin ancho: para los que van dentro de una frase (los días del período). */
const CAMPO_EN_LINEA =
  "rounded-md border border-ink-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800 placeholder:text-ink-400 disabled:opacity-60";
const CAMPO = `w-full ${CAMPO_EN_LINEA}`;
/** Revisión ligera para habilitar «Enviar prueba»; la acción valida el correo de verdad. */
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function EnvioAutomatico({
  resultado,
  alcance,
  generarReporte,
}: {
  resultado: ResultadoPanelEnvio;
  /** Período de la página y novedades marcadas «Omitir»: lo que llevan la prueba y el envío a la lista. */
  alcance: AlcanceDelEnvio;
  /**
   * La tarjeta para generar el reporte (la arma `ReporteEjecutivoClient`): va junto a «Enviar ahora»,
   * antes de «Últimos envíos». Si el panel no se pudo cargar, se muestra igual debajo del aviso.
   */
  generarReporte?: React.ReactNode;
}) {
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
              En «Cuándo se envía» eliges el día, la hora y qué período cubre cada envío.
            </p>
          </div>
        </div>
      </div>
      {resultado.ok ? (
        <PanelEnvio panel={resultado.panel} alcance={alcance} generarReporte={generarReporte} />
      ) : (
        <>
          <p role="status" className="px-4 py-4 text-[12.5px] text-warn-700 lg:px-5">
            {resultado.message}
          </p>
          {generarReporte ? <div className="px-4 pb-4 lg:px-5">{generarReporte}</div> : null}
        </>
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

function PanelEnvio({
  panel,
  alcance,
  generarReporte,
}: {
  panel: PanelEnvioAutomatico;
  alcance: AlcanceDelEnvio;
  generarReporte?: React.ReactNode;
}) {
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
      <ProgramacionForm
        key={`${panel.activa}|${panel.diaSemana}|${panel.hora}|${panel.modoPeriodo}|${panel.diasPeriodo}|${panel.incluirDiaEnvio}`}
        panel={panel}
        destinatariosActivos={activos}
      />
      <Destinatarios panel={panel} activos={activos} />
      <Envios panel={panel} destinatariosActivos={destinatariosActivos} alcance={alcance} />
      {generarReporte}
      <Historial ejecuciones={panel.ejecuciones} />
    </div>
  );
}

type ProximoPorOpcion = {
  /** El próximo envío con el día y la hora del formulario, si quedara activo. */
  proxima: Date;
  /** Lo que cubriría con «Los últimos N días» (null si los días no son válidos). */
  ultimosDias: PeriodoEnvio | null;
  /** Lo que cubriría con «Desde el último reporte enviado». */
  continua: PeriodoEnvio;
};

/**
 * El próximo envío con lo que hay en el formulario y lo que cubriría con cada opción del
 * período: la misma cuenta del servidor (`calcularProximaAlGuardar` + `calcularPeriodoEnvio`)
 * con el último reporte enviado que trae el panel. `ahora` es el instante en que el servidor
 * armó el panel (o el del último cambio): así el servidor y el navegador pintan lo mismo.
 */
function proximoEnvioPorOpcion(params: {
  panel: PanelEnvioAutomatico;
  diaSemana: number;
  hora: string;
  dias: number | null;
  incluirDiaEnvio: boolean;
  ahora: Date;
}): ProximoPorOpcion | null {
  const { panel, diaSemana, hora, dias, incluirDiaEnvio, ahora } = params;
  if (!esHoraValida(hora) || Number.isNaN(ahora.getTime())) return null;
  const proxima = calcularProximaAlGuardar({
    previa: {
      activa: panel.activa,
      diaSemana: panel.diaSemana,
      hora: panel.hora,
      proximaEjecucionEn: panel.proximaEjecucionEn ? new Date(panel.proximaEjecucionEn) : null,
    },
    nueva: { activa: true, diaSemana, hora },
    ahora,
  });
  if (!proxima) return null;
  const { ultimoHasta } = panel.periodoManualSugerido;
  // Así se guarda el «hasta» de un período (ver `fechaDePeriodoGuardado`).
  const ultimoPeriodoHasta = ultimoHasta ? new Date(`${ultimoHasta}T23:59:59.999Z`) : null;
  const periodo = (regla: ReglaPeriodo) => calcularPeriodoEnvio({ referencia: proxima, ultimoPeriodoHasta, regla });
  return {
    proxima,
    ultimosDias: dias === null ? null : periodo({ modo: "ultimos_dias", dias, incluirDiaEnvio }),
    continua: periodo({ modo: "continua", dias: DIAS_PERIODO_POR_DEFECTO, incluirDiaEnvio }),
  };
}

/** «Próximo envío (miércoles 02/Dic/2026): del 25/Nov/2026 al 01/Dic/2026», junto a cada opción. */
function PeriodoDeLaOpcion({ proxima, periodo, activa }: { proxima: Date; periodo: PeriodoEnvio; activa: boolean }) {
  const cuando = `${etiquetaDiaSemana(diaSemanaColombia(proxima)).toLowerCase()} ${fmtCalendarDate(fechaColombia(proxima))}`;
  const cubierto = periodo.estado === "cubierto";
  const que = cubierto
    ? `ya está cubierto hasta el ${fmtCalendarDate(periodo.cubiertoHasta)}, no se enviaría`
    : periodo.desde === periodo.hasta
      ? `el ${fmtCalendarDate(periodo.desde)}`
      : `del ${fmtCalendarDate(periodo.desde)} al ${fmtCalendarDate(periodo.hasta)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] ${
        cubierto ? "border-warn-200 bg-warn-100 text-warn-700" : "border-blue-200 bg-blue-50 text-navy-800"
      }`}
    >
      <Icon name="calendar" size={12} className="shrink-0" />
      <span>
        Próximo envío ({cuando}
        {activa ? "" : ", si lo activas"}): <strong className="font-semibold">{que}</strong>
      </span>
    </span>
  );
}

/** El día de la semana a `delta` días de `diaSemana` (1 = lunes … 7 = domingo), en minúsculas. */
function diaDesplazado(diaSemana: number, delta: number): string {
  return etiquetaDiaSemana(((((diaSemana - 1 + delta) % 7) + 7) % 7) + 1).toLowerCase();
}

/** «Enviado un miércoles, cubre del miércoles anterior al martes…»: qué significa la regla elegida. */
function explicarUltimosDias(diaSemana: number, dias: number, incluirDiaEnvio: boolean): string {
  const dia = diaDesplazado(diaSemana, 0);
  // Último día que cubre: el mismo del envío o el anterior.
  const ultimo = incluirDiaEnvio ? `ese mismo ${dia}` : `el ${diaDesplazado(diaSemana, -1)}`;
  const cubre =
    dias === 7
      ? incluirDiaEnvio
        ? `Enviado el ${dia}, cubre del ${diaDesplazado(diaSemana, 1)} anterior al ${dia} (hasta la hora del envío).`
        : `Enviado el ${dia}, cubre del ${dia} anterior al ${diaDesplazado(diaSemana, -1)}: cada día se reporta una sola vez.`
      : dias === 1
        ? `Enviado el ${dia}, cubre solo ${ultimo}.`
        : `Enviado el ${dia}, cubre los ${dias} días que terminan ${ultimo}.`;
  const semanal =
    dias < 7
      ? ` Con envío semanal, ${7 - dias} ${7 - dias === 1 ? "día" : "días"} de cada semana no ${7 - dias === 1 ? "sale" : "salen"} en ningún reporte.`
      : dias > 7
        ? ` Con envío semanal, ${dias - 7} ${dias - 7 === 1 ? "día se repite" : "días se repiten"} en el envío siguiente.`
        : "";
  return `${cubre}${semanal} Si alguien ya envió a mano un reporte que llega hasta ${ultimo}, ese envío se omite.`;
}

/** Lo que implica contar el día del envío: ese día solo trae lo registrado hasta la hora en que sale. */
function avisoDiaEnvio(hora: string, regla: ReglaPeriodo): string {
  const resto =
    regla.modo === "ultimos_dias" && regla.dias > 7
      ? "el resto de ese día sale en el envío siguiente."
      : "lo que pase después ese día no sale en ningún reporte, porque el siguiente arranca al día siguiente.";
  return `El día del envío entra solo con lo registrado hasta las ${hora} (hora de Colombia): ${resto}`;
}

function ProgramacionForm({ panel, destinatariosActivos }: { panel: PanelEnvioAutomatico; destinatariosActivos: number }) {
  const [pendiente, startTransition] = useTransition();
  const [activa, setActiva] = useState(panel.activa);
  const [diaSemana, setDiaSemana] = useState(panel.diaSemana);
  const [hora, setHora] = useState(panel.hora);
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>(panel.modoPeriodo);
  const [diasTexto, setDiasTexto] = useState(String(panel.diasPeriodo));
  const [incluirDiaEnvio, setIncluirDiaEnvio] = useState(panel.incluirDiaEnvio);
  // Momento del último cambio: con él se recalcula el próximo envío de cada opción (antes de
  // cualquier cambio se usa el instante del panel, el mismo en el servidor y en el navegador).
  const [cambiadoEn, setCambiadoEn] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dias = Number(diasTexto);
  const diasValidos = Number.isInteger(dias) && dias >= DIAS_PERIODO_MINIMO && dias <= DIAS_PERIODO_MAXIMO;
  // En «desde el último reporte enviado» los días no se usan: cambiarlos no es un cambio.
  const cambiaPeriodo =
    modoPeriodo !== panel.modoPeriodo ||
    (modoPeriodo === "ultimos_dias" && dias !== panel.diasPeriodo) ||
    incluirDiaEnvio !== panel.incluirDiaEnvio;
  const cambios = activa !== panel.activa || diaSemana !== panel.diaSemana || hora !== panel.hora || cambiaPeriodo;
  const periodoValido = modoPeriodo !== "ultimos_dias" || diasValidos;
  const regla: ReglaPeriodo = { modo: modoPeriodo, dias: diasValidos ? dias : panel.diasPeriodo, incluirDiaEnvio };
  const proximo = proximoEnvioPorOpcion({
    panel,
    diaSemana,
    hora,
    dias: diasValidos ? dias : null,
    incluirDiaEnvio,
    ahora: cambiadoEn ?? new Date(panel.ahora),
  });

  /** Cada cambio del formulario anota cuándo ocurrió, para la vista previa. */
  const cambiar = <T,>(fijar: (valor: T) => void) => (valor: T) => {
    fijar(valor);
    setCambiadoEn(new Date());
  };

  const guardar = () => {
    setError(null);
    startTransition(async () => {
      const r = await guardarProgramacionReporte({
        activa, diaSemana, hora, modoPeriodo, diasPeriodo: regla.dias, incluirDiaEnvio,
      });
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
            onChange={(e) => cambiar(setActiva)(e.target.checked)}
            disabled={pendiente}
            className="h-4 w-4 rounded border-ink-300 accent-navy-700"
          />
          {activa ? "Envío automático activo" : "Envío automático en pausa"}
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">
          Día de la semana
          <select
            value={diaSemana}
            onChange={(e) => cambiar(setDiaSemana)(Number(e.target.value))}
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
            onChange={(e) => cambiar(setHora)(e.target.value)}
            disabled={pendiente}
            required
            className={`${CAMPO} w-[7.5rem]`}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5" disabled={pendiente}>
        <legend className="mb-1 text-[11.5px] font-semibold text-ink-600">Qué período cubre cada envío</legend>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
          <input
            id="periodo-ultimos-dias"
            type="radio"
            name="modo-periodo"
            checked={modoPeriodo === "ultimos_dias"}
            onChange={() => cambiar(setModoPeriodo)("ultimos_dias")}
            className="h-4 w-4 accent-navy-700"
          />
          <label htmlFor="periodo-ultimos-dias">Los últimos</label>
          <input
            type="number"
            inputMode="numeric"
            min={DIAS_PERIODO_MINIMO}
            max={DIAS_PERIODO_MAXIMO}
            step={1}
            value={diasTexto}
            onChange={(e) => cambiar(setDiasTexto)(e.target.value)}
            onFocus={() => {
              if (modoPeriodo !== "ultimos_dias") cambiar(setModoPeriodo)("ultimos_dias");
            }}
            aria-label="Días que cubre cada envío"
            className={`${CAMPO_EN_LINEA} w-16 text-center`}
          />
          <label htmlFor="periodo-ultimos-dias">
            {incluirDiaEnvio ? "días, contando el día del envío" : "días, sin contar el día del envío"}
          </label>
          {proximo?.ultimosDias && (
            <PeriodoDeLaOpcion proxima={proximo.proxima} periodo={proximo.ultimosDias} activa={activa} />
          )}
        </div>
        {/* La explicación va bajo la opción que explica. */}
        {modoPeriodo === "ultimos_dias" &&
          (diasValidos ? (
            <p className="pl-6 text-[11.5px] text-ink-500">{explicarUltimosDias(diaSemana, dias, incluirDiaEnvio)}</p>
          ) : (
            <p role="alert" className="pl-6 text-[11.5px] text-err-700">
              Indica de {DIAS_PERIODO_MINIMO} a {fmtNum(DIAS_PERIODO_MAXIMO)} días.
            </p>
          ))}
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
          <input
            id="periodo-continua"
            type="radio"
            name="modo-periodo"
            checked={modoPeriodo === "continua"}
            onChange={() => cambiar(setModoPeriodo)("continua")}
            className="h-4 w-4 accent-navy-700"
          />
          <label htmlFor="periodo-continua">
            {incluirDiaEnvio
              ? `Desde el último reporte enviado (máximo ${fmtNum(TOPE_DIAS_ENVIO_AUTOMATICO)} días)`
              : `Desde el último reporte enviado (sin huecos ni días repetidos; máximo ${fmtNum(TOPE_DIAS_ENVIO_AUTOMATICO)} días)`}
          </label>
          {proximo && <PeriodoDeLaOpcion proxima={proximo.proxima} periodo={proximo.continua} activa={activa} />}
        </div>

        {/* Vale para las dos opciones: hasta qué día llega cada envío. */}
        <label className="mt-1.5 flex items-center gap-2 text-[12.5px] font-medium text-ink-700">
          <input
            id="incluir-dia-envio"
            type="checkbox"
            checked={incluirDiaEnvio}
            onChange={(e) => cambiar(setIncluirDiaEnvio)(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 accent-navy-700"
          />
          Contar también el día del envío (hasta la hora en que sale)
        </label>
        {incluirDiaEnvio && esHoraValida(hora) && (
          <p className="pl-6 text-[11.5px] text-warn-700">{avisoDiaEnvio(hora, regla)}</p>
        )}
      </fieldset>

      <div>
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !cambios || !hora || !periodoValido}
          className={BTN_PRIMARIO}
        >
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
      {/* Lo que cubre cada opción ya se ve junto a ella; aquí solo cuándo saldría al guardar. */}
      {cambios && activa && proximo ? (
        <p className="text-[12.5px] text-navy-800" aria-live="polite">
          <span className="font-semibold">Al guardar:</span> el próximo envío sería el{" "}
          {fechaEnvio(proximo.proxima.toISOString())} (hora de Colombia), con el período de la opción elegida.
        </p>
      ) : (
        !cambios &&
        panel.activa &&
        panel.proximaEjecucionEn &&
        panel.periodoProximo && (
          <PeriodoDelProximoEnvio periodo={panel.periodoProximo} incluyeDiaEnvio={panel.incluirDiaEnvio} />
        )
      )}
    </section>
  );
}

/** «Los últimos 7 días antes del envío…» del próximo envío, según cuente o no el día del envío. */
function textoUltimosDias(dias: number, incluyeDiaEnvio: boolean): string {
  if (incluyeDiaEnvio) {
    return dias === 1
      ? "El día del envío, hasta la hora en que sale."
      : `Los últimos ${fmtNum(dias)} días, contando el día del envío hasta la hora en que sale.`;
  }
  return dias === 1 ? "El día anterior al envío." : `Los últimos ${fmtNum(dias)} días antes del envío, sin contar ese día.`;
}

/** Qué cubrirá el próximo envío y de dónde sale ese período (del servidor, o la vista previa al editar). */
function PeriodoDelProximoEnvio({ periodo, incluyeDiaEnvio }: { periodo: PeriodoProximoPanel; incluyeDiaEnvio: boolean }) {
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
        {periodo.origen === "ultimos_dias"
          ? textoUltimosDias(diasDelPeriodo(periodo.desde, periodo.hasta), incluyeDiaEnvio)
          : periodo.origen === "continua" && periodo.ultimoHasta
            ? `Continúa desde el último reporte enviado (del ${periodo.ultimoDesde ? fmtCalendarDate(periodo.ultimoDesde) : "—"} al ${fmtCalendarDate(periodo.ultimoHasta)}).`
            : "Primer envío: últimos 7 días."}
        {periodo.origen !== "ultimos_dias" && incluyeDiaEnvio && " Llega hasta el día del envío, a la hora en que sale."}
        {periodo.recortado &&
          ` Se recortó a ${fmtNum(TOPE_DIAS_ENVIO_AUTOMATICO)} días (el tope): sin él habría arrancado el ${fmtCalendarDate(periodo.desdeSinRecorte)}.`}
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

/**
 * Lo que llevan la prueba y el envío a la lista: el período elegido arriba, junto al título de
 * la página, y las novedades de ese período marcadas «Omitir». Es lo mismo con que se genera
 * «Resumen de uso y avances», así que el correo es el reporte que se vio.
 */
export type AlcanceDelEnvio = {
  desde: string;
  hasta: string;
  omitidos: Array<{ id: number; titulo: string; version: string }>;
};

type ReporteManualGenerado = Extract<GenerarReporteEjecutivoResult, { ok: true }> & {
  desde: string;
  hasta: string;
};

/** El período de arriba sirve para enviar si es válido y no termina después de hoy (hora de Colombia). */
function validarPeriodoDeEnvio(desde: string, hasta: string, hoy: string): string | null {
  if (!desde || !hasta || desde > hasta || !parseRangoReporte(desde, hasta)) {
    return `El período elegido arriba no es válido o supera ${fmtNum(MAX_DIAS_RANGO)} días: elige otro junto al título de la página.`;
  }
  if (hasta > hoy) {
    return "El período elegido arriba termina después de hoy: elige uno que termine hoy o antes para enviarlo.";
  }
  return null;
}

function textoPeriodo(desde: string, hasta: string): string {
  return desde === hasta ? fmtCalendarDate(desde) : `${fmtCalendarDate(desde)} al ${fmtCalendarDate(hasta)}`;
}

function EtiquetasDestinatarios({ destinatarios }: { destinatarios: DestinatarioPanel[] }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Correos que recibirán el reporte">
      {destinatarios.map((d) => (
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
  );
}

function Envios({
  panel,
  destinatariosActivos,
  alcance,
}: {
  panel: PanelEnvioAutomatico;
  destinatariosActivos: DestinatarioPanel[];
  alcance: AlcanceDelEnvio;
}) {
  const [pendiente, setPendiente] = useState<"prueba" | "lista" | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [actualizarDatos, setActualizarDatos] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [generado, setGenerado] = useState<ReporteManualGenerado | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  // A dónde va la prueba: arranca con el correo de quien mira la pantalla y se puede cambiar.
  const [correoPrueba, setCorreoPrueba] = useState(panel.correoPrueba ?? "");
  const solicitudRef = useRef<AbortController | null>(null);
  useEffect(() => () => solicitudRef.current?.abort(), []);

  const ocupado = pendiente !== null;
  const correoPruebaValido = CORREO_VALIDO.test(correoPrueba.trim());
  const sinConexion = panel.conexion.estado !== "lista";
  const totalActivos = destinatariosActivos.length;
  const { desde, hasta, omitidos } = alcance;
  const cambiosOmitidos = omitidos.map((o) => o.id);
  // Del panel solo se usan hoy (hora de Colombia) y el último reporte enviado a la lista.
  const { hoy, ultimoDesde, ultimoHasta } = panel.periodoManualSugerido;
  const errorPeriodo = validarPeriodoDeEnvio(desde, hasta, hoy);
  const periodoComparado = !errorPeriodo ? periodoAnteriorEnFechas(desde, hasta) : null;
  // Volver a enviar días ya enviados se permite (p. ej. para corregir), pero se avisa.
  const repiteUltimo = Boolean(ultimoHasta && desde <= ultimoHasta && (!ultimoDesde || hasta >= ultimoDesde));

  const cancelarGeneracion = () => {
    solicitudRef.current?.abort();
    solicitudRef.current = null;
    setGenerando(false);
  };

  const abrirModal = () => {
    setActualizarDatos(false);
    setGenerado(null);
    setErrorModal(null);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (pendiente === "lista") return;
    if (solicitudRef.current) cancelarGeneracion();
    setModalAbierto(false);
    setErrorModal(null);
  };

  const generarParaEnviar = async () => {
    if (solicitudRef.current || errorPeriodo) return;
    setErrorModal(null);
    const solicitud = new AbortController();
    solicitudRef.current = solicitud;
    setGenerando(true);
    try {
      const response = await fetch("/api/auditoria/reporte-ejecutivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde,
          hasta,
          actualizar: actualizarDatos,
          cambiosOmitidos,
        }),
        signal: solicitud.signal,
      });
      const res = (await response.json()) as GenerarReporteEjecutivoResult;
      if (solicitud.signal.aborted || solicitudRef.current !== solicitud) return;
      if (!res.ok) {
        setErrorModal(res.message);
        return;
      }
      setGenerado({ ...res, desde, hasta });
    } catch (e) {
      if (!solicitud.signal.aborted && solicitudRef.current === solicitud) {
        setErrorModal(e instanceof Error ? e.message : "No se pudo generar el reporte.");
      }
    } finally {
      if (solicitudRef.current === solicitud) {
        solicitudRef.current = null;
        setGenerando(false);
      }
    }
  };

  const enviarPrueba = async () => {
    if (ocupado || !correoPruebaValido || errorPeriodo) return;
    setPendiente("prueba");
    try {
      const r = await enviarPruebaDelReporte({ correo: correoPrueba.trim(), alcance: { desde, hasta, cambiosOmitidos } });
      if (r.ok) notifySuccess("Prueba enviada", r.message ?? "");
      else notifyError("No se pudo enviar la prueba", r.message ?? "Inténtalo de nuevo.");
    } catch {
      notifyError("No se pudo enviar", "La solicitud no terminó. Revisa el historial antes de reintentar.");
    } finally {
      setPendiente(null);
    }
  };

  const enviarALista = async () => {
    if (ocupado || !generado) return;
    setErrorModal(null);
    setPendiente("lista");
    try {
      // Las omisiones que aplicó el reporte revisado: el correo reutiliza exactamente ese reporte.
      const r = await enviarReporteAhoraALista({
        desde: generado.desde,
        hasta: generado.hasta,
        cambiosOmitidos: generado.cambiosOmitidos,
      });
      if (r.ok) {
        notifySuccess("Reporte enviado", r.message ?? "");
        setModalAbierto(false);
        setGenerado(null);
      } else {
        const msg = r.message ?? "Inténtalo de nuevo.";
        setErrorModal(msg);
        notifyError("No se pudo enviar el reporte", msg);
      }
    } catch {
      const msg = "La solicitud no terminó. Revisa el historial antes de reintentar.";
      setErrorModal(msg);
      notifyError("No se pudo enviar", msg);
    } finally {
      setPendiente(null);
    }
  };

  return (
    <section aria-labelledby="envio-ahora" className="flex flex-col gap-3">
      <div>
        <h3 id="envio-ahora" className="text-[12.5px] font-semibold text-navy-800">
          Enviar ahora
        </h3>
        <p className="text-[11.5px] text-ink-500">
          Los dos envíos llevan el período elegido arriba (
          <strong className="font-semibold text-ink-700">{textoPeriodo(desde, hasta)}</strong>) y{" "}
          {omitidos.length === 0
            ? "todas sus novedades"
            : `dejan fuera ${omitidos.length === 1 ? "la novedad marcada" : `las ${fmtNum(omitidos.length)} novedades marcadas`} «Omitir»`}
          : es el mismo reporte de «Resumen de uso y avances».
        </p>
      </div>
      {errorPeriodo && (
        <p role="alert" className="text-[12px] text-err-700">
          {errorPeriodo}
        </p>
      )}

      {/* La prueba y el envío a la lista van en recuadros separados: cada botón con sus correos. */}
      <div role="group" aria-labelledby="envio-prueba" className="flex flex-col gap-2 rounded-md border border-ink-150 px-3 py-3">
        <div>
          <h4 id="envio-prueba" className="text-[12px] font-semibold text-navy-800">
            Enviar una prueba
          </h4>
          <p className="text-[11.5px] text-ink-500">
            La prueba llega solo al correo que escribas aquí (de entrada, el tuyo), con «[Prueba]» en el asunto. No va
            a la lista ni cuenta como entregada al cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="correo-prueba" className="sr-only">
            Correo al que va la prueba
          </label>
          <input
            id="correo-prueba"
            type="email"
            value={correoPrueba}
            onChange={(e) => setCorreoPrueba(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void enviarPrueba();
              }
            }}
            placeholder="Correo para la prueba"
            autoComplete="off"
            maxLength={254}
            disabled={ocupado}
            className={`${CAMPO} min-w-0 flex-1 sm:w-72 sm:flex-none`}
          />
          <button
            type="button"
            onClick={enviarPrueba}
            disabled={ocupado || sinConexion || !correoPruebaValido || Boolean(errorPeriodo)}
            className={BTN_SECUNDARIO}
            title={
              errorPeriodo ?? (correoPruebaValido ? `Envía solo a ${correoPrueba.trim()}` : "Escribe un correo válido")
            }
          >
            <Icon name="send" size={13} />
            {pendiente === "prueba" ? "Enviando prueba…" : "Enviar prueba"}
          </button>
        </div>
      </div>

      <div role="group" aria-labelledby="envio-lista" className="flex flex-col gap-2 rounded-md border border-ink-150 px-3 py-3">
        <div>
          <h4 id="envio-lista" className="text-[12px] font-semibold text-navy-800">
            Enviar a la lista
          </h4>
          <p className="text-[11.5px] text-ink-500">
            Va a los correos marcados en «Destinatarios». Antes de enviarlo generas el reporte para revisarlo; queda
            registrado en «Reportes enviados» para que el envío automático no repita esas novedades.
          </p>
        </div>
        {totalActivos > 0 ? (
          <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
            <p className="font-medium text-ink-800">
              El reporte llegará a {fmtNum(totalActivos)} {totalActivos === 1 ? "correo activo" : "correos activos"}:
            </p>
            <EtiquetasDestinatarios destinatarios={destinatariosActivos} />
          </div>
        ) : (
          <p className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-500">
            No hay correos activos para el envío. Agrega o activa al menos un destinatario arriba para habilitar el envío a la lista.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={abrirModal}
            disabled={ocupado || sinConexion || totalActivos === 0 || Boolean(errorPeriodo)}
            className={BTN_PRIMARIO}
          >
            <Icon name="send" size={13} />
            {pendiente === "lista" ? "Enviando a la lista…" : "Enviar ahora a la lista"}
          </button>
        </div>
      </div>

      <Modal
        open={modalAbierto}
        onClose={cerrarModal}
        title={generado ? "Revisar y enviar reporte para gerencia" : "Generar reporte para gerencia"}
        size={generado ? "4xl" : "2xl"}
        footer={
          generado ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setGenerado(null);
                  setErrorModal(null);
                }}
                disabled={pendiente === "lista"}
                className={BTN_SECUNDARIO}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={enviarALista}
                disabled={pendiente === "lista" || sinConexion || totalActivos === 0}
                className={BTN_PRIMARIO}
              >
                <Icon name="send" size={14} />
                {pendiente === "lista" ? (
                  <EstadoProcesando>Enviando a la lista</EstadoProcesando>
                ) : (
                  `Enviar ahora a la lista (${fmtNum(totalActivos)})`
                )}
              </button>
            </>
          ) : (
            <>
              {generando && (
                <button type="button" onClick={cancelarGeneracion} className={BTN_SECUNDARIO}>
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={generarParaEnviar}
                disabled={generando || Boolean(errorPeriodo) || totalActivos === 0}
                className={BTN_PRIMARIO}
              >
                <Icon name="ai" size={14} />
                {generando ? <EstadoProcesando>Generando</EstadoProcesando> : "Generar reporte para gerencia"}
              </button>
            </>
          )
        }
      >
        {generado ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
              <span className="font-medium text-ink-700">Período: {textoPeriodo(generado.desde, generado.hasta)}</span>
              <span>·</span>
              <span>
                {fmtNum(generado.totalAcciones)} acciones · {fmtNum(generado.totalUsuarios)} usuarios ·{" "}
                {fmtNum(generado.totalNovedades)} novedades
                {generado.cambiosOmitidos.length > 0
                  ? ` · ${fmtNum(generado.cambiosOmitidos.length)} ${generado.cambiosOmitidos.length === 1 ? "omitida" : "omitidas"}`
                  : ""}
                {generado.porcentajeAdopcion != null ? ` · ${generado.porcentajeAdopcion}% adopción` : ""}
                {generado.desdeCache ? " · reutilizado de caché" : ""}
              </span>
            </div>
            <h4 className="text-lg font-light text-navy-800">{generado.report.titulo}</h4>
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-ink-700">
              <p className="font-medium text-navy-800">
                Listo para enviar a {fmtNum(totalActivos)} {totalActivos === 1 ? "destinatario activo" : "destinatarios activos"}:
              </p>
              <EtiquetasDestinatarios destinatarios={destinatariosActivos} />
              <p className="mt-1.5 text-[11.5px] text-ink-600">
                Al enviar quedará constancia en «Reportes enviados» hasta el {fmtCalendarDate(generado.hasta)} para que el
                envío automático continúe desde el día siguiente.
              </p>
            </div>
            {errorModal && (
              <p role="alert" className="text-[12.5px] text-err-700">
                {errorModal}
              </p>
            )}
            <iframe
              title="Vista previa del reporte para gerencia"
              srcDoc={generado.report.html}
              sandbox=""
              className="h-[52vh] w-full rounded-md border border-ink-150 bg-white"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed text-ink-600">
              El correo lleva el mismo reporte de «Resumen de uso y avances»: el período elegido arriba y sin las
              novedades marcadas «Omitir». Genéralo para revisarlo y luego envíalo a la lista de destinatarios activos.
            </p>

            <div className="flex flex-col gap-2">
              <h4 className="text-[12.5px] font-semibold text-navy-800">Período</h4>
              <p className="text-[12.5px] text-ink-700">
                <strong>{textoPeriodo(desde, hasta)}</strong>
                {periodoComparado ? ` (${periodoComparado.dias} ${periodoComparado.dias === 1 ? "día" : "días"})` : ""}.
                Es el que elegiste arriba, junto al título de la página; para cambiarlo, cierra esta ventana y elige
                otro.
              </p>

              {errorPeriodo && (
                <p role="alert" className="text-[12px] text-err-700">
                  {errorPeriodo}
                </p>
              )}

              {periodoComparado && (
                <p className="rounded-md bg-navy-50 px-3 py-2 text-[12px] text-navy-800">
                  Se comparará con{" "}
                  {periodoComparado.dias === 1 ? "el día anterior" : `los ${periodoComparado.dias} días anteriores`}:{" "}
                  <strong>{textoPeriodo(periodoComparado.desde, periodoComparado.hasta)}</strong>.
                </p>
              )}

              {ultimoHasta &&
                (repiteUltimo ? (
                  <Aviso>
                    El último reporte enviado a la lista cubrió{" "}
                    {ultimoDesde ? `del ${textoPeriodo(ultimoDesde, ultimoHasta)}` : `hasta el ${fmtCalendarDate(ultimoHasta)}`}: este
                    período repite días ya enviados.
                  </Aviso>
                ) : (
                  <p className="text-[11.5px] text-ink-500">
                    Último reporte enviado a la lista:{" "}
                    {ultimoDesde ? `del ${textoPeriodo(ultimoDesde, ultimoHasta)}` : `hasta el ${fmtCalendarDate(ultimoHasta)}`}.
                  </p>
                ))}
            </div>

            <div className="flex flex-col gap-1">
              <h4 className="text-[12.5px] font-semibold text-navy-800">Novedades del período</h4>
              {omitidos.length === 0 ? (
                <p className="text-[12.5px] text-ink-700">Ninguna está marcada «Omitir»: entran todas las del período.</p>
              ) : (
                <>
                  <p className="text-[12.5px] text-ink-700">
                    {omitidos.length === 1
                      ? "Queda fuera la novedad marcada «Omitir»:"
                      : `Quedan fuera las ${fmtNum(omitidos.length)} novedades marcadas «Omitir»:`}
                  </p>
                  <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-[12px] text-ink-500">
                    {omitidos.map((o) => (
                      <li key={o.id}>
                        {o.titulo} <span className="text-ink-400">(v{o.version})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-[11.5px] text-ink-500">
                Lo que entra y lo que queda fuera se elige en «Novedades del período», en la página.
              </p>
            </div>

            <div className="rounded-lg border border-ink-150 bg-ink-50 p-3 text-[12px] text-ink-600">
              <p>
                El mismo período recupera el reporte guardado con sus cifras y fecha de corte originales, salvo que
                marques actualizarlo. Si se guardó con otra forma de contar las operaciones, se vuelve a calcular.
              </p>
              <label className="mt-2 flex cursor-pointer items-start gap-2 font-medium text-ink-800">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-navy-700"
                  checked={actualizarDatos}
                  disabled={generando}
                  onChange={(e) => setActualizarDatos(e.target.checked)}
                />
                Actualizar con datos nuevos y guardar otra revisión
              </label>
            </div>

            <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
              <p className="font-medium text-ink-800">
                Destinatarios activos ({fmtNum(totalActivos)}):
              </p>
              <EtiquetasDestinatarios destinatarios={destinatariosActivos} />
            </div>

            {errorModal && (
              <p role="alert" className="text-[12.5px] text-err-700">
                {errorModal}
              </p>
            )}
          </div>
        )}
      </Modal>
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
