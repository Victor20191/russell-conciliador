"use client"; // Los error boundaries deben ser Client Components

import { useEffect } from "react";
import { PantallaError } from "@/components/pantalla-error";

/**
 * Error boundary del área autenticada. Captura cualquier excepción no
 * controlada de las páginas y de las server actions invocadas desde ellas
 * (p. ej. un fallo de base de datos en una acción `void`), mostrando una
 * pantalla controlada en vez de un crash. Se renderiza dentro del shell
 * (sidebar/topbar siguen visibles).
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Rastro en consola del navegador; el detalle completo está en el servidor.
    console.error(error);
  }, [error]);

  return <PantallaError error={error} retry={unstable_retry} />;
}
