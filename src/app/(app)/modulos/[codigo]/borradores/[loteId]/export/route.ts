import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { consolidarPorClasificador, filaEnCero } from "@/lib/modulos/promocion";
import { versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import { crearExportacionModulo } from "@/lib/export/modulo";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaCalendarioISO, fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga a Excel el BORRADOR del módulo (staging GUARDADO): hoja «Detalle» con
 *  todas las filas y su estado (agrupadora/omitida/en cero no consolidan) y hoja
 *  «Consolidado» por clasificador. Mismo permiso y alcance que la página. */
export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string; loteId: string }> }) {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });
  const { codigo, loteId } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return NextResponse.json({ message: "El borrador no existe." }, { status: 404 });
  try {
    const [lote, filas] = await Promise.all([
      prisma.moduloImportacionLote.findUnique({ where: { loteId } }),
      prisma.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } }),
    ]);
    if (!lote || lote.moduloCodigo !== moduloCodigo || filas.length === 0 || lote.clienteId == null) {
      return NextResponse.json({ message: "El borrador no existe." }, { status: 404 });
    }
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return NextResponse.json({ message: scope.message }, { status: 403 });

    const [cliente, hermanos] = await Promise.all([
      prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } }),
      lote.periodoInicial && lote.periodoFinal
        ? prisma.moduloImportacionLote.findMany({
            where: { moduloCodigo, clienteId: lote.clienteId, periodoInicial: lote.periodoInicial, periodoFinal: lote.periodoFinal },
            select: { loteId: true, clienteId: true, moduloCodigo: true, archivoNombre: true, periodoInicial: true, periodoFinal: true, creadoEn: true },
          })
        : Promise.resolve([]),
    ]);
    const version = versionarYOrdenarBorradoresModulo(
      hermanos.map((h) => ({
        loteId: h.loteId, clienteId: h.clienteId, moduloCodigo: h.moduloCodigo, archivoNombre: h.archivoNombre,
        periodoInicial: h.periodoInicial ? fechaCalendarioISO(h.periodoInicial) : null,
        periodoFinal: h.periodoFinal ? fechaCalendarioISO(h.periodoFinal) : null,
        creadoEn: h.creadoEn.toISOString(),
      })),
    ).find((h) => h.loteId === loteId)?.version ?? 1;

    const columnasNumericas = descriptor.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
    // Misma regla de imputabilidad de la pantalla y de la promoción: solo movimientos
    // no omitidos y con algún valor consolidan.
    const detalle = filas.map((f) => {
      const datos = (f.datos ?? {}) as Record<string, string | number | null>;
      const enCero = filaEnCero(datos, columnasNumericas);
      const imputable = f.tipoFila === "movimiento" && f.omitida !== true && !enCero;
      const base = f.tipoFila === "agrupadora" ? "Agrupadora" : f.tipoFila === "total" ? "Total" : "Movimiento";
      const estado = f.omitida === true ? `${base} · OMITIDA` : !imputable && enCero ? `${base} · en cero` : base;
      return { filaNum: f.filaNum, clasificador: f.clasificador, valor: imputable ? Number(f.valor) : 0, datos, estado, imputable };
    });
    const consolidado = consolidarPorClasificador(detalle.filter((d) => d.imputable).map((d) => ({ clasificador: d.clasificador, valor: d.valor })))
      .map((c) => ({ clasificador: c.clasificador, total: c.total, filas: c.filas, cuentas4: [] }));

    const periodo = lote.periodoFinal ? fechaCalendarioISO(lote.periodoFinal).slice(0, 7) : lote.periodoInicial ? fechaCalendarioISO(lote.periodoInicial).slice(0, 7) : "sin-periodo";
    const generadoEn = new Date();
    const buffer = await crearExportacionModulo({
      columnas: descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo })),
      clasificadorEtiqueta: descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador",
      detalle,
      consolidado,
      meta: { modulo: `Borrador · ${descriptor.label}`, cliente: cliente?.name ?? `Cliente ${lote.clienteId}`, periodo, version, archivo: lote.archivoNombre, generadoEn },
    });
    const base = lote.archivoNombre.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 60);
    const nombreArchivo = `Borrador_${descriptor.label.replace(/\s+/g, "")}_${base}_${fechaColombiaISO(generadoEn)}.xlsx`;
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
    return NextResponse.json({ message: mensajeErrorBD("exportarBorradorModulo", e) }, { status: 500 });
  }
}
