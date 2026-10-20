import "server-only";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAsignacionesUsuario, getMatriz } from "@/lib/rbac/contexto";
import { alcanzaCliente, tienePermiso } from "@/lib/rbac/permisos";
import { ROLES_ALCANCE_GLOBAL, ROL_SOCIO } from "@/lib/rbac/jerarquia";
import { moduloDisponibleParaRol } from "@/lib/rbac/publicacion";
import { moduloDelPermiso } from "@/lib/rbac/modulos-plataforma";

export type AlcanceAviso = {
  permiso: string;
  permisoRuta?: string;
  modoAlcance?: "lectura" | "escritura";
  /** undefined: aviso global; null: cliente desconocido (no enviar). */
  clienteId?: number | null;
  /** Las menciones fijan destinatarios. Sin IDs se resuelve el equipo del cliente. */
  usuarioIds?: number[];
  actorId?: number | null;
};

export async function destinatariosAviso(input: AlcanceAviso): Promise<string[]> {
  if (input.clienteId === null || (!input.usuarioIds && !input.clienteId)) return [];
  let ids = input.usuarioIds;
  if (!ids) {
    const ahora = new Date();
    const asignaciones = await prisma.clientAssignment.findMany({
      where: { clientId: input.clienteId!, active: true, readScope: true,
        validFrom: { lte: ahora }, OR: [{ validUntil: null }, { validUntil: { gte: ahora } }] },
      select: { userId: true, role: true },
    });
    const gerentes = asignaciones.filter((a) => a.role === "gerente").map((a) => a.userId);
    const superiores = gerentes.length ? await prisma.userHierarchy.findMany({
      where: { subordinateId: { in: gerentes } }, select: { superiorId: true },
    }) : [];
    // Solo los socios derivan cartera; un superior con otro rol no se añade.
    const socios = superiores.length ? await prisma.user.findMany({
      where: { id: { in: superiores.map((s) => s.superiorId) }, active: true, role: ROL_SOCIO }, select: { id: true },
    }) : [];
    ids = [...asignaciones.map((a) => a.userId), ...socios.map((s) => s.id)];
  }
  ids = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0 && id !== input.actorId);
  if (!ids.length) return [];
  const [usuarios, matriz] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, email: true, role: true } }),
    getMatriz(),
  ]);
  const correos: string[] = [];
  for (const usuario of usuarios) {
    if (!tienePermiso(matriz, usuario.role, input.permiso) || !z.email().safeParse(usuario.email).success) continue;
    if (!(await moduloDisponibleParaRol(usuario.role, moduloDelPermiso(input.permiso)))) continue;
    if (input.permisoRuta && (!tienePermiso(matriz, usuario.role, input.permisoRuta)
      || !(await moduloDisponibleParaRol(usuario.role, moduloDelPermiso(input.permisoRuta))))) continue;
    if (input.clienteId !== undefined && !ROLES_ALCANCE_GLOBAL.has(usuario.role)) {
      const { asignaciones } = await getAsignacionesUsuario(usuario.id, usuario.role);
      if (!alcanzaCliente(asignaciones, usuario.id, input.clienteId, input.modoAlcance ?? "lectura")) continue;
    }
    correos.push(usuario.email.toLowerCase());
  }
  return [...new Set(correos)];
}
