// Gráficos de barras HTML/CSS para el reporte ejecutivo.
// Deterministas: se construyen en código a partir del resumen factual (sin IA).

import type { ResumenAdopcion } from "./adopcion";
import type { ResumenUsoFactual } from "./metricas";

const MARCA_GRAFICOS = "rd-graficos-uso";

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pct(valor: number, max: number): number {
  if (max <= 0 || !Number.isFinite(valor) || valor <= 0) return 0;
  return Math.max(2, Math.round((valor / max) * 100)); // mínimo 2% para visibilidad
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

type Barra = { etiqueta: string; valor: number; sub?: string };

function graficoBarrasHorizontales(params: {
  id: string;
  titulo: string;
  subtitulo?: string;
  items: Barra[];
  colorBarra?: string;
  vacio?: string;
}): string {
  const color = params.colorBarra ?? "#142b4a";
  if (params.items.length === 0) {
    return `
<section class="rd-chart" id="${params.id}" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">${escapeHtml(params.titulo)}</h3>
  <p style="margin:0;font-size:12.5px;color:#566273;">${escapeHtml(params.vacio ?? "Sin datos en el período.")}</p>
</section>`;
  }

  const max = Math.max(...params.items.map((i) => i.valor), 1);
  const filas = params.items
    .map((item) => {
      const ancho = pct(item.valor, max);
      const sub = item.sub
        ? `<span style="display:block;font-size:11px;color:#626e7e;margin-top:1px;">${escapeHtml(item.sub)}</span>`
        : "";
      return `
    <div style="margin:0 0 0.65rem;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.75rem;margin-bottom:0.28rem;">
        <div style="min-width:0;flex:1;">
          <span style="font-size:12.5px;color:#1a2330;font-weight:500;">${escapeHtml(item.etiqueta)}</span>
          ${sub}
        </div>
        <span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:#142b4a;white-space:nowrap;">${fmtNum(item.valor)}</span>
      </div>
      <div style="height:8px;border-radius:999px;background:#eff1f4;overflow:hidden;">
        <div style="height:100%;width:${ancho}%;border-radius:999px;background:${color};"></div>
      </div>
    </div>`;
    })
    .join("");

  const subtitulo = params.subtitulo
    ? `<p style="margin:0 0 0.85rem;font-size:12px;color:#566273;">${escapeHtml(params.subtitulo)}</p>`
    : "";

  return `
<section class="rd-chart" id="${params.id}" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">${escapeHtml(params.titulo)}</h3>
  ${subtitulo}
  ${filas}
</section>`;
}

function graficoAdopcionDonutLike(adopcion: ResumenAdopcion): string {
  const total = adopcion.totalCambios;
  if (total === 0) {
    return `
<section class="rd-chart" id="rd-chart-adopcion" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Adopción de novedades</h3>
  <p style="margin:0;font-size:12.5px;color:#566273;">Sin novedades evaluables en el alcance.</p>
</section>`;
  }

  const segmentos: Array<{ label: string; valor: number; color: string }> = [
    { label: "Usadas", valor: adopcion.usadas, color: "#2f6b3f" },
    { label: "Sin evidencia", valor: adopcion.sinEvidencia, color: "#b8801f" },
    { label: "No medibles", valor: adopcion.noMedibles, color: "#626e7e" },
  ].filter((s) => s.valor > 0);

  const max = Math.max(...segmentos.map((s) => s.valor), 1);
  const filas = segmentos
    .map((s) => {
      const ancho = pct(s.valor, max);
      const pctTotal = Math.round((s.valor / total) * 1000) / 10;
      return `
    <div style="margin:0 0 0.65rem;">
      <div style="display:flex;justify-content:space-between;gap:0.75rem;margin-bottom:0.28rem;">
        <span style="font-size:12.5px;color:#1a2330;font-weight:500;">${escapeHtml(s.label)}</span>
        <span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:#142b4a;">${fmtNum(s.valor)} <span style="color:#626e7e;font-weight:500;">(${pctTotal}%)</span></span>
      </div>
      <div style="height:10px;border-radius:999px;background:#eff1f4;overflow:hidden;">
        <div style="height:100%;width:${ancho}%;border-radius:999px;background:${s.color};"></div>
      </div>
    </div>`;
    })
    .join("");

  const pctAdop =
    adopcion.porcentajeAdopcion == null
      ? "No calculable"
      : `${adopcion.porcentajeAdopcion}% sobre evaluables`;

  return `
<section class="rd-chart" id="rd-chart-adopcion" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Adopción de novedades</h3>
  <p style="margin:0 0 0.85rem;font-size:12px;color:#566273;">${escapeHtml(pctAdop)} · ${fmtNum(total)} cambios en alcance</p>
  ${filas}
</section>`;
}

/**
 * Sección completa de gráficos del reporte (módulos, usuarios, acciones, clientes, adopción).
 * HTML autocontenido con estilos inline (compatible con PDF y correo).
 */
export function construirSeccionGraficosHtml(params: {
  uso: ResumenUsoFactual;
  adopcion: ResumenAdopcion;
}): string {
  const { uso, adopcion } = params;

  const modulos = graficoBarrasHorizontales({
    id: "rd-chart-modulos",
    titulo: "Módulos y procesos más usados",
    subtitulo: "Acciones de bitácora agrupadas por familia de proceso",
    items: uso.porFamilia.slice(0, 10).map((f) => ({
      etiqueta: f.nombre,
      valor: f.total,
    })),
    colorBarra: "#142b4a",
    vacio: "No hubo acciones registradas en el período.",
  });

  const usuarios = graficoBarrasHorizontales({
    id: "rd-chart-usuarios",
    titulo: "Usuarios con más actividad",
    subtitulo: "Top de usuarios por número de acciones en el período",
    items: uso.topUsuarios.slice(0, 10).map((u) => ({
      etiqueta: u.usuario,
      valor: u.total,
      sub: u.porFamilia
        .slice(0, 2)
        .map((f) => f.nombre)
        .join(" · ") || undefined,
    })),
    colorBarra: "#2f6fa7",
    vacio: "No hubo usuarios con acciones en el período.",
  });

  const acciones = graficoBarrasHorizontales({
    id: "rd-chart-acciones",
    titulo: "Acciones más frecuentes",
    subtitulo: "Tipos de operación con mayor volumen",
    items: uso.topAcciones.slice(0, 10).map((a) => ({
      etiqueta: a.nombre,
      valor: a.total,
    })),
    colorBarra: "#1e3a5f",
    vacio: "Sin acciones en el período.",
  });

  const clientes = graficoBarrasHorizontales({
    id: "rd-chart-clientes",
    titulo: "Clientes con más operaciones",
    subtitulo: "Actividad asociada a cliente en la bitácora",
    items: uso.topClientes.slice(0, 8).map((c) => ({
      etiqueta: c.nombre,
      valor: c.total,
    })),
    colorBarra: "#345a82",
    vacio: "No hubo operaciones vinculadas a clientes en el período.",
  });

  const adopcionChart = graficoAdopcionDonutLike(adopcion);

  // Serie diaria compacta (últimos 14 puntos si hay más).
  const serie = uso.serieDiaria.slice(-14);
  const maxDia = Math.max(...serie.map((d) => d.total), 1);
  const barrasDia =
    serie.length === 0
      ? `<p style="margin:0;font-size:12.5px;color:#566273;">Sin actividad diaria en el período.</p>`
      : `<div style="display:flex;align-items:flex-end;gap:4px;height:88px;padding-top:0.5rem;">
${serie
  .map((d) => {
    const h = Math.max(4, Math.round((d.total / maxDia) * 80));
    const label = d.fecha.slice(5); // MM-DD
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;" title="${escapeHtml(d.fecha)}: ${fmtNum(d.total)}">
  <div style="width:100%;max-width:18px;height:${h}px;border-radius:3px 3px 0 0;background:#142b4a;"></div>
  <span style="font-size:9px;color:#626e7e;margin-top:4px;transform:rotate(-45deg);transform-origin:top center;white-space:nowrap;">${escapeHtml(label)}</span>
</div>`;
  })
  .join("")}
</div>`;

  const actividadDiaria = `
<section class="rd-chart" id="rd-chart-diario" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Ritmo de uso diario</h3>
  <p style="margin:0 0 0.35rem;font-size:12px;color:#566273;">Acciones por día${serie.length < uso.serieDiaria.length ? " (últimos 14 días con datos en el rango)" : ""}</p>
  ${barrasDia}
</section>`;

  return `
<section id="${MARCA_GRAFICOS}" class="rd-graficos-uso" style="margin:1.75rem 0 2rem;">
  <h2 style="margin:0 0 0.35rem;font-family:Georgia,'Times New Roman',serif;font-size:1.35rem;color:#0e1721;border-left:3px solid #142b4a;padding-left:0.65rem;">Uso en gráficos</h2>
  <p style="margin:0 0 1rem;font-size:13px;color:#475160;">Distribución factual de la actividad del período. Las barras reflejan conteos exactos de la bitácora.</p>
  <div style="display:grid;grid-template-columns:1fr;gap:0;">
    ${modulos}
    ${usuarios}
    ${acciones}
    ${clientes}
    ${adopcionChart}
    ${actividadDiaria}
  </div>
</section>`;
}

/**
 * Inserta (o reemplaza) la sección de gráficos en el HTML del reporte.
 * Si la IA no la incluyó, se inyecta antes del footer o del cierre de body.
 */
export function inyectarGraficosEnHtml(html: string, seccionGraficos: string): string {
  if (!seccionGraficos.trim()) return html;

  // Si ya existe la marca, reemplazar el bloque completo.
  if (html.includes(`id="${MARCA_GRAFICOS}"`) || html.includes(`id='${MARCA_GRAFICOS}'`)) {
    return html.replace(
      /<section\b[^>]*\bid=["']rd-graficos-uso["'][^>]*>[\s\S]*?<\/section>/i,
      seccionGraficos.trim(),
    );
  }

  // Preferir insertar antes de un footer típico o de la sección de recomendaciones.
  const anclas = [
    /(<h[12][^>]*>\s*Recomendaciones)/i,
    /(<h[12][^>]*>\s*Cierre)/i,
    /(<footer\b)/i,
    /(Reporte de uso, adopción y novedades)/i,
    /(<\/body>)/i,
  ];

  for (const re of anclas) {
    if (re.test(html)) {
      return html.replace(re, `${seccionGraficos}\n$1`);
    }
  }

  return `${html}\n${seccionGraficos}`;
}

export { MARCA_GRAFICOS };
