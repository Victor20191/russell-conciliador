import AppShell from "@/components/app-shell";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getMatriz } from "@/lib/rbac/contexto";
import { moduloPublicadoParaRol } from "@/lib/rbac/modulos-plataforma";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import { urlAvatar } from "@/lib/avatares";
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");

  // El DAL ya devolvió los datos del usuario junto con la verificación de la
  // sesión. No hace falta atravesar de nuevo getCurrentUser(). Las lecturas de
  // configuración y notificaciones tampoco dependen entre sí.
  const [matriz, publicacionModulos, notifications] = await Promise.all([
    getMatriz(),
    getPublicacionModulos(),
    prisma.notification.findMany({
      where: { unread: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        who: true,
        text: true,
        target: true,
        createdAt: true,
        unread: true,
      },
    }),
  ]);
  const permisos = matriz[session.role] ?? [];
  // Usuario para el cascarón: incluye la URL de la foto (o null → iniciales).
  const shellUser = {
    name: session.name,
    role: session.role,
    initials: session.initials,
    avatarUrl: urlAvatar({
      id: session.userId,
      avatarKey: session.avatarKey,
      updatedAt: session.updatedAt,
    }),
  };
  const modulosVisibles = publicacionModulos
    .filter((m) => moduloPublicadoParaRol(session.role, m.key, publicacionModulos))
    .map((m) => m.key);
  const modulosEnDesarrollo = publicacionModulos
    .filter((m) => m.configurableForNonAdmins && !m.enabledForNonAdmins)
    .map((m) => m.key);
  return (
    <AppShell
      user={shellUser}
      permisos={permisos}
      modulosVisibles={modulosVisibles}
      modulosEnDesarrollo={modulosEnDesarrollo}
      notifications={notifications.map((n) => ({
        id: n.id,
        kind: n.kind,
        who: n.who,
        text: n.text,
        target: n.target,
        time: fmtDateTime(n.createdAt),
        unread: n.unread,
      }))}
    >
      {children}
    </AppShell>
  );
}
