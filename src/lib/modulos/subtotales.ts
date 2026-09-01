// Detección de filas de SUBTOTAL por clasificador en los archivos de módulos y CONTROL
// contra los movimientos del mismo archivo.
//
// Los archivos del ERP pueden traer, o no, un renglón de subtotal por cada cuenta/grupo
// («Total Materia prima», una fila sin referencia con el acumulado, un renglón en negrita…).
// Si ese renglón entra como ítem, el consolidado del módulo queda al DOBLE; si se descarta
// sin más, se pierde una verificación gratuita. Aquí:
//  1. `detectarSubtotales` marca las filas de subtotal combinando varias señales (el formato
//     varía por cliente/ERP): rótulo, fila sin detalle, negrita y ARITMÉTICA (la fila vale
//     lo mismo que el bloque contiguo de movimientos con el mismo clasificador).
//  2. `controlSubtotales` compara cada subtotal del archivo con la Σ de los movimientos de
//     su bloque tal como quedaron en el borrador (omitidas/en cero fuera) y reporta la
//     diferencia. NO bloquea la carga: el consolidado se calcula SIEMPRE desde los movimientos.
// Lógica pura: sin BD, sin React. Reutiliza la tolerancia del gran total.
import type { DescriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import { norm } from "./extraccion/sugerir";
import { TOLERANCIA_FILA_TOTALIZADORA, detectarFilasTotalizadoras } from "./fila-totalizadora";

export type SenalSubtotal = "rotulo" | "rotulo_debil" | "sin_detalle" | "negrita" | "aritmetica" | "aritmetica_arriba" | "marca_manual" | "cola";

/** Preferencia del perfil de formato (`SpecModulo.subtotales`). */
export type ModoSubtotales = "auto" | "rotulo" | "nunca" | "manual";
export const MODOS_SUBTOTALES: readonly ModoSubtotales[] = ["auto", "rotulo", "nunca", "manual"];

export type FilaCandidata = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, unknown>;
  tipoFila: string;
  omitida?: boolean | null;
  /** Negrita en las columnas clave (solo disponible al leer el archivo). */
  negrita?: boolean;
  /** Texto CRUDO de la celda del clasificador antes del arrastre/sección (solo al leer). */
  rotuloClasificador?: string | null;
  /** Motivo persistido de la detección (`motivoDe`): «gran_total:…» identifica el gran total en el control. */
  motivo?: string | null;
  /** Modo "manual": la columna marcadora elegida por el usuario señala esta fila (solo al leer). */
  marcaManual?: boolean;
  /** La fila fue ubicada expresamente por coordenada en ESTE archivo. */
  marcaManualExacta?: boolean;
};

export type BloqueSubtotal = {
  clasificador: string | null;
  /** filaNum de la primera y la última fila del bloque. */
  desde: number;
  hasta: number;
  indices: number[];
  suma: number;
  direccion: "arriba" | "abajo";
};

export type DeteccionSubtotal = {
  indice: number;
  filaNum: number;
  esSubtotal: boolean;
  /**
   * - `subtotal`     → control de un grupo (se compara contra la Σ de su bloque).
   * - `gran_total`   → el total que el archivo declara para TODO el detalle.
   * - `cola_control` → el resto del bloque de control al pie del archivo (cifras de
   *   referencia y sus diferencias). Se excluye del consolidado pero NO se valida: no es
   *   un subtotal del detalle, es una anotación del cliente.
   */
  clase: "subtotal" | "gran_total" | "cola_control" | null;
  senales: SenalSubtotal[];
  /** Clasificador del bloque al que pertenece el subtotal. */
  grupo: string | null;
  bloque: BloqueSubtotal | null;
};

export type ControlGrupo = {
  clasificador: string;
  filaSubtotal: number;
  bloque: { desde: number; hasta: number; items: number };
  sumaMovimientos: number;
  subtotalArchivo: number;
  /** subtotalArchivo − sumaMovimientos (2 decimales). */
  diferencia: number | null;
  estado: "cuadra" | "descuadre" | "no_validado";
};

export type ControlGranTotal = {
  filaNum: number;
  subtotalArchivo: number;
  sumaMovimientos: number;
  diferencia: number | null;
  estado: "cuadra" | "descuadre" | "no_validado";
};

export type ControlSubtotales = {
  grupos: ControlGrupo[];
  granTotal: ControlGranTotal | null;
  descuadres: number;
  noValidados: number;
};

export type EstadoGeneralControlSubtotales = "coincide" | "no_coincide" | "no_validado";

/** Estado literal del panel: nunca afirma un descuadre cuando faltan movimientos comparables. */
export function estadoGeneralControlSubtotales(control: ControlSubtotales): EstadoGeneralControlSubtotales {
  if (control.descuadres > 0) return "no_coincide";
  if (control.noValidados > 0 || (control.grupos.length === 0 && control.granTotal == null)) return "no_validado";
  return "coincide";
}

/** Un bloque de una sola fila no informa nada (la fila «cuadra» consigo misma). */
export const MINIMO_FILAS_BLOQUE = 2;

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** Tolerancia de DETECCIÓN: al menos 1 COP, o el 1 % del valor (misma que el gran total). */
export const toleranciaSubtotal = (valor: number): number => Math.max(1, Math.abs(valor) * TOLERANCIA_FILA_TOTALIZADORA);
/** Tolerancia de CONTROL: al peso (1 COP absorbe el redondeo a 2 decimales). Detectar
 *  admite holgura; validar no: un subtotal inflado en 150.000 debe acusar descuadre. */
export const TOLERANCIA_CONTROL = 1;

/** ¿El texto empieza por «total», «subtotal», «gran total», «totales»…? */
export const esRotuloTotal = (s: string): boolean => /^\s*(gran\s+)?(sub)?\s*-?total(es)?\b/i.test(s);

/** ¿Es el rótulo del GRAN total del archivo? («Total», «Gran total», «Total general»). */
export const esRotuloGranTotal = (s: string): boolean => /^\s*(gran\s+total|total\s+general|total(es)?)\s*:?\s*$/i.test(s.trim());

const NUMERO_MARCA_SUBTOTAL = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

/**
 * Modo "manual": ¿la celda de la COLUMNA MARCADORA señala que la fila es un subtotal?
 * Sin `patron`, basta con que la celda traiga texto (columna que solo se llena en los
 * subtotales); con un patrón textual, la celda debe contenerlo (normalizado, sin tildes
 * ni mayúsculas), para columnas tipo «TIPO» donde el valor es «TOTAL», «Total bodega 3»…
 * Un patrón numérico localizado por coordenada exige igualdad exacta: «120» no puede
 * marcar por accidente una fila cuyo valor sea «1200».
 */
export function coincideMarcaSubtotal(celda: unknown, patron?: string | null): boolean {
  const texto = celda == null ? "" : String(celda).trim();
  if (!texto) return false;
  const patronLimpio = String(patron ?? "").trim();
  const buscado = norm(patronLimpio);
  if (buscado && NUMERO_MARCA_SUBTOTAL.test(texto) && NUMERO_MARCA_SUBTOTAL.test(patronLimpio)) {
    return texto === patronLimpio;
  }
  return buscado ? norm(texto).includes(buscado) : true;
}

const ROTULOS_EXACTOS = new Set(["total", "totales", "subtotal", "sub total", "total general", "gran total", "sumas", "suma", "sumas iguales"]);

/** ¿El texto es un rótulo FUERTE de subtotal? Exacto, o «(sub)total (de) <grupo>». */
function esRotuloFuerte(texto: string, grupo: string | null): boolean {
  const n = norm(texto);
  if (!n) return false;
  if (ROTULOS_EXACTOS.has(n)) return true;
  if (grupo) {
    const g = norm(grupo);
    if (g && (n === `total ${g}` || n === `total de ${g}` || n === `subtotal ${g}` || n === `subtotal de ${g}` || n === `sub total ${g}` || n === `totales ${g}`)) return true;
  }
  return false;
}

/** ¿Rótulo DÉBIL? Empieza por (sub)total pero trae más texto («Total lubricantes 20W50»). */
function esRotuloDebil(texto: string): boolean {
  return esRotuloTotal(texto) && !ROTULOS_EXACTOS.has(norm(texto));
}

/**
 * Roles de TEXTO «de detalle» (referencia, documento, tercero, placa…): todo lo que no es
 * el clasificador ni su alterno. En un subtotal vienen vacíos. Si se pasa el spec, solo
 * cuentan los mapeados (columna ≥ 1): un rol sin columna siempre estaría vacío y sería
 * un falso positivo.
 */
export function columnasDetalle(descriptor: DescriptorModulo, spec?: Pick<SpecModulo, "columnas">): string[] {
  return descriptor.columnas
    .filter((c) => c.tipo === "texto" && c.nombre !== descriptor.clasificador && c.nombre !== descriptor.clasificadorAlterno)
    .filter((c) => !spec || (spec.columnas[c.nombre] ?? 0) >= 1)
    .map((c) => c.nombre);
}

const vacio = (v: unknown): boolean => v == null || v === "" || (typeof v === "string" && v.trim() === "");
const mismoClasificador = (a: string | null, b: string | null): boolean => norm(a ?? "") === norm(b ?? "");

/** Fila que participa en un bloque: movimiento, no omitida, con valor. */
const esMovimientoConValor = (f: FilaCandidata): boolean => f.tipoFila === "movimiento" && f.omitida !== true && f.valor !== 0;
/** Fila que puede SER subtotal: movimiento con valor, aunque venga omitida (la negrita del
 *  transform ya la omitió; si además es subtotal, debe pasar a `total` para entrar al control). */
const esCandidata = (f: FilaCandidata): boolean => f.tipoFila === "movimiento" && f.valor !== 0;

/**
 * Bloque contiguo de movimientos con el mismo clasificador que rodea a la fila `indice`.
 * Primero hacia ARRIBA (subtotal al pie del bloque, lo usual); si no cuadra o está vacío,
 * hacia ABAJO (subtotal en cabeza). Salta filas que no son movimiento con valor y las
 * ya marcadas como subtotal (`esSubtotal`); se detiene al cambiar el clasificador.
 * Devuelve el bloque que cuadra, o el de arriba (para reportar el descuadre), o null.
 */
export function bloqueDeSubtotal(
  filas: readonly FilaCandidata[],
  indice: number,
  esSubtotal: (i: number) => boolean,
  esParte: (f: FilaCandidata) => boolean = esMovimientoConValor,
): BloqueSubtotal | null {
  const candidato = filas[indice];
  if (!candidato) return null;
  const recorrer = (paso: 1 | -1): BloqueSubtotal | null => {
    const indices: number[] = [];
    let clasificador: string | null = null;
    let suma = 0;
    for (let i = indice + paso; i >= 0 && i < filas.length; i += paso) {
      if (esSubtotal(i)) break; // otro subtotal cierra el bloque
      const f = filas[i];
      if (!esParte(f)) continue;
      if (indices.length === 0) clasificador = f.clasificador;
      else if (!mismoClasificador(clasificador, f.clasificador)) break;
      indices.push(i);
      suma += f.valor;
    }
    if (indices.length === 0) return null;
    indices.sort((a, b) => a - b);
    return { clasificador, desde: filas[indices[0]].filaNum, hasta: filas[indices[indices.length - 1]].filaNum, indices, suma: redondear(suma), direccion: paso === -1 ? "arriba" : "abajo" };
  };
  const cuadra = (b: BloqueSubtotal | null): boolean => !!b && b.indices.length >= MINIMO_FILAS_BLOQUE && Math.abs(candidato.valor - b.suma) <= toleranciaSubtotal(candidato.valor);
  const arriba = recorrer(-1);
  if (cuadra(arriba)) return arriba;
  const abajo = recorrer(1);
  if (cuadra(abajo)) return abajo;
  return arriba ?? abajo;
}

/** El gran total no pertenece a ningún grupo: si su «clasificador» es el propio rótulo, queda null. */
const grupoGranTotal = (f: FilaCandidata): string | null => (f.clasificador != null && esRotuloTotal(f.clasificador) ? null : f.clasificador);

/** Textos de la fila donde puede venir el rótulo: columnas de texto del descriptor + crudo del clasificador. */
function textosDeFila(f: FilaCandidata, descriptor: DescriptorModulo): string[] {
  const out: string[] = [];
  if (f.rotuloClasificador) out.push(f.rotuloClasificador);
  for (const c of descriptor.columnas) {
    if (c.tipo !== "texto") continue;
    const v = f.datos[c.nombre];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}

/** Tope del bloque de cola: más allá de esto ya no es un cierre, es el archivo entero. */
export const MAX_FILAS_COLA_CONTROL = 25;

export type ColaControl = {
  /** Índices (en `filas`) de TODAS las filas del bloque de cola, en orden de archivo. */
  indices: number[];
  /** Índice de la fila que declara el total del detalle. Nunca null: sin ella no hay cola. */
  indiceGranTotal: number;
  /** Σ de los movimientos que quedan POR ENCIMA de la cola (el detalle real). */
  sumaDetalle: number;
};

/**
 * BLOQUE DE CONTROL AL PIE. Muchos archivos cierran con un cuadro de cierre en vez de un
 * renglón «Total»: «SALDO INVENTARIO DICIEMBRE 31/2025», «BALANCE DEL INVENTARIO»,
 * «SALDO CONTABILIDAD» y las diferencias entre ellas. Ningún rótulo dice «total», así que
 * la detección por texto no lo ve; y la aritmética global tampoco, porque esas cifras son
 * casi iguales entre sí y se anulan al buscar «la fila que vale la Σ de las demás».
 * Resultado sin esto: el cuadro entra como movimientos y multiplica el módulo.
 *
 * Criterio (puro, sin rótulos): desde el FINAL hacia arriba, toda fila cuyas columnas de
 * DETALLE vengan vacías es cola; se corta en la primera fila con detalle. La cola solo se
 * acepta si alguna de sus filas vale la Σ del detalle que queda arriba — esa es la
 * EVIDENCIA. Sin evidencia devuelve null y no se toca nada: una cola sin total comprobable
 * podría ser detalle legítimo sin referencia.
 */
export function detectarColaControl(
  filas: readonly FilaCandidata[],
  cols: readonly string[],
): ColaControl | null {
  // Sin columnas de detalle mapeadas no hay forma de distinguir cierre de detalle.
  if (cols.length === 0) return null;
  const sinDetalle = (f: FilaCandidata): boolean =>
    cols.every((c) => vacio(f.datos[c])) && (f.tipoFila === "movimiento" || f.tipoFila === "total");

  let corte = filas.length; // primer índice del bloque de cola
  for (let i = filas.length - 1; i >= 0; i--) {
    if (!sinDetalle(filas[i])) break;
    corte = i;
  }
  const indices = filas.map((_, i) => i).filter((i) => i >= corte && esCandidata(filas[i]));
  if (indices.length === 0 || filas.length - corte > MAX_FILAS_COLA_CONTROL) return null;

  const detalle = filas.filter((f, i) => i < corte && esMovimientoConValor(f));
  if (detalle.length < MINIMO_FILAS_BLOQUE) return null;
  const sumaDetalle = redondear(detalle.reduce((s, f) => s + f.valor, 0));

  // La primera fila de la cola (la más pegada al detalle) que valga la Σ del detalle.
  const indiceGranTotal = indices.find((i) => Math.abs(filas[i].valor - sumaDetalle) <= toleranciaSubtotal(filas[i].valor));
  if (indiceGranTotal == null) return null;
  return { indices, indiceGranTotal, sumaDetalle };
}

/**
 * Filas de control posteriores a una coordenada manual exacta. La coordenada manda sobre
 * la aritmética; el sufijo solo se excluye si TODAS sus filas carecen de detalle. Si aparece
 * detalle real después, no se toca el sufijo y el control del gran total acusará el descuadre.
 */
function colaPosteriorManualExacta(
  filas: readonly FilaCandidata[],
  indiceGranTotal: number,
  cols: readonly string[],
): number[] {
  if (cols.length === 0) return [];
  const posteriores = filas.slice(indiceGranTotal + 1);
  if (posteriores.length === 0 || posteriores.length > MAX_FILAS_COLA_CONTROL) return [];
  if (posteriores.some((f) => cols.some((c) => !vacio(f.datos[c])))) return [];
  return filas
    .map((_, i) => i)
    .filter((i) => i > indiceGranTotal && esCandidata(filas[i]));
}

/**
 * Marca las filas de SUBTOTAL (por grupo) y el GRAN TOTAL de un archivo. Solo evalúa
 * movimientos con valor; procesa en orden de archivo y cada subtotal detectado queda fuera
 * de los bloques siguientes.
 *
 * Criterio (según `modo`):
 *  - "nunca"  → no marca nada (queda solo la negrita del transform).
 *  - "rotulo" → rótulo fuerte, o rótulo débil + (sin detalle | negrita | aritmética).
 *  - "auto"   → lo anterior, o aritmética + (sin detalle | negrita). Un candidato con
 *               clasificador propio distinto al del bloque y sin rótulo NO es subtotal
 *               (es la primera fila del grupo siguiente).
 *  - "manual" → con coordenada exacta, ESA fila es el gran total y solo el sufijo posterior
 *               sin columnas de detalle se excluye como cuadro de control. Sin coordenada
 *               conserva el legado por patrón (`marcaManual`) para perfiles administrados.
 * Un rótulo fuerte que NO cuadra sigue siendo subtotal: ese es justamente el descuadre a reportar.
 */
export function detectarSubtotales(
  filas: readonly FilaCandidata[],
  descriptor: DescriptorModulo,
  opts: { modo?: ModoSubtotales; columnasDetalle?: string[] } = {},
): DeteccionSubtotal[] {
  const modo = opts.modo ?? "auto";
  const cols = opts.columnasDetalle ?? columnasDetalle(descriptor);
  const marcados = new Set<number>();
  const esMarcado = (i: number) => marcados.has(i);
  const resultado: DeteccionSubtotal[] = [];
  if (modo === "nunca") return resultado;

  // La coordenada que el usuario ubicó contra el original íntegro es autoridad para ESTE
  // archivo: nunca se degrada a subtotal de grupo aunque también cuadre con el bloque previo.
  if (modo === "manual") {
    const indiceExacto = filas.findIndex((f) => f.marcaManualExacta === true);
    if (indiceExacto >= 0) {
      const exacta = filas[indiceExacto];
      marcados.add(indiceExacto);
      resultado.push({
        indice: indiceExacto,
        filaNum: exacta.filaNum,
        esSubtotal: true,
        clase: "gran_total",
        senales: ["marca_manual"],
        grupo: grupoGranTotal(exacta),
        bloque: null,
      });
      for (const i of colaPosteriorManualExacta(filas, indiceExacto, cols)) {
        marcados.add(i);
        resultado.push({
          indice: i,
          filaNum: filas[i].filaNum,
          esSubtotal: true,
          clase: "cola_control",
          senales: ["cola", "sin_detalle"],
          grupo: grupoGranTotal(filas[i]),
          bloque: null,
        });
      }
    }
  }

  // FASE 0 — bloque de control al pie (solo en "auto": es aritmética, no rótulo, y los modos
  // "rotulo"/"manual" prometen que nada se marca fuera de su criterio). Sus filas quedan
  // marcadas de entrada, así que ni el barrido de subtotales ni el del gran total las ven.
  const cola = modo === "auto" ? detectarColaControl(filas, cols) : null;
  if (cola) {
    // El RÓTULO manda sobre la cola: si la fila que cuadra con el detalle dice «Total …»,
    // la detección normal ya sabe leerla (y distingue subtotal de gran total mejor que la
    // aritmética sola), así que se deja pasar. Las demás filas del cierre igual se excluyen.
    const conRotulo = textosDeFila(filas[cola.indiceGranTotal], descriptor).some(esRotuloTotal);
    for (const i of cola.indices) {
      const esGran = i === cola.indiceGranTotal;
      if (esGran && conRotulo) continue;
      marcados.add(i);
      resultado.push({
        indice: i,
        filaNum: filas[i].filaNum,
        esSubtotal: true,
        clase: esGran ? "gran_total" : "cola_control",
        senales: esGran ? ["cola", "sin_detalle", "aritmetica"] : ["cola", "sin_detalle"],
        grupo: grupoGranTotal(filas[i]),
        bloque: null,
      });
    }
  }

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (marcados.has(i) || !esCandidata(f)) continue;
    const bloque = bloqueDeSubtotal(filas, i, esMarcado);
    const grupo = bloque?.clasificador ?? f.clasificador;
    const textos = textosDeFila(f, descriptor);
    const senales: SenalSubtotal[] = [];
    if (textos.some((t) => esRotuloFuerte(t, grupo) || (f.clasificador != null && esRotuloFuerte(t, f.clasificador)))) senales.push("rotulo");
    else if (textos.some(esRotuloDebil)) senales.push("rotulo_debil");
    if (cols.length > 0 && cols.every((c) => vacio(f.datos[c])) && (f.clasificador != null || f.rotuloClasificador != null)) senales.push("sin_detalle");
    if (f.negrita === true) senales.push("negrita");
    if (bloque && bloque.indices.length >= MINIMO_FILAS_BLOQUE && Math.abs(f.valor - bloque.suma) <= toleranciaSubtotal(f.valor)) {
      senales.push(bloque.direccion === "arriba" ? "aritmetica" : "aritmetica_arriba");
    }

    if (modo === "manual" && f.marcaManual === true) senales.unshift("marca_manual");
    const rotulo = senales.includes("rotulo");
    const debil = senales.includes("rotulo_debil");
    const sinDetalle = senales.includes("sin_detalle");
    const negrita = senales.includes("negrita");
    const aritmetica = senales.includes("aritmetica") || senales.includes("aritmetica_arriba");
    let esSubtotal = modo === "manual"
      ? senales.includes("marca_manual")
      : rotulo || (debil && (sinDetalle || negrita || aritmetica));
    if (!esSubtotal && modo === "auto" && aritmetica && (sinDetalle || negrita)) {
      // Sin rótulo: si trae su propio clasificador y es OTRO que el del bloque, es un ítem
      // del grupo siguiente que casualmente vale lo mismo, no un subtotal.
      const propio = f.rotuloClasificador ?? f.clasificador;
      esSubtotal = !(propio != null && bloque != null && !mismoClasificador(propio, bloque.clasificador) && !esRotuloTotal(propio));
    }
    if (!esSubtotal) continue;
    marcados.add(i);
    // Rótulo de GRAN total («Gran total», «Total general») que no cuadra con ningún bloque
    // parcial: es el total del archivo, no un subtotal de grupo.
    const granPorRotulo = rotulo && !aritmetica && textos.some(esRotuloGranTotal);
    resultado.push(granPorRotulo
      ? { indice: i, filaNum: f.filaNum, esSubtotal: true, clase: "gran_total", senales, grupo: grupoGranTotal(f), bloque: null }
      : { indice: i, filaNum: f.filaNum, esSubtotal: true, clase: "subtotal", senales, grupo, bloque });
  }

  // GRAN TOTAL: entre los subtotales ya marcados y los movimientos restantes, la fila cuyo
  // valor equivale a la Σ de TODOS los movimientos restantes (los subtotales ya no suman).
  const restantes = filas
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) => !marcados.has(i) && esMovimientoConValor(f));
  const sumaRestantes = redondear(restantes.reduce((s, { f }) => s + f.valor, 0));
  // Candidatos: (a) movimientos restantes con señal de total (rótulo/sin detalle/negrita) que
  // valgan la Σ del resto; (b) subtotales ya marcados que valgan la Σ de TODOS los restantes.
  const totalizadoras = new Set(detectarFilasTotalizadoras(restantes.map(({ f }) => ({ filaNum: f.filaNum, valor: f.valor }))).map((t) => t.filaNum));
  // En modo "manual" NADA se marca por cuenta propia: si el gran total no trae la marca,
  // no es un subtotal (esa es la promesa del modo).
  for (const { f, i } of modo === "manual" ? [] : restantes) {
    if (!totalizadoras.has(f.filaNum)) continue;
    const textos = textosDeFila(f, descriptor);
    const senales: SenalSubtotal[] = [];
    if (textos.some((t) => esRotuloGranTotal(t) || esRotuloFuerte(t, null))) senales.push("rotulo");
    if (cols.length > 0 && cols.every((c) => vacio(f.datos[c]))) senales.push("sin_detalle");
    if (f.negrita === true) senales.push("negrita");
    if (senales.length === 0 || (modo === "rotulo" && !senales.includes("rotulo"))) continue;
    senales.push("aritmetica");
    marcados.add(i);
    resultado.push({ indice: i, filaNum: f.filaNum, esSubtotal: true, clase: "gran_total", senales, grupo: grupoGranTotal(f), bloque: null });
    break;
  }
  if (!resultado.some((r) => r.clase === "gran_total") && restantes.length >= MINIMO_FILAS_BLOQUE) {
    // Un subtotal marcado por rótulo (fuerte o débil: «Total cartera») que en realidad suma
    // TODO el archivo y no cuadra con su bloque es el gran total.
    const candidato = resultado.find((r) =>
      r.clase === "subtotal"
      && (r.senales.includes("rotulo") || r.senales.includes("rotulo_debil") || r.senales.includes("marca_manual"))
      && !r.senales.includes("aritmetica") && !r.senales.includes("aritmetica_arriba")
      && Math.abs(filas[r.indice].valor - sumaRestantes) <= toleranciaSubtotal(sumaRestantes));
    if (candidato) { candidato.clase = "gran_total"; candidato.bloque = null; candidato.grupo = grupoGranTotal(filas[candidato.indice]); }
  }
  return resultado.sort((a, b) => a.indice - b.indice);
}

/** Motivo legible/persistible de una detección: «subtotal:rotulo,aritmetica». */
export function motivoDe(d: DeteccionSubtotal): string {
  return `${d.clase ?? "subtotal"}:${d.senales.join(",")}`;
}

/**
 * CONTROL: para cada fila `tipoFila === "total"` recalcula su bloque sobre las filas
 * ACTUALES del borrador (respetando `omitida`/en cero vía `esImputableFn`) y compara. Si
 * la fila se detectó como gran total (motivo) o equivale a la Σ de todos los imputables sin
 * cuadrar con un bloque parcial, se reporta como gran total.
 * Al rescatar un subtotal (pasa a movimiento) sale del control solo.
 */
export function controlSubtotales(
  filas: readonly FilaCandidata[],
  esImputableFn: (f: FilaCandidata) => boolean = (f) => f.tipoFila === "movimiento" && f.omitida !== true && f.valor !== 0,
): ControlSubtotales {
  const esTotal = (i: number) => filas[i]?.tipoFila === "total";
  const imputables = filas.filter(esImputableFn);
  const sumaTodo = redondear(imputables.reduce((s, f) => s + f.valor, 0));
  const grupos: ControlGrupo[] = [];
  let granTotal: ControlGranTotal | null = null;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!esTotal(i)) continue;
    const bloque = bloqueDeSubtotal(filas, i, esTotal, esImputableFn);
    const tol = toleranciaSubtotal(f.valor);
    const cuadraBloque = bloque != null && bloque.indices.length >= MINIMO_FILAS_BLOQUE && Math.abs(f.valor - bloque.suma) <= tol;
    const cuadraTodo = imputables.length >= MINIMO_FILAS_BLOQUE && Math.abs(f.valor - sumaTodo) <= tol;
    // Gran total: vale la Σ de TODO y no la de un bloque parcial (con un solo grupo, el
    // bloque y el todo coinciden y se reporta como grupo).
    const esGran = f.motivo?.startsWith("gran_total") || (cuadraTodo && !cuadraBloque);
    if (esGran && granTotal == null) {
      const comparable = imputables.length >= MINIMO_FILAS_BLOQUE;
      const diferencia = comparable ? redondear(f.valor - sumaTodo) : null;
      granTotal = {
        filaNum: f.filaNum,
        subtotalArchivo: f.valor,
        sumaMovimientos: sumaTodo,
        diferencia,
        estado: !comparable ? "no_validado" : Math.abs(diferencia ?? 0) <= TOLERANCIA_CONTROL ? "cuadra" : "descuadre",
      };
      continue;
    }
    const suma = bloque?.suma ?? 0;
    const comparable = bloque != null && bloque.indices.length >= MINIMO_FILAS_BLOQUE;
    const diferencia = comparable ? redondear(f.valor - suma) : null;
    grupos.push({
      clasificador: (bloque?.clasificador ?? f.clasificador)?.trim() || "(sin clasificar)",
      filaSubtotal: f.filaNum,
      bloque: bloque ? { desde: bloque.desde, hasta: bloque.hasta, items: bloque.indices.length } : { desde: f.filaNum, hasta: f.filaNum, items: 0 },
      sumaMovimientos: suma,
      subtotalArchivo: f.valor,
      diferencia,
      estado: !comparable ? "no_validado" : Math.abs(diferencia ?? 0) <= TOLERANCIA_CONTROL ? "cuadra" : "descuadre",
    });
  }
  const descuadres = grupos.filter((g) => g.estado === "descuadre").length + (granTotal?.estado === "descuadre" ? 1 : 0);
  const noValidados = grupos.filter((g) => g.estado === "no_validado").length + (granTotal?.estado === "no_validado" ? 1 : 0);
  return { grupos, granTotal, descuadres, noValidados };
}

/** Descripción del modo de subtotales para la UI. */
export function descripcionModoSubtotales(modo: ModoSubtotales): string {
  switch (modo) {
    case "rotulo":
      return "Solo por rótulo: filas que digan «Total»/«Subtotal»";
    case "nunca":
      return "Desactivada: ningún renglón se toma como total (salvo negrita)";
    case "manual":
      return "Manual: los marca la celda que indique el usuario";
    default:
      return "Automática: por rótulo, cuadro de cierre al pie, o suma del bloque + fila sin detalle/negrita";
  }
}
