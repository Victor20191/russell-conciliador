import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { construirArbol } from "@/lib/estructura/arbol";
import EstructuraClient from "./estructura-client";

// Módulo ESTRUCTURA (mapa organizacional), admin-only y de solo lectura. El
// guard es `estructura:ver` (SOLO_ADMIN). No muta nada: arma el árbol
// Socio→Gerente→Senior→Staff + los clientes que atiende cada persona a partir
// de jerarquia_usuarios y asignaciones_cliente (los datos se editan en
// Usuarios/Clientes). Patrón de loader RSC idéntico a /novedades.
export default async function EstructuraPage() {
  await requirePermiso("estructura:ver");

  // Asignaciones VIGENTES (mismo criterio que getAsignacionesUsuario): activas,
  // ya iniciadas y no expiradas. Así la vista cuenta lo mismo que autoriza.
  const ahora = new Date();
  const vigente = {
    active: true,
    validFrom: { lte: ahora },
    OR: [{ validUntil: null }, { validUntil: { gte: ahora } }],
  };

  const [usuarios, aristas, asignaciones, clientes] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, initials: true, cargo: true, active: true },
    }),
    prisma.userHierarchy.findMany({ select: { superiorId: true, subordinateId: true } }),
    prisma.clientAssignment.findMany({
      where: vigente,
      select: { clientId: true, userId: true, role: true },
    }),
    prisma.client.findMany({ select: { id: true, code: true, name: true } }),
  ]);

  const arbol = construirArbol(usuarios, aristas, asignaciones, clientes);

  return <EstructuraClient arbol={arbol} />;
}
