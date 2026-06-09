"use client"; // Los error boundaries deben ser Client Components

import { useEffect } from "react";
import { PantallaError } from "@/components/pantalla-error";
import "./globals.css";

/**
 * Último recurso: captura errores del propio layout raíz. Reemplaza al layout
 * raíz cuando se activa, por lo que debe declarar sus propias etiquetas
 * <html>/<body> e importar los estilos globales.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <PantallaError
          error={error}
          retry={unstable_retry}
          className="min-h-screen"
        />
      </body>
    </html>
  );
}
