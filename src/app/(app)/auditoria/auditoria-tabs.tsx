"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barra de pestañas de Auditoría.
 * - Accesos: permiso `auditoria:accesos`
 * El servidor decide `can*` y la página de destino vuelve a exigir el gate.
 */
export default function AuditoriaTabs({
  canAccesos,
}: {
  canAccesos: boolean;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: "/auditoria", label: "Acciones" },
    ...(canAccesos ? [{ href: "/auditoria/accesos", label: "Accesos y tráfico" }] : []),
  ];

  return (
    <div className="mb-4 flex gap-1 border-b border-ink-100">
      {tabs.map((t) => {
        const activo = pathname === t.href || (t.href !== "/auditoria" && pathname.startsWith(t.href));
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
