import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { crearExportacionPuc, type DatosExportacionPuc } from "@/lib/export/puc";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga el Excel del plan estándar Russell que muestra /config/mapeo.
 * Una sola hoja: el catálogo completo de cuentas estándar. No incluye el PUC
 * del cliente, la memoria de mapeo ni los subgrupos.
 */
export async function GET() {
  // Mismo permiso que la página: quien puede verla, exporta.
  const authz = await authorizePermiso("mapeo:ver");
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: 403 });
  }

  try {
    const standard = await prisma.standardAccount.findMany({ orderBy: { code: "asc" } });

    const datos: DatosExportacionPuc = {
      estandar: standard.map((s) => ({
        code: s.code,
        name: s.name,
        level: s.level,
        nature: s.nature,
        parent: s.parent,
        critical: s.critical,
        russellAccount: s.russellAccount,
        categoryType: s.categoryType,
        includes: s.includes,
        excludes: s.excludes,
        possibleAccounts: s.possibleAccounts,
        supportingDocuments: s.supportingDocuments,
        controlSupports: s.controlSupports,
        mappingNotes: s.mappingNotes,
      })),
    };

    const generadoEn = new Date();
    const buffer = await crearExportacionPuc(datos, generadoEn);
    const nombreArchivo = `PUC_Russell_${fechaColombiaISO(generadoEn)}.xlsx`;
    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { message: mensajeErrorBD("exportarPuc", e) },
      { status: 500 },
    );
  }
}
