import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import { redirect } from "next/navigation";
import { getCurrentUser, verifySession } from "@/lib/dal";
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
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar notifications={notifications} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
