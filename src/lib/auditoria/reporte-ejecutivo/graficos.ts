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

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** "2026-08-20" -> "20/08" (sin zona horaria: la fecha ya viene en formato local del reporte). */
function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return mes && dia ? `${dia}/${mes}` : fecha;
}

/** "2026-08-20" -> "Jueves". Se calcula en UTC para no depender de la zona del servidor. */
function diaSemana(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (!anio || !mes || !dia) return "";
  return DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()] ?? "";
}

function construirDetalleUsuariosHtml(uso: ResumenUsoFactual): string {
  const filas = uso.detalleUsuarios.length
    ? uso.detalleUsuarios
        .map((usuario) => {
          const acciones = usuario.accionesPrincipales.length
            ? usuario.accionesPrincipales
                .map((accion) => `${escapeHtml(accion.nombre)} (${fmtNum(accion.total)})`)
                .join(" · ")
            : "Sin acciones auditables registradas.";
          const familias = usuario.porFamilia.length
            ? `<span style="display:block;margin-top:0.25rem;font-size:10.5px;color:#626e7e;">Procesos: ${usuario.porFamilia
                .map((familia) => escapeHtml(familia.nombre))
                .join(" · ")}</span>`
            : "";

          const correo = usuario.correo
            ? `<span style="display:block;margin-top:0.15rem;font-size:10.5px;font-weight:400;color:#566273;word-break:break-all;">${escapeHtml(usuario.correo)}</span>`
            : `<span style="display:block;margin-top:0.15rem;font-size:10.5px;font-weight:400;color:#8a94a1;">Correo no documentado</span>`;

          return `
      <tr class="rd-user-row" style="break-inside:avoid;page-break-inside:avoid;">
        <td style="padding:0.62rem 0.7rem;border-bottom:1px solid #e7eaef;vertical-align:top;font-weight:600;color:#1a2330;">${escapeHtml(usuario.usuario)}${correo}</td>
        <td style="padding:0.62rem 0.7rem;border-bottom:1px solid #e7eaef;vertical-align:top;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#142b4a;">${fmtNum(usuario.conexiones)}</td>
        <td style="padding:0.62rem 0.7rem;border-bottom:1px solid #e7eaef;vertical-align:top;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#142b4a;">${fmtNum(usuario.totalAcciones)}</td>
        <td style="padding:0.62rem 0.7rem;border-bottom:1px solid #e7eaef;vertical-align:top;color:#2a3441;line-height:1.4;">${acciones}${familias}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" style="padding:0.85rem;text-align:center;color:#566273;">Sin conexiones ni acciones auditables en el período.</td></tr>`;

  return `
<section class="rd-user-detail" id="rd-detalle-usuarios" style="break-inside:auto;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #dce0e7;border-radius:10px;background:#fff;">
  <div class="rd-user-detail-heading" style="break-inside:avoid;break-after:avoid-page;page-break-after:avoid;">
    <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Detalle de actividad por usuario</h3>
    <p style="margin:0 0 0.85rem;font-size:12px;color:#566273;">Cada usuario se identifica con su nombre y su correo. Conexiones corresponde a inicios de sesión exitosos en el período. Las acciones provienen de la bitácora auditable y se muestran sin limitar usuarios.</p>
  </div>
  <div style="overflow:visible;">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px;">
      <thead style="display:table-header-group;">
        <tr style="background:#f2f7fc;color:#142b4a;">
          <th style="width:26%;padding:0.55rem 0.7rem;text-align:left;border-bottom:1px solid #dce0e7;">Usuario y correo</th>
          <th style="width:12%;padding:0.55rem 0.7rem;text-align:right;border-bottom:1px solid #dce0e7;">Conexiones</th>
          <th style="width:11%;padding:0.55rem 0.7rem;text-align:right;border-bottom:1px solid #dce0e7;">Acciones</th>
          <th style="width:51%;padding:0.55rem 0.7rem;text-align:left;border-bottom:1px solid #dce0e7;">Qué realizó en la app</th>
        </tr>
      </thead>
      <tbody>${filas}
      </tbody>
    </table>
  </div>
</section>`;
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 0.28rem;">
        <tbody><tr>
        <td valign="bottom" style="padding:0;vertical-align:bottom;">
          <span style="font-size:12.5px;color:#1a2330;font-weight:500;">${escapeHtml(item.etiqueta)}</span>
          ${sub}
        </td>
        <td valign="bottom" align="right" style="width:1%;padding:0 0 0 0.75rem;vertical-align:bottom;text-align:right;white-space:nowrap;"><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:#142b4a;white-space:nowrap;">${fmtNum(item.valor)}</span></td>
        </tr></tbody>
      </table>
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
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Adopción de nuevas funcionalidades</h3>
  <p style="margin:0;font-size:12.5px;color:#566273;">No hay funcionalidades publicadas en el alcance para revisar su actividad relacionada.</p>
</section>`;
  }

  const segmentos: Array<{ label: string; valor: number; color: string }> = [
    { label: "Con actividad relacionada", valor: adopcion.usadas, color: "#2f6b3f" },
    { label: "Sin actividad relacionada", valor: adopcion.sinEvidencia, color: "#b8801f" },
    { label: "No se puede medir", valor: adopcion.noMedibles, color: "#626e7e" },
  ].filter((s) => s.valor > 0);

  const max = Math.max(...segmentos.map((s) => s.valor), 1);
  const filas = segmentos
    .map((s) => {
      const ancho = pct(s.valor, max);
      const pctTotal = Math.round((s.valor / total) * 1000) / 10;
      return `
    <div style="margin:0 0 0.65rem;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 0.28rem;">
        <tbody><tr>
        <td valign="bottom" style="padding:0;vertical-align:bottom;"><span style="font-size:12.5px;color:#1a2330;font-weight:500;">${escapeHtml(s.label)}</span></td>
        <td valign="bottom" align="right" style="width:1%;padding:0 0 0 0.75rem;vertical-align:bottom;text-align:right;white-space:nowrap;"><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:#142b4a;">${fmtNum(s.valor)} <span style="color:#626e7e;font-weight:500;">(${pctTotal}%)</span></span></td>
        </tr></tbody>
      </table>
      <div style="height:10px;border-radius:999px;background:#eff1f4;overflow:hidden;">
        <div style="height:100%;width:${ancho}%;border-radius:999px;background:${s.color};"></div>
      </div>
    </div>`;
    })
    .join("");

  const pctAdop =
    adopcion.porcentajeAdopcion == null
      ? "Porcentaje no calculable"
      : `${adopcion.porcentajeAdopcion}% de las funcionalidades medibles tienen actividad relacionada`;

  return `
<section class="rd-chart" id="rd-chart-adopcion" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Adopción de nuevas funcionalidades</h3>
  <p style="margin:0 0 0.45rem;font-size:12px;color:#566273;">${escapeHtml(pctAdop)} · ${fmtNum(total)} funcionalidades en alcance</p>
  <p style="margin:0 0 0.85rem;font-size:12px;color:#566273;">La actividad corresponde al módulo relacionado. No confirma que una funcionalidad específica haya sido usada ni identifica usuarios. «Sin actividad relacionada» tampoco prueba que no se haya usado.</p>
  ${filas}
</section>`;
}

/**
 * Sección completa de gráficos del reporte (consultas, operaciones, usuarios, clientes y adopción).
 * HTML autocontenido con estilos inline (compatible con PDF y correo).
 */
export function construirSeccionGraficosHtml(params: {
  uso: ResumenUsoFactual;
  adopcion: ResumenAdopcion;
}): string {
  const { uso, adopcion } = params;

  const modulosConsultados = graficoBarrasHorizontales({
    id: "rd-chart-modulos-consultados",
    titulo: "Módulos más consultados",
    subtitulo: "Visitas de navegación a familias operativas publicadas; no se suman a las operaciones",
    items: uso.navegacionesPorFamilia.slice(0, 10).map((f) => ({
      etiqueta: f.nombre,
      valor: f.total,
    })),
    colorBarra: "#2f6fa7",
    vacio: "No hubo consultas a módulos operativos en el período.",
  });

  const operacionesPorProceso = graficoBarrasHorizontales({
    id: "rd-chart-operaciones-proceso",
    titulo: "Procesos con más operaciones registradas",
    subtitulo: "Acciones auditables agrupadas por familia de proceso; no incluyen visitas de navegación",
    items: uso.porFamilia.slice(0, 10).map((f) => ({
      etiqueta: f.nombre,
      valor: f.total,
    })),
    colorBarra: "#142b4a",
    vacio: "No hubo acciones registradas en el período.",
  });

  const usuarios = graficoBarrasHorizontales({
    id: "rd-chart-usuarios",
    titulo: "Usuarios con más actividad (top 5)",
    subtitulo: "Comparativo por número de acciones; el detalle siguiente conserva a todos los usuarios",
    items: uso.topUsuarios.slice(0, 5).map((u) => ({
      etiqueta: u.usuario,
      valor: u.total,
      sub:
        [
          u.correo ?? undefined,
          u.porFamilia
            .slice(0, 2)
            .map((f) => f.nombre)
            .join(" · ") || undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
    })),
    colorBarra: "#2f6fa7",
    vacio: "No hubo usuarios con acciones en el período.",
  });

  const detalleUsuarios = construirDetalleUsuariosHtml(uso);

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

  // Serie diaria en tabla (últimos 14 puntos si hay más): los datos quedan
  // legibles y alineados, en vez de barras verticales apretadas.
  const serie = uso.serieDiaria.slice(-14);
  const totalSerie = serie.reduce((acc, d) => acc + d.total, 0);
  const maxDia = Math.max(...serie.map((d) => d.total), 1);
  const cell = "padding:0.42rem 0.6rem;border-bottom:1px solid #e7eaef;";
  const filasDia = serie
    .map((d, i) => {
      const ancho = pct(d.total, maxDia);
      const pctPeriodo = totalSerie > 0 ? Math.round((d.total / totalSerie) * 1000) / 10 : 0;
      const fondo = i % 2 === 1 ? "background:#fafbfc;" : "";
      return `
        <tr style="${fondo}break-inside:avoid;page-break-inside:avoid;">
          <td style="${cell}color:#1a2330;font-weight:500;white-space:nowrap;">${escapeHtml(fechaCorta(d.fecha))}</td>
          <td style="${cell}color:#566273;white-space:nowrap;">${escapeHtml(diaSemana(d.fecha))}</td>
          <td style="${cell}text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#142b4a;white-space:nowrap;">${fmtNum(d.total)}</td>
          <td style="${cell}text-align:right;font-family:ui-monospace,Menlo,monospace;color:#566273;white-space:nowrap;">${pctPeriodo}%</td>
          <td style="${cell}width:40%;">
            <div style="height:8px;border-radius:999px;background:#eff1f4;overflow:hidden;">
              <div style="height:100%;width:${ancho}%;border-radius:999px;background:#142b4a;"></div>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const tablaDia =
    serie.length === 0
      ? `<p style="margin:0;font-size:12.5px;color:#566273;">Sin actividad diaria en el período.</p>`
      : `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px;">
      <thead style="display:table-header-group;">
        <tr style="background:#f2f7fc;color:#142b4a;">
          <th style="width:14%;padding:0.5rem 0.6rem;text-align:left;border-bottom:1px solid #dce0e7;">Fecha</th>
          <th style="width:16%;padding:0.5rem 0.6rem;text-align:left;border-bottom:1px solid #dce0e7;">Día</th>
          <th style="width:16%;padding:0.5rem 0.6rem;text-align:right;border-bottom:1px solid #dce0e7;">Acciones</th>
          <th style="width:14%;padding:0.5rem 0.6rem;text-align:right;border-bottom:1px solid #dce0e7;">% del total</th>
          <th style="width:40%;padding:0.5rem 0.6rem;text-align:left;border-bottom:1px solid #dce0e7;">Comparativo</th>
        </tr>
      </thead>
      <tbody>${filasDia}
      </tbody>
      <tfoot>
        <tr style="background:#f7f9fb;">
          <td colspan="2" style="padding:0.5rem 0.6rem;font-weight:600;color:#1a2330;">Total del período mostrado</td>
          <td style="padding:0.5rem 0.6rem;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#142b4a;">${fmtNum(totalSerie)}</td>
          <td colspan="2" style="padding:0.5rem 0.6rem;color:#566273;">${serie.length} ${serie.length === 1 ? "día con datos" : "días con datos"}</td>
        </tr>
      </tfoot>
    </table>`;

  const actividadDiaria = `
<section class="rd-chart" id="rd-chart-diario" style="break-inside:avoid;margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid #e7eaef;border-radius:10px;background:#fff;">
  <h3 style="margin:0 0 0.25rem;font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;color:#0e1721;font-weight:600;">Ritmo de uso diario</h3>
  <p style="margin:0 0 0.6rem;font-size:12px;color:#566273;">Acciones por día${serie.length < uso.serieDiaria.length ? " (últimos 14 días con datos en el rango)" : ""}</p>
  ${tablaDia}
</section>`;

  return `
<section id="${MARCA_GRAFICOS}" class="rd-graficos-uso" style="margin:1.75rem 0 2rem;">
  <div class="rd-graficos-heading" style="break-inside:avoid;break-after:avoid-page;page-break-after:avoid;">
    <h2 style="margin:0 0 0.35rem;font-family:Georgia,'Times New Roman',serif;font-size:1.35rem;color:#0e1721;border-left:3px solid #142b4a;padding-left:0.65rem;">Uso en gráficos</h2>
    <p style="margin:0 0 1rem;font-size:13px;color:#475160;">Distribución factual del período. Las consultas provienen de la navegación y las operaciones de la bitácora auditable; se muestran por separado e incluyen únicamente familias operativas publicadas.</p>
  </div>
  <div style="display:grid;grid-template-columns:1fr;gap:0;">
    ${modulosConsultados}
    ${operacionesPorProceso}
    ${usuarios}
    ${detalleUsuarios}
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
/**
 * Índice donde termina la <section> abierta en `inicio`, contando anidamiento.
 * Devuelve -1 si el HTML del modelo dejó la sección sin cerrar.
 */
function finDeSeccion(html: string, inicio: number): number {
  const re = /<section\b|<\/section\s*>/gi;
  re.lastIndex = inicio;
  let profundidad = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith("</")) {
      profundidad -= 1;
      if (profundidad === 0) return m.index + m[0].length;
    } else {
      profundidad += 1;
    }
  }
  return -1;
}

export function inyectarGraficosEnHtml(html: string, seccionGraficos: string): string {
  if (!seccionGraficos.trim()) return html;

  // Si ya existe la marca, reemplazar el bloque completo. El reemplazo NO puede
  // hacerse con un regex no-greedy: el bloque anida una <section> por gráfico y
  // se cortaría en el primer </section> interno, dejando los gráficos restantes
  // del modelo duplicados debajo de los factuales.
  const apertura = new RegExp(`<section\\b[^>]*\\bid=["']${MARCA_GRAFICOS}["'][^>]*>`, "i").exec(html);
  if (apertura) {
    const fin = finDeSeccion(html, apertura.index);
    const resto = fin > 0 ? html.slice(fin) : "";
    return `${html.slice(0, apertura.index)}${seccionGraficos.trim()}${resto}`;
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
