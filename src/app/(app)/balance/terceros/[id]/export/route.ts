import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { parseId } from "@/lib/ids";
import { construirArbolTercero, resumirArbolTercero } from "@/lib/balance/arbol-tercero";
import type { FilaBalanceTercero } from "@/lib/balance/tercero-vista";
import { crearExportacionBalanceTercero } from "@/lib/export/balance-tercero";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga a Excel un cargue del balance por tercero: el MISMO árbol de la
 * pantalla (reconstruido desde el detalle con `arbol-tercero.ts`) + detalle plano. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ message: "Cargue inexistente." }, { status: 404 });
  try {
    const encabezado = await prisma.balanceTerceroEncabezado.findUnique({
      where: { id },
      select: { id: true, clienteId: true, nombreCliente: true, nit: true, periodo: true, version: true, archivo: true },
    });
    if (!encabezado) return NextResponse.json({ message: "El cargue no existe." }, { status: 404 });
    // Permiso + alcance por cartera, igual que la página.
    const authz = await authorizePermiso("balance:ver", { clientId: encabezado.clienteId });
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });

    const detalles = await prisma.balanceTerceroDetalle.findMany({
      where: { encabezadoId: id },
      select: {
        id: true, cuenta2: true, cuenta4: true, cuenta6: true, cuenta8: true, nombreCuenta: true, cuenta6Russell: true,
        nitTercero: true, nombreTercero: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true,
      },
      orderBy: [{ cuenta8: "asc" }, { id: "asc" }],
    });
    const filas: FilaBalanceTercero[] = detalles.map((d) => ({
      id: d.id, cuenta2: d.cuenta2, cuenta4: d.cuenta4, cuenta6: d.cuenta6, cuenta8: d.cuenta8,
      nombreCuenta: d.nombreCuenta, cuenta6Russell: d.cuenta6Russell, nitTercero: d.nitTercero, nombreTercero: d.nombreTercero,
      saldoInicial: Number(d.saldoInicial), debitos: Number(d.debitos), creditos: Number(d.creditos), saldoFinal: Number(d.saldoFinal),
    }));
    const arbol = construirArbolTercero(filas);
    const resumen = resumirArbolTercero(arbol);
    const generadoEn = new Date();

    const buffer = await crearExportacionBalanceTercero({
      arbol,
      resumen,
      filasArchivo: filas.length,
      meta: {
        cliente: encabezado.nombreCliente,
        nit: encabezado.nit,
        periodo: encabezado.periodo,
        version: encabezado.version,
        archivo: encabezado.archivo,
        generadoEn,
      },
    });
    const base = encabezado.nombreCliente.replace(/[^\w.-]+/g, "_").slice(0, 40);
    const nombreArchivo = `Balance_Terceros_${base}_${encabezado.version}_${fechaColombiaISO(generadoEn)}.xlsx`;
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
    return NextResponse.json({ message: mensajeErrorBD("exportarBalanceTercero", e) }, { status: 500 });
  }
}
