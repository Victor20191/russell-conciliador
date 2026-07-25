"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ActionForm } from "@/components/action-form";
import { markAllNotificationsRead } from "@/app/actions/notifications";

export type NotificationDTO = {
  id: number;
  kind: string;
  who: string;
  text: string;
  target: string;
  time: string;
  unread: boolean;
};

const CRUMB_LABELS: Record<string, string> = {
  dashboard: "Inicio",
  balance: "Balance de comprobación",
  mapeo: "Mapeo plan estándar",
  conciliacion: "Conciliación",
  nueva: "Nueva",
  "en-proceso": "En proceso",
  resultados: "Resultados",
  dian: "Impuestos · DIAN",
  auditoria: "Auditoría",
  config: "Configuración",
  modulos: "Módulos y campos",
  "publicacion-modulos": "Publicación de módulos",
  clientes: "Clientes",
  maestros: "Maestros",
  parametros: "Parámetros de alertas",
};

export default function Topbar({
  notifications,
  onOpenMobileNav,
}: {
  notifications: NotificationDTO[];
  onOpenMobileNav?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [bellOpen, setBellOpen] = useState(false);
  const unread = notifications.filter((n) => n.unread).length;
  const hasNotifications = notifications.length > 0;

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      if (CRUMB_LABELS[seg]) return CRUMB_LABELS[seg];
      // Los segmentos numéricos son IDs internos de detalle.
      if (/^[1-9]\d*$/.test(seg)) return "Detalle";
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    });
  if (crumbs.length === 0) crumbs.push("Inicio");

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-150 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-5">
      {/* Botón de menú: abre el drawer de navegación en pantallas angostas */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Abrir menú"
        className="-ml-1 shrink-0 rounded-md border border-ink-200 bg-white p-1.5 text-ink-600 transition hover:bg-ink-50 lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>
      {/* Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-500">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <Icon name="chev-r" size={11} className="text-ink-400" />}
            {i === crumbs.length - 1 ? (
              <b className="truncate text-ink-800">{c}</b>
            ) : (
              <span className="truncate">{c}</span>
            )}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (hasNotifications) setBellOpen((o) => !o);
            }}
            disabled={!hasNotifications}
            aria-label={hasNotifications ? "Notificaciones" : "Sin procesos activos"}
            title={hasNotifications ? "Notificaciones" : "Sin procesos activos"}
            className={`relative rounded-md border border-ink-200 bg-white p-2 text-ink-600 transition ${
              hasNotifications ? "hover:bg-ink-50" : "cursor-default opacity-45"
            }`}
          >
            <Icon name="bell" size={16} />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-err-500" />
            )}
          </button>

          {bellOpen && hasNotifications && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-xs overflow-hidden rounded-lg border border-ink-150 bg-white shadow-lg sm:w-80 sm:max-w-none">
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
                <b className="text-[13px] text-ink-800">Notificaciones</b>
                <span className="rounded-full bg-ai-100 px-1.5 py-0.5 text-[10px] font-semibold text-ai-700">
                  {unread} sin leer
                </span>
                {unread > 0 && (
                  <ActionForm
                    action={markAllNotificationsRead}
                    successMessage="Notificaciones marcadas como leídas."
                    errorMessage="No se pudieron marcar las notificaciones."
                    className="ml-auto"
                    showInlineError={false}
                    onSuccess={() => {
                      setBellOpen(false);
                      router.refresh();
                    }}
                  >
                    {(pending) => (
                      <button
                        type="submit"
                        disabled={pending}
                        className="text-[11px] font-medium text-blue-500 hover:underline disabled:opacity-60"
                      >
                        {pending ? <EstadoProcesando>Marcando</EstadoProcesando> : "Marcar todo leído"}
                      </button>
                    )}
                  </ActionForm>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-2.5 border-b border-ink-100 px-4 py-2.5 last:border-0 ${
                      n.unread ? "bg-blue-50" : ""
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        n.kind === "assign"
                          ? "bg-blue-100 text-navy-700"
                          : n.kind === "comment"
                            ? "bg-ai-100 text-ai-700"
                            : "bg-ink-100 text-ink-700"
                      }`}
                    >
                      <Icon
                        name={
                          n.kind === "assign"
                            ? "users"
                            : n.kind === "comment"
                              ? "msg"
                              : "settings"
                        }
                        size={12}
                      />
                    </div>
                    <div className="text-[12px] leading-snug text-ink-700">
                      <b>{n.who}</b> {n.text} <b>{n.target}</b>
                      <div className="mt-0.5 text-[11px] text-ink-400">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
