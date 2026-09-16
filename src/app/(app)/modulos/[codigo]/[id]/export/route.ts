import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { consolidarPorClasificador } from "@/lib/modulos/promocion";
import { crearExportacionModulo, type ColumnaExportModulo, type CruceNominaExportModulo, type CruceTerceroExportModulo } from "@/lib/export/modulo";
import { columnasDetalleModulo } from "@/lib/modulos/cartera/columnas-cartera";
import { cargarCuentasEstandarDeCedula, cargarInsumosCruceModulo, construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { cedulaModulo, claveCedula } from "@/lib/modulos/cuentas-modulo";
import { claveConsolidado } from "@/lib/modulos/nomina/clave-consolidado";
import { cruceTerceroDeCargue, etiquetasCruceTercero } from "@/lib/modulos/cruce-tercero-servidor";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga a Excel el dato cargado del módulo (hojas «Detalle» y «Consolidado», y «Cruce por
 *  tercero» en los módulos que lo tienen, con el mismo cálculo de la pestaña).
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

    // Misma clave que la pantalla: subgrupo de 4 dígitos, la cuenta Russell completa o una mezcla.
    // La clave no depende de los prefijos del prevalidador, así que no se carga el catálogo.
    const cedula = cedulaModulo(descriptor, []);
    const [consolidacionRows, subgrupos, cuentasEstandar] = await Promise.all([
      prisma.consolidacionModuloCliente.findMany({
        where: { clienteId: encabezado.clienteId, moduloCodigo },
        select: { clasificador: true, agrupador: true, descripcion: true, cuenta4: true, cuenta6: true },
      }),
      prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true } }),
      cargarCuentasEstandarDeCedula(descriptor),
    ]);
    const nombrePorCuenta = new Map([...subgrupos, ...cuentasEstandar].map((s) => [s.codigo, s.nombre]));
    const cuentasPorClasificador = new Map<string, string[]>();
    const descripcionPorClasificador = new Map<string, string>();
    // Nómina consolida por (concepto, centro de costo): la clave del renglón lleva el agrupador
    // y la homologación se lee por esa misma clave («1 ∥ GYA»), con la base del concepto de respaldo.
    const porAgrupador = descriptor.nomina != null;
    for (const r of consolidacionRows) {
      const clave = claveCedula(cedula, r.cuenta6, r.cuenta4);
      const llave = porAgrupador ? claveConsolidado(r.clasificador, r.agrupador) : r.clasificador;
      if (clave) cuentasPorClasificador.set(llave, [...(cuentasPorClasificador.get(llave) ?? []), clave]);
      if (r.descripcion && !descripcionPorClasificador.has(r.clasificador)) descripcionPorClasificador.set(r.clasificador, r.descripcion);
    }

    const detalle = encabezado.detalles.map((d) => ({
      filaNum: d.filaNum,
      clasificador: d.clasificador,
      valor: Number(d.valor),
      datos: (d.datos ?? {}) as Record<string, string | number | null>,
    }));
    const consolidado = consolidarPorClasificador(
      detalle.map((d) => ({ ...d, agrupador: porAgrupador ? (d.datos.agrupador == null ? null : String(d.datos.agrupador)) : null })),
      { porAgrupador },
    ).map((c) => ({
      clasificador: c.clasificador,
      descripcion: descripcionPorClasificador.get(c.codigo ?? c.clasificador) ?? null,
      total: c.total,
      filas: c.filas,
      cuentas4: [...new Set(cuentasPorClasificador.get(c.clasificador) ?? (c.agrupador ? cuentasPorClasificador.get(c.codigo ?? c.clasificador) : undefined) ?? [])].sort().map((cod) => ({ codigo: cod, nombre: nombrePorCuenta.get(cod) ?? null })),
    }));

    // Nómina: vista por subcuenta PUC y control de deducciones, el mismo cálculo de la pestaña.
    let cruceNomina: CruceNominaExportModulo | undefined;
    if (descriptor.nomina) {
      const insumos = await cargarInsumosCruceModulo(encabezado.id);
      const cruce = insumos ? await construirCruceContableModulo(insumos) : null;
      if (cruce?.nomina && (cruce.nomina.vistaSubcuenta || cruce.nomina.control)) {
        cruceNomina = { vistaSubcuenta: cruce.nomina.vistaSubcuenta, control: cruce.nomina.control, rango: cruce.nomina.rango, base: cruce.nomina.base };
      }
    }
    // Cruce por tercero: el mismo cálculo de la pestaña, con sus marcas y emparejamientos.
    let cruceTercero: CruceTerceroExportModulo | undefined;
    if (descriptor.crucePorTercero.habilitado) {
      const insumos = await cargarInsumosCruceModulo(encabezado.id);
      const cruce = insumos ? await construirCruceContableModulo(insumos) : null;
      const tercero = insumos && cruce ? await cruceTerceroDeCargue(insumos, cruce) : null;
      if (tercero?.resumen && cruce?.balanceEmparejado) {
        cruceTercero = {
          resumen: tercero.resumen,
          ...etiquetasCruceTercero(descriptor),
          fuente: `Balance ${cruce.balanceEmparejado.descripcion}${tercero.balanceTercero ? ` · detalle por tercero ${tercero.balanceTercero.version}` : ""}`,
        };
      }
    }

    const generadoEn = new Date();
    const buffer = await crearExportacionModulo({
      // Las de la pantalla: con los rangos de vencimiento del cargue y el saldo efectivo.
      columnas: columnasDetalleModulo(descriptor, encabezado.rangosEdades).map((c) => ({ ...c, tipo: c.tipo as ColumnaExportModulo["tipo"] })),
      clasificadorEtiqueta: descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador",
      detalle,
      consolidado,
      ...(cruceTercero ? { cruceTercero } : {}),
      ...(cruceNomina ? { cruceNomina } : {}),
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
