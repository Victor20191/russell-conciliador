const MARCA_ESTILOS_IMPRESION = "rd-estilos-impresion";

const ESTILOS_IMPRESION = `<style id="${MARCA_ESTILOS_IMPRESION}">
@page {
  size: Letter;
  margin: 12mm 13mm 14mm;
}

@media print {
  html, body {
    width: auto !important;
    min-width: 0 !important;
    background: #fff !important;
  }

  body {
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body > main,
  body > article,
  body > div {
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  section {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  h1, h2, h3, h4 {
    break-after: avoid-page !important;
    page-break-after: avoid !important;
    orphans: 3;
    widows: 3;
  }

  .section-kicker,
  .eyebrow {
    break-after: avoid-page !important;
    page-break-after: avoid !important;
  }

  .section-kicker + *,
  .eyebrow + * {
    break-before: avoid-page !important;
    page-break-before: avoid !important;
  }

  p, li {
    orphans: 3;
    widows: 3;
  }

  .card,
  .kpi,
  .metric,
  .stat,
  .highlight,
  blockquote,
  footer,
  tr,
  .rd-user-row {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .rd-chart {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .rd-user-detail,
  table {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  .rd-user-detail-heading,
  .rd-graficos-heading {
    break-inside: avoid !important;
    break-after: avoid-page !important;
    page-break-inside: avoid !important;
    page-break-after: avoid !important;
  }

  .rd-user-detail-heading + div,
  .rd-graficos-heading + div {
    break-before: avoid-page !important;
    page-break-before: avoid !important;
  }

  thead {
    display: table-header-group;
  }

  tfoot {
    display: table-footer-group;
  }
}
</style>`;

/**
 * Añade reglas de impresión controladas por la plataforma. El HTML editorial
 * viene de IA, por lo que estas reglas ganan sobre estilos inline que vuelven
 * indivisibles secciones completas y producen páginas casi vacías.
 */
export function prepararHtmlReporteEjecutivoPdf(html: string): string {
  if (!html.trim() || html.includes(`id="${MARCA_ESTILOS_IMPRESION}"`)) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${ESTILOS_IMPRESION}\n</head>`);
  }
  return `${ESTILOS_IMPRESION}\n${html}`;
}

export { MARCA_ESTILOS_IMPRESION };
