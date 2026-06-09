import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import PublicacionModulosClient from "./publicacion-modulos-client";

export default async function PublicacionModulosPage() {
  await requirePermiso("publicacion_modulos:ver");

  const [modules, nonSuperadminUsers] = await Promise.all([
    getPublicacionModulos(),
    prisma.user.count({
      where: {
        active: true,
        role: { not: "Superadministrador" },
      },
    }),
  ]);

  return (
    <PublicacionModulosClient
      modules={modules}
      nonSuperadminUsers={nonSuperadminUsers}
    />
  );
}
