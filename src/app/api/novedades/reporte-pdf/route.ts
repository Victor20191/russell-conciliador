import type { NextRequest } from "next/server";
import { chromium } from "playwright";
import * as z from "zod";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReportePdfSchema = z.object({
  titulo: z.string().trim().min(1).max(180),
  html: z.string().min(100).max(6_000_000),
});

function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "reporte-funcional-novedades"
  );
}

function inyectarAjustesPdf(html: string): string {
  const ajustes = `<style id="russell-ajustes-pdf">
@page{size:Letter;margin:12mm 12mm 14mm}
html,body{width:auto!important;min-width:0!important;margin:0!important;background:#fff!important}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
*,*::before,*::after{box-sizing:border-box;max-width:100%}
main,.container,.report,.content,.page{width:100%!important;max-width:none!important;margin-left:auto!important;margin-right:auto!important}
img,svg,canvas,table{max-width:100%!important}
table{width:100%!important;table-layout:fixed;border-collapse:collapse}
p,li,td,th{overflow-wrap:anywhere}
section,article,.section,.card,.funcionality,.functionality,.feature,.stat-card{break-inside:avoid;page-break-inside:avoid}
.footer{break-inside:avoid}
@media print{
  html,body{overflow:visible!important}
  a{text-decoration:none;color:inherit}
}
</style>`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${ajustes}</head>`);
  if (/<body[\s>]/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${ajustes}`);
  return `<!DOCTYPE html><html lang="es"><head>${ajustes}</head><body>${html}</body></html>`;
}

export async function POST(req: NextRequest) {
  const authz = await authorizePermiso("novedades:ver");
  if (!authz.ok) {
    return Response.json({ message: authz.message }, { status: 403 });
  }

  try {
    const parsed = ReportePdfSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: "El reporte no tiene un formato válido para generar PDF." }, { status: 400 });
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        javaScriptEnabled: false,
        viewport: { width: 816, height: 1056 },
      });
      await page.setContent(inyectarAjustesPdf(parsed.data.html), { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });

      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });

      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${slug(parsed.data.titulo)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    registrarError("generarPdfReporteNovedades", e);
    return Response.json({ message: "No se pudo generar el PDF del reporte." }, { status: 500 });
  }
}
