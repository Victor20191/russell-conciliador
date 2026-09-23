"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Topbar, { type NotificationDTO } from "@/components/topbar";
import { ActionToaster } from "@/components/action-toaster";
import AccessTracker from "@/components/access-tracker";
import { Icon } from "@/components/icons";

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
  appVersion,
  children,
}: {
  user: { name: string; role: string; initials: string; avatarUrl?: string | null } | null;
  permisos: string[];
  modulosVisibles: string[];
  modulosEnDesarrollo: string[];
  notifications: NotificationDTO[];
  /** Última versión publicada (o package.json). Visible en el sidebar. */
  appVersion: { number: string; title: string | null } | null;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Estado FIJADO por el usuario (botón de colapsar/expandir): persiste hasta
  // el próximo clic, independiente del mouse.
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  // Expansión TEMPORAL por hover: solo tiene efecto cuando el sidebar está
  // fijado colapsado; si fue fijado abierto, el hover no altera nada.
  const [desktopNavHovered, setDesktopNavHovered] = useState(false);
  const desktopNavVisuallyCollapsed = desktopNavCollapsed && !desktopNavHovered;
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
        appVersion={appVersion}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        desktopCollapsed={desktopNavVisuallyCollapsed}
        onExpandDesktop={() => setDesktopNavCollapsed(false)}
        onDesktopHoverChange={setDesktopNavHovered}
      />
      <button
        type="button"
        aria-label={desktopNavCollapsed ? "Expandir barra de navegación" : "Contraer barra de navegación"}
        title={desktopNavCollapsed ? "Expandir barra de navegación" : "Contraer barra de navegación"}
        aria-controls="app-sidebar"
        aria-expanded={!desktopNavCollapsed}
        onClick={() => setDesktopNavCollapsed((collapsed) => !collapsed)}
        className={`fixed bottom-0 z-30 hidden items-center justify-center border-l border-navy-800 bg-navy-800 text-[#A9B6C8] transition-[left,width,height,background-color,color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-navy-800),white_6%)] hover:text-white focus-visible:bg-navy-800 focus-visible:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400 lg:flex ${
          desktopNavVisuallyCollapsed ? "left-0 h-7 w-14 border-t border-t-white/10" : "left-[212px] h-[57px] w-5 border-t border-t-white/10"
        }`}
      >
        <Icon name={desktopNavCollapsed ? "chev-r" : "chev-l"} size={14} />
      </button>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          notifications={notifications}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main data-scroll-app className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
      <ActionToaster />
      <AccessTracker />
    </div>
  );
}
