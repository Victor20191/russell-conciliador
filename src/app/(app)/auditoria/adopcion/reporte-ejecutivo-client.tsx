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
import { Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtCalendarDate, fmtDate, fmtDateTimeLong, fmtNum } from "@/lib/format";
import { periodoAnteriorEnFechas } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { despliegueEnFechas } from "@/lib/auditoria/reporte-ejecutivo/novedades-periodo";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import {
  hacerBarrasCompatiblesCorreo,
  htmlConEstilosEnLinea,
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

export type VersionOpcion = {
  id: number;
  number: string;
  title: string;
  changesCount: number;
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
  /** Operaciones: las acciones por fila valen una por persona, acción, cliente y día. */
  totalAcciones: number;
  /** Registros de la bitácora detrás de esas operaciones. */
  totalRegistros?: number;
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
  desde: string;
  hasta: string;
};

type CanalEnvio = "correo" | "pdf" | "html";

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_REPORTE_PRINCIPAL =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-navy-700 px-5 text-[13px] font-semibold text-white shadow-md ring-1 ring-ink-150 transition hover:bg-navy-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_ATAJO =
  "inline-flex items-center gap-1 rounded-md border border-ink-150 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition hover:bg-ink-50";
const BTN_ATAJO_ACTIVO =
  "inline-flex items-center gap-1 rounded-md border border-navy-700 bg-navy-700 px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-navy-600";

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

function aYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function haceDias(n: number): { desde: string; hasta: string } {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (n - 1));
  return { desde: aYYYYMMDD(desde), hasta: aYYYYMMDD(hasta) };
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

/** A partir de este tamaño Gmail corta el cuerpo con «[Mensaje recortado]». */
const LIMITE_RECORTE_GMAIL = 102_000;

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
  defaultDesde,
  defaultHasta,
  periodoTablero,
  notaPeriodo,
  envios,
  generados = [],
}: {
  versions: VersionOpcion[];
  kpis: KpisIniciales;
  /** Período PRELLENADO del modal: continúa donde terminó el último reporte. */
  defaultDesde: string;
  defaultHasta: string;
  /** Ventana que leen los indicadores del tablero, en texto (se elige arriba de la página). */
  periodoTablero?: string;
  /** Explicación de por qué el modal propone ese período. */
  notaPeriodo?: string | null;
  envios: EnvioReportePrevio[];
  /** Historial de reportes generados; borrarlos reinicia el período sugerido. */
  generados?: ReporteGeneradoPrevio[];
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

  const [desde, setDesde] = useState(defaultDesde);
  const [hasta, setHasta] = useState(defaultHasta);
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
        body: JSON.stringify({ desde, hasta, actualizar: actualizarDatos }),
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

  // Confirmación en dos pasos: el borrado del historial mueve hacia atrás el
  // período que propone el modal, así que no basta un clic.
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
      notifySuccess("Reporte eliminado", "El período que se propone al generar vuelve a partir del reporte anterior.");
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
        `Se borraron ${res.eliminados} reporte(s). El modal vuelve a proponer los últimos 30 días.`,
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

  return (
    <div className="flex flex-col gap-4">
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
      </div>

      {/* Indicadores permanentes: siempre visibles en la plataforma (sin depender del reporte IA). */}
      <IndicadoresUso
        periodoLabel={periodoTablero ?? `${defaultDesde} → ${defaultHasta}`}
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
        <div className="flex flex-col gap-4 border-b border-ink-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
          <div className="flex min-w-0 gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ai-100 text-ai-700">
              <Icon name="ai" size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip label="Reporte para gerencia" tone="ai" />
                <span className="text-[11.5px] text-ink-500">
                  {periodoTablero ?? `${defaultDesde} → ${defaultHasta}`}
                </span>
              </div>
              <h2 className="mt-1 text-lg text-navy-800">
                Resumen de uso y avances
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-600">
                Lo más importante del período: cómo se usó la plataforma, qué cambió y qué conviene
                atender. Preparado con la actividad registrada y listo para enviar en PDF.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 border-t border-ink-100 pt-3 sm:flex-row sm:items-center lg:w-auto lg:min-w-[240px] lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <button onClick={abrirConfig} className={BTN_REPORTE_PRINCIPAL}>
              <Icon name="ai" size={15} />
              {reporte ? "Consultar o actualizar reporte" : "Generar reporte para gerencia"}
            </button>
            {reporte && (
              <button onClick={() => setModalAbierto(true)} className={BTN_SECUNDARIO}>
                <Icon name="eye" size={14} />
                Ver reporte
              </button>
            )}
          </div>
        </div>

        {error && !configAbierto && !modalAbierto && (
          <div className="border-b border-err-100 bg-err-100 px-4 py-3 text-[13px] text-err-700">
            {error}
          </div>
        )}

        <div className="px-4 py-5 text-[13px] text-ink-500">
          {reporte && meta ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Icon name="check" size={14} className="text-ok-700" />
              Reporte generado el {fechaLarga(meta.generatedAt)}
              {meta.desdeCache ? " (reutilizado de caché)" : ""} · {fmtNum(meta.totalAcciones)}{" "}
              acciones · {fmtNum(meta.totalUsuarios)} usuarios · {fmtNum(meta.totalNovedades)}{" "}
              novedades.
            </span>
          ) : (
            "El reporte para gerencia se genera bajo demanda. Elige el período: incluye las versiones de Novedades desplegadas en esas fechas."
          )}
        </div>
      </Card>

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
              Historial de la plataforma. Al borrar uno, el período que propone «Generar reporte para
              gerencia» vuelve a partir del reporte anterior.
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
                title="Vacía el historial: el modal vuelve a proponer los últimos 30 días"
              >
                Borrar todos
              </button>
            ))}
        </div>
        {!historialAbierto ? null : generados.length === 0 ? (
          <p id="historial-reportes-generados" className="px-4 py-4 text-[12.5px] text-ink-500 lg:px-5">
            Aún no se ha generado ningún reporte. El primero tomará los últimos 30 días.
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
        title="Generar reporte para gerencia"
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
              {generando ? <EstadoProcesando>Generando</EstadoProcesando> : "Generar reporte"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-600">
            Define el período de actividad de los usuarios y el alcance de las novedades liberadas.
            La IA solo redacta a partir de la actividad registrada y de los avances publicados.
          </p>

          <div className="rounded-lg border border-ink-150 bg-ink-50 p-3 text-[12px] text-ink-600">
            <p>El mismo período y alcance recupera el reporte guardado, con sus cifras y fecha de corte originales.</p>
            <label className="mt-2 flex cursor-pointer items-start gap-2 font-medium text-ink-800">
              <input type="checkbox" className="mt-0.5 accent-navy-700" checked={actualizarDatos}
                disabled={generando} onChange={(event) => setActualizarDatos(event.target.checked)} />
              Actualizar con datos nuevos y guardar otra revisión
            </label>
          </div>
          <div>
            <h3 className="mb-2 text-[12.5px] font-semibold text-navy-800">Período de uso</h3>
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Atajos de período">
              {/* Igual que el selector del tablero: los atajos son los últimos N días, hasta hoy. */}
              <span className="text-[11.5px] text-ink-600">Últimos:</span>
              {(
                [
                  ["7 días", 7],
                  ["15 días", 15],
                  ["30 días", 30],
                  ["90 días", 90],
                ] as const
              ).map(([label, n]) => {
                const rango = haceDias(n);
                const activo = rango.desde === desde && rango.hasta === hasta;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={activo}
                    className={activo ? BTN_ATAJO_ACTIVO : BTN_ATAJO}
                    onClick={() => {
                      setDesde(rango.desde);
                      setHasta(rango.hasta);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12px] text-ink-600">
                Desde
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="rounded-md border border-ink-150 px-2.5 py-2 text-[13px] text-ink-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-600">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="rounded-md border border-ink-150 px-2.5 py-2 text-[13px] text-ink-800"
                />
              </label>
            </div>
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
            {notaPeriodo && desde === defaultDesde && hasta === defaultHasta && (
              <p className="mt-1.5 text-[11.5px] text-ink-500">{notaPeriodo}</p>
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
            <p className="mb-2 text-[11.5px] leading-relaxed text-ink-600">
              Entran solas: las versiones publicadas en Novedades cuya fecha de despliegue cae entre
              Desde y Hasta. Así dos reportes de fechas distintas no repiten avances. No cambian las
              cifras de uso ni la comparación.
            </p>
            {versionesDelPeriodo.length === 0 ? (
              <p className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5 text-[12px] text-ink-600">
                No hay versiones desplegadas en este período: el reporte saldrá sin avances. Si algo se
                desplegó y no aparece, revisa en Novedades que la versión esté publicada y tenga su
                fecha «Desplegada el».
              </p>
            ) : (
              <div className="rounded-md border border-ink-150">
                <p className="border-b border-ink-100 px-3 py-2 text-[11.5px] text-ink-500">
                  {versionesDelPeriodo.length}{" "}
                  {versionesDelPeriodo.length === 1 ? "versión desplegada" : "versiones desplegadas"} ·{" "}
                  {cambiosDelPeriodo} {cambiosDelPeriodo === 1 ? "cambio" : "cambios"}
                </p>
                <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto">
                  {versionesDelPeriodo.map((v) => (
                    <li key={v.id} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
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
              </div>
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
