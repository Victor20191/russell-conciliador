import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import UsuariosClient, { type UserRow, type RoleOption } from "./usuarios-client";

export default async function UsuariosPage() {
  await requirePermiso("usuarios:ver");
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({
      where: { active: true },
      orderBy: { rank: "desc" },
      select: { code: true, name: true },
    }),
  ]);
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    initials: u.initials,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));
  const roleOptions: RoleOption[] = roles.map((r) => ({ code: r.code, name: r.name }));

  return (
    <div>
      <UsuariosClient rows={rows} roles={roleOptions} />
    </div>
  );
}
