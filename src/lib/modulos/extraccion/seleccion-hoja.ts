// HOJA DEL AUXILIAR en un libro de varias hojas — puro, sin BD.
//
// Los libros de conciliación que entregan los clientes traen el auxiliar del módulo junto a
// hojas que no lo son: el balance por terceros contra el que se concilió, tablas dinámicas por
// cuenta, la conciliación del auditor, la TRM histórica. Tomar la primera hoja del libro
// cargaba con frecuencia una de esas.
//
// La hoja se propone por el CONTENIDO de su encabezado, nunca por su tamaño (el balance por
// terceros suele ser la hoja más grande del libro): pesan los roles del módulo reconocidos, y
// se descartan las hojas con la firma de un balance (saldo inicial, débitos/créditos, saldo
// final) o de una hoja de trabajo (conciliación, diferencia, tabla dinámica). Es solo una
// propuesta: el wizard deja cambiarla y explica qué descartó.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import { sugerirSpec } from "./sugerir";

/** Filas que se analizan de cada hoja: el encabezado se busca en las 15 primeras. */
const FILAS_MUESTRA = 60;
/** Tope de filas donde se buscan títulos y rótulos (siempre hasta el encabezado). */
const FILAS_ROTULOS = 15;
/** Puntaje mínimo, con los roles requeridos presentes, para tener la hoja por auxiliar. */
const PUNTAJE_AUXILIAR = 5;

export type ClaseHoja = "auxiliar" | "otra" | "hoja_trabajo" | "balance" | "vacia";

export type PuntajeHoja = {
  nombre: string;
  clase: ClaseHoja;
  /** Peso de los roles del módulo reconocidos en el encabezado. */
  puntaje: number;
  /** Fila de encabezado (1-based) que detecta el sugeridor en la hoja. */
  filaEncabezado: number;
};

export type SeleccionHoja = {
  /** Hoja propuesta, o `null` si ninguna hoja trae datos. */
  propuesta: string | null;
  /** Todas las hojas con datos tienen la firma de un balance: el archivo no es un auxiliar. */
  soloBalances: boolean;
  puntajes: PuntajeHoja[];
};

const normalizar = (v: unknown): string =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\s]+/g, " ").trim();

const SALDO_INICIAL = /\bsaldo (inicial|anterior)\b/;
const SALDO_FINAL = /\bsaldo (final|actual)\b/;
const MOVIMIENTO = /\b(debitos?|creditos?|debe|haber)\b/;
const TITULO_BALANCE = /comprobacion de saldos|balance de prueba|sumas y saldos|balance (por|con) terceros/;
/** Nombre de hoja del papel de trabajo del auditor. */
const NOMBRE_HOJA_TRABAJO = /concilia|\bdif(erencias?)?\b|resumen|cruce|^td\b|tabla dinamica|^marcas?\b|^trm\b|^ht\b|russell/;
/** Rótulos de tabla dinámica y del encabezado de un papel de trabajo. */
const ROTULO_HOJA_TRABAJO = /etiquetas de (fila|columna)|^suma de |^total general$|\(en blanco\)|papel de trabajo|russell bedford|tipo de trabajo/;

const RANGO: Record<ClaseHoja, number> = { auxiliar: 0, otra: 1, hoja_trabajo: 1, balance: 2, vacia: 3 };

function textos(filas: GridHoja["filas"]): string[] {
  return filas.flatMap((f) => (f ?? []).filter((c) => typeof c === "string").map(normalizar)).filter(Boolean);
}

function puntuarHoja(descriptor: DescriptorModulo, hoja: GridHoja): PuntajeHoja {
  const conDatos = hoja.filas.some((f) => (f ?? []).some((c) => c != null && String(c).trim() !== ""));
  if (!conDatos) return { nombre: hoja.nombre, clase: "vacia", puntaje: 0, filaEncabezado: 1 };

  const muestra: GridHoja = {
    nombre: hoja.nombre,
    filas: hoja.filas.slice(0, FILAS_MUESTRA),
    ...(hoja.negrita ? { negrita: hoja.negrita.slice(0, FILAS_MUESTRA) } : {}),
    ...(hoja.filasFisicas ? { filasFisicas: hoja.filasFisicas.slice(0, FILAS_MUESTRA) } : {}),
  };
  const spec = sugerirSpec(descriptor, muestra);
  const requeridos = descriptor.columnas.filter((c) => c.requerido).map((c) => c.nombre);
  let puntaje = 0;
  for (const [rol, columna] of Object.entries(spec.columnas)) {
    if (columna < 1) continue;
    puntaje += requeridos.includes(rol) ? 3 : rol === descriptor.valor || rol === descriptor.clasificador ? 2 : 1;
  }
  const edades = Object.values(spec.familias ?? {}).reduce((n, columnas) => n + columnas.length, 0);
  if (edades >= 2) puntaje += 3;
  const base = { nombre: hoja.nombre, puntaje, filaEncabezado: spec.filaEncabezado };

  // Los rótulos se leen hasta el encabezado (y la fila siguiente, donde algunos balances
  // parten el suyo en dos): más abajo ya hay datos, y un proveedor puede llamarse como la firma.
  const rotulos = textos(hoja.filas.slice(0, Math.min(spec.filaEncabezado + 1, FILAS_ROTULOS)));
  const firmaBalance = rotulos.some((t) => SALDO_INICIAL.test(t))
    && rotulos.some((t) => SALDO_FINAL.test(t))
    && rotulos.some((t) => MOVIMIENTO.test(t));
  // Un balance no trae rangos de vencimiento.
  if (edades < 2 && (firmaBalance || rotulos.some((t) => TITULO_BALANCE.test(t)))) return { ...base, clase: "balance" };

  const hastaEncabezado = textos(hoja.filas.slice(0, Math.min(spec.filaEncabezado, FILAS_ROTULOS)));
  const encabezado = (hoja.filas[spec.filaEncabezado - 1] ?? []).map(normalizar);
  if (
    NOMBRE_HOJA_TRABAJO.test(normalizar(hoja.nombre))
    || hastaEncabezado.some((t) => ROTULO_HOJA_TRABAJO.test(t))
    || encabezado.includes("diferencia")
  ) {
    return { ...base, clase: "hoja_trabajo" };
  }

  const conRequeridos = requeridos.every((rol) => (spec.columnas[rol] ?? 0) >= 1);
  return { ...base, clase: conRequeridos && puntaje >= PUNTAJE_AUXILIAR ? "auxiliar" : "otra" };
}

/**
 * Hoja que se propone cargar: la PRIMERA del libro que parece un auxiliar. Entre auxiliares no
 * decide el puntaje: la hoja en dólares reconoce más roles (moneda, tasa) que la de pesos que
 * la precede, y dos hojas gemelas se resuelven como antes, por la primera. Si ninguna parece
 * auxiliar, la de más roles reconocidos, con los balances al final.
 */
export function seleccionarHojaModulo(descriptor: DescriptorModulo, hojas: readonly GridHoja[]): SeleccionHoja {
  const puntajes = hojas.map((hoja) => puntuarHoja(descriptor, hoja));
  const conDatos = puntajes.filter((p) => p.clase !== "vacia");
  const mejor = [...conDatos].sort((a, b) =>
    RANGO[a.clase] - RANGO[b.clase] || (a.clase === "auxiliar" ? 0 : b.puntaje - a.puntaje))[0] ?? null;
  return {
    propuesta: mejor?.nombre ?? null,
    soloBalances: conDatos.length > 0 && conDatos.every((p) => p.clase === "balance"),
    puntajes,
  };
}

function lista(nombres: readonly string[], max = 4): string {
  const citados = nombres.slice(0, max).map((n) => `«${n}»`);
  const resto = nombres.length - citados.length;
  if (resto > 0) return `${citados.join(", ")} y ${resto} más`;
  return citados.length <= 1 ? citados.join("") : `${citados.slice(0, -1).join(", ")} y ${citados.at(-1)}`;
}

/**
 * Aviso para quien carga sobre la hoja que se va a leer, o `null` si no hay nada que explicar
 * (libro de una sola hoja con datos). Nombra lo descartado y las otras hojas que también
 * parecen un auxiliar: la decisión es del usuario y necesita saber contra qué está eligiendo.
 */
export function avisoSeleccionHoja(puntajes: readonly PuntajeHoja[], hojaCargada: string): string | null {
  const cargada = puntajes.find((p) => p.nombre === hojaCargada);
  if (!cargada) return null;
  if (cargada.clase === "balance") {
    return `La hoja «${hojaCargada}» tiene la firma de un balance (saldo inicial, débitos y créditos, saldo final), `
      + "no la de un auxiliar del módulo. Revisa que sea la hoja correcta.";
  }

  const otras = puntajes.filter((p) => p.nombre !== hojaCargada && p.clase !== "vacia");
  const nombres = (clase: ClaseHoja) => otras.filter((p) => p.clase === clase).map((p) => p.nombre);
  const balances = nombres("balance");
  const deTrabajo = nombres("hoja_trabajo");
  const auxiliares = nombres("auxiliar");
  const partes: string[] = [];
  if (cargada.clase === "hoja_trabajo") {
    partes.push(`La hoja «${hojaCargada}» parece una hoja de trabajo (conciliación, diferencias o tabla dinámica), no el auxiliar del módulo.`);
  }
  const descartes = [
    balances.length > 0 ? `${lista(balances)} (${balances.length === 1 ? "balance" : "balances"})` : null,
    deTrabajo.length > 0 ? `${lista(deTrabajo)} (${deTrabajo.length === 1 ? "hoja de trabajo" : "hojas de trabajo"})` : null,
  ].filter((d): d is string => d != null);
  if (descartes.length > 0) partes.push(`Se lee «${hojaCargada}»; no se tomaron ${descartes.join(" ni ")}.`);
  if (auxiliares.length > 0) {
    partes.push(auxiliares.length === 1
      ? `La hoja ${lista(auxiliares)} también parece un auxiliar: si corresponde, cárgala por separado.`
      : `Las hojas ${lista(auxiliares)} también parecen auxiliares: si corresponde, cárgalas por separado.`);
  }
  return partes.length > 0 ? partes.join(" ") : null;
}
