import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes alojadas en el repo (subconjunto latino, woff2) en vez de next/font/google: el build
// no depende de que Google responda con el formato de URL que Turbopack sabe leer. En el VPS,
// Google devolvió URLs «fonts.gstatic.com/l/font?kit=…&skey=…» y `next build` fallaba con
// «next/font/google queries have exactly one entry». Misma tipografía y mismas variables CSS.
const ibmPlexSans = localFont({
  variable: "--font-ibm-plex-sans",
  src: [{ path: "./fonts/ibm-plex-sans.woff2", weight: "400 700", style: "normal" }], // fuente variable
  fallback: ["system-ui", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

const ibmPlexMono = localFont({
  variable: "--font-ibm-plex-mono",
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  fallback: ["ui-monospace", "monospace"],
});

const newsreader = localFont({
  variable: "--font-newsreader",
  src: [{ path: "./fonts/newsreader.woff2", weight: "400 500", style: "normal" }], // fuente variable
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
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
