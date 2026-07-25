import type { NextRequest } from "next/server";
import * as z from "zod";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { generarPdfReporteNovedades } from "@/lib/novedades/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReportePdfSchema = z.object({
  titulo: z.string().trim().min(1).max(180),
  html: z.string().min(100).max(6_000_000),
  viewportWidth: z.number().min(320).max(1_800).optional(),
});

function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "reporte-ejecutivo-uso-adopcion"
  );
}

export async function POST(req: NextRequest) {
  const authz = await authorizePermiso("auditoria:reporte_ejecutivo");
  if (!authz.ok) {
    return Response.json({ message: authz.message }, { status: 403 });
  }

  try {
    const parsed = ReportePdfSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { message: "El reporte no tiene un formato válido para generar PDF." },
        { status: 400 },
      );
    }

    const pdf = await generarPdfReporteNovedades(parsed.data);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug(parsed.data.titulo)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    registrarError("generarPdfReporteEjecutivoUso", e);
    return Response.json({ message: "No se pudo generar el PDF del reporte." }, { status: 500 });
  }
}
