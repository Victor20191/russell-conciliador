"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barra de pestañas de Auditoría. La pestaña «Accesos y tráfico» solo se ofrece
 * a quien tiene el permiso `auditoria:accesos` (admin-only); el `canAccesos` lo
 * decide el servidor y la página de destino lo vuelve a exigir (defensa en capas).
 */
export default function AuditoriaTabs({ canAccesos }: { canAccesos: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/auditoria", label: "Acciones" },
    ...(canAccesos ? [{ href: "/auditoria/accesos", label: "Accesos y tráfico" }] : []),
  ];

  return (
    <div className="mb-4 flex gap-1 border-b border-ink-100">
      {tabs.map((t) => {
        const activo = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
              activo
                ? "border-blue-500 text-blue-500"
                : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
