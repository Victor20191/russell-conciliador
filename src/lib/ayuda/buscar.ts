// Ayuda en pantalla — búsqueda dentro de una ficha (pura). Sin tildes ni mayúsculas, y todas
// las palabras escritas tienen que aparecer en el elemento.

import type { AccionAyuda, EtapaAyuda, FichaAyuda, PestanaAyuda } from "./tipos";

export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function coincide(palabras: readonly string[], ...textos: (string | readonly string[] | undefined)[]): boolean {
  const pajar = normalizarBusqueda(textos.flat().filter(Boolean).join(" "));
  return palabras.every((p) => pajar.includes(p));
}

function filtrarEtapas(etapas: readonly EtapaAyuda[], palabras: readonly string[]): EtapaAyuda[] {
  return etapas.flatMap((etapa) => {
    const acciones = etapa.acciones.filter((a: AccionAyuda) => coincide(palabras, a.nombre, a.queHace, a.condiciones));
    return acciones.length > 0 ? [{ ...etapa, acciones }] : [];
  });
}

function contarAcciones(etapas: readonly EtapaAyuda[]): number {
  return etapas.reduce((n, e) => n + e.acciones.length, 0);
}

/**
 * La ficha con solo lo que coincide con el texto (acciones de la pantalla y de sus pestañas,
 * estados y preguntas) y cuántos elementos quedaron. Con el texto vacío, la ficha entera.
 */
export function filtrarFicha(ficha: FichaAyuda, texto: string): { ficha: FichaAyuda; coincidencias: number } {
  const palabras = normalizarBusqueda(texto).split(" ").filter(Boolean);
  if (palabras.length === 0) return { ficha, coincidencias: -1 };
  const etapas = filtrarEtapas(ficha.etapas, palabras);
  const pestanas = (ficha.pestanas ?? []).flatMap((p: PestanaAyuda) => {
    const suyas = filtrarEtapas(p.etapas, palabras);
    return suyas.length > 0 ? [{ ...p, etapas: suyas }] : [];
  });
  const estados = (ficha.estados ?? []).filter((e) => coincide(palabras, e.etiqueta, e.significado));
  const preguntas = (ficha.preguntas ?? []).filter((q) => coincide(palabras, q.pregunta, q.respuesta));
  const coincidencias =
    contarAcciones(etapas) + pestanas.reduce((n, p) => n + contarAcciones(p.etapas), 0) + estados.length + preguntas.length;
  return { ficha: { ...ficha, etapas, pestanas, estados, preguntas }, coincidencias };
}
