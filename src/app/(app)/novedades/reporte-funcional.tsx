"use client";

import { useMemo, useState, useTransition } from "react";
import { generarReporteFuncionalNovedades } from "@/app/actions/novedades";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtDate } from "@/lib/format";
import type { ReporteNovedades } from "@/lib/novedades/reportes";

// Versión reducida para el selector de alcance del reporte (no necesita el
// detalle completo de cambios, solo cuántos trae cada versión).
export type VersionOpcion = {
  id: number;
  number: string;
  title: string;
  changesCount: number;
  releasedAt: string | null; // ISO — fecha de publicación (null si es borrador)
  createdAt: string; // ISO — fecha de registro/generación
};

type MetaReporte = {
  generatedAt: string;
  totalVersions: number;
  totalChanges: number;
};

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_REPORTE_PRINCIPAL =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-navy-700 px-5 text-[13px] font-semibold text-white shadow-md shadow-navy-900/10 ring-1 ring-navy-900/10 transition hover:bg-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_ATAJO =
  "inline-flex items-center gap-1 rounded-md border border-ink-150 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition hover:bg-ink-50";

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
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

function descargarHtml(reporte: ReporteNovedades): void {
  const blob = new Blob([reporte.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(reporte.titulo) || "reporte-funcional-novedades"}.html`;
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

async function descargarPdf(reporte: ReporteNovedades): Promise<void> {
  const res = await fetch("/api/novedades/reporte-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: reporte.titulo, html: reporte.html }),
  });

  const esPdf = res.headers.get("content-type")?.includes("application/pdf");
  if (!res.ok || res.redirected || !esPdf) {
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "No se pudo generar el PDF.");
  }

  const blob = await res.blob();
  descargarBlob(blob, `${slug(reporte.titulo) || "reporte-funcional-novedades"}.pdf`);
}

export function ReporteFuncionalNovedades({
  versions,
  totalChanges,
  totalVersions,
}: {
  versions: VersionOpcion[];
  totalChanges: number;
  totalVersions: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [reporte, setReporte] = useState<ReporteNovedades | null>(null);
  const [meta, setMeta] = useState<MetaReporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false); // modal con el resultado
  const [configAbierto, setConfigAbierto] = useState(false); // modal de alcance
  const [pdfPendiente, setPdfPendiente] = useState(false);
  // Alcance del reporte: por defecto TODAS las versiones (caso más común).
  const [modo, setModo] = useState<"todas" | "seleccion">("todas");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  const cambiosSeleccionados = useMemo(
    () => versions.filter((v) => seleccion.has(v.id)).reduce((acc, v) => acc + v.changesCount, 0),
    [versions, seleccion],
  );

  const generar = (versionIds?: number[]) => {
    setError(null);
    startTransition(async () => {
      const res = await generarReporteFuncionalNovedades(versionIds ? { versionIds } : undefined);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setReporte(res.report);
      setMeta({
        generatedAt: res.generatedAt,
        totalVersions: res.totalVersions,
        totalChanges: res.totalChanges,
      });
      // Cierra la configuración y entrega el resultado en su propia ventana modal.
      setConfigAbierto(false);
      setModalAbierto(true);
    });
  };

  const confirmarGenerar = () => {
    if (modo === "seleccion") {
      const ids = versions.filter((v) => seleccion.has(v.id)).map((v) => v.id);
      if (ids.length === 0) return;
      generar(ids);
      return;
    }
    generar();
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
  const soloUltima = () => setSeleccion(versions[0] ? new Set([versions[0].id]) : new Set());
  const seleccionarTodas = () => setSeleccion(new Set(versions.map((v) => v.id)));
  const limpiar = () => setSeleccion(new Set());

  const puedeAbrir = totalChanges > 0;
  const puedeConfirmar =
    !isPending && (modo === "todas" ? totalChanges > 0 : cambiosSeleccionados > 0);

  const descargarPdfActual = async () => {
    if (!reporte || pdfPendiente) return;
    setError(null);
    setPdfPendiente(true);
    try {
      await descargarPdf(reporte);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfPendiente(false);
    }
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-ink-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="flex min-w-0 gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ai-100 text-ai-700">
            <Icon name="ai" size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip label="Reporte funcional IA" tone="ai" />
              <span className="text-[11.5px] text-ink-500">
                {totalVersions} versiones · {totalChanges} cambios
              </span>
            </div>
            <h2 className="mt-1 font-serif text-lg text-ink-900">
              Reporte detallado de funcionalidades con IA
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-600">
              Genera una presentación funcional lista para PDF, sin detalles técnicos innecesarios.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 border-t border-ink-100 pt-3 sm:flex-row sm:items-center lg:w-auto lg:min-w-[240px] lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <button onClick={abrirConfig} disabled={!puedeAbrir} className={BTN_REPORTE_PRINCIPAL}>
            <Icon name="ai" size={15} />
            {reporte ? "Regenerar con IA" : "Generar reporte con IA"}
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
            Reporte generado el {fechaLarga(meta.generatedAt)} · {meta.totalVersions} versiones ·{" "}
            {meta.totalChanges} cambios. Usa «Ver reporte» para abrirlo y descargarlo.
          </span>
        ) : totalChanges > 0 ? (
          "El reporte se genera bajo demanda; puedes incluir todo el historial o solo las versiones que elijas."
        ) : (
          "Documenta al menos un cambio para generar el reporte funcional."
        )}
      </div>

      {/* Configuración del alcance antes de generar. */}
      <Modal
        open={configAbierto}
        onClose={() => setConfigAbierto(false)}
        title="Generar reporte funcional"
        size="2xl"
        footer={
          <button onClick={confirmarGenerar} disabled={!puedeConfirmar} className={BTN_PRIMARIO}>
            <Icon name="ai" size={14} />
            {isPending ? "Generando…" : "Generar reporte"}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-600">
            Elige qué versiones incluir. Acotar el alcance produce un documento más enfocado y evita
            recortes cuando el historial es extenso.
          </p>

          <div className="flex flex-col gap-2.5">
            <label
              className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                modo === "todas" ? "border-navy-600 bg-navy-700/5" : "border-ink-150 hover:bg-ink-50"
              }`}
            >
              <input
                type="radio"
                name="alcance-reporte"
                checked={modo === "todas"}
                onChange={() => setModo("todas")}
                className="mt-0.5 accent-navy-700"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink-800">Todas las versiones</span>
                <span className="block text-[11.5px] text-ink-500">
                  {totalVersions} versiones · {totalChanges} cambios documentados
                </span>
              </span>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                modo === "seleccion" ? "border-navy-600 bg-navy-700/5" : "border-ink-150 hover:bg-ink-50"
              }`}
            >
              <input
                type="radio"
                name="alcance-reporte"
                checked={modo === "seleccion"}
                onChange={() => setModo("seleccion")}
                className="mt-0.5 accent-navy-700"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink-800">Elegir versiones</span>
                <span className="block text-[11.5px] text-ink-500">
                  Selecciona una o varias versiones del historial.
                </span>
              </span>
            </label>
          </div>

          {modo === "seleccion" && (
            <div className="flex flex-col gap-2 rounded-md border border-ink-150 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={soloUltima} className={BTN_ATAJO}>
                  Solo la última
                </button>
                <button type="button" onClick={seleccionarTodas} className={BTN_ATAJO}>
                  Seleccionar todas
                </button>
                <button type="button" onClick={limpiar} className={BTN_ATAJO}>
                  Limpiar
                </button>
                <span className="ml-auto text-[11.5px] text-ink-500">
                  {seleccion.size} versiones · {cambiosSeleccionados} cambios
                </span>
              </div>
              <div className="max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-100">
                {versions.map((v) => (
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
                    <span
                      className="shrink-0 tabular-nums text-[11px] text-ink-400"
                      title={v.releasedAt ? "Fecha de publicación" : "Fecha de generación"}
                    >
                      {fmtDate(v.releasedAt ?? v.createdAt)}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-500">
                      {v.changesCount} {v.changesCount === 1 ? "cambio" : "cambios"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-[12.5px] text-err-700">{error}</p>}
        </div>
      </Modal>

      {reporte && meta && (
        <Modal
          open={modalAbierto}
          onClose={() => setModalAbierto(false)}
          title="Reporte funcional de novedades"
          size="4xl"
          footer={
            <>
              <button onClick={() => descargarHtml(reporte)} className={BTN_SECUNDARIO}>
                <Icon name="download" size={14} />
                Descargar HTML
              </button>
              <button onClick={descargarPdfActual} disabled={pdfPendiente} className={BTN_PRIMARIO}>
                <Icon name="doc" size={14} />
                {pdfPendiente ? "Descargando..." : "Descargar PDF"}
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
            <span>{fechaLarga(meta.generatedAt)}</span>
            <span>·</span>
            <span>
              {meta.totalVersions} versiones · {meta.totalChanges} cambios documentados
            </span>
          </div>
          <h3 className="mt-2 font-serif text-xl text-ink-900">{reporte.titulo}</h3>
          <p className="mt-1 text-[13px] text-ink-500">
            Vista previa del documento. Descárgalo en HTML o PDF con los botones de abajo.
          </p>
          <iframe
            title="Vista previa del reporte funcional"
            srcDoc={reporte.html}
            sandbox=""
            className="mt-4 h-[68vh] w-full rounded-md border border-ink-150 bg-white"
          />
        </Modal>
      )}
    </Card>
  );
}
