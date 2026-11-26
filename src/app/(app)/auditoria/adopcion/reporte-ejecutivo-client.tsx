"use client";

import { EstadoProcesando } from "@/components/estado-procesando";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  eliminarEnvioReporteEjecutivo,
  eliminarReporteGenerado,
  eliminarTodosLosReportesGenerados,
  type GenerarReporteEjecutivoResult,
  type ReporteGeneradoPrevio,
  registrarEnvioReporteEjecutivo,
} from "@/app/actions/auditoria-reporte";
import { Card, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtCalendarDate, fmtDate, fmtDateTimeLong, fmtNum } from "@/lib/format";
import { periodoAnteriorEnFechas } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import type { SeccionNovedad } from "@/lib/auditoria/reporte-ejecutivo/omitir-novedades";
import { NovedadesAOmitir, type CambioAOmitir } from "./novedades-a-omitir";
import { despliegueEnFechas } from "@/lib/auditoria/reporte-ejecutivo/novedades-periodo";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import {
  hacerBarrasCompatiblesCorreo,
  htmlConEstilosEnLinea,
  LIMITE_RECORTE_GMAIL,
} from "@/lib/correo/preparar-html-correo";
import { copiarHtmlAlPortapapeles } from "@/lib/portapapeles";
import { absolutizarRecursosMarca, prepararMarcaParaCorreo } from "@/lib/marca/html";
import { FUENTE_CORREO, NEUTRO } from "@/lib/marca/paleta";
import type { ReporteEjecutivoUso } from "@/lib/auditoria/reporte-ejecutivo/reportes";
import type {
  EnvioReportePrevio,
} from "@/lib/auditoria/reporte-ejecutivo/envios";
import {
  IndicadoresUso,
  type BarraUso,
  type SerieDiaUso,
} from "./indicadores-uso";
import type { ComparativoUso } from "@/lib/auditoria/reporte-ejecutivo/comparativo";
import type { CostosIA } from "@/lib/auditoria/reporte-ejecutivo/costos-ia";
import type { TicketsAtendidosVista } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos";
import type { UsuariosActivos } from "@/lib/auditoria/reporte-ejecutivo/usuarios-activos";
import {
  consecuenciaTraslape,
  describirTraslape,
  detectarTraslapes,
  TITULO_TRASLAPE,
} from "@/lib/auditoria/reporte-ejecutivo/traslape";
import { TarjetaUsuariosActivos } from "./usuarios-activos-tarjeta";
import { EnvioAutomatico, type AlcanceDelEnvio } from "@/app/(app)/config/reportes-ejecutivos/envio-automatico";
import type { ResultadoPanelEnvio } from "@/app/actions/notificaciones-programadas";

/** Un cambio publicable de una versión, tal como lo verá gerencia (para elegir qué omitir). */
export type CambioOpcion = {
  id: number;
  tipo: string;
  titulo: string;
  descripcion: string;
  /** Nombre del módulo en el menú; null si el cambio es de la plataforma en general. */
  modulo: string | null;
};

export type VersionOpcion = {
  id: number;
  number: string;
  title: string;
  changesCount: number;
  cambios: CambioOpcion[];
  releasedAt: string | null;
  /** Día que cuenta para el reporte (AAAA-MM-DD): el de despliegue o, sin él, el de publicación. */
  deployedOn: string | null;
  createdAt: string;
};

export type KpisIniciales = {
  /** Variación del uso frente al reporte anterior; null cuando no hay con qué comparar. */
  comparativo?: ComparativoUso | null;
  /** Gasto de IA del período; null cuando no hubo consumo. */
  costos?: CostosIA | null;
  /** Tickets atendidos en el período; null cuando no se pudieron leer. */
  tickets?: TicketsAtendidosVista | null;
  /** Operaciones según la metodología 7 (definición en `metricas.ts`). */
  totalAcciones: number;
  /** Registros de la bitácora detrás de esas operaciones. */
  totalRegistros?: number;
  /** Volumen de trabajo detrás de las operaciones (cuentas homologadas, alertas, marcas…). */
  volumen?: BarraUso[];
  /** Personas con acciones auditadas en el período (no es «usuarios activos»). */
  totalUsuarios: number;
  /** «Usuarios activos: X de Y»; null cuando no se pudo medir. */
  usuariosActivos?: UsuariosActivos | null;
  totalClientes: number;
  usadas: number;
  sinEvidencia: number;
  noMedibles: number;
  porcentajeAdopcion: number | null;
  totalNovedades: number;
  totalVersionesPublicadas: number;
  porFamilia: BarraUso[];
  topUsuarios: BarraUso[];
  topAcciones: BarraUso[];
  topClientes: BarraUso[];
  serieDiaria: SerieDiaUso[];
  adopcionBarras: BarraUso[];
};

type MetaReporte = {
  generatedAt: string;
  totalAcciones: number;
  totalUsuarios: number;
  totalNovedades: number;
  porcentajeAdopcion: number | null;
  desdeCache: boolean;
  /** Alcance con el que se generó: necesario para registrar el envío. */
  versionIdsIncluidos: number[];
  /** Cambios que se dejaron fuera de este reporte. */
  cambiosOmitidos: number[];
  desde: string;
  hasta: string;
};

type CanalEnvio = "correo" | "pdf" | "html";

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
function fechaLarga(iso: string): string {
  const fecha = fmtDateTimeLong(iso);
  return fecha === "—" ? "" : fecha;
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}


function descargarHtml(reporte: ReporteEjecutivoUso): void {
  // El archivo se abre fuera de la plataforma: el logotipo y Lato con dirección absoluta.
  const html = absolutizarRecursosMarca(reporte.html, window.location.origin);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(reporte.titulo) || "reporte-uso-y-avances"}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Deja el reporte listo para pegar en un correo. Vuelca el CSS a estilos EN
 * LÍNEA porque Gmail elimina las etiquetas <style> del contenido pegado: con
 * la hoja embebida el documento llega sin serif, sin azul institucional y sin
 * tarjetas. Si el navegador no expone DOMParser, cae al fragmento con <style>
 * embebido (Outlook de escritorio sí lo respeta).
 */
function prepararHtmlCorreo(htmlCompleto: string): string {
  let html: string;
  try {
    html = htmlConEstilosEnLinea(htmlCompleto);
  } catch {
    html = htmlCorreoConEstilosEmbebidos(htmlCompleto);
  }
  // En el correo el manual pide Arial (§2.2) y el logotipo necesita una dirección absoluta.
  return prepararMarcaParaCorreo(html, window.location.origin);
}

function htmlCorreoConEstilosEmbebidos(htmlCompleto: string): string {
  const estilos =
    htmlCompleto.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1]?.trim() ?? "";
  const cuerpoMatch = htmlCompleto.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const cuerpo = hacerBarrasCompatiblesCorreo((cuerpoMatch?.[1] ?? htmlCompleto).trim());

  return `<div style="font-family:${FUENTE_CORREO};color:${NEUTRO.k90};font-size:14px;line-height:1.5;">
${estilos ? `<style type="text/css">${estilos}</style>` : ""}
${cuerpo}
</div>`;
}

function htmlATextoPlano(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const texto = (tmp.textContent ?? tmp.innerText ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto;
}

type ResultadoCopiaCorreo = { conFormato: boolean; caracteres: number };

/**
 * Copia el reporte al portapapeles en HTML (para Gmail/Outlook) + texto plano.
 * Luego el usuario pega (Ctrl/Cmd+V) en el borrador del correo.
 */
async function copiarFormatoCorreo(reporte: ReporteEjecutivoUso): Promise<ResultadoCopiaCorreo> {
  const htmlCorreo = prepararHtmlCorreo(reporte.html);
  const textoPlano = htmlATextoPlano(htmlCorreo);
  const caracteres = htmlCorreo.length;

  const { conFormato } = await copiarHtmlAlPortapapeles(htmlCorreo, textoPlano);
  return { conFormato, caracteres };
}

async function descargarPdf(reporte: ReporteEjecutivoUso, viewportWidth?: number): Promise<void> {
  const res = await fetch("/api/auditoria/reporte-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: reporte.titulo, html: reporte.html, viewportWidth }),
  });

  const esPdf = res.headers.get("content-type")?.includes("application/pdf");
  if (!res.ok || res.redirected || !esPdf) {
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "No se pudo generar el PDF.");
  }

  const blob = await res.blob();
  descargarBlob(blob, `${slug(reporte.titulo) || "reporte-uso-y-avances"}.pdf`);
}

export function ReporteEjecutivoClient({
  versions,
  kpis,
  periodoDesde,
  periodoHasta,
  envios,
  generados = [],
  panelEnvio,
}: {
  versions: VersionOpcion[];
  kpis: KpisIniciales;
  /**
   * Período de toda la página (AAAA-MM-DD), elegido arriba junto al título: lo
   * usan los indicadores, las novedades, los tickets y el reporte que se genere.
   */
  periodoDesde: string;
  periodoHasta: string;
  envios: EnvioReportePrevio[];
  /** Historial de reportes generados; solo sirve para avisar de traslapes. */
  generados?: ReporteGeneradoPrevio[];
  /**
   * Panel de envío por correo. Con él, la página empieza por ese panel y la tarjeta para
   * generar el reporte va dentro, junto a «Enviar ahora»; sin él, la tarjeta va tras las novedades.
   */
  panelEnvio?: ResultadoPanelEnvio;
}) {
  const [, startTransition] = useTransition();
  const [generando, setGenerando] = useState(false);
  const [actualizarDatos, setActualizarDatos] = useState(false);
  const solicitudRef = useRef<AbortController | null>(null);
  useEffect(() => () => solicitudRef.current?.abort(), []);
  const [reporte, setReporte] = useState<ReporteEjecutivoUso | null>(null);
  const [meta, setMeta] = useState<MetaReporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [configAbierto, setConfigAbierto] = useState(false);
  const [pdfPendiente, setPdfPendiente] = useState(false);
  const [correoPendiente, setCorreoPendiente] = useState(false);
  const vistaPreviaRef = useRef<HTMLIFrameElement | null>(null);

  // El reporte se genera con el período de arriba: la ventana no tiene fechas propias.
  const desde = periodoDesde;
  const hasta = periodoHasta;
  const periodoTexto = `${desde} → ${hasta}`;
  const [envioPendiente, setEnvioPendiente] = useState(false);
  const [envioRegistrado, setEnvioRegistrado] = useState<EnvioReportePrevio | null>(null);
  const [canalUsado, setCanalUsado] = useState<CanalEnvio>("correo");

  // Reportes ya generados con los que se traslapa el período elegido (solo avisa).
  const traslapes = useMemo(() => detectarTraslapes({ desde, hasta, generados }), [desde, hasta, generados]);
  // Contra qué días se comparará el uso: se dice antes de generar para que nadie lo busque en otra opción.
  const periodoComparado = useMemo(() => periodoAnteriorEnFechas(desde, hasta), [desde, hasta]);

  // Avances del reporte: las versiones desplegadas en el período elegido (la misma
  // regla que aplica el servidor al generar, ver `novedades-periodo.ts`).
  const versionesDelPeriodo = useMemo(
    () => versions.filter((v) => despliegueEnFechas(v.deployedOn, desde, hasta)),
    [versions, desde, hasta],
  );
  const cambiosDelPeriodo = versionesDelPeriodo.reduce((acc, v) => acc + v.changesCount, 0);
  const cambiosAOmitir = useMemo<CambioAOmitir[]>(
    () => versionesDelPeriodo.flatMap((v) => v.cambios.map((c) => ({ ...c, version: v.number }))),
    [versionesDelPeriodo],
  );

  // Qué dejar fuera del reporte: se marca en «Novedades del período», vive en la
  // página (no se guarda en Novedades) y solo viaja lo que pertenece al período.
  // Las secciones arrancan cerradas.
  const [omitidos, setOmitidos] = useState<ReadonlySet<number>>(() => new Set());
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<ReadonlySet<SeccionNovedad>>(() => new Set());
  // El último reporte generado en esta visita solo se ofrece si es del período de arriba.
  const reporteVigente = Boolean(reporte && meta && meta.desde === desde && meta.hasta === hasta);
  const omitidosParaEnviar = useMemo(
    () => cambiosAOmitir.filter((c) => omitidos.has(c.id)).map((c) => c.id),
    [cambiosAOmitir, omitidos],
  );
  // La prueba y el envío a la lista llevan el mismo período y las mismas omisiones que el reporte de aquí.
  const alcanceEnvio = useMemo<AlcanceDelEnvio>(
    () => ({
      desde,
      hasta,
      omitidos: cambiosAOmitir
        .filter((c) => omitidos.has(c.id))
        .map((c) => ({ id: c.id, titulo: c.titulo, version: c.version })),
    }),
    [desde, hasta, cambiosAOmitir, omitidos],
  );
  const alternarOmitido = (id: number) =>
    setOmitidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  const alternarSeccion = (seccion: SeccionNovedad) =>
    setSeccionesAbiertas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(seccion)) siguiente.delete(seccion);
      else siguiente.add(seccion);
      return siguiente;
    });

  const cancelarGeneracion = () => {
    solicitudRef.current?.abort();
    solicitudRef.current = null;
    setGenerando(false);
    setError(null);
    notifyInfo("Generación cancelada", "Puedes ajustar el alcance y generar otro reporte.");
  };

  const generar = async () => {
    if (solicitudRef.current) return;
    setError(null);

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
          cambiosOmitidos: omitidosParaEnviar,
        }),
        signal: solicitud.signal,
      });
      const res = (await response.json()) as GenerarReporteEjecutivoResult;
      if (solicitud.signal.aborted || solicitudRef.current !== solicitud) return;
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setReporte(res.report);
      setMeta({
        generatedAt: res.generatedAt,
        totalAcciones: res.totalAcciones,
        totalUsuarios: res.totalUsuarios,
        totalNovedades: res.totalNovedades,
        porcentajeAdopcion: res.porcentajeAdopcion,
        desdeCache: res.desdeCache,
        versionIdsIncluidos: res.versionIdsIncluidos,
        cambiosOmitidos: res.cambiosOmitidos ?? [],
        desde,
        hasta,
      });
      setEnvioRegistrado(null);
      setConfigAbierto(false);
      setModalAbierto(true);
    } catch (e) {
      if (!solicitud.signal.aborted && solicitudRef.current === solicitud) {
        setError(e instanceof Error ? e.message : "No se pudo generar el reporte.");
      }
    } finally {
      if (solicitudRef.current === solicitud) {
        solicitudRef.current = null;
        setGenerando(false);
      }
    }
  };

  const abrirConfig = () => {
    setError(null);
    setActualizarDatos(false);
    setConfigAbierto(true);
  };

  const puedeConfirmar = !generando && Boolean(desde && hasta);

  const descargarPdfActual = async () => {
    if (!reporte || pdfPendiente) return;
    setError(null);
    setPdfPendiente(true);
    try {
      const viewportWidth = vistaPreviaRef.current?.clientWidth;
      await descargarPdf(reporte, viewportWidth ? Math.round(viewportWidth) : undefined);
      setCanalUsado("pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfPendiente(false);
    }
  };

  /** Copia HTML+texto al portapapeles sin abrir aplicaciones ni ventanas externas. */
  const copiarFormatoParaCorreo = async () => {
    if (!reporte || correoPendiente) return;
    setError(null);
    setCorreoPendiente(true);
    try {
      const { conFormato, caracteres } = await copiarFormatoCorreo(reporte);
      setCanalUsado("correo");
      if (!conFormato) {
        notifyInfo(
          "Copiado sin formato",
          "Tu navegador no permitió copiar el diseño: se copió el texto. Para enviarlo con formato, adjunta el PDF.",
        );
      } else if (caracteres > LIMITE_RECORTE_GMAIL) {
        notifySuccess(
          "Formato correo copiado",
          "Pega el contenido en el cuerpo (Ctrl+V o Cmd+V). Es un reporte extenso: si Gmail lo muestra recortado, envía mejor el PDF adjunto.",
        );
      } else {
        notifySuccess(
          "Formato correo copiado",
          "El reporte quedó en tu portapapeles. Pégalo en el cuerpo del correo con Ctrl+V o Cmd+V.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo copiar el reporte para correo.";
      setError(msg);
      notifyError("No se pudo copiar", msg);
    } finally {
      setCorreoPendiente(false);
    }
  };

  /** Deja constancia de que este reporte se entregó: el próximo no repetirá sus avances. */
  const marcarComoEnviado = () => {
    if (!reporte || !meta || envioPendiente) return;
    setError(null);
    setEnvioPendiente(true);
    startTransition(async () => {
      const res = await registrarEnvioReporteEjecutivo({
        titulo: reporte.titulo,
        desde: meta.desde,
        hasta: meta.hasta,
        versionIds: meta.versionIdsIncluidos,
        totalNovedades: meta.totalNovedades,
        totalAcciones: meta.totalAcciones,
        canal: canalUsado,
      });
      setEnvioPendiente(false);
      if (!res.ok) {
        setError(res.message);
        notifyError("No se pudo registrar el envío", res.message);
        return;
      }
      setEnvioRegistrado(res.envio);
      notifySuccess(
        "Envío registrado",
        res.envio.versionIds.length === 0
          ? "Quedó registrado el envío de este reporte, sin avances del período."
          : `Quedó registrado el envío, con ${res.envio.versionIds.length} ${
              res.envio.versionIds.length === 1 ? "versión desplegada" : "versiones desplegadas"
            } en el período.`,
      );
    });
  };

  // Confirmación en dos pasos: lo borrado del historial no se recupera.
  const [confirmarBorrado, setConfirmarBorrado] = useState<number | "todos" | null>(null);
  // El historial de reportes generados es largo y se consulta poco: arranca cerrado.
  const [historialAbierto, setHistorialAbierto] = useState(false);

  const borrarGenerado = (id: number) => {
    setConfirmarBorrado(null);
    startTransition(async () => {
      const res = await eliminarReporteGenerado(id);
      if (!res.ok) {
        notifyError("No se pudo eliminar", res.message);
        return;
      }
      notifySuccess("Reporte eliminado", "Si vuelves a generar ese período, el documento se arma de nuevo.");
    });
  };

  const borrarTodosGenerados = () => {
    setConfirmarBorrado(null);
    startTransition(async () => {
      const res = await eliminarTodosLosReportesGenerados();
      if (!res.ok) {
        notifyError("No se pudo vaciar el historial", res.message);
        return;
      }
      notifySuccess(
        "Historial vaciado",
        `Se borraron ${res.eliminados} reporte(s). El historial quedó vacío.`,
      );
    });
  };

  const deshacerEnvio = (id: number) => {
    startTransition(async () => {
      const res = await eliminarEnvioReporteEjecutivo(id);
      if (!res.ok) {
        notifyError("No se pudo deshacer", res.message);
        return;
      }
      if (envioRegistrado?.id === id) setEnvioRegistrado(null);
      notifyInfo("Registro eliminado", "Se quitó el registro de ese envío.");
    });
  };

  const enviosVisibles = useMemo(() => envios.slice(0, 6), [envios]);
  const nombreVersion = useMemo(() => {
    const mapa = new Map(versions.map((v) => [v.id, `v${v.number}`]));
    return (id: number) => mapa.get(id) ?? `#${id}`;
  }, [versions]);

  const adopcionLabel =
    kpis.porcentajeAdopcion == null ? "—" : `${kpis.porcentajeAdopcion}%`;

  // «Ver o descargar»: el mismo reporte de la prueba y la lista, para verlo, bajarlo en PDF o HTML
  // o copiarlo. Con el panel de envío va dentro de «Enviar ahora», tras la prueba y la lista.
  const verODescargar = (
    <div role="group" aria-labelledby="envio-ver" className="flex flex-col gap-2 rounded-md border border-ink-150 px-3 py-3">
      <div>
        <h4 id="envio-ver" className="text-[12px] font-semibold text-navy-800">
          Ver o descargar
        </h4>
        <p className="text-[11.5px] text-ink-500">
          El mismo reporte, para verlo, descargarlo en PDF o HTML o copiarlo en formato correo. Si lo entregas por
          fuera de la plataforma, usa «Marcar como enviado» para dejar constancia.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {reporteVigente ? (
          <>
            <button type="button" onClick={() => setModalAbierto(true)} className={BTN_PRIMARIO}>
              <Icon name="eye" size={14} />
              Ver reporte
            </button>
            <button type="button" onClick={abrirConfig} className={BTN_SECUNDARIO}>
              <Icon name="ai" size={14} />
              Generar de nuevo
            </button>
          </>
        ) : (
          <button type="button" onClick={abrirConfig} className={BTN_PRIMARIO}>
            <Icon name="eye" size={14} />
            Ver reporte
          </button>
        )}
      </div>
      {reporteVigente && meta && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-500">
          <Icon name="check" size={13} className="text-ok-700" />
          Generado el {fechaLarga(meta.generatedAt)}
          {meta.desdeCache ? " (reutilizado de caché)" : ""} · {fmtNum(meta.totalAcciones)} operaciones ·{" "}
          {fmtNum(meta.totalUsuarios)} usuarios · {fmtNum(meta.totalNovedades)} novedades
          {meta.cambiosOmitidos.length > 0
            ? ` · ${fmtNum(meta.cambiosOmitidos.length)} ${meta.cambiosOmitidos.length === 1 ? "omitida" : "omitidas"}`
            : ""}
          .
        </p>
      )}
      {error && !configAbierto && !modalAbierto && (
        <p role="alert" className="text-[12px] text-err-700">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {panelEnvio && <EnvioAutomatico resultado={panelEnvio} alcance={alcanceEnvio} verReporte={verODescargar} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Operaciones en el período"
          value={fmtNum(kpis.totalAcciones)}
          tone="ink"
          hint={
            kpis.totalRegistros && kpis.totalRegistros > kpis.totalAcciones
              ? `${fmtNum(kpis.totalRegistros)} registros en la bitácora`
              : undefined
          }
        />
        <StatCard label="Usuarios con operaciones" value={fmtNum(kpis.totalUsuarios)} tone="blue" />
        <StatCard
          label="Actividad relacionada con nuevas funcionalidades"
          value={adopcionLabel}
          tone="ok"
          hint={
            kpis.porcentajeAdopcion == null
              ? "sin funcionalidades evaluables"
              : `${kpis.usadas} con actividad relacionada · ${kpis.sinEvidencia} sin actividad relacionada`
          }
        />
        <StatCard
          label="Novedades desplegadas en el período"
          value={fmtNum(kpis.totalNovedades)}
          tone="ink"
          hint={`${kpis.totalVersionesPublicadas} ${kpis.totalVersionesPublicadas === 1 ? "versión" : "versiones"}`}
        />
        {kpis.usuariosActivos && (
          <div className="col-span-2 lg:col-span-4">
            <TarjetaUsuariosActivos indicador={kpis.usuariosActivos} />
          </div>
        )}
        {kpis.volumen && kpis.volumen.length > 0 && (
          <Card className="col-span-2 px-4 py-3 lg:col-span-4 lg:px-5">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">Volumen de trabajo</h2>
            <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
              {kpis.volumen.map((v) => (
                <li key={v.etiqueta} className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold tabular-nums text-navy-800">{fmtNum(v.total)}</span>
                  <span className="text-[12.5px] text-ink-600">{v.etiqueta}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-ink-500">
              Lo que hay detrás de las operaciones del período: no se suma a ellas, dice cuánto trabajo hubo
              en cada paso.
            </p>
          </Card>
        )}
      </div>

      {/* Indicadores permanentes: siempre visibles en la plataforma (sin depender del reporte IA). */}
      <IndicadoresUso
        periodoLabel={periodoTexto}
        porFamilia={kpis.porFamilia ?? []}
        topUsuarios={kpis.topUsuarios ?? []}
        topAcciones={kpis.topAcciones ?? []}
        topClientes={kpis.topClientes ?? []}
        serieDiaria={kpis.serieDiaria ?? []}
        adopcion={kpis.adopcionBarras ?? []}
        comparativo={kpis.comparativo ?? null}
        costos={kpis.costos ?? null}
        tickets={kpis.tickets ?? null}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3 lg:px-5">
          <h2 className="text-[13px] font-semibold text-navy-800">Novedades del período</h2>
          <p className="text-[11.5px] text-ink-500">
            Versiones de Novedades, publicadas o en borrador, que llegaron al servidor de producción
            entre el {fmtCalendarDate(desde)} y el {fmtCalendarDate(hasta)}: son los avances que lleva el
            reporte para gerencia.
          </p>
        </div>
        {versionesDelPeriodo.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-500 lg:px-5">
            No se desplegaron versiones en este período: el reporte saldrá sin avances. Si algo se
            desplegó y no aparece, revisa en Novedades que la versión tenga su fecha «Desplegada el».
          </p>
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {versionesDelPeriodo.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-[12.5px] lg:px-5">
                  <span className="min-w-0 flex-1 truncate text-ink-800">
                    <span className="font-medium">v{v.number}</span> · {v.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-ink-400">
                    Desplegada el {v.deployedOn ? fmtCalendarDate(v.deployedOn) : "—"}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-500">
                    {v.changesCount} {v.changesCount === 1 ? "cambio" : "cambios"}
                  </span>
                </li>
              ))}
            </ul>
            <NovedadesAOmitir
              cambios={cambiosAOmitir}
              omitidos={omitidos}
              onAlternarOmitido={alternarOmitido}
              onIncluirTodos={() => setOmitidos(new Set())}
              abiertas={seccionesAbiertas}
              onAlternarSeccion={alternarSeccion}
              deshabilitado={generando}
            />
          </>
        )}
      </Card>

      {!panelEnvio && <Card className="px-4 py-4 lg:px-5">{verODescargar}</Card>}

      <Card className="overflow-hidden">
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-5 ${
            historialAbierto ? "border-b border-ink-100" : ""
          }`}
        >
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-navy-800">
              <button
                type="button"
                onClick={() => {
                  setHistorialAbierto((abierto) => !abierto);
                  setConfirmarBorrado(null);
                }}
                aria-expanded={historialAbierto}
                aria-controls="historial-reportes-generados"
                className="inline-flex items-center gap-1.5 rounded text-left transition hover:text-navy-600"
                title={historialAbierto ? "Ocultar el historial" : "Mostrar el historial"}
              >
                <Icon name={chevronDivulgacion(historialAbierto)} size={13} className="shrink-0 text-ink-500" />
                Reportes generados
                <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10.5px] font-semibold text-ink-600">
                  {fmtNum(generados.length)}
                </span>
              </button>
            </h2>
            <p className="pl-[19px] text-[11.5px] text-ink-500">
              Historial de la plataforma: avisa si el período elegido arriba se traslapa con un reporte
              ya generado. Al borrar uno, si vuelves a generar ese período, se arma de nuevo.
            </p>
          </div>
          {historialAbierto &&
            generados.length > 0 &&
            (confirmarBorrado === "todos" ? (
              <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-ink-600">
                ¿Borrar los {generados.length}?
                <button
                  type="button"
                  onClick={borrarTodosGenerados}
                  className="rounded-md border border-err-200 bg-err-100 px-2 py-1 text-[11px] font-semibold text-err-700 transition hover:bg-err-100"
                >
                  Sí, vaciar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(null)}
                  className="rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado("todos")}
                className="shrink-0 rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
                title="Vacía el historial de reportes generados"
              >
                Borrar todos
              </button>
            ))}
        </div>
        {!historialAbierto ? null : generados.length === 0 ? (
          <p id="historial-reportes-generados" className="px-4 py-4 text-[12.5px] text-ink-500 lg:px-5">
            Aún no se ha generado ningún reporte.
          </p>
        ) : (
          <ul id="historial-reportes-generados" className="divide-y divide-ink-100">
            {generados.map((reporte) => (
              <li
                key={reporte.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px] lg:px-5"
              >
                <span className="font-medium text-ink-800">{fmtDate(reporte.generadoEn)}</span>
                <span className="text-ink-500">
                  {fmtDate(reporte.periodoDesde)} → {fmtDate(reporte.periodoHasta)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-600">
                  {fmtNum(reporte.totalAcciones)} acciones · {fmtNum(reporte.totalUsuarios)} usuarios ·{" "}
                  {fmtNum(reporte.totalNovedades)} novedades
                </span>
                <span className="text-ink-400">{reporte.modelo}</span>
                {confirmarBorrado === reporte.id ? (
                  <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-ink-600">
                    ¿Eliminar?
                    <button
                      type="button"
                      onClick={() => borrarGenerado(reporte.id)}
                      className="rounded-md border border-err-200 bg-err-100 px-2 py-1 text-[11px] font-semibold text-err-700 transition hover:bg-err-100"
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmarBorrado(null)}
                      className="rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmarBorrado(reporte.id)}
                    className="shrink-0 rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
                    title="Eliminar del historial"
                  >
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 lg:px-5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-navy-800">Reportes enviados</h2>
            <p className="text-[11.5px] text-ink-500">
              Constancia de lo comunicado al cliente: cuándo se envió cada reporte, de qué período y
              con qué versiones.
            </p>
          </div>
        </div>
        {enviosVisibles.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-500 lg:px-5">
            Aún no hay envíos registrados. Genera el reporte, envíalo y usa «Marcar como enviado»
            para dejar constancia.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {enviosVisibles.map((envio) => (
              <li
                key={envio.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px] lg:px-5"
              >
                <span className="font-medium text-ink-800">{fmtDate(envio.enviadoEn)}</span>
                <span className="text-ink-500">
                  {fmtDate(envio.periodoDesde)} → {fmtDate(envio.periodoHasta)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-600">
                  {envio.versionIds.length === 0
                    ? "Sin versiones asociadas"
                    : envio.versionIds.map(nombreVersion).join(" · ")}
                </span>
                <span className="text-ink-400">{envio.canal}</span>
                <span className="text-ink-400">{envio.enviadoPor}</span>
                <button
                  type="button"
                  onClick={() => deshacerEnvio(envio.id)}
                  className="shrink-0 rounded-md border border-ink-150 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
                  title="Deshacer: quita el registro de este envío"
                >
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={configAbierto}
        onClose={() => {
          if (solicitudRef.current) cancelarGeneracion();
          setConfigAbierto(false);
        }}
        title="Ver reporte para gerencia"
        size="2xl"
        footer={
          <>
            {generando && (
              <button type="button" onClick={cancelarGeneracion} className={BTN_SECUNDARIO}>
                Cancelar
              </button>
            )}
            <button onClick={generar} disabled={!puedeConfirmar} className={BTN_PRIMARIO}>
              <Icon name="ai" size={14} />
              {generando ? <EstadoProcesando>Generando</EstadoProcesando> : "Generar y ver"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-600">
            El reporte se genera con el período elegido arriba y deja fuera las novedades marcadas
            «Omitir» en la página. Se arma solo con la actividad registrada y los avances publicados.
          </p>

          <div className="rounded-lg border border-ink-150 bg-ink-50 p-3 text-[12px] text-ink-600">
            <p>
              El mismo período, con las mismas novedades omitidas, recupera el reporte guardado, con sus
              cifras y fecha de corte originales. Si se guardó con otra forma de contar las operaciones, se
              vuelve a calcular.
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2 font-medium text-ink-800">
              <input type="checkbox" className="mt-0.5 accent-navy-700" checked={actualizarDatos}
                disabled={generando} onChange={(event) => setActualizarDatos(event.target.checked)} />
              Actualizar con datos nuevos y guardar otra revisión
            </label>
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-semibold text-navy-800">Período</h3>
            <p className="text-[12.5px] text-ink-700">
              <strong>
                {desde === hasta
                  ? fmtCalendarDate(desde)
                  : `${fmtCalendarDate(desde)} al ${fmtCalendarDate(hasta)}`}
              </strong>
              {periodoComparado ? ` (${periodoComparado.dias} ${periodoComparado.dias === 1 ? "día" : "días"})` : ""}.
              Es el que elegiste arriba, junto al título de la página; para cambiarlo, cierra esta ventana
              y elige otro.
            </p>
            {traslapes.length > 0 && (
              <div
                role="status"
                className="mt-2 rounded-md border border-warn-200 bg-warn-100 px-3 py-2.5 text-[12px] text-warn-700"
              >
                <p className="font-semibold">{TITULO_TRASLAPE}</p>
                <ul className="mt-1 list-disc pl-4">
                  {traslapes.map((t) => (
                    <li key={t.id}>{describirTraslape(t)}</li>
                  ))}
                </ul>
                <p className="mt-1">{consecuenciaTraslape(traslapes.length)}</p>
              </div>
            )}
            {periodoComparado && (
              <p className="mt-1.5 rounded-md bg-navy-50 px-3 py-2 text-[12px] text-navy-800">
                El uso de este período se compara con{" "}
                {periodoComparado.dias === 1 ? "el día anterior" : `los ${periodoComparado.dias} días anteriores`}:{" "}
                <strong>
                  {periodoComparado.desde === periodoComparado.hasta
                    ? fmtCalendarDate(periodoComparado.desde)
                    : `${fmtCalendarDate(periodoComparado.desde)} al ${fmtCalendarDate(periodoComparado.hasta)}`}
                </strong>
                . No tienes que elegir nada más para la comparación.
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-[12.5px] font-semibold text-navy-800">
              Novedades del período (avances de la plataforma)
            </h3>
            {versionesDelPeriodo.length === 0 ? (
              <p className="text-[12.5px] text-ink-600">
                No se desplegaron versiones en este período: el reporte saldrá sin avances.
              </p>
            ) : (
              <>
                <p className="text-[12.5px] text-ink-700">
                  {versionesDelPeriodo.length}{" "}
                  {versionesDelPeriodo.length === 1 ? "versión desplegada" : "versiones desplegadas"} ·{" "}
                  {cambiosDelPeriodo} {cambiosDelPeriodo === 1 ? "cambio" : "cambios"}
                  {omitidosParaEnviar.length === 0
                    ? " · entran todos."
                    : ` · ${omitidosParaEnviar.length} ${
                        omitidosParaEnviar.length === 1 ? "queda fuera:" : "quedan fuera:"
                      }`}
                </p>
                {omitidosParaEnviar.length > 0 && (
                  <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5 text-[12px] text-ink-500">
                    {cambiosAOmitir
                      .filter((c) => omitidos.has(c.id))
                      .map((c) => (
                        <li key={c.id}>
                          {c.titulo} <span className="text-ink-400">(v{c.version})</span>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="mt-1 text-[11.5px] text-ink-500">
                  Lo que entra y lo que queda fuera se elige en «Novedades del período», en la página.
                </p>
              </>
            )}
          </div>

          {error && <p className="text-[12.5px] text-err-700">{error}</p>}
        </div>
      </Modal>

      {reporte && meta && (
        <Modal
          open={modalAbierto}
          onClose={() => setModalAbierto(false)}
          title="Reporte de uso y avances"
          size="4xl"
          footer={
            <>
              <button
                type="button"
                onClick={copiarFormatoParaCorreo}
                disabled={correoPendiente}
                className={BTN_SECUNDARIO}
                title="Copia el reporte con formato para pegarlo en el cuerpo de un correo"
              >
                <Icon name="doc" size={14} />
                {correoPendiente ? (
                  <EstadoProcesando>Copiando</EstadoProcesando>
                ) : (
                  "Copiar formato correo"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCanalUsado("html");
                  descargarHtml(reporte);
                }}
                className={BTN_SECUNDARIO}
              >
                <Icon name="download" size={14} />
                Descargar HTML
              </button>
              <button
                type="button"
                onClick={marcarComoEnviado}
                disabled={envioPendiente || envioRegistrado != null}
                className={BTN_SECUNDARIO}
                title="Deja constancia de que este reporte se entregó: sus avances no se repetirán en el próximo"
              >
                <Icon name="check" size={14} />
                {envioPendiente ? (
                  <EstadoProcesando>Registrando</EstadoProcesando>
                ) : envioRegistrado ? (
                  "Registrado como enviado"
                ) : (
                  "Marcar como enviado"
                )}
              </button>
              <button
                type="button"
                onClick={descargarPdfActual}
                disabled={pdfPendiente}
                className={BTN_PRIMARIO}
              >
                <Icon name="doc" size={14} />
                {pdfPendiente ? <EstadoProcesando>Descargando</EstadoProcesando> : "Descargar PDF"}
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
            <span>{fechaLarga(meta.generatedAt)}</span>
            <span>·</span>
            <span>
              {fmtNum(meta.totalAcciones)} acciones · {fmtNum(meta.totalUsuarios)} usuarios ·{" "}
              {fmtNum(meta.totalNovedades)} novedades
              {meta.porcentajeAdopcion != null ? ` · ${meta.porcentajeAdopcion}% adopción` : ""}
            </span>
          </div>
          <h3 className="mt-2 text-xl font-light text-navy-800">{reporte.titulo}</h3>
          <p className="mt-1 text-[13px] text-ink-500">
            Vista previa del documento. Cópialo en formato correo, o descárgalo en HTML o PDF para
            enviarlo al cliente.
          </p>
          <p className="mt-2 rounded-md bg-ink-50 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
            {envioRegistrado ? (
              <>
                Envío registrado el {fmtDate(envioRegistrado.enviadoEn)}, con{" "}
                {envioRegistrado.versionIds.length}{" "}
                {envioRegistrado.versionIds.length === 1 ? "versión desplegada" : "versiones desplegadas"} en
                el período.
              </>
            ) : (
              <>
                Cuando lo envíes al cliente, usa <strong>Marcar como enviado</strong> para dejar
                constancia del envío.
              </>
            )}
          </p>
          <iframe
            ref={vistaPreviaRef}
            title="Vista previa del reporte para gerencia"
            srcDoc={reporte.html}
            sandbox=""
            className="mt-4 h-[68vh] w-full rounded-md border border-ink-150 bg-white"
          />
        </Modal>
      )}
    </div>
  );
}
