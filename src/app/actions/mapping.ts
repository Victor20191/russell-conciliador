"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeCuentaCliente, clientIdPorNombre } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

export async function updateAccountMapping(formData: FormData): Promise<ActionState> {
  // Primer gate: sesión + permiso de rol; segundo: alcance de escritura
  // sobre el cliente dueño de la cuenta que se va a mapear (cartera).
  const authz = await authorizePermiso("mapeo:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  const russell = (formData.get("russell") as string) || null;
  if (!id) return { ok: false, message: "Cuenta inexistente." };
  const alcance = await authorizePermiso("mapeo:editar", { clientId: await clienteDeCuentaCliente(id) });
  if (!alcance.ok) return { ok: false, message: alcance.message };
  // Envolvemos las operaciones de base de datos para registrar cualquier fallo
  // y devolver un mensaje claro a la UI que disparó el cambio.
  try {
    const option = russell
      ? await prisma.russellOption.findUnique({ where: { code: russell }, select: { id: true } })
      : null;
    await prisma.clientAccount.update({
      where: { id },
      data: { russellOptionId: option?.id ?? null },
    });
    revalidatePath("/config/mapeo");
    return { ok: true, message: "Mapeo actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateAccountMapping", e) };
  }
}

// IA simulada: asigna a las cuentas sin mapear el RussellOption cuyo código sea
// el prefijo más largo del código de la cuenta (similitud por plan de cuentas).
export async function suggestMappingsAI(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("mapeo:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clientName = formData.get("clientName") as string;
  if (!clientName) return { ok: false, message: "Cliente inválido." };
  // Alcance de escritura sobre el cliente cuyas cuentas se van a mapear.
  const alcance = await authorizePermiso("mapeo:editar", { clientId: await clientIdPorNombre(clientName) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  // Envolvemos las operaciones de base de datos (lecturas, actualizaciones,
  // auditoría) para registrar cualquier fallo y devolverlo a la UI.
  try {
    const [accounts, options] = await Promise.all([
      prisma.clientAccount.findMany({ where: { clientName, russellOptionId: null } }),
      prisma.russellOption.findMany(),
    ]);
    const codes = options.map((o) => o.code).sort((a, b) => b.length - a.length); // más largo primero

    let suggested = 0;
    for (const a of accounts) {
      const match = codes.find((c) => a.code.startsWith(c));
      if (match) {
        const option = options.find((o) => o.code === match);
        if (!option) continue;
        await prisma.clientAccount.update({
          where: { id: a.id },
          data: { russellOptionId: option.id },
        });
        suggested += 1;
      }
    }

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "SUGIRIÓ MAPEO (IA)",
      entity: `Mapeo · ${clientName}`,
      detail: `${suggested} cuenta(s) mapeadas por similitud`,
    });
    revalidatePath("/config/mapeo");
    return { ok: true, message: `${suggested} cuenta(s) mapeadas por sugerencia.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("suggestMappingsAI", e) };
  }
}
