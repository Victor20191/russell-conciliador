import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import { aplanarArbolFiltrado, type FilaBorrador } from "@/lib/balance/borrador";
import { crearExportacionBorrador } from "@/lib/export/borrador";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga el árbol crudo del borrador a Excel. `?filtro=2,24,2408` exporta solo
 *  esas ramas (mismo filtro visual del árbol). Mismo permiso que la página. */
export async function GET(req: Request, { params }: { params: Promise<{ loteId: string }> }) {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });
  const { loteId } = await params;
  try {
    const [lote, filasStaging] = await Promise.all([
      prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
      prisma.balanceImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } }),
    ]);
    if (filasStaging.length === 0) return NextResponse.json({ message: "El borrador no existe." }, { status: 404 });

    const filas: FilaBorrador[] = filasStaging.map((f) => ({
      filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
      tipoFila: f.tipoFila as FilaBorrador["tipoFila"],
      // Flags de edición manual GUARDADA: se aplican igual que en la vista, para que el
      // árbol/fórmulas del Excel reflejen desacoples, omitidos, re-parentados (tabulador)
      // y conversiones movimiento↔agrupadora.
      // TRI-ESTADO durable: null (BD) = «sin tocar» → el marcado del re-listado con
      // guiones las tacha; false = rescatada a mano → se respeta; true = omitida.
      tipoFilaForzado: f.tipoFilaForzado === "agrupadora" || f.tipoFilaForzado === "movimiento" ? f.tipoFilaForzado : null,
      desacoplada: f.desacoplada, omitida: f.omitida ?? undefined, padreManual: f.padreManual,
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    }));
    const { arbol } = construirVistaBorrador(filas, { preservarAgrupadorasForzadas: true });

    const filtro = (new URL(req.url).searchParams.get("filtro") ?? "")
      .split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    const planas = aplanarArbolFiltrado(arbol, filtro);

    const generadoEn = new Date();
    const buffer = await crearExportacionBorrador(planas, { archivo: lote?.archivoNombre ?? loteId, generadoEn, filtro });
    const base = (lote?.archivoNombre ?? loteId).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 60);
    const nombreArchivo = `Borrador_${base}${filtro.length > 0 ? "_filtrado" : ""}_${fechaColombiaISO(generadoEn)}.xlsx`;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json({ message: mensajeErrorBD("exportarBorrador", e) }, { status: 500 });
  }
}
