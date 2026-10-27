import "server-only";
import prisma from "@/lib/prisma";
import { isAccountBlocked, isLockedOut, nextFailedLoginState } from "./login-throttle";

type UsuarioLogin = {
  id: number;
  name: string;
  role: string;
  sessionVersion: number;
  mustChangePassword: boolean;
};

/** Revalida la credencial comprobada por bcrypt contra la cuenta vigente bajo bloqueo. */
export async function finalizarLogin(args: {
  userId: number;
  passwordHash: string;
  sessionVersion: number;
}): Promise<{ ok: true; user: UsuarioLogin } | { ok: false; bloqueada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const [vigente] = await tx.$queryRaw<(UsuarioLogin & {
      password: string;
      active: boolean;
      blockedUntil: Date | null;
    })[]>`
      SELECT id, nombre AS "name", rol AS "role", contrasena AS "password",
             activo AS "active", version_sesion AS "sessionVersion",
             debe_cambiar_contrasena AS "mustChangePassword", bloqueado_hasta AS "blockedUntil"
      FROM usuarios WHERE id = ${args.userId} FOR UPDATE
    `;
    if (!vigente || !vigente.active || vigente.password !== args.passwordHash
      || vigente.sessionVersion !== args.sessionVersion) {
      return { ok: false, bloqueada: false };
    }
    const now = new Date();
    if (isAccountBlocked(vigente.blockedUntil, now)) return { ok: false, bloqueada: true };
    // El mismo bloqueo que usa registrarFalloLogin impide borrar un bloqueo
    // establecido mientras bcrypt comprobaba la contraseña fuera de la transacción.
    await tx.user.update({
      where: { id: vigente.id },
      data: { lastLoginAt: now, failedLoginAttempts: 0, lastFailedLoginAt: null, blockedUntil: null },
    });
    return { ok: true, user: {
      id: vigente.id,
      name: vigente.name,
      role: vigente.role,
      sessionVersion: vigente.sessionVersion,
      mustChangePassword: vigente.mustChangePassword,
    } };
  });
}

/** Cuenta fallos con bloqueo de fila: peticiones simultáneas no pisan el contador. */
export async function registrarFalloLogin(userId: number, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [estado] = await tx.$queryRaw<{
      failedLoginAttempts: number;
      lastFailedLoginAt: Date | null;
      blockedUntil: Date | null;
    }[]>`
      SELECT intentos_fallidos AS "failedLoginAttempts",
             ultimo_intento_fallido AS "lastFailedLoginAt",
             bloqueado_hasta AS "blockedUntil"
      FROM usuarios WHERE id = ${userId} AND activo = true FOR UPDATE
    `;
    if (!estado) return false;
    if (isAccountBlocked(estado.blockedUntil, now)) return true;
    const siguiente = nextFailedLoginState({ ...estado, now });
    await tx.user.update({ where: { id: userId }, data: siguiente });
    return isLockedOut(siguiente.failedLoginAttempts);
  });
}
