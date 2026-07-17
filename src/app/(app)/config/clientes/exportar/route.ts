import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { crearExportacionClientes, type FilaClienteExport } from "@/lib/export/clientes";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Mismo permiso que la página /config/clientes: quien puede verla, exporta.
  const authz = await authorizePermiso("clientes:configurar");
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: 403 });
  }

  try {
    // Respeta la cartera: el Senior solo exporta los clientes donde es
    // responsable; Admin/Superadmin exportan todos. Igual que la página.
    const alc = await alcanceLecturaUsuario();
    const whereCliente = alc.todos ? {} : { id: { in: alc.clientIds } };

    const [clients, modules, dianFormsBD, usuarios, asignaciones] = await Promise.all([
      prisma.client.findMany({
        where: whereCliente,
        orderBy: { name: "asc" },
        include: {
          modules: true,
          dianForms: true,
          erp: { select: { name: true } },
          sector: { select: { name: true } },
        },
      }),
      prisma.module.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.dianForm.findMany({
        orderBy: { code: "asc" },
        select: { id: true, name: true, code: true },
      }),
      prisma.user.findMany({ select: { id: true, name: true } }),
      prisma.clientAssignment.findMany({
        where: { active: true, ...(alc.todos ? {} : { clientId: { in: alc.clientIds } }) },
        select: { clientId: true, userId: true, role: true },
      }),
    ]);

    const nombrePorId = new Map(usuarios.map((u) => [u.id, u.name]));
    // Responsables (gerente/senior/staff) por cliente desde asignaciones_cliente.
    const respPorCliente = new Map<
      number,
      { gerente: string | null; senior: string | null; staff: string[] }
    >();
    for (const a of asignaciones) {
      const r = respPorCliente.get(a.clientId) ?? { gerente: null, senior: null, staff: [] };
      const nombre = nombrePorId.get(a.userId) ?? `Usuario ${a.userId}`;
      if (a.role === "gerente") r.gerente = nombre;
      else if (a.role === "senior") r.senior = nombre;
      else if (a.role === "staff") r.staff.push(nombre);
      respPorCliente.set(a.clientId, r);
    }

    const filas: FilaClienteExport[] = clients.map((c) => {
      const r = respPorCliente.get(c.id) ?? { gerente: null, senior: null, staff: [] };
      return {
        code: c.code,
        name: c.name,
        nit: c.nit,
        tipo: c.tipo,
        erpName: c.erp?.name ?? null,
        sectorName: c.sector?.name ?? null,
        // El Socio NO se asigna en asignaciones_cliente: vive en Client.socioId.
        socio: c.socioId != null ? (nombrePorId.get(c.socioId) ?? null) : null,
        gerente: r.gerente,
        senior: r.senior,
        staff: [...r.staff].sort((a, b) => a.localeCompare(b, "es")),
        modules: c.modules.map((m) => ({ moduleId: m.moduleId, status: m.status })),
        dianFormIds: c.dianForms.map((f) => f.formId),
      };
    });

    const generadoEn = new Date();
    const buffer = await crearExportacionClientes(
      filas,
      { modulos: modules, dianForms: dianFormsBD },
      generadoEn,
    );
    const nombreArchivo = `Clientes_Russell_${fechaColombiaISO(generadoEn)}.xlsx`;
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
      { message: mensajeErrorBD("exportarClientes", e) },
      { status: 500 },
    );
  }
}
