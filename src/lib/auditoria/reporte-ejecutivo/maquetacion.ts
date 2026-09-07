const MARCA = "rd-maquetacion-graficos";
const ESTILOS = `<style id="${MARCA}">
/* Las tablas de las barras reservan a las cifras su ancho real. */
#rd-graficos-uso table[role="presentation"] {
  table-layout: auto !important;
}
#rd-graficos-uso table[role="presentation"] td {
  border: 0 !important;
}
</style>`;

/** Corrección visual de documentos nuevos y guardados; no altera sus cifras. */
export function ajustarMaquetacionReporte(html: string): string {
  if (!html.trim() || html.includes(`id="${MARCA}"`)) return html;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${ESTILOS}\n</head>`)
    : `${ESTILOS}\n${html}`;
}
