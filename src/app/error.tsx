"use client"; // Los error boundaries deben ser Client Components

import { useEffect } from "react";
import { PantallaError } from "@/components/pantalla-error";

/**
 * Error boundary de nivel raíz. Cubre las páginas fuera del shell (login,
 * cambiar contraseña) y los fallos del layout del área autenticada
 * (`(app)/layout.tsx`), que el error boundary de ese grupo no puede capturar
 * por estar por encima de él. Solo el layout raíz queda fuera de su alcance
 * (ese lo cubre `global-error.tsx`).
 */
export default function RootError({
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
    <PantallaError
      error={error}
      retry={unstable_retry}
      className="min-h-screen"
    />
  );
}
