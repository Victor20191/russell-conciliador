import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/rbac";
import UsuariosClient, { type UserRow } from "./usuarios-client";

export default async function UsuariosPage() {
  await requireRole("Administrador");
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    initials: u.initials,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita y desactiva cuentas. Solo administradores."
      />
      <UsuariosClient rows={rows} />
    </div>
  );
}
