"use client"; // Los error boundaries deben ser Client Components

import { useEffect } from "react";
import { PantallaError } from "@/components/pantalla-error";
import { lato } from "./fuente-lato";
import "./globals.css";

/**
 * Último recurso: captura errores del propio layout raíz. Reemplaza al layout
 * raíz cuando se activa, por lo que debe declarar sus propias etiquetas
 * <html>/<body> e importar los estilos globales.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es" className={lato.variable}>
      <body>
        <PantallaError
          error={error}
          retry={retry}
          className="min-h-screen"
          conMarca
        />
      </body>
    </html>
  );
}
