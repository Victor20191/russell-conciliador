"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Topbar, { type NotificationDTO } from "@/components/topbar";
import { ActionToaster } from "@/components/action-toaster";
import AccessTracker from "@/components/access-tracker";

/**
 * Cascarón de la app (cliente) que coordina el estado compartido entre el
 * Topbar (botón de menú) y el Sidebar (drawer) para que la navegación sea
 * responsive: en pantallas anchas el sidebar es fijo; en angostas se oculta y
 * se abre como panel deslizante sobre un overlay.
 */
export default function AppShell({
  user,
  permisos,
  modulosVisibles,
  modulosEnDesarrollo,
  notifications,
  children,
}: {
  user: { name: string; role: string; initials: string; avatarUrl?: string | null } | null;
  permisos: string[];
  modulosVisibles: string[];
  modulosEnDesarrollo: string[];
  notifications: NotificationDTO[];
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer al cambiar de ruta (ajuste de estado en render, sin efecto).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (mobileNavOpen) setMobileNavOpen(false);
  }

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden overscroll-none">
      <Sidebar
        user={user}
        permisos={permisos}
        modulosVisibles={modulosVisibles}
        modulosEnDesarrollo={modulosEnDesarrollo}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          notifications={notifications}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
      <ActionToaster />
      <AccessTracker />
    </div>
  );
}
