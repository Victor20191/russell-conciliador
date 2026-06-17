import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Russell Bedford · Conciliador",
  description:
    "Plataforma de conciliación y diagnóstico contable y tributario — Russell Bedford",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${newsreader.variable}`}
    >
      {/* suppressHydrationWarning: extensiones del navegador (ColorZilla → cz-shortcut-listen,
          Grammarly → data-gr-*, etc.) inyectan atributos en <body> antes de que React
          hidrate. Solo silencia el aviso de atributos de ESTE nodo, no de su contenido. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
