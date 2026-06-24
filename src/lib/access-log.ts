import "server-only";
import prisma from "@/lib/prisma";
import { registrarError } from "@/lib/errores";

// Tipos de evento registrados en `registros_acceso`:
//   - navegacion: visita real de una ruta (no prefetch), vía /api/registro-acceso
//   - ingreso:    inicio de sesión exitoso
//   - salida:     cierre de sesión
export type AccessKind = "navegacion" | "ingreso" | "salida";

export type AccessInput = {
  userId: number | null;
  userName: string;
  role?: string | null;
  path: string;
  kind: AccessKind;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Registra un acceso/navegación. Es un efecto secundario best-effort: si falla,
 * NO debe afectar la operación principal ni la navegación del usuario — se
 * registra el error en el servidor y se continúa (mismo contrato que `logAudit`).
 */
export async function registrarAcceso(input: AccessInput): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        userId: input.userId,
        userName: input.userName,
        role: input.role ?? null,
        path: input.path.slice(0, 512),
        kind: input.kind,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch (e) {
    registrarError("registrarAcceso", e);
  }
}
