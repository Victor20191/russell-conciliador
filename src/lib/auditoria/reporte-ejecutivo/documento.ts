import { z } from "zod";
import type { ResumenAdopcion } from "./adopcion";
import { construirSeccionGraficosHtml } from "./graficos";
import type { ResumenUsoFactual } from "./metricas";
import { alertaComparativo, type ComparativoUso, type VariacionUso } from "./comparativo";
import type { NovedadReporteEjecutivoContexto } from "./prompt";
import type { ReporteEjecutivoUso } from "./reportes";

// Vocabulario editorial cerrado: la IA puede seleccionar orientaciones, pero no
// introducir personas, cifras o afirmaciones nuevas en el documento factual.
const LECTURAS = [
  "La actividad registrada describe las operaciones observadas durante el período; no permite concluir por sí sola productividad o calidad del trabajo.",
  "Las operaciones, las visitas y los inicios de sesión describen aspectos distintos del uso y deben interpretarse por separado.",
  "La actividad de un módulo ofrece evidencia relacionada, pero no confirma el uso de cada funcionalidad individual.",
] as const;
const RECOMENDACIONES = [
  "Revisar el detalle de actividad junto con el contexto operativo del equipo.",
  "Validar con el equipo el uso de las funcionalidades sin actividad relacionada.",
  "Distinguir falta de evidencia de falta de uso antes de tomar decisiones.",
] as const;
const LecturaSchema = z.object({
  lectura: z.enum(LECTURAS),
  recomendaciones: z.array(z.enum(RECOMENDACIONES)).max(3),
}).strict();
export type LecturaConsistente = z.infer<typeof LecturaSchema>;

type Contexto = {
  uso: ResumenUsoFactual;
  adopcion: ResumenAdopcion;
  novedades: NovedadReporteEjecutivoContexto[];
  /** Variación frente al reporte anterior; ausente cuando no hay con qué comparar. */
  comparativo?: ComparativoUso | null;
};

export function construirPromptLecturaConsistente({ uso, adopcion }: Contexto): string {
  return [
    "Selecciona una lectura editorial y hasta tres recomendaciones pertinentes. Devuelve exclusivamente JSON estricto con las claves lectura y recomendaciones.",
    "Copia literalmente los textos permitidos. No agregues cifras, porcentajes, nombres de personas, HTML, conclusiones causales ni texto nuevo.",
    `Lecturas permitidas: ${JSON.stringify(LECTURAS)}`,
    `Recomendaciones permitidas: ${JSON.stringify(RECOMENDACIONES)}`,
    `Contexto: ${JSON.stringify({ hayOperaciones: uso.totalAcciones > 0, hayNavegaciones: uso.totalNavegaciones > 0, hayFuncionalidadesSinEvidencia: adopcion.sinEvidencia > 0 })}`,
  ].join("\n");
}

export function parsearLecturaConsistente(texto: string): LecturaConsistente | null {
  if (texto.length > 2500 || /[\d%<>]/u.test(texto)) return null;
  try {
    const parsed = LecturaSchema.safeParse(JSON.parse(texto));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function escapeHtml(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const numero = (valor: number) => new Intl.NumberFormat("es-CO").format(valor);

/** Colores del banner de alerta, en línea porque el HTML viaja suelto (correo/PDF). */
const ESTILO_ALERTA = {
  alza: "background:#e5f0e8;border-left:6px solid #2f6b3f;color:#2f6b3f",
  baja: "background:#f8e1de;border-left:6px solid #9a2a22;color:#9a2a22",
  estable: "background:#f7f8fa;border-left:6px solid #566273;color:#2a3441",
} as const;

const SIGNO = { subio: "▲", bajo: "▼", igual: "=" } as const;

/** Verde sube, rojo baja, gris igual. Mismos tonos del banner y de la pantalla. */
const COLOR_VARIACION = { subio: "#2f6b3f", bajo: "#9a2a22", igual: "#566273" } as const;

const COLOR_ALERTA = { alza: "#2f6b3f", baja: "#9a2a22", estable: "#566273" } as const;

/** Flecha del banner: la del NIVEL, no la de la medida (un alza del 2 % es «estable»). */
const SIGNO_ALERTA = { alza: "▲", baja: "▼", estable: "=" } as const;

function filaVariacion(v: VariacionUso): string {
  const pct = v.variacionPct == null ? "—" : `${v.variacionPct > 0 ? "+" : ""}${numero(v.variacionPct)} %`;
  const color = COLOR_VARIACION[v.direccion];
  return `<tr><td>${escapeHtml(v.etiqueta)}</td><td>${numero(v.previo)}</td><td style="color:${color};font-weight:600">${numero(v.actual)}</td><td style="color:${color};font-weight:600;white-space:nowrap">${SIGNO[v.direccion]} ${escapeHtml(pct)}</td></tr>`;
}

/**
 * Sección «¿Subió o bajó el uso?»: alerta visible arriba y el detalle debajo.
 * Todo se calcula en código; la IA no interviene en estas cifras.
 */
function seccionComparativo(comparativo?: ComparativoUso | null): string {
  if (!comparativo) return "";
  const c = comparativo;
  const alerta = alertaComparativo(c);
  const referencia = c.base === "reporte_anterior"
    ? `reporte anterior (${c.previo.desde} → ${c.previo.hasta}${c.generadoEn ? `, generado el ${c.generadoEn.slice(0, 10)}` : ""})`
    : `período anterior (${c.previo.desde} → ${c.previo.hasta})`;
  const aviso = c.comparable
    ? ""
    : `<p class="nota">Los períodos no miden lo mismo (${numero(c.previo.dias)} días frente a ${numero(c.actual.dias)}): la comparación se lee sobre el promedio diario, no sobre los totales.</p>`;
  const familias = c.porFamilia.slice(0, 8).map(filaVariacion).join("");
  return `<section id="comparativo"><h2>¿Subió o bajó el uso?</h2>
<div style="${ESTILO_ALERTA[alerta.nivel]};padding:12px 14px;margin:12px 0;border-radius:4px"><strong style="display:block;font-size:15px">${SIGNO_ALERTA[alerta.nivel]} ${escapeHtml(alerta.titulo)}</strong><span style="font-size:12px">${escapeHtml(alerta.mensaje)}</span></div>
<p>Comparación del período actual (${escapeHtml(c.actual.desde)} → ${escapeHtml(c.actual.hasta)}) contra el ${escapeHtml(referencia)}.</p>${aviso}
<table><thead><tr><th>Indicador</th><th>Anterior</th><th>Actual</th><th>Variación</th></tr></thead><tbody>${[...c.totales, c.promedioDiario].map(filaVariacion).join("")}</tbody></table>
${familias ? `<h2 style="font-size:15px">Por módulo o proceso</h2><table><thead><tr><th>Módulo o proceso</th><th>Anterior</th><th>Actual</th><th>Variación</th></tr></thead><tbody>${familias}</tbody></table>` : ""}
<p class="nota">Una variación describe el volumen de operaciones registradas; no mide por sí sola productividad ni calidad del trabajo.</p></section>
`;
}

export function construirDocumentoConsistente({ uso, adopcion, novedades, comparativo, lecturaIA, corte }: Contexto & {
  lecturaIA?: LecturaConsistente | null;
  corte?: string | null;
}): ReporteEjecutivoUso {
  const titulo = "Resumen de uso y avances";
  const lectura = LecturaSchema.safeParse(lecturaIA);
  const cambios = novedades.flatMap((version) => version.cambios.map((cambio) => ({ version: version.numero, ...cambio })));
  const filas = cambios.map((cambio) => `<tr><td>${escapeHtml(cambio.version)}</td><td>${escapeHtml(cambio.titulo)}</td><td>${escapeHtml(cambio.descripcion)}</td></tr>`).join("");
  const decision = adopcion.sinEvidencia > 0
    ? `Hay ${numero(adopcion.sinEvidencia)} funcionalidades sin actividad relacionada. Conviene revisar su contexto operativo antes de concluir que no se utilizan.`
    : "No se identificaron asuntos críticos con la información disponible. Los registros de actividad no permiten evaluar por sí solos la calidad del trabajo.";
  const orientacion = lectura.success ? `<p>${escapeHtml(lectura.data.lectura)}</p>` : "";
  const recomendaciones = lectura.success ? [...new Set(lectura.data.recomendaciones)] : [];
  const graficos = construirSeccionGraficosHtml({ uso, adopcion });
  return {
    titulo,
    html: `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title><style>
@page{size:letter;margin:16mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#1a2330;font:13px/1.55 'Helvetica Neue',Helvetica,Arial,sans-serif}main{max-width:920px;margin:auto;padding:32px}header{border-bottom:2px solid #142b4a;padding-bottom:16px;margin-bottom:24px}.marca{font-size:11px;letter-spacing:2px;color:#142b4a;font-weight:bold}h1,h2{font-family:Georgia,'Times New Roman',serif;color:#142b4a}h1{font-size:28px;margin:8px 0}h2{font-size:20px;margin:24px 0 12px;break-after:avoid}p{margin:8px 0}section{margin:20px 0}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}th,td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid #dbe2ea;overflow-wrap:anywhere}th{background:#eef2f6}th:first-child{width:16%}tr{break-inside:avoid}li{margin:5px 0}.nota{color:#566273;font-size:11px}footer{border-top:1px solid #dbe2ea;margin-top:24px;padding-top:10px}@media print{main{max-width:none;padding:0}thead{display:table-header-group}}@media(max-width:600px){main{padding:16px}}
</style></head><body><main><header><div class="marca">RUSSELL DIAGNÓSTICO</div><h1>${titulo}</h1><p>Período: ${escapeHtml(uso.periodoDesde.slice(0, 10))} → ${escapeHtml(uso.periodoHasta.slice(0, 10))}</p><p class="nota">Alcance temporal UTC: ${escapeHtml(uso.periodoDesde)} → ${escapeHtml(uso.periodoHasta)}</p>${corte ? `<p class="nota">Fecha de corte: ${escapeHtml(corte)}</p>` : ""}</header>
<section id="lo-mas-importante"><h2>Lo más importante</h2><ul><li>Operaciones registradas: <strong>${numero(uso.totalAcciones)}</strong>.</li><li>Usuarios con operaciones: <strong>${numero(uso.totalUsuarios)}</strong>; clientes con operaciones: <strong>${numero(uso.totalClientes)}</strong>.</li><li>Visitas a módulos operativos: <strong>${numero(uso.totalNavegaciones)}</strong>; inicios de sesión: <strong>${numero(uso.totalConexiones)}</strong>. Se contabilizan por separado.</li><li>Funcionalidades con actividad relacionada: <strong>${numero(adopcion.usadas)}</strong>; sin actividad relacionada: <strong>${numero(adopcion.sinEvidencia)}</strong>.</li>${comparativo ? (() => { const a = alertaComparativo(comparativo); return `<li>Frente al ${comparativo.base === "reporte_anterior" ? "reporte anterior" : "período anterior"}: <strong style="color:${COLOR_ALERTA[a.nivel]}">${SIGNO_ALERTA[a.nivel]} ${escapeHtml(a.titulo)}</strong>.</li>`; })() : ""}</ul>${orientacion}</section>
<section id="decisiones"><h2>Decisiones y asuntos por atender</h2><p>${decision}</p><p>La actividad de un módulo no confirma el uso de una funcionalidad individual ni permite atribuirlo a una persona concreta.</p></section>
${seccionComparativo(comparativo)}<section id="indicadores"><h2>Indicadores de uso</h2>${graficos}</section>
<section id="avances"><h2>Avances publicados</h2>${filas ? `<table><thead><tr><th>Versión</th><th>Avance</th><th>Descripción</th></tr></thead><tbody>${filas}</tbody></table>` : "<p>No hay avances publicados en el alcance seleccionado.</p>"}</section>
<section id="proximos-pasos"><h2>Próximos pasos</h2><ul><li>Revisar los indicadores con el contexto operativo del período.</li>${adopcion.sinEvidencia > 0 ? "<li>Consultar con el equipo las funcionalidades sin actividad relacionada antes de definir acompañamiento.</li>" : ""}${uso.totalAcciones === 0 ? "<li>Comprobar el alcance y la disponibilidad de registros antes de interpretar la ausencia de operaciones.</li>" : ""}${recomendaciones.map((texto) => `<li>${escapeHtml(texto)}</li>`).join("")}</ul></section><footer class="nota">Fuente: registros de actividad y novedades incluidas en el alcance del reporte.</footer></main></body></html>`,
  };
}
