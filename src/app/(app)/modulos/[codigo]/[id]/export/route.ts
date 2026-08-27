import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { crearExportacionModulo } from "@/lib/export/modulo";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga a Excel el dato cargado del módulo (hojas «Detalle» y «Consolidado»).
 *  Mismo permiso y alcance por cliente que la página. */
export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string; id: string }> }) {
  const authz = await authorizePermiso("modulos_datos:ver");
  if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });
  const { codigo, id } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  const encabezadoId = Number(id);
  if (!descriptor || !Number.isInteger(encabezadoId)) return NextResponse.json({ message: "El dato no existe." }, { status: 404 });
  try {
    const encabezado = await prisma.moduloDatoEncabezado.findUnique({
      where: { id: encabezadoId },
      include: { detalles: { orderBy: { filaNum: "asc" } } },
    });
    if (!encabezado || encabezado.moduloCodigo !== moduloCodigo) return NextResponse.json({ message: "El dato no existe." }, { status: 404 });
    const scope = await authorizePermiso("modulos_datos:ver", { clientId: encabezado.clienteId });
    if (!scope.ok) return NextResponse.json({ message: scope.message }, { status: 403 });

    const [consolidacionRows, subgrupos] = await Promise.all([
      prisma.consolidacionModuloCliente.findMany({
        where: { clienteId: encabezado.clienteId, moduloCodigo },
        select: { clasificador: true, descripcion: true, cuenta4: true },
      }),
      prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true } }),
    ]);
    const nombrePorCuenta = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
    const cuentasPorClasificador = new Map<string, string[]>();
    const descripcionPorClasificador = new Map<string, string>();
    for (const r of consolidacionRows) {
      cuentasPorClasificador.set(r.clasificador, [...(cuentasPorClasificador.get(r.clasificador) ?? []), r.cuenta4]);
      if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }

    const detalle = encabezado.detalles.map((d) => ({
      filaNum: d.filaNum,
      clasificador: d.clasificador,
      valor: Number(d.valor),
      datos: (d.datos ?? {}) as Record<string, string | number | null>,
    }));
    const consolidado = consolidarPorClasificador(detalle).map((c) => ({
      clasificador: c.clasificador,
      descripcion: descripcionPorClasificador.get(c.clasificador) ?? null,
      total: c.total,
      filas: c.filas,
      cuentas4: [...new Set(cuentasPorClasificador.get(c.clasificador) ?? [])].sort().map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
    }));

    const generadoEn = new Date();
    const buffer = await crearExportacionModulo({
      columnas: descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo })),
      clasificadorEtiqueta: descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador",
      detalle,
      consolidado,
      meta: {
        modulo: descriptor.label,
        cliente: encabezado.nombreCliente,
        periodo: encabezado.periodo,
        version: encabezado.version,
        archivo: encabezado.archivoNombre,
        generadoEn,
      },
    });
    const cliente = encabezado.nombreCliente.replace(/[^\w.-]+/g, "_").slice(0, 40);
    const nombreArchivo = `${descriptor.label.replace(/\s+/g, "")}_${cliente}_${encabezado.periodo}_v${encabezado.version}_${fechaColombiaISO(generadoEn)}.xlsx`;
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
    return NextResponse.json({ message: mensajeErrorBD("exportarModulo", e) }, { status: 500 });
  }
}
