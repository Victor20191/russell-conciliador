import { ajustarHtmlAMarca, logoHtml } from "@/lib/marca/html";
import { signosDeMarca } from "./signos";

const MARCA = "rd-maquetacion-graficos";
/** La sección no anida otras `<section>`: basta cortar en su primer cierre. */
const SECCION_PROXIMOS_PASOS = /<section\b[^>]*\bid=["']proximos-pasos["'][^>]*>[\s\S]*?<\/section>/i;
const ESTILOS = `<style id="${MARCA}">
/* Las tablas de las barras reservan a las cifras su ancho real. */
#rd-graficos-uso table[role="presentation"] {
  table-layout: auto !important;
}
#rd-graficos-uso table[role="presentation"] td {
  border: 0 !important;
}
/* Detalle por usuario: los encabezados numéricos no se parten a mitad de palabra
   (los reportes guardados antes repartían 26/12/11/51 % con más relleno). */
#rd-detalle-usuarios th:nth-child(1) { width: 24% !important; }
#rd-detalle-usuarios th:nth-child(2) { width: 15% !important; }
#rd-detalle-usuarios th:nth-child(3) { width: 12% !important; }
#rd-detalle-usuarios th:nth-child(4) { width: 49% !important; }
#rd-detalle-usuarios th:nth-child(2),
#rd-detalle-usuarios th:nth-child(3) {
  padding-left: 0.45rem !important;
  padding-right: 0.45rem !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
</style>`;

/**
 * Corrección visual de documentos nuevos y guardados; no altera sus cifras.
 * Los reportes generados antes de aplicar el Manual de Marca llevaban el nombre
 * de la plataforma escrito como rótulo: se cambia por el logotipo oficial, y sus
 * colores y tipografías se llevan a la paleta y a Lato, y sus ▲, ▼ y «→» a los
 * glifos actuales (`signosDeMarca`). Los guardados antes del 25/Nov/2026 traían
 * «Próximos pasos» (frases fijas, sin datos): se quitan como en los nuevos.
 */
export function ajustarMaquetacionReporte(html: string): string {
  if (!html.trim()) return html;
  const sinProximosPasos = html.replace(SECCION_PROXIMOS_PASOS, "");
  const conMarca = ajustarHtmlAMarca(signosDeMarca(sinProximosPasos).replace(/<div class="marca">[^<]*<\/div>/i, logoHtml({ ancho: 180 })));
  if (conMarca.includes(`id="${MARCA}"`)) return conMarca;
  return /<\/head>/i.test(conMarca)
    ? conMarca.replace(/<\/head>/i, `${ESTILOS}\n</head>`)
    : `${ESTILOS}\n${conMarca}`;
}
