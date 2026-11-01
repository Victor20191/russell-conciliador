// Manual de usuario — el documento HTML que se imprime a PDF (puro).
//
// Sale de las MISMAS fichas de la ayuda en pantalla: no hay otro texto que mantener. Cada unidad
// empieza en una página nueva; así el generador cuenta las páginas de cada una por separado y
// pone los números del contenido.

import { RUTA_LOGO_BLANCO, logoHtml } from "@/lib/marca/html";
import { chipsDeRoles, rolesDeRegla, type RolesAyuda } from "../roles";
import type { Regla } from "../tipos";
import { etiquetaSolo, MARCADOR_MODULO, type AccionManual, type EtapaManual, type FichaManual, type TextoManual } from "./combinar";

export type PantallaManual = { id: string; ficha: FichaManual };
export type CapituloManual = { id: string; titulo: string; intro: string[]; pantallas: PantallaManual[] };
export type PasoManual = { numero: number; titulo: string; descripcion: string; regla: Regla; donde: string };

export type DatosManual = {
  version: string;
  /** Fecha de los permisos con que se generó, ya escrita («26 de octubre de 2026»). */
  fecha: string;
  roles: RolesAyuda;
  ciclo: PasoManual[];
  capitulos: CapituloManual[];
};

export type EntradaContenido = { id: string; titulo: string; nivel: 1 | 2 };
export type UnidadManual = { id: string; html: string; contenido: EntradaContenido[] };

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Texto de una ficha: escapado y con el marcador del módulo resaltado. */
const t = (s: string) =>
  esc(s).replaceAll(MARCADOR_MODULO, '<span class="mod">‹módulo›</span>');

function etiqueta(en: readonly string[] | undefined, contenedor: readonly string[]): string {
  const texto = etiquetaSolo(en, contenedor);
  return texto ? ` <span class="solo">${esc(texto)}</span>` : "";
}

function chips(regla: Regla, roles: RolesAyuda): string {
  const lista = chipsDeRoles(rolesDeRegla(regla, roles));
  if (lista.length === 0) return '<span class="sin-rol">Hoy ningún rol tiene este permiso.</span>';
  return lista
    .map((c) => `<span class="chip">${esc(c.texto)}${c.detalle ? `<span class="chip-det"> · ${esc(c.detalle)}</span>` : ""}</span>`)
    .join(" ");
}

function lista(items: readonly TextoManual[], contenedor: readonly string[], clase: string): string {
  if (items.length === 0) return "";
  return `<ul class="${clase}">${items.map((i) => `<li>${t(i.texto)}${etiqueta(i.en, contenedor)}</li>`).join("")}</ul>`;
}

function accion(a: AccionManual, contenedor: readonly string[], roles: RolesAyuda): string {
  const propio = a.en ?? contenedor;
  return `<div class="accion">
    <div class="accion-cab"><span class="boton">${t(a.nombre)}</span>${etiqueta(a.en, contenedor)}</div>
    <p class="que-hace">${t(a.queHace)}</p>
    <div class="quien"><span class="quien-etq">Quién</span> ${chips(a.regla, roles)}</div>
    ${lista(a.condiciones, propio, "condiciones")}
  </div>`;
}

function etapas(lista: readonly EtapaManual[], contenedor: readonly string[], roles: RolesAyuda): string {
  return lista
    .map((e, i) => {
      const propio = e.en ?? contenedor;
      return `<div class="etapa">
        <h4><span class="num">${i + 1}</span>${t(e.titulo)}${etiqueta(e.en, contenedor)}</h4>
        ${e.acciones.map((a) => accion(a, propio, roles)).join("")}
      </div>`;
    })
    .join("");
}

/** Una pantalla; sin título cuando se llama igual que su capítulo y va primero. */
function pantalla({ id, ficha: f }: PantallaManual, roles: RolesAyuda, conTitulo = true): string {
  const v = f.variantes;
  const partes: string[] = [conTitulo ? `<h2 id="${esc(id)}">${t(f.titulo)}</h2>` : "", `<p class="proposito">${t(f.proposito)}</p>`];
  if (f.antesDeEmpezar.length > 0) {
    partes.push(`<div class="antes"><h3>Antes de empezar</h3>${lista(f.antesDeEmpezar, v, "antes-lista")}</div>`);
  }
  if (f.etapas.length > 0 || f.pestanas.length > 0) {
    partes.push('<h3>Qué puedes hacer aquí</h3>');
    if (f.etapas.length > 0) partes.push(etapas(f.etapas, v, roles));
    for (const p of f.pestanas) {
      const propio = p.en ?? v;
      partes.push(`<div class="pestana">
        <h3 class="pestana-tit">Pestaña «${t(p.titulo)}»${etiqueta(p.en, v)}</h3>
        <p class="proposito">${t(p.proposito)}</p>
        ${etapas(p.etapas, propio, roles)}
      </div>`);
    }
  }
  if (f.estados.length > 0) {
    partes.push(`<h3>Estados y avisos</h3><table class="estados"><tbody>${f.estados
      .map((e) => `<tr><th><span class="estado">${t(e.etiqueta)}</span></th><td>${t(e.significado)}${etiqueta(e.en, v)}</td></tr>`)
      .join("")}</tbody></table>`);
  }
  if (f.preguntas.length > 0) {
    partes.push(`<h3>Preguntas frecuentes</h3>${f.preguntas
      .map((q) => `<div class="pregunta"><p class="p">${t(q.pregunta)}${etiqueta(q.en, v)}</p><p class="r">${t(q.respuesta)}</p></div>`)
      .join("")}`);
  }
  if (f.relacionadas.length > 0) {
    partes.push(`<p class="relacionado"><b>Relacionado:</b> ${f.relacionadas.map((r) => `${t(r.texto)}${etiqueta(r.en, v)}`).join(" · ")}</p>`);
  }
  return `<section class="pantalla">${partes.join("\n")}</section>`;
}

function portada(d: DatosManual): string {
  return `<div class="portada">
    ${logoHtml({ src: RUTA_LOGO_BLANCO, ancho: 240 })}
    <div class="portada-cuerpo">
      <p class="portada-sobre">Russell Conciliador · Manual de usuario</p>
      <h1>Qué se puede hacer en cada pantalla, quién lo hace y con qué condiciones</h1>
      <p class="portada-meta">Versión ${esc(d.version)} · ${esc(d.fecha)}</p>
    </div>
    <p class="portada-pie">Los roles de cada acción salen de los permisos vigentes en la plataforma el ${esc(d.fecha)}.</p>
  </div>`;
}

function contenido(entradas: EntradaContenido[], paginas: ReadonlyMap<string, number>): string {
  return `<h1 class="cap">Contenido</h1><ol class="toc">${entradas
    .map(
      (e) =>
        `<li class="toc-${e.nivel}"><a href="#${esc(e.id)}"><span class="toc-tit">${t(e.titulo)}</span><span class="toc-pag">${paginas.get(e.id) ?? ""}</span></a></li>`,
    )
    .join("")}</ol>`;
}

function comoUsar(d: DatosManual): string {
  return `<h1 class="cap" id="como-usar">Cómo usar este manual</h1>
  <p>Este manual reúne, pantalla por pantalla, lo que se puede hacer en Russell Conciliador, quién lo puede hacer y con qué condiciones. Es el mismo contenido de la ayuda que se abre con el botón <b>«?»</b> de la barra superior, junto a la campana: allí aparece solo la ayuda de la pantalla en que estás.</p>
  <h3>Cómo está organizada cada pantalla</h3>
  <ul class="antes-lista">
    <li><b>Para qué sirve:</b> el primer párrafo, debajo del nombre de la pantalla.</li>
    <li><b>Antes de empezar:</b> lo que conviene saber antes de usarla.</li>
    <li><b>Qué puedes hacer aquí:</b> las acciones en el orden del trabajo, agrupadas por etapas y, si la pantalla tiene pestañas, por pestaña. Cada acción lleva el nombre del botón o control tal como se ve en pantalla.</li>
    <li><b>Estados y avisos</b> y <b>Preguntas frecuentes</b>, cuando la pantalla los tiene.</li>
  </ul>
  <h3>Quién puede hacer cada acción</h3>
  <p>Debajo de cada acción aparecen los roles que pueden hacerla, tomados de los permisos vigentes el ${esc(d.fecha)}. Si un administrador cambia los permisos, la ayuda de la plataforma se actualiza sola; este documento muestra los de esa fecha.</p>
  <table class="estados"><tbody>
    <tr><th><span class="chip">Staff<span class="chip-det"> · sus clientes</span></span></th><td>Ese rol puede hacerlo solo en los clientes de su cartera: los que tiene asignados y, en el caso del Socio, los de los gerentes que le reportan.</td></tr>
    <tr><th><span class="chip">Gerente</span></th><td>Sin «sus clientes»: la acción no depende del cliente (por ejemplo, un catálogo o un parámetro de toda la plataforma).</td></tr>
    <tr><th><span class="chip">Todos los roles</span></th><td>La pueden hacer Staff, Senior, Gerente y Socio; con «cada uno en los clientes que consulta», cada quien en los de su cartera.</td></tr>
    <tr><th><span class="chip">Solo administradores</span></th><td>La hace la administración de la plataforma. Administrador y Superadministrador no se nombran en las demás acciones, aunque tengan el permiso.</td></tr>
  </tbody></table>
  <h3>Condiciones</h3>
  <ul class="condiciones"><li>Los puntos en este color son condiciones: lo que tiene que cumplirse para que la acción funcione.</li></ul>
  <h3>Módulos de conciliación</h3>
  <p>Los módulos tienen las mismas pantallas, así que cada una se describe una vez. Donde dice <span class="mod">‹módulo›</span> va el nombre del módulo en que estás, y lo que solo existe en algunos módulos lleva una etiqueta, por ejemplo <span class="solo">Solo en Nómina</span>.</p>
  <h3>¿No encontraste lo que buscabas?</h3>
  <p>Si algo no funciona como dice este manual o no encuentras lo que buscas, repórtalo en la Mesa de ayuda de la plataforma.</p>`;
}

function ciclo(d: DatosManual): string {
  return `<h1 class="cap" id="ciclo">El ciclo de trabajo de un cliente</h1>
  <p>El trabajo de un cliente de principio a fin, en el orden en que se hace. Cada paso dice quién lo hace y dónde. En la plataforma, este ciclo se ve en la ayuda de Balance y de los módulos, en la vista «Ciclo del cliente».</p>
  <ol class="ciclo">${d.ciclo
    .map(
      (p) => `<li><span class="paso">${p.numero}</span><div>
        <p class="paso-tit">${t(p.titulo)}</p>
        <p class="que-hace">${t(p.descripcion)}</p>
        <div class="quien"><span class="quien-etq">Quién</span> ${chips(p.regla, d.roles)}</div>
        <p class="donde"><span class="quien-etq">Dónde</span> ${t(p.donde)}</p>
      </div></li>`,
    )
    .join("")}</ol>`;
}

/** Las unidades del manual en orden; `paginas` (id → página) llena el contenido. */
export function unidadesManual(d: DatosManual, paginas: ReadonlyMap<string, number> = new Map()): UnidadManual[] {
  const unidades: UnidadManual[] = [
    { id: "como-usar", html: comoUsar(d), contenido: [{ id: "como-usar", titulo: "Cómo usar este manual", nivel: 1 }] },
    { id: "ciclo", html: ciclo(d), contenido: [{ id: "ciclo", titulo: "El ciclo de trabajo de un cliente", nivel: 1 }] },
  ];
  for (const c of d.capitulos) {
    c.pantallas.forEach((p, i) => {
      const entrada: EntradaContenido = { id: p.id, titulo: p.ficha.titulo, nivel: 2 };
      if (i === 0) {
        const cabeza = `<h1 class="cap" id="${esc(c.id)}">${esc(c.titulo)}</h1>${c.intro.map((x) => `<p class="intro">${t(x)}</p>`).join("")}`;
        const repetido = p.ficha.titulo === c.titulo;
        unidades.push({
          id: p.id,
          html: cabeza + pantalla(p, d.roles, !repetido),
          contenido: [{ id: c.id, titulo: c.titulo, nivel: 1 }, ...(repetido ? [] : [entrada])],
        });
      } else {
        unidades.push({ id: p.id, html: pantalla(p, d.roles), contenido: [entrada] });
      }
    });
  }
  const entradas = unidades.flatMap((u) => u.contenido);
  return [
    { id: "portada", html: portada(d), contenido: [] },
    { id: "contenido", html: contenido(entradas, paginas), contenido: [] },
    ...unidades,
  ];
}

/** El documento completo (o una parte, para contar sus páginas). */
export function documentoManual(unidades: readonly UnidadManual[], estilos: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual de usuario · Russell Conciliador</title><style>${estilos}</style></head><body>${unidades
    .map((u) => `<div class="unidad unidad-${esc(u.id)}">${u.html}</div>`)
    .join("\n")}</body></html>`;
}
