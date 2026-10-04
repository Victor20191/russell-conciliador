// LECTURA POR EJEMPLO (INV): deduce las reglas que reproducen los productos que el usuario armó
// sobre la grilla del original. Determinista y sin IA. Solo produce literales de la gramática
// `lecturaEstructurada` (nunca código ni regex) o, si todo viene por columnas, un mapeo tabular.
// Cada candidato se aplica con las MISMAS funciones del motor (`aplicarSelector`,
// `evaluarCondicion`) y se puntúa sobre la hoja entera: un ejemplo enseña la forma; el archivo
// completo decide cuál de las formas posibles generaliza. Puro y sin BD.
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import {
  aplicarSelector,
  ejecutarLecturaEstructurada,
  evaluarCondicion,
  LecturaEstructuradaSchema,
  ROLES_LECTURA_INVENTARIO,
  tokenNumerico,
  type CondicionLectura,
  type LecturaEstructurada,
  type RolLecturaInventario,
  type SelectorLectura,
} from "../extraccion/lectura-estructurada";
import { sugerirSpec } from "../extraccion/sugerir";
import { letraColumnaModulo } from "../perfil-modulo";
import { ETIQUETA_ROL, esRolNumerico, ModeloUsuarioSchema, nucleoTramo, type EjemploVerificado, type ModeloUsuarioInventario } from "./modelo-usuario";
import { verificarEjemplos } from "./verificar-ejemplos";

export type DudaDeduccion = {
  tipo: "ancla" | "seccion" | "separacion";
  mensaje: string;
  /** Fila física donde se ve la duda: la UI ofrece armar ese producto como ejemplo. */
  fila?: number;
  rol?: RolLecturaInventario;
  /** Sin resolverla no hay regla: es el único caso en que se consulta a la IA. */
  bloqueante: boolean;
};

export type ResultadoDeduccion = {
  spec: SpecModulo | null;
  modo: "tabular" | "estructurada" | null;
  /** Problemas del modelo (coordenadas, incoherencias): los corrige el usuario. */
  errores: string[];
  dudas: DudaDeduccion[];
  /** Productos con el texto REAL del archivo: casos de prueba y contexto para la IA. */
  ejemplos: EjemploVerificado[];
  /** Lo que la regla elegida no reproduce de los ejemplos (vacío = los reproduce todos). */
  diferencias: string[];
};

type Ubicada = { idx: number; col: number; fila: number; columna: number; texto: string; nucleo: [number, number]; completa: boolean };
type ProductoResuelto = { inicio: number; idxInicio: number; campos: Map<RolLecturaInventario, Ubicada> };

const SEPARADORES_ROTULO = ["|", ";", "·", "\t"];
const SEPARADORES_SEGMENTO = ["|", ";", "·", "\t", " - ", "/", ","];
const ALFANUMERICO = /[\p{L}\p{N}]/u;
const MAX_CANDIDATOS_ANCLA = 8;
const textoCelda = (v: CeldaCruda | undefined) => (v == null ? "" : String(v));

function vacio(errores: string[] = []): ResultadoDeduccion {
  return { spec: null, modo: null, errores, dudas: [], ejemplos: [], diferencias: [] };
}

/** Rótulo fijo al inicio de una celda: «Ref:», «TIPO DE INVENTARIO:». */
function prefijoRotulo(texto: string): string | null {
  const m = texto.match(/^\s*([^:|;·\t]{1,40}:)/u);
  return m && /\p{L}/u.test(m[1]) ? m[1].trim() : null;
}

/** Texto antes de la primera cifra («Total 18 productos» → «Total»). */
function rotuloSinCifras(texto: string): string | null {
  const m = texto.trim().match(/^([^\d]{3,60}?)\s*(?:\d|$)/u);
  return m && /\p{L}/u.test(m[1]) ? m[1].trim() : null;
}

/** Prefijo común (sin distinguir mayúsculas) cortado en un borde de palabra. */
function prefijoComun(textos: string[]): string | null {
  if (textos.length < 2) return null;
  const bajos = textos.map((t) => t.toLocaleLowerCase("es"));
  let k = 0;
  while (k < bajos[0].length && bajos.every((t) => t[k] === bajos[0][k])) k++;
  const base = textos[0];
  while (k > 0 && k < base.length && ALFANUMERICO.test(base[k - 1]) && ALFANUMERICO.test(base[k])) k--;
  const literal = base.slice(0, k).trim();
  return literal.length >= 2 && literal.length <= 160 && ALFANUMERICO.test(literal) ? literal : null;
}

function rotulosAntes(texto: string, inicio: number): string[] {
  const izquierda = texto.slice(0, inicio);
  let corte = -1;
  let largo = 0;
  for (const sep of SEPARADORES_ROTULO) {
    const i = izquierda.lastIndexOf(sep);
    if (i > corte) { corte = i; largo = sep.length; }
  }
  const valido = (s: string | undefined): s is string => !!s && s.length <= 60 && /\p{L}/u.test(s);
  const candidatos = new Set<string>();
  const segmento = izquierda.slice(corte + largo).trim();
  if (valido(segmento)) candidatos.add(segmento);
  const recortada = izquierda.trimEnd();
  const ultima = recortada.match(/(\S+)$/u)?.[1];
  if (valido(ultima) && !SEPARADORES_ROTULO.some((s) => ultima.includes(s))) candidatos.add(ultima);
  const dos = recortada.match(/(\S+\s+\S+)$/u)?.[1];
  if (valido(dos) && !SEPARADORES_ROTULO.some((s) => dos.includes(s))) candidatos.add(dos);
  return [...candidatos];
}

function cierresDespues(texto: string, fin: number): (string | undefined)[] {
  const derecha = texto.slice(fin);
  if (!derecha.trim()) return [undefined];
  const salida: (string | undefined)[] = [];
  const sep = derecha.match(/^\s*([|;·\t])/u)?.[1];
  if (sep) salida.push(sep);
  const rotulo = derecha.match(/^\s*([^\s|;·\t:]+(?:\s[^\s|;·\t:]+)?:)/u)?.[1];
  if (rotulo) salida.push(rotulo);
  const simbolos = derecha.match(/^\s*([^\p{L}\p{N}\s]{1,3})/u)?.[1];
  if (simbolos) salida.push(simbolos);
  salida.push(undefined);
  return [...new Set(salida)];
}

const mismoTramo = (texto: string, s: SelectorLectura, nucleo: [number, number]) => {
  const r = aplicarSelector(texto, s);
  if (!r.ok) return false;
  const [a, b] = nucleoTramo(texto, r.inicio, r.fin);
  return a === nucleo[0] && b === nucleo[1];
};

/** Todas las formas de la gramática que toman exactamente el tramo marcado en esta celda. */
function selectoresQueReproducen(texto: string, nucleo: [number, number], completa: boolean): SelectorLectura[] {
  const salida: SelectorLectura[] = [];
  if (completa) salida.push({ tipo: "completa" });
  for (const inicio of rotulosAntes(texto, nucleo[0])) {
    for (const fin of cierresDespues(texto, nucleo[1])) {
      const s: SelectorLectura = fin ? { tipo: "etiqueta", inicio, fin } : { tipo: "etiqueta", inicio };
      if (mismoTramo(texto, s, nucleo)) salida.push(s);
    }
  }
  for (const separador of SEPARADORES_SEGMENTO) {
    if (!texto.includes(separador)) continue;
    const segmentos = texto.split(separador).length;
    for (let indice = 1; indice <= Math.min(segmentos, 64); indice++) {
      const s: SelectorLectura = { tipo: "separador", separador, indice };
      if (mismoTramo(texto, s, nucleo)) { salida.push(s); break; }
    }
  }
  if (nucleo[1] > nucleo[0]) salida.push({ tipo: "posicion", inicio: nucleo[0] + 1, longitud: nucleo[1] - nucleo[0] });
  const vistos = new Set<string>();
  return salida.filter((s) => { const k = JSON.stringify(s); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/** Menor = preferible a igual cobertura: lo más estable entre archivos del mismo formato. */
function rangoSelector(s: SelectorLectura): number {
  if (s.tipo === "completa") return 0;
  if (s.tipo === "etiqueta") return 1 + (s.fin && !SEPARADORES_ROTULO.includes(s.fin) ? 0.1 : 0) - Math.min(s.inicio.length, 40) / 1000;
  if (s.tipo === "separador") return 2;
  return 3;
}

const intersecar = (listas: SelectorLectura[][]) => {
  const [primera, ...resto] = listas;
  const claves = resto.map((l) => new Set(l.map((s) => JSON.stringify(s))));
  return (primera ?? []).filter((s) => claves.every((c) => c.has(JSON.stringify(s))));
};

/** El tramo no corta una palabra ni un número a la mitad. */
function bordeLimpio(texto: string, inicio: number, fin: number): boolean {
  const [a, b] = nucleoTramo(texto, inicio, fin);
  if (a >= b) return false;
  return !(a > 0 && ALFANUMERICO.test(texto[a - 1])) && !(b < texto.length && ALFANUMERICO.test(texto[b]));
}

export function deducirLectura(hojas: readonly GridHoja[], entrada: unknown): ResultadoDeduccion {
  const parseado = ModeloUsuarioSchema.safeParse(entrada);
  if (!parseado.success) return vacio([parseado.error.issues[0]?.message ?? "El ejemplo armado no es válido."]);
  const modelo = parseado.data;
  const hoja = hojas.find((h) => h.nombre === modelo.hoja);
  if (!hoja) return vacio([`La hoja «${modelo.hoja}» no existe en el archivo.`]);

  const desplazamiento = hoja.columnaInicial ?? 0;
  const filaFisica = (i: number) => hoja.filasFisicas?.[i] ?? i + 1;
  const indicePorFila = new Map(hoja.filas.map((_, i) => [filaFisica(i), i]));
  const texto = (i: number, c: number) => textoCelda(hoja.filas[i]?.[c - 1]);
  const nombre = (fila: number, columna: number) => `${letraColumnaModulo(columna)}${fila}`;
  const errores: string[] = [];

  const ubicar = (s: { fila: number; columna: number; inicio?: number; fin?: number }, que: string): Ubicada | null => {
    const idx = indicePorFila.get(s.fila);
    const col = s.columna - desplazamiento;
    const t = idx == null || col < 1 ? "" : texto(idx, col);
    if (idx == null || !t.trim()) { errores.push(`La celda ${nombre(s.fila, s.columna)} (${que}) está vacía en el archivo.`); return null; }
    if (s.fin != null && s.fin > t.length) { errores.push(`El pedazo marcado en ${nombre(s.fila, s.columna)} (${que}) ya no coincide con el texto de la celda.`); return null; }
    const nucleo = nucleoTramo(t, s.inicio, s.fin);
    if (nucleo[0] >= nucleo[1]) { errores.push(`El pedazo marcado en ${nombre(s.fila, s.columna)} (${que}) está vacío.`); return null; }
    const entera = nucleoTramo(t);
    return { idx, col, fila: s.fila, columna: s.columna, texto: t, nucleo, completa: entera[0] === nucleo[0] && entera[1] === nucleo[1] };
  };

  // ---- Productos: cada campo con su celda real; las columnas enteras se leen en la fila de inicio.
  const productos: ProductoResuelto[] = [];
  modelo.productos.forEach((p, n) => {
    if (!p.asignaciones.length && p.filaInicio == null) return;
    const inicio = p.filaInicio ?? Math.min(...p.asignaciones.map((a) => a.fila));
    const idxInicio = indicePorFila.get(inicio);
    if (idxInicio == null) { errores.push(`La fila ${inicio} donde empieza el producto ${n + 1} está vacía.`); return; }
    const campos = new Map<RolLecturaInventario, Ubicada>();
    for (const a of p.asignaciones) {
      const u = ubicar(a, `${ETIQUETA_ROL[a.rol]} del producto ${n + 1}`);
      if (u) campos.set(a.rol, u);
    }
    for (const c of modelo.columnas) {
      if (campos.has(c.rol)) continue;
      const col = c.columna - desplazamiento;
      const t = col >= 1 ? texto(idxInicio, col) : "";
      if (!t.trim()) continue;
      const nucleo = nucleoTramo(t);
      campos.set(c.rol, { idx: idxInicio, col, fila: inicio, columna: c.columna, texto: t, nucleo, completa: true });
    }
    if (campos.size) productos.push({ inicio, idxInicio, campos });
  });
  const ejemplos: EjemploVerificado[] = productos.map((p) => ({
    filaInicio: p.inicio,
    campos: [...p.campos].map(([rol, u]) => ({ rol, fila: u.fila, columna: u.columna, texto: u.texto.slice(0, 360), valor: u.texto.slice(u.nucleo[0], u.nucleo[1]) })),
  }));
  if (errores.length) return { ...vacio(errores), ejemplos };
  // Dos campos sobre el mismo tramo de una celda no separan nada (p. ej. la columna A entera en
  // todos los campos): cada campo debe tomar SU pedazo.
  for (const [n, p] of productos.entries()) {
    const lista = [...p.campos];
    for (let a = 0; a < lista.length; a++) {
      for (let b = a + 1; b < lista.length; b++) {
        const [ra, ua] = lista[a];
        const [rb, ub] = lista[b];
        if (ua.idx === ub.idx && ua.col === ub.col && ua.nucleo[0] < ub.nucleo[1] && ub.nucleo[0] < ua.nucleo[1]) {
          return { ...vacio([`En el producto ${n + 1}, ${ETIQUETA_ROL[ra]} y ${ETIQUETA_ROL[rb]} toman el mismo texto de ${nombre(ua.fila, ua.columna)}. Si la celda trae varios datos, selecciona el pedazo de cada campo.`]), ejemplos };
        }
      }
    }
  }

  const roles = new Set<RolLecturaInventario>([...productos.flatMap((p) => [...p.campos.keys()]), ...modelo.columnas.map((c) => c.rol)]);
  if (!roles.has("valorTotal") && !(roles.has("cantidad") && roles.has("valorUnitario"))) {
    return { ...vacio(["Arma el Valor total, o la Cantidad y el Valor unitario: sin ellos no hay importe que leer."]), ejemplos };
  }
  if (roles.has("tipo") && modelo.secciones.length) {
    return { ...vacio(["El Tipo ya sale de un campo del producto: quita los títulos de sección o el campo Tipo."]), ejemplos };
  }
  if (!roles.has("tipo") && !modelo.secciones.length && !modelo.tipoUnico) {
    return { ...vacio(["Indica de dónde sale el Tipo de inventario (un campo o un título de sección) o marca «Todo el archivo es un solo inventario»."]), ejemplos };
  }

  const tabular = !modelo.secciones.length && productos.every((p) => [...p.campos.values()].every((u) => u.completa && u.idx === p.idxInicio))
    && [...roles].every((r) => new Set(productos.map((p) => p.campos.get(r)?.col).filter((c) => c != null)).size <= 1);
  if (tabular) return deducirTabular(hoja, modelo, productos, roles, ejemplos, indicePorFila);
  return deducirEstructurada(hoja, modelo, productos, ejemplos, { filaFisica, indicePorFila, texto, nombre, ubicar, errores });
}

// ============================================================
// Lectura TABULAR: cada campo es una columna entera.
// ============================================================
function deducirTabular(
  hoja: GridHoja,
  modelo: ModeloUsuarioInventario,
  productos: ProductoResuelto[],
  roles: Set<RolLecturaInventario>,
  ejemplos: EjemploVerificado[],
  indicePorFila: Map<number, number>,
): ResultadoDeduccion {
  const desplazamiento = hoja.columnaInicial ?? 0;
  const base = sugerirSpec(MODULOS_IMPORT.INV, hoja);
  const columnas: Record<string, number> = Object.fromEntries(ROLES_LECTURA_INVENTARIO.map((r) => [r, 0]));
  for (const r of roles) {
    columnas[r] = modelo.columnas.find((c) => c.rol === r)
      ? modelo.columnas.find((c) => c.rol === r)!.columna - desplazamiento
      : productos.find((p) => p.campos.has(r))!.campos.get(r)!.col;
  }
  const titulos = [...new Set(modelo.columnas.map((c) => c.filaTitulos))];
  if (titulos.length > 1) return { ...vacio([`Las columnas arrastradas tienen sus títulos en filas distintas (${titulos.join(", ")}). Elige la misma fila de títulos.`]), ejemplos };
  let filaEncabezado = base.filaEncabezado;
  if (titulos.length) {
    const idx = indicePorFila.get(titulos[0]);
    if (idx == null) return { ...vacio([`La fila de títulos ${titulos[0]} está vacía en el archivo.`]), ejemplos };
    filaEncabezado = idx + 1;
  }
  const primerProducto = productos.length ? Math.min(...productos.map((p) => p.idxInicio)) + 1 : null;
  if (primerProducto != null && filaEncabezado >= primerProducto) filaEncabezado = primerProducto - 1;
  if (filaEncabezado < 1) return { ...vacio(["Los datos empiezan en la primera fila del archivo: el patrón necesita una fila de títulos arriba de los productos."]), ejemplos };
  const general = modelo.totales.filter((t) => t.tipo === "general");
  const total = general.length === 1 ? general[0] : null;
  const spec: SpecModulo = {
    hoja: hoja.nombre,
    filaEncabezado,
    primeraFilaDatos: filaEncabezado + 1,
    columnas,
    clasificadorModo: roles.has("tipo") ? "columna" : "global",
    subtotales: base.subtotales ?? "auto",
    ...(total && total.columna - desplazamiento >= 1 ? { subtotalesFila: total.fila, subtotalesColumna: total.columna - desplazamiento } : {}),
  };
  const verificacion = verificarEjemplos(hoja, spec, ejemplos);
  return { spec, modo: "tabular", errores: [], dudas: [], ejemplos, diferencias: verificacion.diferencias };
}

// ============================================================
// Lectura ESTRUCTURADA: campos dentro de celdas o productos de varias filas.
// ============================================================
type Herramientas = {
  filaFisica: (i: number) => number;
  indicePorFila: Map<number, number>;
  texto: (i: number, c: number) => string;
  nombre: (fila: number, columna: number) => string;
  ubicar: (s: { fila: number; columna: number; inicio?: number; fin?: number }, que: string) => Ubicada | null;
  errores: string[];
};

type CampoPlan = { rol: RolLecturaInventario; col: number; desplazamientoFila: number; celdas: Ubicada[] };

function deducirEstructurada(
  hoja: GridHoja,
  modelo: ModeloUsuarioInventario,
  productos: ProductoResuelto[],
  ejemplos: EjemploVerificado[],
  h: Herramientas,
): ResultadoDeduccion {
  const { filaFisica, indicePorFila, texto, errores } = h;
  const desplazamiento = hoja.columnaInicial ?? 0;
  const fallar = (mensajes: string[]): ResultadoDeduccion => ({ ...vacio(mensajes), ejemplos });
  if (!productos.length) return fallar(["Arma al menos un producto completo para enseñar cómo se separan sus datos."]);

  // ---- Posición fija de cada campo dentro del bloque del producto.
  const plan: CampoPlan[] = [];
  const roles = new Set(productos.flatMap((p) => [...p.campos.keys()]));
  for (const rol of ROLES_LECTURA_INVENTARIO) {
    if (!roles.has(rol)) continue;
    const presentes = productos.map((p, n) => ({ n, p, u: p.campos.get(rol) })).filter((x) => x.u);
    const etiqueta = ETIQUETA_ROL[rol];
    for (const { n, p, u } of presentes) {
      const d = u!.fila - p.inicio;
      if (d < 0) errores.push(`En el producto ${n + 1}, ${etiqueta} (fila ${u!.fila}) está por encima de donde empieza el producto (fila ${p.inicio}).`);
      else if (d > 31) errores.push(`En el producto ${n + 1}, ${etiqueta} está ${d} filas debajo del inicio: un producto puede ocupar hasta 32 filas.`);
    }
    const [primero, ...resto] = presentes;
    for (const otro of resto) {
      if (otro.u!.col !== primero.u!.col) errores.push(`${etiqueta} está en la columna ${letraColumnaModulo(primero.u!.columna)} en el producto ${primero.n + 1} y en la ${letraColumnaModulo(otro.u!.columna)} en el producto ${otro.n + 1}: la regla necesita la misma columna en todos.`);
      const d1 = primero.u!.fila - primero.p.inicio;
      const d2 = otro.u!.fila - otro.p.inicio;
      if (d1 !== d2) errores.push(`${etiqueta} está ${d1} fila(s) debajo del inicio en el producto ${primero.n + 1} y ${d2} en el producto ${otro.n + 1}: la regla necesita la misma posición en todos.`);
    }
    plan.push({ rol, col: primero.u!.col, desplazamientoFila: primero.u!.fila - primero.p.inicio, celdas: presentes.map((x) => x.u!) });
  }
  if (errores.length) return fallar([...new Set(errores)]);
  const maxFilas = Math.max(1, ...plan.map((c) => c.desplazamientoFila + 1));
  const filasBloque = productos.flatMap((p) => {
    const filas: number[] = [];
    for (let f = p.inicio + 1; f < p.inicio + maxFilas; f++) { const i = indicePorFila.get(f); if (i != null) filas.push(i); }
    return filas;
  });

  // ---- Marcas: secciones, totales e ignorados, ubicadas en el archivo.
  const secciones = modelo.secciones.map((s, n) => h.ubicar(s, `título de sección ${n + 1}`));
  const totales = modelo.totales.map((t, n) => ({ marca: t, u: h.ubicar(t, `total ${n + 1}`) }));
  for (const f of modelo.ignorarFilas) if (!indicePorFila.has(f.fila)) errores.push(`La fila ${f.fila} está vacía: no hace falta ignorarla.`);
  const ignorarColumnas = modelo.ignorarColumnas.map((c) => ({ columna: c.columna - desplazamiento, motivo: c.motivo }));
  for (const c of modelo.ignorarColumnas) if (c.columna - desplazamiento < 1) errores.push(`La columna ${letraColumnaModulo(c.columna)} no tiene datos en la hoja.`);
  if (errores.length) return fallar([...new Set(errores)]);
  const seccionesUbicadas = secciones.filter((s): s is Ubicada => s != null);
  if (new Set(seccionesUbicadas.map((s) => s.col)).size > 1) return fallar(["Los títulos de sección deben estar en la misma columna."]);
  const usadas = new Set(plan.map((c) => c.col));
  for (const c of ignorarColumnas) if (usadas.has(c.columna)) return fallar([`La columna ${letraColumnaModulo(c.columna + desplazamiento)} se usa en un campo del producto: no se puede ignorar.`]);

  // ---- Candidatos para reconocer dónde empieza cada producto.
  const anclas = candidatosAncla(hoja, productos, plan, filasBloque, texto);
  if (!anclas.length) {
    return { ...vacio(), ejemplos, dudas: [{ tipo: "ancla", bloqueante: true, fila: productos[0].inicio, mensaje: `No encontramos un texto fijo que marque dónde empieza cada producto (fila ${productos[0].inicio}). Marca el inicio de otro producto o explica cómo se reconoce.` }] };
  }

  type Intento = { reglas: LecturaEstructurada; primeraFilaDatos: number; errores: number; registros: number; diferencias: string[]; dudas: DudaDeduccion[]; orden: number };
  let mejor: Intento | null = null;
  let dudaBloqueante: DudaDeduccion | null = null;
  let errorMarcas: string | null = null;
  anclas.forEach((ancla, orden) => {
    const filasAncla = new Set<number>();
    hoja.filas.forEach((fila, i) => { if (evaluarCondicion(fila, ancla)) filasAncla.add(i); });

    // Sección
    let seccion: LecturaEstructurada["seccion"];
    if (seccionesUbicadas.length) {
      const regla = reglaSeccion(hoja, seccionesUbicadas, filasAncla, filasBloque);
      if (!regla) { dudaBloqueante ??= { tipo: "seccion", bloqueante: true, fila: seccionesUbicadas[0].fila, mensaje: `No encontramos un texto fijo que distinga los títulos de sección (fila ${seccionesUbicadas[0].fila}) de los productos. Explica cómo se reconocen.` }; return; }
      seccion = regla;
    }
    // Totales
    const reglasTotales: NonNullable<LecturaEstructurada["totales"]> = [];
    for (const { marca, u } of totales) {
      if (!u) continue;
      const regla = reglaTotal(hoja, u, marca.tipo, filasAncla, texto);
      if (!regla) { errorMarcas ??= `No encontramos un rótulo que identifique el total de la fila ${u.fila} sin confundirlo con los productos.`; return; }
      if (!reglasTotales.some((t) => JSON.stringify(t) === JSON.stringify(regla))) reglasTotales.push(regla);
    }
    // Filas ignoradas
    const reglasIgnorar: NonNullable<LecturaEstructurada["ignorarFilas"]> = [];
    for (const f of modelo.ignorarFilas) {
      const regla = reglaIgnorar(hoja, indicePorFila.get(f.fila)!, f.motivo, filasAncla, filasBloque, texto);
      if (!regla) { errorMarcas ??= `La fila ${f.fila} se parece a un producto: no se puede ignorar con un texto fijo.`; return; }
      if (!reglasIgnorar.some((t) => JSON.stringify(t.condicion) === JSON.stringify(regla.condicion))) reglasIgnorar.push(regla);
    }

    const especial = (fila: CeldaCruda[]) => (seccion && evaluarCondicion(fila, seccion.condicion))
      || reglasTotales.some((t) => evaluarCondicion(fila, t.condicion))
      || reglasIgnorar.some((t) => evaluarCondicion(fila, t.condicion));
    const clases: number[] = [];
    const anclados: number[] = [];
    hoja.filas.forEach((fila, i) => {
      if (fila.every((c) => !textoCelda(c).trim())) return;
      if (especial(fila)) clases.push(i);
      else if (filasAncla.has(i)) { clases.push(i); anclados.push(i); }
    });
    const siguiente = new Map(clases.map((i, n) => [i, clases[n + 1]]));
    // Lo que tomaría un selector en el producto que empieza en la fila i (o null si no aplica).
    const leer = (i: number, rol: RolLecturaInventario, col: number, desplazamientoFila: number, s: SelectorLectura): string | null => {
      const fisica = filaFisica(i) + desplazamientoFila;
      const limite = Math.min(filaFisica(i) + maxFilas, siguiente.get(i) == null ? Infinity : filaFisica(siguiente.get(i)!));
      const j = indicePorFila.get(fisica);
      if (j == null || fisica >= limite) return null;
      const t = texto(j, col);
      const r = aplicarSelector(t, s);
      if (!r.ok) return null;
      const valor = s.tipo === "completa" ? t.trim() : r.valor ?? "";
      if (!valor || !bordeLimpio(t, r.inicio, r.fin)) return null;
      if (esRolNumerico(rol) && (!/[0-9]/.test(valor) || tokenNumerico(valor, rol).mezclado)) return null;
      return valor;
    };

    // Selector de cada campo: el que reproduce los ejemplos y mejor generaliza a la hoja entera.
    const dudas: DudaDeduccion[] = [];
    const campos: LecturaEstructurada["campos"] = [];
    for (const c of plan) {
      const candidatos = intersecar(c.celdas.map((u) => selectoresQueReproducen(u.texto, u.nucleo, u.completa)));
      if (!candidatos.length) { errorMarcas ??= `No hay una sola forma de separar ${ETIQUETA_ROL[c.rol]} que tome lo marcado en todos los productos. Revisa que el dato esté en la misma posición de su celda.`; return; }
      const evaluados = candidatos.map((s) => {
        const valores = new Map<number, string>();
        let aciertos = 0;
        for (const i of anclados) {
          const valor = leer(i, c.rol, c.col, c.desplazamientoFila, s);
          if (valor == null) continue;
          aciertos++;
          valores.set(filaFisica(i) + c.desplazamientoFila, valor);
        }
        return { s, aciertos, valores };
      }).sort((x, y) => y.aciertos - x.aciertos || rangoSelector(x.s) - rangoSelector(y.s));
      const elegido = evaluados[0];
      const rival = evaluados.find((e) => e.aciertos === elegido.aciertos && e.s.tipo !== elegido.s.tipo);
      if (rival) {
        for (const [fila, valor] of elegido.valores) {
          const otro = rival.valores.get(fila);
          if (otro != null && otro !== valor) {
            dudas.push({ tipo: "separacion", bloqueante: false, rol: c.rol, fila, mensaje: `En la fila ${fila} no está claro dónde termina ${ETIQUETA_ROL[c.rol]}: puede ser «${valor.slice(0, 40)}» o «${otro.slice(0, 40)}». Arma ese producto como ejemplo para decidirlo.` });
            break;
          }
        }
      }
      campos.push({ rol: c.rol, fuente: { columna: c.col, desplazamientoFila: c.desplazamientoFila, selector: elegido.s } });
    }

    const reglas: LecturaEstructurada = {
      version: 1,
      registro: { ancla, maxFilas },
      campos,
      ...(seccion ? { seccion } : {}),
      ...(reglasTotales.length ? { totales: reglasTotales } : {}),
      ...(reglasIgnorar.length ? { ignorarFilas: reglasIgnorar } : {}),
      ...(ignorarColumnas.length ? { ignorarColumnas } : {}),
    };
    const validas = LecturaEstructuradaSchema.safeParse(reglas);
    if (!validas.success) { errorMarcas ??= `Las reglas deducidas no son válidas: ${validas.error.issues[0]?.message ?? "revisa el ejemplo"}`; return; }
    // Los datos empiezan en el primer título o en la primera fila que de verdad trae un producto
    // (con su importe): un rótulo del informe que también «no está vacío» queda en el encabezado.
    const importe = (i: number, rol: RolLecturaInventario) => {
      const campo = campos.find((c) => c.rol === rol);
      return campo ? leer(i, rol, campo.fuente.columna, campo.fuente.desplazamientoFila, campo.fuente.selector) != null : false;
    };
    const pareceProducto = (i: number) => importe(i, "valorTotal") || (importe(i, "cantidad") && importe(i, "valorUnitario"));
    const inicio = clases.find((i) => (seccion && evaluarCondicion(hoja.filas[i], seccion.condicion)) || (anclados.includes(i) && pareceProducto(i)));
    if (inicio == null || inicio < 1) { errorMarcas ??= "Los datos empiezan en la primera fila del archivo: el patrón necesita una fila de títulos arriba de los productos."; return; }
    const primeraFilaDatos = inicio + 1;
    const lectura = ejecutarLecturaEstructurada(hoja, validas.data, primeraFilaDatos);
    const verificacion = verificarEjemplos(hoja, { hoja: hoja.nombre, filaEncabezado: inicio, primeraFilaDatos, columnas: {}, lecturaEstructurada: validas.data }, ejemplos);
    const intento: Intento = {
      reglas: validas.data, primeraFilaDatos, orden, dudas,
      errores: lectura.errores.length,
      registros: lectura.trazas.filter((t) => t.tipo === "registro").length,
      diferencias: verificacion.diferencias,
    };
    const puntaje = (x: Intento) => [x.diferencias.length === 0 ? 1 : 0, -x.errores, x.registros, -x.orden];
    if (!mejor || compararPuntajes(puntaje(intento), puntaje(mejor)) > 0) mejor = intento;
  });

  const elegido = mejor as Intento | null;
  if (!elegido) {
    if (dudaBloqueante) return { ...vacio(), ejemplos, dudas: [dudaBloqueante] };
    return fallar([errorMarcas ?? "No se pudo deducir una regla con estos ejemplos."]);
  }
  const conTipo = elegido.reglas.campos.some((c) => c.rol === "tipo");
  const spec: SpecModulo = {
    hoja: hoja.nombre,
    filaEncabezado: elegido.primeraFilaDatos - 1,
    primeraFilaDatos: elegido.primeraFilaDatos,
    columnas: {},
    clasificadorModo: elegido.reglas.seccion ? "seccion" : conTipo ? "columna" : "global",
    lecturaEstructurada: elegido.reglas,
  };
  return { spec, modo: "estructurada", errores: [], dudas: elegido.dudas, ejemplos, diferencias: elegido.diferencias };
}

function compararPuntajes(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Condiciones que coinciden en la fila de inicio de cada ejemplo y en ninguna otra fila de sus bloques. */
function candidatosAncla(hoja: GridHoja, productos: ProductoResuelto[], plan: CampoPlan[], filasBloque: number[], texto: (i: number, c: number) => string): CondicionLectura[] {
  const ancho = Math.max(...productos.map((p) => hoja.filas[p.idxInicio]?.length ?? 0));
  const columnasCampos = new Set(plan.filter((c) => c.desplazamientoFila === 0).map((c) => c.col));
  const colReferencia = plan.find((c) => c.rol === "referencia" && c.desplazamientoFila === 0)?.col;
  const candidatos: { condicion: CondicionLectura; rango: number }[] = [];
  for (let col = 1; col <= ancho; col++) {
    const textos = productos.map((p) => texto(p.idxInicio, col));
    if (textos.some((t) => !t.trim())) continue;
    const enCampo = columnasCampos.has(col) ? 0 : 10;
    const rotulos = textos.map(prefijoRotulo);
    if (rotulos.every((r) => r && r.toLocaleLowerCase("es") === rotulos[0]!.toLocaleLowerCase("es"))) {
      candidatos.push({ condicion: { columna: col, operador: "empieza", texto: rotulos[0]! }, rango: 0 + enCampo });
    }
    const comun = prefijoComun(textos);
    if (comun && comun !== rotulos[0]) candidatos.push({ condicion: { columna: col, operador: "empieza", texto: comun }, rango: 1 + enCampo });
    candidatos.push({ condicion: { columna: col, operador: "no_vacia" }, rango: (col === colReferencia ? 2 : 3) + enCampo });
  }
  return candidatos
    .filter(({ condicion }) => productos.every((p) => evaluarCondicion(hoja.filas[p.idxInicio] ?? [], condicion))
      && !filasBloque.some((i) => evaluarCondicion(hoja.filas[i] ?? [], condicion)))
    .sort((a, b) => a.rango - b.rango || a.condicion.columna - b.condicion.columna)
    .slice(0, MAX_CANDIDATOS_ANCLA)
    .map((c) => c.condicion);
}

function reglaSeccion(hoja: GridHoja, marcas: Ubicada[], filasAncla: Set<number>, filasBloque: number[]): LecturaEstructurada["seccion"] | null {
  const col = marcas[0].col;
  const selectores = intersecar(marcas.map((u) => selectoresQueReproducen(u.texto, u.nucleo, u.completa))).sort((a, b) => rangoSelector(a) - rangoSelector(b));
  // Una etiqueta («TIPO:») es a la vez el selector y la condición más natural.
  const selector = selectores.find((s) => s.tipo === "etiqueta") ?? selectores[0];
  if (!selector) return null;
  const textos = marcas.map((u) => u.texto);
  const condiciones: CondicionLectura[] = [];
  if (selector.tipo === "etiqueta" && textos.every((t) => t.trim().toLocaleLowerCase("es").startsWith(selector.inicio.toLocaleLowerCase("es")))) condiciones.push({ columna: col, operador: "empieza", texto: selector.inicio });
  const rotulos = textos.map(prefijoRotulo);
  if (rotulos.every((r) => r && r.toLocaleLowerCase("es") === rotulos[0]!.toLocaleLowerCase("es"))) condiciones.push({ columna: col, operador: "empieza", texto: rotulos[0]! });
  const comun = prefijoComun(textos);
  if (comun) condiciones.push({ columna: col, operador: "empieza", texto: comun });
  condiciones.push({ columna: col, operador: "no_vacia" });
  const distintos = new Set(textos.map((t) => t.trim()));
  if (distintos.size === 1 && textos[0].trim().length <= 160) condiciones.push({ columna: col, operador: "igual", texto: textos[0].trim() });
  const filasMarcas = marcas.map((u) => u.idx);
  const condicion = condiciones.find((c) => filasMarcas.every((i) => evaluarCondicion(hoja.filas[i], c))
    && ![...filasAncla].some((i) => !filasMarcas.includes(i) && evaluarCondicion(hoja.filas[i], c))
    && !filasBloque.some((i) => evaluarCondicion(hoja.filas[i], c)));
  return condicion ? { condicion, fuente: { columna: col, desplazamientoFila: 0, selector } } : null;
}

function reglaTotal(hoja: GridHoja, u: Ubicada, tipo: "general" | "subtotal", filasAncla: Set<number>, texto: (i: number, c: number) => string): NonNullable<LecturaEstructurada["totales"]>[number] | null {
  const selectores = selectoresQueReproducen(u.texto, u.nucleo, u.completa).sort((a, b) => rangoSelector(a) - rangoSelector(b));
  const etiqueta = selectores.find((s) => s.tipo === "etiqueta");
  const condiciones: CondicionLectura[] = [];
  let selector = etiqueta ?? selectores[0];
  if (etiqueta && etiqueta.tipo === "etiqueta") condiciones.push({ columna: u.col, operador: "empieza", texto: etiqueta.inicio });
  // Importe solo en su celda: el rótulo es otra celda de la misma fila («TOTAL GENERAL»).
  const fila = hoja.filas[u.idx] ?? [];
  for (let c = 1; c <= fila.length; c++) {
    if (c === u.col) continue;
    const t = texto(u.idx, c).trim();
    if (!/\p{L}/u.test(t)) continue;
    const literal = prefijoRotulo(t) ?? rotuloSinCifras(t) ?? (t.length <= 160 ? t : null);
    if (literal) condiciones.push({ columna: c, operador: literal === t ? "igual" : "empieza", texto: literal });
    break;
  }
  if (!etiqueta) selector = selectores.find((s) => s.tipo === "completa") ?? selectores[0];
  if (!selector) return null;
  const condicion = condiciones.find((c) => evaluarCondicion(fila, c) && ![...filasAncla].some((i) => i !== u.idx && evaluarCondicion(hoja.filas[i], c)));
  return condicion ? { condicion, fuente: { columna: u.col, desplazamientoFila: 0, selector }, tipo } : null;
}

function reglaIgnorar(hoja: GridHoja, idx: number, motivo: string, filasAncla: Set<number>, filasBloque: number[], texto: (i: number, c: number) => string): NonNullable<LecturaEstructurada["ignorarFilas"]>[number] | null {
  const fila = hoja.filas[idx] ?? [];
  const col = fila.findIndex((v) => textoCelda(v).trim() !== "") + 1;
  if (col < 1) return null;
  const t = texto(idx, col).trim();
  const condiciones: CondicionLectura[] = [];
  const rotulo = prefijoRotulo(t);
  if (rotulo) condiciones.push({ columna: col, operador: "empieza", texto: rotulo });
  if (t.length <= 160) condiciones.push({ columna: col, operador: "igual", texto: t });
  else condiciones.push({ columna: col, operador: "empieza", texto: t.slice(0, 60) });
  const condicion = condiciones.find((c) => ![...filasAncla].some((i) => evaluarCondicion(hoja.filas[i], c)) && !filasBloque.some((i) => i !== idx && evaluarCondicion(hoja.filas[i], c)));
  return condicion ? { condicion, motivo } : null;
}
