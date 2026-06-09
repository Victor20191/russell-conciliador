"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { clienteDeConciliacion, clienteDeFilaConciliacion } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { createProcessNotification } from "@/lib/notifications";
import { registrarError } from "@/lib/errores";

// Patrón de autorización en dos pasos: el primer gate exige sesión +
// permiso de rol ANTES de tocar la BD; el segundo añade el ALCANCE de
// escritura sobre el cliente de la conciliación (cartera, fail-closed).

export async function addReconciliationComment(formData: FormData): Promise<void> {
  await requirePermiso("conciliaciones:editar");
  const reconciliationId = parseId(formData.get("reconciliationId"));
  const cuenta = formData.get("cuenta") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!reconciliationId || !cuenta || !text) return;
  await requirePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(reconciliationId) });

  try {
    const user = await getCurrentUser();
    await prisma.reconciliationComment.create({
      data: {
        reconciliationId, cuenta,
        who: user?.name ?? "Usuario",
        initials: user?.initials ?? "··",
        text, time: "ahora",
      },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Cuenta ${cuenta}`, detail: `Cruce ${reconciliationId}` });
    revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
  } catch (e) {
    registrarError("addReconciliationComment", e);
    throw e;
  }
}

export async function setRowStatus(formData: FormData): Promise<void> {
  await requirePermiso("conciliaciones:editar");
  const rowId = parseId(formData.get("rowId"));
  const status = formData.get("status") as string; // conciliada | excepcion | ajuste
  const reconciliationId = parseId(formData.get("reconciliationId"));
  if (!rowId || !["conciliada", "excepcion", "ajuste"].includes(status)) return;
  // El cliente se resuelve desde la FILA (no desde el formulario, que es manipulable).
  await requirePermiso("conciliaciones:editar", { clientId: await clienteDeFilaConciliacion(rowId) });

  try {
    const row = await prisma.reconciliationRow.update({ where: { id: rowId }, data: { manualStatus: status } });
    const user = await getCurrentUser();
    const labels: Record<string, string> = { conciliada: "marcó como conciliada", excepcion: "marcó como excepción", ajuste: "solicitó ajuste contable" };
    await logAudit({ user: user?.name ?? "Sistema", action: "ACTUALIZÓ PARTIDA", entity: `Cuenta ${row.cuenta}`, detail: labels[status] });
    if (reconciliationId) revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
  } catch (e) {
    registrarError("setRowStatus", e);
    throw e;
  }
}

export async function sendToReviewer(formData: FormData): Promise<void> {
  await requirePermiso("conciliaciones:editar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  await requirePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(id) });
  try {
    await prisma.reconciliation.update({ where: { id }, data: { status: "REVIEW" } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ A REVISOR", entity: `Cruce ${id}`, detail: "Marcado en revisión" });
    revalidatePath(`/conciliacion/resultados/${id}`);
  } catch (e) {
    registrarError("sendToReviewer", e);
    throw e;
  }
}

// Partidas demo del cruce de Inventarios (mismas que el cruce de referencia).
const DEMO_CROSS_ROWS: [string, string, number, number, number, number][] = [
  ["143505", "Mercancías no fabricadas por la empresa", 412580450, 412580450, 0, 124],
  ["143510", "Materias primas", 188204000, 188204000, 0, 86],
  ["143515", "Productos en proceso", 74215300, 72850450, -1364850, 41],
  ["143520", "Materiales, repuestos y accesorios", 56118200, 56340800, 222600, 33],
  ["143524", "Producto terminado", 245118400, 240218400, -4900000, 58],
  ["143530", "Envases y empaques", 18445000, 18445000, 0, 22],
  ["143599", "Otros inventarios", 9120000, 10845200, 1725200, 14],
  ["148015", "Provisión obsolescencia", -12450000, -12450000, 0, 1],
  ["143580", "Inventarios en tránsito", 31200000, 29420000, -1780000, 6],
];

export async function executeReconciliation(formData: FormData): Promise<void> {
  await requirePermiso("conciliaciones:ejecutar");
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  const period = formData.get("period") as string;
  const cutoff = (formData.get("cutoff") as string) || "";
  if (!clientId || !moduleId || !period) return;
  // Ejecutar es la acción operativa por excelencia: exige cartera con escritura.
  await requirePermiso("conciliaciones:ejecutar", { clientId });

  // El id se captura dentro del try; el redirect() se ejecuta DESPUÉS, porque
  // redirect() funciona lanzando una excepción especial que NO debe capturarse.
  let reconciliationId: number | null = null;
  try {
    const [client, mod, user] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.module.findUnique({ where: { id: moduleId } }),
      getCurrentUser(),
    ]);
    if (!client || !mod) return;

    const n = await prisma.reconciliation.count();
    const code = `REC-2026-${5000 + n}`;
    const totalDiff = DEMO_CROSS_ROWS.reduce((s, r) => s + r[4], 0);
    const itemsDiff = DEMO_CROSS_ROWS.filter((r) => r[4] !== 0).length;

    const reconciliation = await prisma.reconciliation.create({
      data: {
        code, clientName: client.name, clientId: client.id, module: mod.name, period,
        erp: client.erp, status: "REVIEW", diff: fmtSigned(totalDiff), items: itemsDiff,
        date: "hoy", owner: user?.name ?? "Auditor", cutoff, runAt: "hoy", runBy: user?.name ?? "Auditor",
        materiality: 2000000, lastActivity: "ahora",
        rows: { create: DEMO_CROSS_ROWS.map(([cuenta, desc, cont, modBal, diff, items], i) => ({ cuenta, desc, cont, mod: modBal, diff, items, order: i })) },
      },
    });

    // Marca el módulo del cliente como parametrizado
    await prisma.clientModule.upsert({
      where: { clientId_moduleId: { clientId, moduleId } },
      create: { clientId, moduleId, status: "configured" },
      update: { status: "configured" },
    });

    await logAudit({ user: user?.name ?? "Sistema", action: "EJECUTÓ", entity: `Cruce ${code}`, detail: `${mod.name} · ${client.name} · ${period}` });
    await createProcessNotification({
      actor: user?.name,
      text: "ejecutó el proceso de conciliación de",
      target: `${client.name} · ${mod.name} · ${period}`,
    });
    revalidatePath("/", "layout");
    reconciliationId = reconciliation.id;
  } catch (e) {
    registrarError("executeReconciliation", e);
    throw e;
  }

  if (reconciliationId !== null) redirect(`/conciliacion/resultados/${reconciliationId}`);
}

function fmtSigned(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${Math.abs(n).toLocaleString("es-CO")}`;
}
