import type { Metadata } from "next";
import { PantallaNoEncontrada } from "@/components/pantalla-no-encontrada";

export const metadata: Metadata = { title: "Página no encontrada · Russell Conciliador" };

/**
 * 404 de nivel raíz: direcciones que no existen y `notFound()` fuera del área
 * autenticada. Sin este archivo Next pinta su página por defecto, ajena a la marca.
 */
export default function NotFound() {
  return <PantallaNoEncontrada conMarca />;
}
