import type { Metadata, Viewport } from "next";
import { lato } from "./fuente-lato";
import { SPACE_BLUE } from "@/lib/marca/paleta";
import "./globals.css";
import { ControlesDeMarca } from "@/components/controles-marca";

export const metadata: Metadata = {
  title: "Russell Conciliador",
  description:
    "Plataforma de conciliación y diagnóstico contable y tributario — Russell Bedford",
};

// La barra del navegador móvil, en el azul institucional (Manual de Marca §3.1).
export const viewport: Viewport = {
  themeColor: SPACE_BLUE[100],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={lato.variable}>
      {/* suppressHydrationWarning: extensiones del navegador (ColorZilla → cz-shortcut-listen,
          Grammarly → data-gr-*, etc.) inyectan atributos en <body> antes de que React
          hidrate. Solo silencia el aviso de atributos de ESTE nodo, no de su contenido. */}
      <body suppressHydrationWarning>
        {children}
        <ControlesDeMarca />
      </body>
    </html>
  );
}
