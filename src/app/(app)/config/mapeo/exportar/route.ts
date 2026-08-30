import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ORIGEN_MANUAL_CUENTA } from "@/lib/balance/mapeo-cliente-config";
import { authorizePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { crearExportacionPuc, type DatosExportacionPuc } from "@/lib/export/puc";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga el Excel con TODOS los PUC que muestra /config/mapeo: el plan
 * estándar Russell, el PUC del cliente elegido, su memoria de mapeo y los
 * subgrupos de nivel 4 — una hoja por pestaña.
 *
 * La resolución del cliente espeja la de la página: el `cliente` del query solo
 * se acepta si está en la cartera del usuario, de modo que no puede descargarse
 * el plan de cuentas de un cliente ajeno cambiando la URL.
 */
export async function GET(request: Request) {
  // Mismo permiso que la página: quien puede verla, exporta.
  const authz = await authorizePermiso("mapeo:ver");
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: 403 });
  }

  try {
    const pedido = new URL(request.url).searchParams.get("cliente") ?? "";
    const alc = await alcanceLecturaUsuario();

    const [balances, standard, subgruposRows] = await Promise.all([
      prisma.balancePruebaEncabezado.findMany({
        where: alc.todos ? {} : { clienteId: { in: alc.clientIds } },
        select: { clienteId: true, nombreCliente: true, nit: true },
        distinct: ["clienteId"],
        orderBy: { nombreCliente: "asc" },
      }),
      prisma.standardAccount.findMany({ orderBy: { code: "asc" } }),
      prisma.subgrupoEstandar.findMany({ orderBy: { codigo: "asc" } }),
    ]);

    const clientNames = [...new Set(balances.map((b) => b.nombreCliente))];
    const cliente = clientNames.includes(pedido)
      ? pedido
      : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");
    const clienteRow = cliente ? balances.find((b) => b.nombreCliente === cliente) ?? null : null;
    const clienteId = clienteRow?.clienteId ?? null;

    const [accounts, mapeoRows] = await Promise.all([
      clienteId
        ? prisma.clientAccount.findMany({
            where: { clienteId },
            orderBy: [{ order: "asc" }, { code: "asc" }],
          })
        : Promise.resolve([]),
      // Mismo recorte que la pestaña «Mapeo balance/cliente»: reglas de grupo
      // (niveles 4 y 6) más las excepciones por cuenta imputable.
      clienteId
        ? prisma.clientAccount.findMany({
            where: {
              clienteId,
              OR: [{ level: { in: [4, 6] } }, { origenMapeo: ORIGEN_MANUAL_CUENTA }],
            },
            orderBy: { code: "asc" },
            select: {
              code: true,
              name: true,
              level: true,
              cuenta6Russell: true,
              coincidencia: true,
              origenMapeo: true,
              actualizadoPor: true,
              actualizadoEn: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const stdNombre = new Map(standard.map((s) => [s.code, s.name]));

    const datos: DatosExportacionPuc = {
      cliente: cliente || null,
      clienteNit: clienteRow?.nit ?? null,
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
      pucCliente: accounts.map((a) => ({
        code: a.code,
        name: a.name,
        level: a.level,
        cuenta6Russell: a.cuenta6Russell,
        nombreRussell: a.cuenta6Russell ? (stdNombre.get(a.cuenta6Russell) ?? null) : null,
        coincidencia: a.coincidencia != null ? Number(a.coincidencia) : null,
        origenMapeo: a.origenMapeo,
      })),
      mapeoCliente: mapeoRows.map((r) => ({
        cuenta6: r.code,
        nombreCuenta: r.name,
        nivel: r.level,
        cuenta6Russell: r.cuenta6Russell ?? "",
        nombreRussell: r.cuenta6Russell ? (stdNombre.get(r.cuenta6Russell) ?? null) : null,
        coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null,
        origen: r.origenMapeo,
        actualizadoPor: r.actualizadoPor,
        actualizadoEn: r.actualizadoEn ? r.actualizadoEn.toISOString() : null,
      })),
      subgrupos: subgruposRows.map((s) => ({
        codigo: s.codigo,
        nombre: s.nombre,
        grupo: s.grupo,
        nombreGrupo: s.nombreGrupo,
        naturaleza: s.naturaleza,
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
