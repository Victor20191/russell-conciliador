// Manual de usuario — junta en una sola ficha las variantes de una pantalla de módulo (puro).
//
// Las fichas de los módulos se arman con el descriptor de cada uno: casi todo se repite y lo
// propio de un módulo va con `aplica`. El manual no repite seis veces la misma pantalla: cada
// elemento aparece una vez y anota en qué módulos está (`en`). El nombre del módulo dentro del
// texto se cambia por MARCADOR_MODULO, salvo en lo que es de un solo módulo, que conserva su texto.

import type { AccionAyuda, EstadoAyuda, FichaAyuda, PreguntaAyuda, Regla } from "../tipos";

export const MARCADOR_MODULO = "‹módulo›";

/** En qué variantes (módulos) está el elemento; sin `en`, es de una pantalla única. */
export type Solo = { en?: readonly string[] };

export type TextoManual = { texto: string } & Solo;
export type AccionManual = { nombre: string; queHace: string; regla: Regla; condiciones: TextoManual[] } & Solo;
export type EtapaManual = { titulo: string; acciones: AccionManual[] } & Solo;
export type PestanaManual = { id: string; titulo: string; proposito: string; etapas: EtapaManual[] } & Solo;
export type EstadoManual = Omit<EstadoAyuda, "aplica"> & Solo;
export type PreguntaManual = Omit<PreguntaAyuda, "aplica"> & Solo;

export type FichaManual = {
  titulo: string;
  proposito: string;
  antesDeEmpezar: TextoManual[];
  etapas: EtapaManual[];
  pestanas: PestanaManual[];
  estados: EstadoManual[];
  preguntas: PreguntaManual[];
  relacionadas: TextoManual[];
  /** Las variantes que se juntaron (módulos), en orden; vacío en una pantalla única. */
  variantes: readonly string[];
};

const accionManual = (a: AccionAyuda): AccionManual => ({
  nombre: a.nombre,
  queHace: a.queHace,
  regla: a.regla,
  condiciones: (a.condiciones ?? []).map((texto) => ({ texto })),
});

/** Una ficha de pantalla única, sin anotar módulos. */
export function fichaManual(f: FichaAyuda): FichaManual {
  const etapas = (lista: FichaAyuda["etapas"]) => lista.map((e) => ({ titulo: e.titulo, acciones: e.acciones.map(accionManual) }));
  return {
    titulo: f.titulo,
    proposito: f.proposito,
    antesDeEmpezar: (f.antesDeEmpezar ?? []).map((texto) => ({ texto })),
    etapas: etapas(f.etapas),
    pestanas: (f.pestanas ?? []).map((p) => ({ id: p.id, titulo: p.titulo, proposito: p.proposito, etapas: etapas(p.etapas) })),
    estados: (f.estados ?? []).map(({ etiqueta, significado }) => ({ etiqueta, significado })),
    preguntas: (f.preguntas ?? []).map(({ pregunta, respuesta }) => ({ pregunta, respuesta })),
    relacionadas: (f.relacionadas ?? []).map((r) => ({ texto: r.label })),
    variantes: [],
  };
}

type Ocurrencia<T> = { variante: string; item: T };

/**
 * Une listas ordenadas conservando el orden relativo de cada una: lo que aparece en varias va
 * una vez, en el lugar de su primera aparición; lo nuevo, detrás del anterior de su lista.
 */
export function fusionarOrdenado<T>(listas: readonly { variante: string; items: readonly T[] }[], clave: (item: T, variante: string) => string): Ocurrencia<T>[][] {
  const orden: string[] = [];
  const grupos = new Map<string, Ocurrencia<T>[]>();
  for (const { variante, items } of listas) {
    let ultimo = -1;
    for (const item of items) {
      const k = clave(item, variante);
      const existente = grupos.get(k);
      if (existente) {
        existente.push({ variante, item });
        ultimo = Math.max(ultimo, orden.indexOf(k));
      } else {
        grupos.set(k, [{ variante, item }]);
        orden.splice(ultimo + 1, 0, k);
        ultimo += 1;
      }
    }
  }
  return orden.map((k) => grupos.get(k)!);
}

/** Junta las variantes de una pantalla de módulo. `variantes` va en el orden del menú. */
export function combinarVariantes(variantes: readonly { etiqueta: string; ficha: FichaAyuda }[]): FichaManual {
  const etiquetas = variantes.map((v) => v.etiqueta);
  const neutro = (texto: string, variante: string) => texto.replaceAll(variante, MARCADOR_MODULO);
  // Un elemento de un solo módulo conserva su texto; el de varios lleva el marcador.
  const texto = (occ: Ocurrencia<unknown>[], valor: (o: Ocurrencia<unknown>) => string) =>
    occ.length === 1 ? valor(occ[0]!) : neutro(valor(occ[0]!), occ[0]!.variante);
  const en = (occ: Ocurrencia<unknown>[]) => occ.map((o) => o.variante);

  const textos = (listas: { variante: string; items: readonly string[] }[]): TextoManual[] =>
    fusionarOrdenado(listas, neutro).map((occ) => ({ texto: texto(occ, (o) => o.item as string), en: en(occ) }));

  const acciones = (listas: { variante: string; items: readonly AccionAyuda[] }[]): AccionManual[] =>
    fusionarOrdenado(listas, (a, v) => [neutro(a.nombre, v), neutro(a.queHace, v), JSON.stringify(a.regla)].join("\u0000")).map((occ) => ({
      nombre: texto(occ, (o) => (o.item as AccionAyuda).nombre),
      queHace: texto(occ, (o) => (o.item as AccionAyuda).queHace),
      regla: occ[0]!.item.regla,
      condiciones: textos(occ.map((o) => ({ variante: o.variante, items: o.item.condiciones ?? [] }))),
      en: en(occ),
    }));

  type ListaEtapas = { variante: string; items: FichaAyuda["etapas"] };
  const etapas = (listas: ListaEtapas[]): EtapaManual[] =>
    fusionarOrdenado(listas, (e, v) => neutro(e.titulo, v)).map((occ) => ({
      titulo: texto(occ, (o) => (o.item as FichaAyuda["etapas"][number]).titulo),
      acciones: acciones(occ.map((o) => ({ variante: o.variante, items: o.item.acciones }))),
      en: en(occ),
    }));

  const porVariante = <T>(sacar: (f: FichaAyuda) => readonly T[] | undefined) =>
    variantes.map((v) => ({ variante: v.etiqueta, items: sacar(v.ficha) ?? [] }));

  const pestanas = fusionarOrdenado(porVariante((f) => f.pestanas), (p) => p.id).map((occ) => ({
    id: occ[0]!.item.id,
    titulo: texto(occ, (o) => (o.item as { titulo: string }).titulo),
    proposito: texto(occ, (o) => (o.item as { proposito: string }).proposito),
    etapas: etapas(occ.map((o) => ({ variante: o.variante, items: o.item.etapas }))),
    en: en(occ),
  }));

  const estados = fusionarOrdenado(porVariante((f) => f.estados), (e, v) => neutro(`${e.etiqueta}\u0000${e.significado}`, v)).map((occ) => ({
    etiqueta: texto(occ, (o) => (o.item as EstadoAyuda).etiqueta),
    significado: texto(occ, (o) => (o.item as EstadoAyuda).significado),
    en: en(occ),
  }));

  const preguntas = fusionarOrdenado(porVariante((f) => f.preguntas), (q, v) => neutro(`${q.pregunta}\u0000${q.respuesta}`, v)).map((occ) => ({
    pregunta: texto(occ, (o) => (o.item as PreguntaAyuda).pregunta),
    respuesta: texto(occ, (o) => (o.item as PreguntaAyuda).respuesta),
    en: en(occ),
  }));

  const primera = variantes[0]!;
  return {
    titulo: neutro(primera.ficha.titulo, primera.etiqueta),
    proposito: neutro(primera.ficha.proposito, primera.etiqueta),
    antesDeEmpezar: textos(porVariante((f) => f.antesDeEmpezar)),
    etapas: etapas(porVariante((f) => f.etapas)),
    pestanas,
    estados,
    preguntas,
    relacionadas: textos(porVariante((f) => f.relacionadas?.map((r) => r.label))),
    variantes: etiquetas,
  };
}

/**
 * La etiqueta de un elemento que no está en todas las variantes de su contenedor, o null.
 * «Solo en Nómina», «En Cartera y Cuentas por Pagar», «En todos menos Inventarios».
 */
export function etiquetaSolo(en: readonly string[] | undefined, contenedor: readonly string[]): string | null {
  if (!en || contenedor.length === 0 || en.length >= contenedor.length) return null;
  const lista = (xs: readonly string[]) => (xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
  if (en.length === 1) return `Solo en ${en[0]}`;
  const faltan = contenedor.filter((c) => !en.includes(c));
  if (contenedor.length > 3 && faltan.length < en.length) return `En todos menos ${lista(faltan)}`;
  return `En ${lista(en)}`;
}
