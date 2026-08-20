import type { ResumenAdopcion } from "./adopcion";
import type { ResumenUsoFactual } from "./metricas";

export type NovedadReporteEjecutivoContexto = {
  numero: string;
  titulo: string;
  resumen: string | null;
  estado: string;
  publicadoEn: string | null;
  cambios: Array<{
    tipo: string;
    titulo: string;
    descripcion: string;
    modulo: string | null;
    ruta: string | null;
    comoOperar: string | null;
    ejemplo: string | null;
    estadoFuncionalidad: string;
  }>;
};

export const SISTEMA_REPORTE_EJECUTIVO =
  "Eres un redactor de reportes de uso y avances para gerentes y socios de firmas de revisoría fiscal en Colombia. Presentas conclusiones, alertas y decisiones antes del detalle. Escribes en español claro, directo y sin tecnicismos. No inventas datos ni afirmas causas que la evidencia no demuestre. Debes incluir exactamente el marcador HTML indicado para que el sistema agregue los gráficos y el detalle factual por usuario. No generas botones, llamadas comerciales ni controles no funcionales.";

/**
 * Garantía final para el texto visible: si el modelo ignora la instrucción de
 * lenguaje, el documento que se muestra, copia o descarga conserva términos
 * cotidianos para gerencia.
 */
export function normalizarTerminologiaVisibleReporte(contenido: string): string {
  return contenido
    .replace(/resumen ejecutivo de uso y avances/gi, "Resumen de uso y avances")
    .replace(/resumen ejecutivo/gi, "Lo más importante")
    .replace(/reportes ejecutivos/gi, "Reportes para gerencia")
    .replace(/reporte ejecutivo/gi, "Reporte para gerencia")
    .replace(/informes ejecutivos/gi, "Reportes para gerencia")
    .replace(/informe ejecutivo/gi, "Reporte para gerencia")
    .replace(/presentación ejecutiva/gi, "presentación para gerencia")
    .replace(/tono ejecutivo/gi, "tono claro para gerencia")
    .replace(/\bejecutiv[oa]s?\b/gi, "para gerencia")
    .replace(/Reporte para gerencia para el cliente/gi, "Reporte para gerencia del cliente");
}

export function construirPromptReporteEjecutivo(params: {
  uso: ResumenUsoFactual;
  adopcion: ResumenAdopcion;
  novedades: NovedadReporteEjecutivoContexto[];
}): string {
  return [
    "Genera un REPORTE DE USO Y AVANCES de Russell Diagnóstico para gerentes y socios de la firma de revisoría fiscal.",
    "Debe permitir entender lo esencial y decidir qué atender en una lectura de 3 a 5 minutos. Las conclusiones van primero; el detalle queda como respaldo después.",
    "No uses formato de newsletter, registro de cambios, manual técnico ni pieza comercial.",
    "El lector no necesita conocer cómo funciona la plataforma por dentro.",
    "",
    "LENGUAJE GERENCIAL OBLIGATORIO:",
    "- Español de Colombia, claro, directo y profesional.",
    "- Frases cortas, párrafos de máximo 3 oraciones y viñetas de una sola idea.",
    "- Explica primero el resultado y luego su significado para la operación.",
    "- Usa términos de negocio: «inicios de sesión», «operaciones registradas», «uso de módulos», «mejoras aprovechadas» y «asuntos por atender».",
    "- Escribe sin tecnicismos: evita nombres internos, códigos, rutas web, siglas innecesarias y explicaciones de arquitectura.",
    "- No uses tono publicitario, adjetivos grandilocuentes, introducciones largas ni repitas una cifra en varias secciones.",
    "- No uses en el documento las palabras «ejecutivo» ni «ejecutiva». Prefiere expresiones comunes como «para gerencia», «lo más importante», «uso» y «avances».",
    "- Distingue siempre un hecho comprobado de una interpretación prudente.",
    "",
    "Entrega exclusivamente un documento HTML completo y válido. Debe empezar con <!DOCTYPE html> y contener <html>, <head>, <style> y <body>.",
    "No incluyas Markdown, cercas de código, explicación fuera del HTML, scripts, enlaces externos, imágenes externas ni recursos remotos.",
    "",
    "ESTRUCTURA OBLIGATORIA Y ORDEN FIJO:",
    "",
    "1) CABECERA COMPACTA",
    "   - Texto superior: «RUSSELL DIAGNÓSTICO».",
    "   - Título: «Resumen de uso y avances».",
    "   - Período exacto de la base factual.",
    "   - Sin portada de página completa, subtítulos creativos ni texto promocional.",
    "",
    "2) LO MÁS IMPORTANTE — debe caber en la primera página",
    "   - Abre directamente con 3 a 5 conclusiones priorizadas.",
    "   - Cada conclusión debe combinar: hecho exacto + qué significa para la gerencia.",
    "   - Incluye solo los datos decisivos del período; no enumeres todo lo disponible.",
    "   - Si no hay actividad o evidencia suficiente, dilo de forma directa.",
    "",
    "3) DECISIONES Y ASUNTOS POR ATENDER",
    "   - Presenta de 2 a 4 asuntos priorizados, únicamente si la base factual los sustenta.",
    "   - Para cada asunto indica en una línea: situación, impacto operativo y acción sugerida.",
    "   - No asignes responsables, fechas, ahorros, causas ni metas que no estén en los datos.",
    "   - Si no hay alertas sustentadas, escribe: «No se identificaron asuntos críticos con la información disponible». No inventes una alerta para llenar la sección.",
    "",
    "4) INDICADORES CLAVE DEL PERÍODO",
    "   - Muestra hasta 4 indicadores: operaciones registradas, usuarios, clientes e inicios de sesión, siempre con los valores exactos disponibles.",
    "   - Añade un análisis de máximo 2 párrafos breves sobre concentración, ritmo de uso y participación; evita convertir conteos en conclusiones causales.",
    "   - INMEDIATAMENTE después del análisis escribe EXACTAMENTE esta línea y nada más en su lugar: <section id=\"rd-graficos-uso\"></section>",
    "   - Esa sección vacía es un marcador que el sistema reemplaza por gráficos y detalle factual. NO dibujes barras, NO inventes tablas y NO rellenes el marcador.",
    "",
    "5) AVANCES RELEVANTES",
    "   - Selecciona máximo 5 novedades que tengan mayor impacto operativo o evidencia de uso.",
    "   - Resume cada una en 2 o 3 líneas: qué cambió, para qué le sirve al equipo y si existe evidencia de uso.",
    "   - Agrupa correcciones menores en una sola lista de máximo 5 viñetas; no hagas una sección extensa por cada cambio.",
    "   - Omite rutas web, pasos técnicos y detalles de implementación. Usa cómoOperar/ejemplo solo para explicar el beneficio de forma sencilla.",
    "",
    "6) PRÓXIMOS PASOS",
    "   - Cierra con 2 a 4 acciones concretas, prudentes y derivadas de los datos.",
    "   - Usa verbos directos: revisar, priorizar, acompañar, medir o confirmar.",
    "   - No repitas el resumen ni agregues una despedida comercial.",
    "   - Footer: «Reporte de uso y avances — Russell Diagnóstico».",
    "",
    "EXTENSIÓN Y DISEÑO:",
    "- La parte narrativa completa, sin contar los gráficos y el detalle factual insertados por el sistema, debe poder leerse en 3 a 5 minutos.",
    "- Prioriza listas y bloques cortos. Evita muros de texto, anexos, glosarios, índices y tablas narrativas.",
    "- Diseño de informe empresarial sobrio: fondo blanco o #fbfbfc, texto #1a2330, títulos #0e1721 y acentos #142b4a / #2f6fa7.",
    "- Títulos en Georgia, 'Times New Roman', serif; cuerpo en 'Helvetica Neue', Helvetica, Arial, sans-serif.",
    "- Título principal entre 24 y 30px. No uses una portada ornamental ni títulos gigantes.",
    "- Indicadores en tarjetas compactas; tablas solo para datos realmente comparables.",
    "- Márgenes consistentes y @media print para tamaño carta. No hagas indivisible una sección grande; evita encabezados huérfanos.",
    "- CSS 100% autocontenido en <style>. Sin fuentes externas, emojis, iconos decorativos, degradados, sombras fuertes ni colores morados.",
    "",
    "PROHIBIDO EN EL HTML:",
    "- Botones, <button>, enlaces de apariencia de botón, llamadas a la acción y controles que no funcionen.",
    "- Scripts, iframes, formularios, inputs, canvas, SVG de gráficos inventados y recursos remotos.",
    "- Detalle técnico sobre código, APIs, bases de datos, modelos de IA, tokens, bitácoras, arquitectura o procesos internos.",
    "- Secciones llamadas «Introducción», «Crónica», «Lo que liberamos», «Leer más» o «Ver detalle».",
    "",
    "REGLAS FACTUALES OBLIGATORIAS:",
    "- Usa únicamente números, fechas, usuarios, acciones, módulos y novedades presentes en las bases factuales.",
    "- No inventes porcentajes de ahorro, costos, tiempos, causas, promesas de producto ni métricas.",
    "- El porcentaje de adopción se muestra solo si viene en la base; si es null, escribe «No calculable» o no incluyas una cifra.",
    "- «Sin evidencia» significa únicamente que no hay una acción medible en la información disponible; no significa que la mejora no se haya usado.",
    "- No digas que recibiste un JSON ni que eres una IA.",
    "- Si falta un dato necesario, escribe «No documentado» o sencillamente omítelo.",
    "- No inventes funcionalidades: usa solo el contexto de novedades.",
    "",
    "Base factual de USO:",
    JSON.stringify(params.uso),
    "",
    "Base factual de ADOPCIÓN:",
    JSON.stringify({
      totalCambios: params.adopcion.totalCambios,
      evaluables: params.adopcion.evaluables,
      usadas: params.adopcion.usadas,
      sinEvidencia: params.adopcion.sinEvidencia,
      noMedibles: params.adopcion.noMedibles,
      porcentajeAdopcion: params.adopcion.porcentajeAdopcion,
      porEstado: params.adopcion.porEstado,
      items: params.adopcion.items,
    }),
    "",
    "Contexto de NOVEDADES publicadas:",
    JSON.stringify(params.novedades),
  ].join("\n");
}
