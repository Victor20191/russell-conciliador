import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import { redirect } from "next/navigation";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { getMatriz } from "@/lib/rbac/contexto";
import { moduloPublicadoParaRol } from "@/lib/rbac/modulos-plataforma";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import prisma from "@/lib/prisma";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");

  // verifySession() (dentro de getCurrentUser) redirige a /login si no hay sesión
  const user = await getCurrentUser();
  // Permisos efectivos del rol (matriz RBAC) para filtrar el menú lateral.
  const [matriz, publicacionModulos] = await Promise.all([
    getMatriz(),
    getPublicacionModulos(),
  ]);
  const permisos = user ? matriz[user.role] ?? [] : [];
  const modulosVisibles = publicacionModulos
    .filter((m) => moduloPublicadoParaRol(session.role, m.key, publicacionModulos))
    .map((m) => m.key);
  const modulosEnDesarrollo = publicacionModulos
    .filter((m) => m.configurableForNonAdmins && !m.enabledForNonAdmins)
    .map((m) => m.key);
  const notifications = await prisma.notification.findMany({
    where: { unread: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={user}
        permisos={permisos}
        modulosVisibles={modulosVisibles}
        modulosEnDesarrollo={modulosEnDesarrollo}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar notifications={notifications} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
