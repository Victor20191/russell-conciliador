import "server-only";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { can, type Role } from "@/lib/roles";

export type AuthzResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; message: string };

// Para Server Actions que devuelven ActionState: no lanza, devuelve el resultado.
export async function authorizeAction(min: Role): Promise<AuthzResult> {
  const session = await verifySession();
  if (!can(session.role, min)) {
    return { ok: false, message: "No tienes permisos para esta acción." };
  }
  return { ok: true, userId: session.userId, role: session.role };
}

// Para páginas/layouts y Server Actions void: redirige si no cumple.
export async function requireRole(min: Role): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, min)) {
    redirect("/dashboard");
  }
}
