import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { ROL_POR_FUNCION, ROL_SOCIO } from "@/lib/rbac/jerarquia";
import { crearPlantillaImportacionClientes } from "@/lib/import/clientes-template";
import { mensajeErrorBD } from "@/lib/errores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOMBRE_ARCHIVO = "Plantilla_Importacion_Clientes.xlsx";

export async function GET() {
  const crearAuthz = await authorizePermiso("clientes:crear");
  if (!crearAuthz.ok) {
    return NextResponse.json({ message: crearAuthz.message }, { status: 403 });
  }

  const configAuthz = await authorizePermiso("clientes:configurar");
  if (!configAuthz.ok) {
    return NextResponse.json({ message: configAuthz.message }, { status: 403 });
  }

  const rolesResponsables = [
    ROL_SOCIO,
    ROL_POR_FUNCION.gerente,
    ROL_POR_FUNCION.senior,
    ROL_POR_FUNCION.staff,
  ];

  try {
    const [modulos, dianForms, personas, erpsBD, sectoresBD] = await Promise.all([
      prisma.module.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      prisma.dianForm.findMany({ orderBy: { code: "asc" }, select: { name: true, code: true } }),
      prisma.user.findMany({
        where: { active: true, role: { in: rolesResponsables } },
        orderBy: { name: "asc" },
        select: { name: true, role: true },
      }),
      prisma.erp.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
      prisma.sector.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
    ]);

    const buffer = await crearPlantillaImportacionClientes({
      modulos,
      dianForms,
      personas,
      erps: erpsBD.map((e) => e.name),
      sectores: sectoresBD.map((s) => s.name),
    });
    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${NOMBRE_ARCHIVO}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json({ message: mensajeErrorBD("plantillaClientes", e) }, { status: 500 });
  }
}
