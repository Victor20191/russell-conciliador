"use client";

import { EstadoProcesando } from "@/components/estado-procesando";
import { useMemo, useRef, useState, useTransition } from "react";
import { generarReporteEjecutivoUso } from "@/app/actions/auditoria-reporte";
import { Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtDate, fmtDateTimeLong, fmtNum } from "@/lib/format";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import { htmlConEstilosEnLinea } from "@/lib/correo/preparar-html-correo";
import type { ReporteEjecutivoUso } from "@/lib/auditoria/reporte-ejecutivo/reportes";
import {
  IndicadoresUso,
  type BarraUso,
  type SerieDiaUso,
} from "./indicadores-uso";

export type VersionOpcion = {
  id: number;
  number: string;
  title: string;
  changesCount: number;
  releasedAt: string | null;
  createdAt: string;
};

export type KpisIniciales = {
  totalAcciones: number;
  totalUsuarios: number;
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
};

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_REPORTE_PRINCIPAL =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-navy-700 px-5 text-[13px] font-semibold text-white shadow-md shadow-navy-900/10 ring-1 ring-navy-900/10 transition hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_ATAJO =
  "inline-flex items-center gap-1 rounded-md border border-ink-150 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition hover:bg-ink-50";
const BTN_ATAJO_ACTIVO =
  "inline-flex items-center gap-1 rounded-md border border-navy-700 bg-navy-700 px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-navy-800";

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
  const blob = new Blob([reporte.html], { type: "text/html;charset=utf-8" });
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
  try {
    return htmlConEstilosEnLinea(htmlCompleto);
  } catch {
    return htmlCorreoConEstilosEmbebidos(htmlCompleto);
  }
}

function htmlCorreoConEstilosEmbebidos(htmlCompleto: string): string {
  const estilos =
    htmlCompleto.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1]?.trim() ?? "";
  const cuerpoMatch = htmlCompleto.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const cuerpo = (cuerpoMatch?.[1] ?? htmlCompleto).trim();

  return `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a2330;font-size:14px;line-height:1.5;">
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

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([htmlCorreo], { type: "text/html" }),
          "text/plain": new Blob([textoPlano], { type: "text/plain" }),
        }),
      ]);
      return { conFormato: true, caracteres };
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textoPlano);
      return { conFormato: false, caracteres };
    }
    throw new Error("Portapapeles no disponible en este navegador.");
  } catch {
    // Fallback legacy (algunos navegadores bloquean ClipboardItem con text/html).
    await navigator.clipboard.writeText(textoPlano);
    return { conFormato: false, caracteres };
  }
}

/** Abre el cliente de correo con el asunto del reporte (el cuerpo se pega del portapapeles). */
function abrirClienteCorreo(reporte: ReporteEjecutivoUso): void {
  const asunto = encodeURIComponent(reporte.titulo || "Reporte Russell Diagnóstico");
  // Sin body largo: mailto trunca HTML/texto extenso. El cuerpo va por el portapapeles.
  window.open(`mailto:?subject=${asunto}`, "_blank", "noopener,noreferrer");
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
}: {
  versions: VersionOpcion[];
  kpis: KpisIniciales;
  defaultDesde: string;
  defaultHasta: string;
}) {
  const [isPending, startTransition] = useTransition();
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
  const [modoVersiones, setModoVersiones] = useState<"publicadas" | "seleccion">("publicadas");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  const cambiosSeleccionados = useMemo(
    () => versions.filter((v) => seleccion.has(v.id)).reduce((acc, v) => acc + v.changesCount, 0),
    [versions, seleccion],
  );

  const generar = () => {
    setError(null);
    const versionIds =
      modoVersiones === "seleccion"
        ? versions.filter((v) => seleccion.has(v.id)).map((v) => v.id)
        : undefined;

    if (modoVersiones === "seleccion" && (!versionIds || versionIds.length === 0)) {
      setError("Selecciona al menos una versión de Novedades.");
      return;
    }

    startTransition(async () => {
      const res = await generarReporteEjecutivoUso({
        desde,
        hasta,
        versionIds,
      });
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
      });
      setConfigAbierto(false);
      setModalAbierto(true);
    });
  };

  const abrirConfig = () => {
    setError(null);
    setConfigAbierto(true);
  };

  const toggle = (id: number) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const puedeConfirmar =
    !isPending &&
    Boolean(desde && hasta) &&
    (modoVersiones === "publicadas" || cambiosSeleccionados > 0 || seleccion.size > 0);

  const descargarPdfActual = async () => {
    if (!reporte || pdfPendiente) return;
    setError(null);
    setPdfPendiente(true);
    try {
      const viewportWidth = vistaPreviaRef.current?.clientWidth;
      await descargarPdf(reporte, viewportWidth ? Math.round(viewportWidth) : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfPendiente(false);
    }
  };

  /** Copia HTML+texto al portapapeles y abre el cliente de correo con el asunto. */
  const copiarYAbrirCorreo = async () => {
    if (!reporte || correoPendiente) return;
    setError(null);
    setCorreoPendiente(true);
    try {
      const { conFormato, caracteres } = await copiarFormatoCorreo(reporte);
      abrirClienteCorreo(reporte);
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
          "Se abrió tu cliente de correo. Pega el contenido en el cuerpo (Ctrl+V o Cmd+V).",
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

  const adopcionLabel =
    kpis.porcentajeAdopcion == null ? "—" : `${kpis.porcentajeAdopcion}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Acciones en el período" value={fmtNum(kpis.totalAcciones)} tone="ink" />
        <StatCard label="Usuarios activos" value={fmtNum(kpis.totalUsuarios)} tone="blue" />
        <StatCard
          label="Adopción de novedades"
          value={adopcionLabel}
          tone="ok"
          hint={
            kpis.porcentajeAdopcion == null
              ? "sin funcionalidades evaluables"
              : `${kpis.usadas} usadas · ${kpis.sinEvidencia} sin evidencia`
          }
        />
        <StatCard
          label="Novedades publicadas"
          value={fmtNum(kpis.totalNovedades)}
          tone="ink"
          hint={`${kpis.totalVersionesPublicadas} versiones`}
        />
      </div>

      {/* Indicadores permanentes: siempre visibles en la plataforma (sin depender del reporte IA). */}
      <IndicadoresUso
        periodoLabel={`${defaultDesde} → ${defaultHasta}`}
        porFamilia={kpis.porFamilia ?? []}
        topUsuarios={kpis.topUsuarios ?? []}
        topAcciones={kpis.topAcciones ?? []}
        topClientes={kpis.topClientes ?? []}
        serieDiaria={kpis.serieDiaria ?? []}
        adopcion={kpis.adopcionBarras ?? []}
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
                  {defaultDesde} → {defaultHasta}
                </span>
              </div>
              <h2 className="mt-1 font-serif text-lg text-ink-900">
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
              {reporte ? "Regenerar con IA" : "Generar reporte para gerencia"}
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
            "El reporte para gerencia se genera bajo demanda. Elige el período de uso y las versiones de Novedades a incluir."
          )}
        </div>
      </Card>

      <Modal
        open={configAbierto}
        onClose={() => setConfigAbierto(false)}
        title="Generar reporte para gerencia"
        size="2xl"
        footer={
          <button onClick={generar} disabled={!puedeConfirmar} className={BTN_PRIMARIO}>
            <Icon name="ai" size={14} />
            {isPending ? <EstadoProcesando>Generando</EstadoProcesando> : "Generar reporte"}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-600">
            Define el período de actividad de los usuarios y el alcance de las novedades liberadas.
            La IA solo redacta a partir de la actividad registrada y de los avances publicados.
          </p>

          <div>
            <h3 className="mb-2 text-[12.5px] font-semibold text-ink-800">Período de uso</h3>
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Atajos de período">
              {(
                [
                  ["7 días", 7],
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
          </div>

          <div>
            <h3 className="mb-2 text-[12.5px] font-semibold text-ink-800">Novedades a incluir</h3>
            <div className="flex flex-col gap-2.5">
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                  modoVersiones === "publicadas"
                    ? "border-navy-600 bg-navy-700/5"
                    : "border-ink-150 hover:bg-ink-50"
                }`}
              >
                <input
                  type="radio"
                  name="alcance-novedades"
                  checked={modoVersiones === "publicadas"}
                  onChange={() => setModoVersiones("publicadas")}
                  className="mt-0.5 accent-navy-700"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-800">
                    Todas las versiones publicadas
                  </span>
                  <span className="block text-[11.5px] text-ink-500">
                    {versions.length} versiones ·{" "}
                    {versions.reduce((s, v) => s + v.changesCount, 0)} cambios
                  </span>
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                  modoVersiones === "seleccion"
                    ? "border-navy-600 bg-navy-700/5"
                    : "border-ink-150 hover:bg-ink-50"
                }`}
              >
                <input
                  type="radio"
                  name="alcance-novedades"
                  checked={modoVersiones === "seleccion"}
                  onChange={() => setModoVersiones("seleccion")}
                  className="mt-0.5 accent-navy-700"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-800">Elegir versiones</span>
                  <span className="block text-[11.5px] text-ink-500">
                    Limita el detalle de novedades a un subconjunto.
                  </span>
                </span>
              </label>
            </div>

            {modoVersiones === "seleccion" && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-ink-150 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSeleccion(versions[0] ? new Set([versions[0].id]) : new Set())}
                    className={BTN_ATAJO}
                  >
                    Solo la última
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeleccion(new Set(versions.map((v) => v.id)))}
                    className={BTN_ATAJO}
                  >
                    Seleccionar todas
                  </button>
                  <button type="button" onClick={() => setSeleccion(new Set())} className={BTN_ATAJO}>
                    Limpiar
                  </button>
                  <span className="ml-auto text-[11.5px] text-ink-500">
                    {seleccion.size} versiones · {cambiosSeleccionados} cambios
                  </span>
                </div>
                <div className="max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-100">
                  {versions.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[12.5px] text-ink-400">
                      No hay versiones publicadas en Novedades.
                    </p>
                  ) : (
                    versions.map((v) => (
                      <label
                        key={v.id}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[12.5px] transition hover:bg-ink-50"
                      >
                        <input
                          type="checkbox"
                          checked={seleccion.has(v.id)}
                          onChange={() => toggle(v.id)}
                          className="accent-navy-700"
                        />
                        <span className="min-w-0 flex-1 truncate text-ink-800">
                          <span className="font-medium">v{v.number}</span> · {v.title}
                        </span>
                        <span className="shrink-0 tabular-nums text-[11px] text-ink-400">
                          {fmtDate(v.releasedAt ?? v.createdAt)}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-500">
                          {v.changesCount} {v.changesCount === 1 ? "cambio" : "cambios"}
                        </span>
                      </label>
                    ))
                  )}
                </div>
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
                onClick={copiarYAbrirCorreo}
                disabled={correoPendiente}
                className={BTN_SECUNDARIO}
                title="Copia el reporte en formato correo y abre tu cliente de email para pegarlo y enviarlo"
              >
                <Icon name="send" size={14} />
                {correoPendiente ? (
                  <EstadoProcesando>Copiando</EstadoProcesando>
                ) : (
                  "Copiar formato correo"
                )}
              </button>
              <button type="button" onClick={() => descargarHtml(reporte)} className={BTN_SECUNDARIO}>
                <Icon name="download" size={14} />
                Descargar HTML
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
          <h3 className="mt-2 font-serif text-xl text-ink-900">{reporte.titulo}</h3>
          <p className="mt-1 text-[13px] text-ink-500">
            Vista previa del documento. Cópialo en formato correo, o descárgalo en HTML o PDF para
            enviarlo al cliente.
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
