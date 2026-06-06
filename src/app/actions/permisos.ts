"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";

export type ToggleResult = { ok: boolean; message?: string };

/**
 * Concede o revoca un permiso a un rol editando `roles_permisos`. Es la
 * palanca del Administrador sobre la matriz que `getMatriz()` lee en runtime,
 * de modo que el cambio surte efecto en la siguiente petición.
 */
export async function toggleRolePermiso(
  roleId: number,
  permissionId: number,
  conceder: boolean,
): Promise<ToggleResult> {
  const authz = await authorizePermiso("roles:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  if (!Number.isSafeInteger(roleId) || !Number.isSafeInteger(permissionId)) {
    return { ok: false, message: "Parámetros inválidos." };
  }

  const [role, permiso] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }),
    prisma.permission.findUnique({ where: { id: permissionId }, select: { code: true } }),
  ]);
  if (!role || !permiso) return { ok: false, message: "Rol o permiso inexistente." };

  if (conceder) {
    // Idempotente: respeta el UNIQUE [roleId, permissionId].
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  } else {
    await prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  }

  const actor = await getCurrentUser();
  await logAudit({
    user: actor?.name ?? "Sistema",
    action: conceder ? "CONCEDIÓ PERMISO" : "REVOCÓ PERMISO",
    entity: `${role.name} · ${permiso.code}`,
    detail: conceder ? "Permiso habilitado para el rol" : "Permiso retirado del rol",
  });
  revalidatePath("/config/permisos");
  return { ok: true };
}
