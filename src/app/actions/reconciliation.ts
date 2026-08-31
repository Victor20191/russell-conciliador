"use server";

import { randomUUID } from "node:crypto";
import { resolverValorErpProceso } from "@/lib/erp-cliente";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeConciliacion, clienteDeFilaConciliacion } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { createProcessNotification } from "@/lib/notifications";
import { mensajeErrorBD } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import type { ActionState } from "@/lib/definitions";
import { anioColombia } from "@/lib/fecha-hora";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import { validarCompuertaPrevalidador } from "@/lib/modulos/compuerta-cruce";

// Patrón de autorización en dos pasos: el primer gate exige sesión +
// permiso de rol ANTES de tocar la BD; el segundo añade el ALCANCE de
// escritura sobre el cliente de la conciliación (cartera, fail-closed).

export async function addReconciliationComment(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const reconciliationId = parseId(formData.get("reconciliationId"));
  const cuenta = formData.get("cuenta") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!reconciliationId || !cuenta || !text) {
    return { ok: false, message: "Escribe una observación antes de comentar." };
  }
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(reconciliationId) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const user = await getCurrentUser();
    await prisma.reconciliationComment.create({
      data: {
        reconciliationId, cuenta,
        who: user?.name ?? "Usuario",
        initials: user?.initials ?? "··",
        text,
      },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Cuenta ${cuenta}`, detail: `Cruce ${reconciliationId}` });
    revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
    return { ok: true, message: "Comentario registrado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("addReconciliationComment", e) };
  }
}

export async function setRowStatus(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const rowId = parseId(formData.get("rowId"));
  const status = formData.get("status") as string; // conciliada | excepcion | ajuste
  const reconciliationId = parseId(formData.get("reconciliationId"));
  if (!rowId || !["conciliada", "excepcion", "ajuste"].includes(status)) {
    return { ok: false, message: "Estado de partida inválido." };
  }
  // El cliente se resuelve desde la FILA (no desde el formulario, que es manipulable).
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeFilaConciliacion(rowId) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const row = await prisma.reconciliationRow.update({ where: { id: rowId }, data: { manualStatus: status } });
    const user = await getCurrentUser();
    const labels: Record<string, string> = { conciliada: "marcó como conciliada", excepcion: "marcó como excepción", ajuste: "solicitó ajuste contable" };
    await logAudit({ user: user?.name ?? "Sistema", action: "ACTUALIZÓ PARTIDA", entity: `Cuenta ${row.cuenta}`, detail: labels[status] });
    if (reconciliationId) revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
    return { ok: true, message: "Partida actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("setRowStatus", e) };
  }
}

export async function sendToReviewer(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Conciliación inexistente." };
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(id) });
  if (!alcance.ok) return { ok: false, message: alcance.message };
  try {
    await prisma.reconciliation.update({ where: { id }, data: { status: "REVIEW" } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ A REVISOR", entity: `Cruce ${id}`, detail: "Marcado en revisión" });
    revalidatePath(`/conciliacion/resultados/${id}`);
    return { ok: true, message: "Conciliación enviada a revisor." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("sendToReviewer", e) };
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

class ErrorCompuertaPrevalidador extends Error {}

type ContextoPrevalidador = Awaited<ReturnType<typeof cargarContextoPrevalidadorBalance>>;

export async function executeReconciliation(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:ejecutar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const balanceId = parseId(formData.get("balanceId"));
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  if (!balanceId || !clientId || !moduleId) {
    return { ok: false, message: "Faltan datos para ejecutar la conciliación." };
  }
  // Ejecutar es la acción operativa por excelencia: exige cartera con escritura.
  const alcance = await authorizePermiso("conciliaciones:ejecutar", { clientId });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  // El id se captura dentro del try; el redirect() se ejecuta DESPUÉS, porque
  // redirect() funciona lanzando una excepción especial que NO debe capturarse.
  let reconciliationId: number | null = null;
  try {
    const [client, mod, user] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        include: {
          erp: { select: { name: true } },
          erpsPorProceso: {
            select: {
              process: { select: { code: true } },
              erp: { select: { name: true } },
            },
          },
        },
      }),
      prisma.module.findUnique({ where: { id: moduleId } }),
      getCurrentUser(),
    ]);
    if (!client || !mod) return { ok: false, message: "Cliente o módulo inexistente." };

    // ING ya cuenta con un flujo operativo basado en archivos reales. Evita que
    // el conciliador legado cree para ese módulo las partidas demostrativas de
    // Inventarios definidas en DEMO_CROSS_ROWS.
    if (mod.code.trim().toUpperCase() === "ING") {
      return {
        ok: false,
        message:
          "El módulo de Ingresos se concilia desde /modulos/ing con los datos reales cargados. El flujo legado no genera partidas demostrativas para ING.",
      };
    }

    const asignacionModulo = client.erpsPorProceso?.find(
      (asignacion) => asignacion.process.code === mod.code.trim().toUpperCase(),
    );
    const erpModulo = resolverValorErpProceso(
      asignacionModulo ? { valor: asignacionModulo.erp?.name ?? null } : undefined,
      client.erp?.name ?? null,
    );
    if (!erpModulo) {
      return {
        ok: false,
        message: `El cliente no tiene un ERP definido para ${mod.name}. Asígnalo en Configuración › Clientes antes de iniciar la conciliación.`,
      };
    }

    let preflight: ContextoPrevalidador;
    try {
      preflight = await cargarContextoPrevalidadorBalance(balanceId);
    } catch {
      return { ok: false, message: "No fue posible verificar de forma íntegra el prevalidador del balance seleccionado." };
    }
    const bloqueoPreflight = validarCompuertaPrevalidador(preflight, clientId, mod.code);
    if (bloqueoPreflight) return { ok: false, message: bloqueoPreflight };

    const totalDiff = DEMO_CROSS_ROWS.reduce((s, r) => s + r[4], 0);
    const itemsDiff = DEMO_CROSS_ROWS.filter((r) => r[4] !== 0).length;

    const { id, code } = await transaccionSerializable(async (tx) => {
      // Misma llave que usan homologación, override y congelamiento. La relectura
      // dentro de la transacción elimina la ventana entre preflight y creación.
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      await tomarCandadoTransaccion(tx, `balance-oficial:${clientId}:${preflight.balance.periodo}`);
      const contexto = await cargarContextoPrevalidadorBalance(balanceId, tx);
      const bloqueo = validarCompuertaPrevalidador(contexto, clientId, mod.code);
      if (bloqueo) throw new ErrorCompuertaPrevalidador(bloqueo);

      const temporalCode = `REC-TMP-${randomUUID()}`;
      const ahora = new Date();
      const reconciliation = await tx.reconciliation.create({
        data: {
          code: temporalCode, clientName: client.name, clientId: client.id, module: mod.name, period: contexto.balance.periodo,
          erp: erpModulo, status: "REVIEW", diff: fmtSigned(totalDiff), items: itemsDiff,
          owner: user?.name ?? "Auditor", cutoff: contexto.balance.periodoFin, runAt: ahora, runBy: user?.name ?? "Auditor",
          balancePrevalidadoId: contexto.balance.id,
          materiality: 2000000, lastActivity: ahora,
          rows: { create: DEMO_CROSS_ROWS.map(([cuenta, desc, cont, modBal, diff, items], i) => ({ cuenta, desc, cont, mod: modBal, diff, items, order: i })) },
        },
        select: { id: true },
      });

      const year = anioColombia(ahora);
      const code = `REC-${year}-${5000 + reconciliation.id}`;
      await tx.reconciliation.update({
        where: { id: reconciliation.id },
        data: { code },
      });

      // Marca el módulo del cliente como parametrizado.
      await tx.clientModule.upsert({
        where: { clientId_moduleId: { clientId, moduleId } },
        create: { clientId, moduleId, status: "configured" },
        update: { status: "configured" },
      });

      return { id: reconciliation.id, code };
    });

    await logAudit({ user: user?.name ?? "Sistema", action: "EJECUTÓ", entity: `Cruce ${code}`, detail: `${mod.name} · ${client.name} · ${preflight.balance.periodo} · balance ${balanceId}` });
    await createProcessNotification({
      actor: user?.name,
      text: "ejecutó el proceso de conciliación de",
      target: `${client.name} · ${mod.name} · ${preflight.balance.periodo}`,
    });
    revalidatePath("/", "layout");
    reconciliationId = id;
  } catch (e) {
    if (e instanceof ErrorCompuertaPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("executeReconciliation", e) };
  }

  // Éxito: redirige al detalle del cruce con la señal `ejecutada=1`, que la
  // página destino usa para confirmar con un toast (FlashToast). El redirect()
  // se ejecuta FUERA del try porque funciona lanzando una excepción especial.
  if (reconciliationId !== null) {
    redirect(`/conciliacion/resultados/${reconciliationId}?ejecutada=1`);
  }
  return { ok: false, message: "No se pudo ejecutar la conciliación." };
}

function fmtSigned(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${Math.abs(n).toLocaleString("es-CO")}`;
}
