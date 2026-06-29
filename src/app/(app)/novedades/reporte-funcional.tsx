"use client";

import { useState, useTransition } from "react";
import { generarReporteFuncionalNovedades } from "@/app/actions/novedades";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { ReporteNovedades } from "@/lib/novedades/reportes";

type MetaReporte = {
  generatedAt: string;
  totalVersions: number;
  totalChanges: number;
};

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";

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

function abrirPdf(reporte: ReporteNovedades): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(reporte.html);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 350);
}

export function ReporteFuncionalNovedades({
  totalChanges,
  totalVersions,
}: {
  totalChanges: number;
  totalVersions: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [reporte, setReporte] = useState<ReporteNovedades | null>(null);
  const [meta, setMeta] = useState<MetaReporte | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = () => {
    setError(null);
    startTransition(async () => {
      const res = await generarReporteFuncionalNovedades();
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
    });
  };

  const puedeGenerar = totalChanges > 0 && !isPending;

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label="Reporte funcional IA" tone="ai" />
            <span className="text-[11.5px] text-ink-500">
              {totalVersions} versiones · {totalChanges} cambios
            </span>
          </div>
          <h2 className="mt-1 font-serif text-lg text-ink-900">Reporte detallado de funcionalidades</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-600">
            Genera una presentación funcional lista para PDF, sin detalles técnicos innecesarios.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {reporte && (
            <>
              <button onClick={() => abrirPdf(reporte)} className={BTN_SECUNDARIO}>
                <Icon name="doc" size={14} />
                PDF
              </button>
              <button onClick={() => descargarHtml(reporte)} className={BTN_SECUNDARIO}>
                <Icon name="download" size={14} />
                HTML
              </button>
            </>
          )}
          <button onClick={generar} disabled={!puedeGenerar} className={BTN_PRIMARIO}>
            <Icon name="ai" size={14} />
            {isPending ? "Generando..." : reporte ? "Regenerar" : "Generar reporte"}
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-err-100 bg-err-100 px-4 py-3 text-[13px] text-err-700">
          {error}
        </div>
      )}

      {reporte && meta ? (
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
            <span>{fechaLarga(meta.generatedAt)}</span>
            <span>·</span>
            <span>{meta.totalVersions} versiones · {meta.totalChanges} cambios documentados</span>
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-xl text-ink-900">{reporte.titulo}</h3>
              <p className="mt-1 text-[13px] text-ink-500">Vista previa del documento que se imprimirá en PDF.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => abrirPdf(reporte)} className={BTN_PRIMARIO}>
                <Icon name="doc" size={14} />
                Imprimir PDF
              </button>
              <button onClick={() => descargarHtml(reporte)} className={BTN_SECUNDARIO}>
                <Icon name="download" size={14} />
                Descargar HTML
              </button>
            </div>
          </div>

          <iframe
            title="Vista previa del reporte funcional"
            srcDoc={reporte.html}
            sandbox=""
            className="mt-4 h-[760px] w-full rounded-md border border-ink-150 bg-white"
          />
        </div>
      ) : (
        <div className="px-4 py-5 text-[13px] text-ink-500">
          {totalChanges > 0
            ? "El reporte se genera bajo demanda con las novedades documentadas actualmente."
            : "Documenta al menos un cambio para generar el reporte funcional."}
        </div>
      )}
    </Card>
  );
}
