"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Registra cada navegación de página (vista real, no prefetch) para la analítica
 * de accesos / tráfico de rutas. Envía solo la ruta a /api/registro-acceso, que
 * resuelve el usuario desde la sesión. Se monta únicamente dentro del cascarón
 * autenticado (AppShell), así que siempre hay una sesión válida detrás.
 *
 * Deduplica rutas consecutivas idénticas (evita doble registro por el doble
 * montaje de efectos en desarrollo y por re-renders ajenos a la navegación).
 */
export default function AccessTracker() {
  const pathname = usePathname();
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === ultima.current) return;
    ultima.current = pathname;
    // keepalive: la petición sobrevive aunque el usuario navegue de inmediato.
    fetch("/api/registro-acceso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruta: pathname }),
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      /* best-effort: el registro nunca debe afectar la navegación */
    });
  }, [pathname]);

  return null;
}
