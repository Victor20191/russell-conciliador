import localFont from "next/font/local";

// Lato es la tipografía principal del Manual de Marca (§2.1) y Arial su alternativa (§2.2).
// Archivo de definición único (lo usan el layout raíz y `global-error.tsx`, que lo reemplaza):
// así la fuente se aloja una sola vez. Subconjunto latino en woff2 dentro de `public/marca/fuentes`
// (licencia SIL OFL en LATO-OFL.md), que también sirve a los documentos generados (PDF, HTML).
// No se usa next/font/google: en el VPS, Google devolvió URLs «fonts.gstatic.com/l/font?kit=…&skey=…»
// y `next build` fallaba con «next/font/google queries have exactly one entry».
export const lato = localFont({
  variable: "--font-lato",
  src: [
    { path: "../../public/marca/fuentes/lato-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../public/marca/fuentes/lato-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../public/marca/fuentes/lato-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../public/marca/fuentes/lato-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../public/marca/fuentes/lato-700-italic.woff2", weight: "700", style: "italic" },
    { path: "../../public/marca/fuentes/lato-900-normal.woff2", weight: "900", style: "normal" },
  ],
  fallback: ["Arial", "Helvetica", "sans-serif"],
  adjustFontFallback: "Arial",
});
