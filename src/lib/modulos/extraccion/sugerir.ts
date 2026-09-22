// Sugeridor HEURÍSTICO de columnas (sin IA): detecta la fila de encabezado y mapea cada
// columna al rol del descriptor cuyo sinónimo/etiqueta mejor coincide con el texto del
// encabezado. Da un punto de partida para el wizard; el usuario lo corrige a mano.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo, RolColumna } from "../descriptores";
import { esRotuloEdad, saldoFavorRedundante } from "../cartera/edades";
import { esIdentificadorVacio } from "../cartera/identificador-compartido";
import { monedaPorNombreHoja } from "../cartera/moneda";
import type { SpecModulo } from "./esquema";

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (s: unknown) =>
  sinAcentos(String(s ?? "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ENCABEZADOS_INGRESO_NETO_SEGUROS = [
  "subtotal",
  "base gravable",
  "venta neta",
  "ingreso neto",
  "sin iva",
  "sin impuestos",
  "valor sin iva",
  "valor sin impuestos",
];

/**
 * Un total de factura suele incluir IVA/otros impuestos y no es comparable con
 * la cuenta 41. Se considera ambiguo salvo que el encabezado declare de forma
 * inequívoca una base neta/sin impuestos.
 */
export function encabezadoValorIngresoAmbiguo(encabezado: unknown): boolean {
  const texto = norm(encabezado);
  if (!texto) return false;
  if (ENCABEZADOS_INGRESO_NETO_SEGUROS.some((seguro) => texto === seguro || texto.includes(seguro))) {
    return false;
  }
  return texto.split(" ").includes("total");
}

/**
 * Invalida únicamente el rol monetario peligroso de ING; conserva el resto del
 * perfil para que el usuario solo tenga que volver a escoger el ingreso neto.
 */
export function invalidarValorAmbiguoIngresos(
  descriptor: DescriptorModulo,
  hoja: GridHoja,
  spec: SpecModulo,
): { spec: SpecModulo; invalidado: boolean } {
  if (descriptor.codigo !== "ING") return { spec, invalidado: false };
  const columna = spec.columnas[descriptor.valor] ?? 0;
  const encabezado = columna > 0
    ? hoja.filas[spec.filaEncabezado - 1]?.[columna - 1]
    : null;
  if (!encabezadoValorIngresoAmbiguo(encabezado)) return { spec, invalidado: false };
  return {
    spec: {
      ...spec,
      columnas: { ...spec.columnas, [descriptor.valor]: 0 },
    },
    invalidado: true,
  };
}

/**
 * Puntaje de coincidencia encabezado↔rol. Prefiere el match EXACTO, luego que el
 * encabezado CONTENGA la clave (encabezado específico), y por último que la clave
 * contenga al encabezado (fragmento débil). 0 = sin match.
 * Exportada: `transformarModulo` la reutiliza para NO sembrar el arrastre del clasificador
 * con la etiqueta del encabezado (ver `transformar.ts`).
 */
export function puntajeRol(headerNorm: string, rc: RolColumna): number {
  if (!headerNorm) return 0;
  const claves = [rc.etiqueta, rc.nombre, ...(rc.sinonimos ?? [])].map(norm).filter(Boolean);
  let mejor = 0;
  for (const k of claves) {
    if (headerNorm === k) mejor = Math.max(mejor, 1000 + k.length);
    else if (headerNorm.includes(k)) mejor = Math.max(mejor, 500 + k.length);
    else if (k.includes(headerNorm)) mejor = Math.max(mejor, headerNorm.length);
  }
  return mejor;
}

/** Fila de encabezado = la de las primeras `maxFilas` con más columnas que matchean algún rol. */
function detectarEncabezado(descriptor: DescriptorModulo, hoja: GridHoja, maxFilas = 15): number {
  let mejorFila = 1;
  let mejorScore = -1;
  const lim = Math.min(hoja.filas.length, maxFilas);
  for (let r = 0; r < lim; r++) {
    const fila = hoja.filas[r] ?? [];
    // Fila de METADATOS del reporte («Fecha de corte: … | Cifras: PESOS | Moneda: COP»): sus
    // rótulos terminan en dos puntos y nombran roles del módulo sin serlo; en SIESA le ganaban
    // al encabezado real. Solo en los módulos con detalle por tercero.
    if (descriptor.crucePorTercero.detalleTercero && fila.filter((c) => typeof c === "string" && /:\s*$/.test(c)).length >= 2) continue;
    let score = 0;
    for (const celda of fila) {
      const h = norm(celda);
      if (descriptor.columnas.some((rc) => puntajeRol(h, rc) > 0)) score += 1;
      // Una columna de familia (un balde de edad) también identifica el encabezado: sin
      // esto, en SIESA ganaba la fila del supra-rótulo «Vencido» sobre la de los rangos.
      else if (descriptor.familiasDinamicas?.some((f) => f.detector(celda))) score += 1;
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejorFila = r + 1;
    }
  }
  return mejorFila;
}

/**
 * Columnas de cada FAMILIA dinámica presentes en el encabezado, con su rótulo literal y su
 * clase. Se resuelven ANTES del reparto de roles y sus columnas quedan fuera de él: si no,
 * un balde rotulado «Total 90» compite por el rol `total` y se lleva el saldo de la fila.
 */
export function detectarFamilias(
  descriptor: DescriptorModulo,
  header: readonly unknown[],
): NonNullable<SpecModulo["familias"]> | undefined {
  const familias = descriptor.familiasDinamicas ?? [];
  if (familias.length === 0) return undefined;
  const salida: NonNullable<SpecModulo["familias"]> = {};
  for (const familia of familias) {
    const columnas: NonNullable<SpecModulo["familias"]>[string] = [];
    for (let c = 0; c < header.length; c++) {
      const celda = header[c];
      if (celda == null || String(celda).trim() === "") continue;
      if (!familia.detector(celda)) continue;
      const clase = familia.nombre === "edades" ? esRotuloEdad(celda)?.clase : undefined;
      columnas.push({
        columna: c + 1,
        etiqueta: String(celda).replace(/\s+/g, " ").trim().slice(0, 80),
        ...(clase ? { clase } : {}),
      });
    }
    if (columnas.length) salida[familia.nombre] = columnas;
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
}

/**
 * ¿El archivo trae el tercero en una fila de CABECERA con sus documentos debajo? Se decide
 * con los datos, no con el encabezado: se cuentan las filas donde el identificador viene
 * solo (sin documento) y las que traen documento sin identificador. Si ambas formas son
 * frecuentes, el reporte es jerárquico.
 */
export function detectarTerceroModo(
  hoja: GridHoja,
  spec: Pick<SpecModulo, "primeraFilaDatos" | "columnas">,
  rolClave: string,
  maxFilas = 200,
): "columna" | "cabecera" {
  const colClave = spec.columnas[rolClave] ?? 0;
  const colDocumento = spec.columnas.documento ?? 0;
  if (colClave < 1 || colDocumento < 1) return "columna";
  let soloClave = 0;
  let soloDocumento = 0;
  let ambos = 0;
  let total = 0;
  const desde = Math.max(0, spec.primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    // La marca de relleno del ERP («*» en los documentos de Mineralin) no es un identificador:
    // contarla como tal hace que un reporte jerárquico parezca plano.
    const claveCruda = String(fila[colClave - 1] ?? "").trim();
    const clave = esIdentificadorVacio(claveCruda) ? "" : claveCruda;
    const documento = String(fila[colDocumento - 1] ?? "").trim();
    if (!clave && !documento) continue;
    total++;
    if (clave && !documento) soloClave++;
    else if (!clave && documento) soloDocumento++;
    else ambos++;
  }
  if (total === 0) return "columna";
  const UMBRAL = 0.15;
  if (soloClave / total > UMBRAL && soloDocumento / total > UMBRAL) return "cabecera";
  // Muchos documentos por proveedor diluyen las cabeceras por debajo del umbral (SAP Redplas:
  // 21 de 179 filas). Si ninguna fila trae identificador y documento a la vez, es jerárquico.
  return ambos === 0 && soloClave >= 3 && soloDocumento >= 3 ? "cabecera" : "columna";
}

/**
 * Sugiere un `SpecModulo` para una hoja: detecta encabezado y asigna columnas a roles de
 * forma greedy (mayor puntaje primero; cada columna y cada rol se usan una sola vez).
 */
/**
 * Columna del identificador del tercero reconocida por su CONTENIDO, para los reportes de
 * SIESA donde ningún encabezado la nombra: en Zarzal comparte la columna «Documento» y en el
 * detalle de Mineralin va en una columna sin encabezado. La delatan los dígitos EN NEGRITA de
 * las cabeceras de tercero y de sección, intercalados con el resto de filas.
 *
 * Solo mira la columna del documento y las que no tienen encabezado ni rol, y solo en archivos
 * con «#Ter.» y negrita: sin esas dos señales no hay evidencia fiable y devuelve 0.
 */
export function columnaIdentificadorPorContenido(
  hoja: GridHoja,
  filaEncabezado: number,
  columnas: Readonly<Record<string, number>>,
  reservadas: ReadonlySet<number>,
  maxFilas = 400,
): number {
  const negrita = hoja.negrita;
  if (!negrita || (columnas.marcaSeccion ?? 0) < 1) return 0;
  const header = hoja.filas[filaEncabezado - 1] ?? [];
  const ocupante = new Map<number, string>();
  for (const [rol, col] of Object.entries(columnas)) if (col >= 1) ocupante.set(col, rol);
  const ancho = hoja.filas.reduce((m, f) => Math.max(m, f?.length ?? 0), 0);
  const desde = filaEncabezado; // 0-based: primera fila de datos
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  let mejor = 0;
  let mejorPuntaje = 0;
  for (let c = 1; c <= ancho; c++) {
    if (reservadas.has(c)) continue;
    const rol = ocupante.get(c);
    const sinEncabezado = String(header[c - 1] ?? "").trim() === "";
    if (!(rol === "documento" || (!rol && sinEncabezado))) continue;
    let conValor = 0;
    let enNegrita = 0;
    for (let r = desde; r < hasta; r++) {
      const v = String((hoja.filas[r] ?? [])[c - 1] ?? "").trim();
      if (esIdentificadorVacio(v)) continue;
      conValor++;
      if (/^\d{5,13}$/.test(v) && negrita[r]?.[c - 1] === true) enNegrita++;
    }
    if (enNegrita >= 5 && enNegrita / conValor >= 0.05 && enNegrita > mejorPuntaje) {
      mejor = c;
      mejorPuntaje = enNegrita;
    }
  }
  return mejor;
}

/** ¿Algún texto de la fila es un rótulo de total («Total», «TOTAL PROVEEDOR», «Total general»)? */
const esFilaConRotuloTotal = (fila: readonly unknown[]): boolean =>
  fila.some((c) => typeof c === "string" && /^\s*(?:sub\s*)?totale?s?\b/i.test(c));

/** Valor de una fila para votar su signo: la columna de valor o, sin ella, la Σ de las edades. */
function valorParaVoto(fila: readonly unknown[], spec: Pick<SpecModulo, "columnas" | "familias">, rolValor: string): number {
  const colValor = spec.columnas[rolValor] ?? 0;
  const v = colValor >= 1 ? fila[colValor - 1] : null;
  if (typeof v === "number" && v !== 0) return v;
  let suma = 0;
  for (const c of spec.familias?.edades ?? []) {
    if (c.clase === "excluir") continue;
    const x = fila[c.columna - 1];
    if (typeof x === "number") suma += x;
  }
  return suma;
}

/**
 * ¿El archivo imprime la deuda en NEGATIVO? Vota el signo de las filas con valor, sin las de
 * total: 4 de los 16 auxiliares de CxP reales (SAP Business One, ILIMITADA) presentan el
 * pasivo con signo contable, y el módulo lo guarda en positivo.
 */
export function detectarConvencionSigno(
  hoja: GridHoja,
  spec: Pick<SpecModulo, "primeraFilaDatos" | "columnas" | "familias">,
  rolValor: string,
  maxFilas = 2000,
): boolean {
  let positivos = 0;
  let negativos = 0;
  const desde = Math.max(0, spec.primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    if (esFilaConRotuloTotal(fila)) continue;
    const v = valorParaVoto(fila, spec, rolValor);
    if (v > 0) positivos++;
    else if (v < 0) negativos++;
  }
  return negativos >= 3 && negativos > positivos;
}

/** Un número de «días vencidos» por encima de esto (50 años) es un importe. */
const MAX_DIAS_VENCIDOS = 18_300;

/**
 * ¿La columna mapeada como días vencidos trae días? «Vencido» de Helisa entra por el sinónimo
 * «dias vencidos» y es un importe. Los días son enteros de pocas cifras: si la mayoría de los
 * valores no lo son, la columna no es de días.
 */
function columnaConDias(hoja: GridHoja, primeraFilaDatos: number, columna: number, maxFilas = 500): boolean {
  let numeros = 0;
  let noDias = 0;
  const desde = Math.max(0, primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const v = hoja.filas[r]?.[columna - 1];
    if (typeof v !== "number" || v === 0) continue;
    numeros++;
    if (!Number.isInteger(v) || Math.abs(v) > MAX_DIAS_VENCIDOS) noDias++;
  }
  return numeros === 0 || noDias * 2 <= numeros;
}

/**
 * ¿La columna de valor es el SALDO DEL BLOQUE y no el del documento? SIIGO lo imprime solo en
 * la primera fila de cada proveedor-cuenta y deja el importe de cada documento en las edades:
 * tomarlo como valor contaría el saldo del proveedor en cada documento del bloque. Se
 * reconoce porque, entre las filas con edades, la columna viene llena en pocas y casi siempre
 * en la primera del bloque.
 */
export function detectarSaldoDeBloque(
  hoja: GridHoja,
  spec: Pick<SpecModulo, "primeraFilaDatos" | "columnas" | "familias">,
  rolValor: string,
  rolClave: string,
  maxFilas = 2000,
): boolean {
  const colValor = spec.columnas[rolValor] ?? 0;
  const colClave = spec.columnas[rolClave] ?? 0;
  const colCuenta = spec.columnas.cuenta ?? 0;
  const baldes = spec.familias?.edades ?? [];
  if (colValor < 1 || colClave < 1 || baldes.length === 0) return false;
  let conEdades = 0;
  let conValor = 0;
  let enPrimeraDelBloque = 0;
  let continuaciones = 0;
  let bloqueAnterior: string | null = null;
  const desde = Math.max(0, spec.primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    if (esFilaConRotuloTotal(fila)) continue;
    const clave = String(fila[colClave - 1] ?? "").trim();
    const cuenta = colCuenta >= 1 ? String(fila[colCuenta - 1] ?? "").trim() : "";
    const bloque = clave ? clave + "|" + cuenta : null;
    // Neto de las edades: un proveedor en cero con un débito y un crédito que se compensan
    // (Mineralin) no es un documento con importe.
    let netoEdades = 0;
    for (const c of baldes) {
      const x = fila[c.columna - 1];
      if (typeof x === "number" && c.clase !== "excluir") netoEdades += x;
    }
    const tieneEdades = Math.abs(netoEdades) >= 0.005;
    if (tieneEdades) {
      conEdades++;
      const v = fila[colValor - 1];
      if (typeof v === "number" && v !== 0) {
        conValor++;
        if (bloque != null && bloque !== bloqueAnterior) enPrimeraDelBloque++;
      } else if (bloque != null && bloque === bloqueAnterior) {
        continuaciones++;
      }
    }
    if (bloque != null) bloqueAnterior = bloque;
  }
  // Sin filas de continuación no hay bloque: cada proveedor es una fila y la columna es su saldo.
  return conEdades >= 5 && conValor > 0 && continuaciones > 0 && conValor / conEdades < 0.6 && enPrimeraDelBloque / conValor >= 0.8;
}

/**
 * Fila ROTULADA de proveedor (SEVEN): «PROVEEDOR | 10126963 | HERNAN OROZCO» en las columnas de
 * tipo, número y factura, con los documentos debajo. El NIT no tiene columna propia: vive a la
 * derecha del rótulo, solo en esas filas. Se reconoce porque el mismo texto se repite en una de
 * las primeras columnas y casi siempre lleva dígitos de identificador al lado.
 */
export function detectarFilaTercero(
  hoja: GridHoja,
  primeraFilaDatos: number,
  maxFilas = 600,
): NonNullable<SpecModulo["filaTercero"]> | null {
  const conteo = new Map<string, { columna: number; texto: string; filas: number; conClave: number; conNombre: number }>();
  const desde = Math.max(0, primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    for (let c = 0; c < Math.min(fila.length, 6); c++) {
      const v = fila[c];
      if (typeof v !== "string") continue;
      const texto = v.replace(/\s+/g, " ").trim();
      if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ .]{3,20}$/.test(texto) || /total/i.test(texto)) continue;
      const k = c + "|" + texto.toUpperCase();
      const e = conteo.get(k) ?? { columna: c + 1, texto, filas: 0, conClave: 0, conNombre: 0 };
      e.filas++;
      if (/^\d{5,13}$/.test(String(fila[c + 1] ?? "").trim())) e.conClave++;
      if (typeof fila[c + 2] === "string" && /[A-Za-z]/.test(fila[c + 2] as string)) e.conNombre++;
      conteo.set(k, e);
    }
  }
  let mejor: { columna: number; texto: string; filas: number; conClave: number; conNombre: number } | null = null;
  for (const e of conteo.values()) {
    if (e.filas >= 5 && e.conClave / e.filas >= 0.8 && (!mejor || e.filas > mejor.filas)) mejor = e;
  }
  if (!mejor) return null;
  return {
    columnaRotulo: mejor.columna,
    texto: mejor.texto,
    columnaClave: mejor.columna + 1,
    ...(mejor.conNombre / mejor.filas >= 0.8 ? { columnaNombre: mejor.columna + 2 } : {}),
  };
}

export function sugerirSpec(descriptor: DescriptorModulo, hoja: GridHoja): SpecModulo {
  const filaEncabezado = detectarEncabezado(descriptor, hoja);
  const header = hoja.filas[filaEncabezado - 1] ?? [];
  const columnas: Record<string, number> = Object.fromEntries(descriptor.columnas.map((rc) => [rc.nombre, 0]));

  // Las familias se reservan PRIMERO y sus columnas salen del reparto de roles.
  const familias = detectarFamilias(descriptor, header);
  const reservadas = new Set<number>();
  for (const columnasFamilia of Object.values(familias ?? {})) {
    for (const c of columnasFamilia) reservadas.add(c.columna);
  }

  const candidatos: { col: number; rol: string; score: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    if (reservadas.has(c + 1)) continue;
    const h = norm(header[c]);
    for (const rc of descriptor.columnas) {
      const s = puntajeRol(h, rc);
      if (s > 0) candidatos.push({ col: c + 1, rol: rc.nombre, score: s });
    }
  }
  // Desempate: el match DÉBIL (la clave contiene al encabezado) puntúa `headerNorm.length`
  // para TODOS los roles que lo contengan, así que un encabezado genérico como «COSTO»
  // empata entre «costo total» (valorTotal) y «costo unitario» (valorUnitario). Sin criterio,
  // ganaba el rol declarado primero en el descriptor y el archivo quedaba mapeado al
  // unitario: el valor total se DERIVABA como cantidad × unitario y el módulo se multiplicaba.
  // A igual puntaje gana el rol REQUERIDO (el que el archivo debe traer sí o sí); el opcional
  // se deriva después. Último criterio: la columna más a la izquierda, para ser determinista.
  const esRequerido = new Map(descriptor.columnas.map((rc) => [rc.nombre, rc.requerido === true]));
  candidatos.sort((a, b) =>
    b.score - a.score
    || Number(esRequerido.get(b.rol) ?? false) - Number(esRequerido.get(a.rol) ?? false)
    || a.col - b.col);
  const colUsada = new Set<number>();
  const rolUsado = new Set<string>();
  for (const cand of candidatos) {
    if (colUsada.has(cand.col) || rolUsado.has(cand.rol)) continue;
    columnas[cand.rol] = cand.col;
    colUsada.add(cand.col);
    rolUsado.add(cand.rol);
  }

  // Identificador del tercero por CONTENIDO cuando ningún encabezado lo nombró (SIESA).
  const rolIdentificador = descriptor.crucePorTercero.rolClave;
  if (descriptor.crucePorTercero.detalleTercero && rolIdentificador && (columnas[rolIdentificador] ?? 0) < 1) {
    const col = columnaIdentificadorPorContenido(hoja, filaEncabezado, columnas, reservadas);
    if (col >= 1) columnas[rolIdentificador] = col;
  }
  // Fila rotulada de proveedor (SEVEN), cuando ni el encabezado ni el contenido dieron el NIT.
  let filaTercero: SpecModulo["filaTercero"] | null = null;
  if (descriptor.crucePorTercero.detalleTercero && rolIdentificador && (columnas[rolIdentificador] ?? 0) < 1) {
    filaTercero = detectarFilaTercero(hoja, filaEncabezado + 1);
    if (filaTercero) {
      for (const rol of Object.keys(columnas)) if (columnas[rol] === filaTercero.columnaClave) columnas[rol] = 0;
      columnas[rolIdentificador] = filaTercero.columnaClave;
    }
  }

  const base: SpecModulo = {
    hoja: hoja.nombre,
    filaEncabezado,
    primeraFilaDatos: filaEncabezado + 1,
    columnas,
    ...(familias ? { familias } : {}),
  };
  if (familias) base.edadesModo = "ancho";
  else if (descriptor.familiasDinamicas?.length && (columnas.edadEtiqueta ?? 0) >= 1) base.edadesModo = "largo";
  else if (descriptor.familiasDinamicas?.length) base.edadesModo = "ninguna";

  const rolClave = descriptor.crucePorTercero.rolClave;
  if (rolClave && descriptor.arrastrables?.includes(rolClave)) {
    base.terceroModo = detectarTerceroModo(hoja, base, rolClave);
    // Identificador y documento en la MISMA columna: cada fila trae uno u otro, así que el
    // conteo de detectarTerceroModo no los puede separar. Es jerárquico por construcción.
    if ((columnas[rolClave] ?? 0) >= 1 && columnas[rolClave] === columnas.documento) base.terceroModo = "cabecera";
    if (filaTercero) {
      base.filaTercero = filaTercero;
      base.terceroModo = "cabecera";
    }
    // El arrastre se propone SIEMPRE, no solo en los reportes jerárquicos. En cartera un
    // renglón pertenece por fuerza a algún tercero, y varios ERP imprimen el identificador
    // una sola vez por bloque aunque la fila que lo trae sea ya un documento (World Office
    // deja así 21 filas por 115 millones). Donde cada fila trae lo suyo, heredar no cambia
    // nada: solo actúa cuando la celda viene vacía.
    base.arrastrarRoles = descriptor.arrastrables.filter((rol) => (columnas[rol] ?? 0) >= 1);
    if (base.arrastrarRoles.length === 0) delete base.arrastrarRoles;
  }

  const colDias = columnas.diasVencidos ?? 0;
  if (descriptor.crucePorTercero.detalleTercero && colDias >= 1 && !columnaConDias(hoja, base.primeraFilaDatos, colDias)) {
    columnas.diasVencidos = 0;
  }

  // Cuentas por pagar (manda la columna): el saldo pendiente sobre el valor original, el saldo
  // del bloque de SIIGO y la convención de signo del archivo.
  if (descriptor.crucePorTercero.detalleTercero && descriptor.valorDerivado?.prevalece === "columna") {
    // «saldoTercero» no tiene sinónimos: solo lo asigna la detección del saldo del bloque. El
    // reparto por puntaje se lo daría a cualquier «Saldo» sobrante por coincidencia débil.
    if ("saldoTercero" in columnas) columnas.saldoTercero = 0;
    const colValor = columnas[descriptor.valor] ?? 0;
    // SEVEN trae «TOTAL» (valor original de la factura) antes de «SALDO» (lo pendiente).
    if (colValor >= 1 && norm(header[colValor - 1]) === "total") {
      const usadas = new Set(Object.values(columnas).filter((c) => c >= 1));
      const colSaldo = header.findIndex((h, i) => !usadas.has(i + 1) && !reservadas.has(i + 1) && norm(h) === "saldo");
      if (colSaldo >= 0) columnas[descriptor.valor] = colSaldo + 1;
    }
    if (
      base.terceroModo !== "cabecera"
      && rolClave
      && descriptor.columnas.some((c) => c.nombre === "saldoTercero")
      && detectarSaldoDeBloque(hoja, base, descriptor.valor, rolClave)
    ) {
      columnas.saldoTercero = columnas[descriptor.valor];
      columnas[descriptor.valor] = 0;
    }
  }
  if (descriptor.crucePorTercero.naturaleza === "C" && detectarConvencionSigno(hoja, base, descriptor.valor)) {
    base.invertirSigno = true;
  }

  // Hoja entera en divisa («USD», «EUR»): sus importes se convierten con la TRM de cierre. Si el
  // encabezado ya trae una columna en pesos (PLASMAR «Deuda_Pesos»), manda esa y no hay divisa.
  if (descriptor.crucePorTercero.detalleTercero) {
    const moneda = monedaPorNombreHoja(hoja.nombre);
    if (moneda && !header.some((h) => /(^|[^a-z])(pesos|cop)([^a-z]|$)/.test(norm(h)))) {
      base.monedaArchivo = moneda;
      base.origenCartera = "exterior";
    }
  }

  // «Anticipos» impreso como desglose de otro balde (CEMCO SAFIX): se propone sin sumar cuando la
  // muestra lo demuestra contra su columna de total. El transform lo vuelve a comprobar al leer.
  if (descriptor.crucePorTercero.detalleTercero && descriptor.valorDerivado) {
    marcarSaldoFavorRedundante(hoja, base, descriptor.valor);
  }

  if (descriptor.nomina) ajustarRolesNomina(descriptor, hoja, base);

  return invalidarValorAmbiguoIngresos(descriptor, hoja, base).spec;
}

/** Importe de una celda cruda para cotejar baldes contra el total. Solo números: el transform,
 *  que lee también los importes escritos como texto, lo vuelve a comprobar con el archivo real. */
const importeCelda = (x: unknown): number | null => (typeof x === "number" ? x : null);

/**
 * Pasa a `excluir` los baldes de saldo a favor que la muestra delata como desglose de otro balde
 * (`saldoFavorRedundante`). El signo del archivo no importa: se cotejan baldes contra total.
 */
export function marcarSaldoFavorRedundante(hoja: GridHoja, spec: SpecModulo, rolValor: string, maxFilas = 5000): void {
  const colTotal = spec.columnas[rolValor] ?? 0;
  const baldes = spec.familias?.edades ?? [];
  if (colTotal < 1 || !baldes.some((c) => c.clase === "saldo_favor")) return;
  const desde = Math.max(0, spec.primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  const muestra = [];
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    muestra.push({
      total: importeCelda(fila[colTotal - 1]),
      baldes: Object.fromEntries(baldes.map((c) => [c.etiqueta, importeCelda(fila[c.columna - 1])])),
    });
  }
  const noSuman = new Set(saldoFavorRedundante(muestra, baldes));
  if (noSuman.size === 0) return;
  spec.familias = { ...spec.familias, edades: baldes.map((c) => (noSuman.has(c.etiqueta) ? { ...c, clase: "excluir" as const } : c)) };
}

/**
 * Roles requeridos que quedaron sin mapear (para avisar/bloquear en el wizard). El rol de
 * VALOR no falta cuando el archivo trae alguno de sus alternos (devengo/deducción,
 * débito/crédito en Nómina): el valor de la fila se deriva de ellos.
 */
export function rolesRequeridosFaltantes(descriptor: DescriptorModulo, spec: SpecModulo): string[] {
  const alternoMapeado = (descriptor.valorAlterno ?? []).some((rol) => (spec.columnas[rol] ?? 0) >= 1);
  return descriptor.columnas
    .filter((rc) => rc.requerido && (spec.columnas[rc.nombre] ?? 0) < 1)
    .filter((rc) => !(rc.nombre === descriptor.valor && alternoMapeado))
    .map((rc) => rc.nombre);
}

// ===== Nómina: ambigüedades que solo el CONTENIDO resuelve =====
// «Concepto» es el CÓDIGO en Novasoft, SIESA, SIIGO y Ofimática (y el nombre va en «Nombre
// concepto»/«Descripción»/«Descripción Concepto») pero es el NOMBRE en Buk y Santiago Corazón;
// «Empleado» es la cédula en Ofimática y «cédula + nombre» en SIIGO; «Descripción» es el nombre
// del empleado en SIESA y el del concepto en SIIGO; «Cuenta Contable» de Buk trae 1/3/31, que
// no son cuentas; «GRUPO» de LIBRA es la clase (51/52/72/73) y «Total» de Ofimática es el neto.
// Se mira una muestra de las filas de datos y se corrige el reparto por puntaje.

/** Muestra de valores no vacíos de una columna (1-based), desde la primera fila de datos. */
function muestraColumna(hoja: GridHoja, primeraFila: number, col: number, max = 40): string[] {
  const valores: string[] = [];
  for (let r = primeraFila - 1; r < hoja.filas.length && valores.length < max; r++) {
    const v = hoja.filas[r]?.[col - 1];
    if (v == null || v === "") continue;
    valores.push(String(v).trim());
  }
  return valores;
}
const proporcion = (valores: string[], pred: (v: string) => boolean): number =>
  valores.length === 0 ? 0 : valores.filter(pred).length / valores.length;
/** Código de concepto: dígitos o letra+dígitos cortos («001», «C001», «0005», «SOLID», «RETE»). */
const ES_CODIGO = /^[A-Za-z]{0,5}\d{1,6}$|^[A-Z]{3,6}$/;
const ES_DIGITOS = /^[\d.]+(-\d{1,2})?$/;
/** «8032318 - GALLEGO GUZMAN» (NOMINAI), «3348656 URIBE ALVAREZ» (SIIGO): cédula y nombre en la misma celda. */
const ES_CODIGO_Y_NOMBRE = /^\d{4,12}\s*(?:-\s*)?[A-Za-zÁÉÍÓÚÑ]/;
/** Cuenta contable del cliente: seis o más dígitos. */
const ES_CUENTA = /^\d{6,10}$/;

/** Rótulos que solo trae una tabla dinámica o un resumen del auditor. */
const ROTULO_TABLA_LATERAL = /etiquetas de (fila|columna)|^suma de |^total general$|\(en blanco\)/;

/**
 * Primera columna (1-based) de una tabla LATERAL pegada a la derecha del detalle, o 0 si no la
 * hay. Se busca la primera columna con encabezado vacío tras la que vuelve a haber encabezados,
 * y se decide por tres señales: rótulos de tabla dinámica, encabezados repetidos del bloque
 * principal, o un bloque con menos del 20 % de las filas llenas del principal.
 */
export function columnaDeCorteLateral(hoja: GridHoja, spec: Pick<SpecModulo, "filaEncabezado" | "primeraFilaDatos">): number {
  const header = hoja.filas[spec.filaEncabezado - 1] ?? [];
  const textoEnc = (c: number) => norm(header[c - 1]);
  let primeraLlena = 0;
  for (let c = 1; c <= header.length; c++) if (textoEnc(c)) { primeraLlena = c; break; }
  if (primeraLlena === 0) return 0;
  let hueco = 0;
  for (let c = primeraLlena + 1; c <= header.length; c++) {
    if (!textoEnc(c)) { hueco = c; break; }
  }
  if (hueco === 0) return 0;
  let inicioLateral = 0;
  for (let c = hueco + 1; c <= header.length; c++) if (textoEnc(c)) { inicioLateral = c; break; }
  if (inicioLateral === 0) return 0;

  const principales = new Set<string>();
  for (let c = primeraLlena; c < hueco; c++) if (textoEnc(c)) principales.add(textoEnc(c));
  const laterales: string[] = [];
  for (let c = inicioLateral; c <= header.length; c++) if (textoEnc(c)) laterales.push(textoEnc(c));
  const conRotulo = laterales.some((t) => ROTULO_TABLA_LATERAL.test(t));
  const repetidos = laterales.filter((t) => principales.has(t)).length >= Math.max(1, Math.ceil(laterales.length / 2));

  const filasPrincipal = hoja.filas.slice(spec.primeraFilaDatos - 1);
  const llenas = (desde: number, hasta: number) =>
    filasPrincipal.filter((f) => f.slice(desde - 1, hasta).some((v) => v != null && String(v).trim() !== "")).length;
  const llenasPrincipal = llenas(primeraLlena, hueco - 1);
  const llenasLateral = llenas(inicioLateral, header.length);
  const pocaAltura = llenasPrincipal >= 50 && llenasLateral <= llenasPrincipal * 0.2;

  return conRotulo || repetidos || pocaAltura ? hueco : 0;
}

function ajustarRolesNomina(descriptor: DescriptorModulo, hoja: GridHoja, spec: SpecModulo): void {
  const header = hoja.filas[spec.filaEncabezado - 1] ?? [];
  const cols = spec.columnas;
  const primera = spec.primeraFilaDatos;
  const usada = (c: number) => Object.values(cols).includes(c);
  const encabezado = (c: number) => norm(header[c - 1]);
  const muestra = (c: number) => muestraColumna(hoja, primera, c);
  const esTexto = (c: number) => proporcion(muestra(c), (v) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v)) >= 0.6;
  const vecinaTexto = (desde: number, patron: RegExp): number => {
    for (let c = desde + 1; c <= Math.min(desde + 3, header.length); c++) {
      if (usada(c) || !encabezado(c)) continue;
      if (patron.test(encabezado(c)) && esTexto(c)) return c;
    }
    return 0;
  };

  const esCodigos = (c: number) => { const v = muestra(c); return v.length > 0 && proporcion(v, (x) => ES_CODIGO.test(x)) >= 0.7; };

  // 0) Nada por coincidencia DÉBIL (la clave contiene al encabezado): con 25 roles y sinónimos
  //    cortos, «Cia» cae en agrupador por «dependen-cia» y «Concepto_» en código por «concepto
  //    codigo». En Nómina un rol se gana con el encabezado exacto o que lo contenga.
  for (const rc of descriptor.columnas) {
    const c = cols[rc.nombre] ?? 0;
    if (c >= 1 && puntajeRol(encabezado(c), rc) < 500) cols[rc.nombre] = 0;
  }
  // 0a) TABLA LATERAL: los libros del auditor pegan una tabla dinámica o un resumen a la
  //     derecha del detalle, separados por una columna vacía (PLASMAR: «Etiquetas de fila |
  //     Suma de Suma de Valor»; Pure Nature: «Novedad | Tipo | TOTAL» con 28 filas). Sus
  //     columnas se reconocen porque repiten encabezados del bloque principal, traen rótulos
  //     de tabla dinámica o tienen muchas menos filas llenas, y salen del mapeo: sumarlas
  //     duplicaría el archivo.
  const corteLateral = columnaDeCorteLateral(hoja, spec);
  if (corteLateral > 0) {
    for (const rc of descriptor.columnas) if ((cols[rc.nombre] ?? 0) >= corteLateral) cols[rc.nombre] = 0;
  }
  // 0b) Un código de concepto tiene que parecer código («001», «C001», «buk_salario»): una
  //     columna con nombres («Concepto_» = «Aportes al ICBF») no lo es. Vacía se respeta.
  if ((cols.codigo ?? 0) >= 1) {
    const v = muestra(cols.codigo);
    if (v.length > 0 && proporcion(v, (x) => /^\S{1,40}$/.test(x)) < 0.7) cols.codigo = 0;
  }

  // 1) La columna rotulada exactamente «Concepto» con contenido de CÓDIGO es el código
  //    (Novasoft, SIESA, SIIGO, Ofimática); el nombre es la vecina de la derecha. Un «Código
  //    interno contrato» que el puntaje haya tomado por código cede ante ella.
  const colConceptoExacto = header.findIndex((h) => norm(h) === "concepto") + 1;
  if (colConceptoExacto >= 1 && esCodigos(colConceptoExacto) && cols.codigo !== colConceptoExacto) {
    if (cols.concepto === colConceptoExacto) cols.concepto = 0;
    cols.codigo = colConceptoExacto;
    if ((cols.concepto ?? 0) < 1) cols.concepto = vecinaTexto(colConceptoExacto, /concepto|descripci|nombre/);
  }
  // 1b) Cédula sin columna: un «Empleado» numérico que perdió el rol frente a «Nombre_Empleado»
  //     (Ofimática), o cualquier «Tercero»/«Documento» con cédulas.
  if ((cols.cedula ?? 0) < 1) {
    const candidata = header.findIndex((h, i) => !usada(i + 1) && /empleado|cedula|identificaci|documento|nit|tercero/.test(norm(h)) && proporcion(muestra(i + 1), (v) => ES_DIGITOS.test(v)) >= 0.7);
    if (candidata >= 0) cols.cedula = candidata + 1;
  }
  // 2) Cédula y empleado. La columna del empleado con contenido numérico es la cédula y el
  //    nombre está en la vecina («Empleado» → «Nombre_Empleado», Ofimática); con «cédula +
  //    nombre» en una sola celda (SIIGO «EMPLEADO», NOMINAI «8032318 - GALLEGO») la cédula
  //    sale de esa misma celda y el nombre limpio de «Nombre», si existe; y el nombre es
  //    siempre la columna pegada a la cédula, no un «Descripción Grp. Empleados» lejano.
  const colEmpleado = cols.empleado ?? 0;
  if (colEmpleado >= 1) {
    const valores = muestra(colEmpleado);
    if ((cols.cedula ?? 0) < 1 && proporcion(valores, (v) => ES_DIGITOS.test(v)) >= 0.7) {
      cols.cedula = colEmpleado;
      cols.empleado = vecinaTexto(colEmpleado, /nombre|descripci|empleado|trabajador/);
    } else if (proporcion(valores, (v) => ES_CODIGO_Y_NOMBRE.test(v)) >= 0.7) {
      if ((cols.cedula ?? 0) < 1) cols.cedula = colEmpleado;
      const nombre = header.findIndex((h, i) => !usada(i + 1) && /^nombre/.test(norm(h)) && esTexto(i + 1));
      if (nombre >= 0) cols.empleado = nombre + 1;
    }
  }
  // Cédula mapeada a una columna vacía (Heinsohn «Código Empleado») cuando hay otra con cédulas.
  if ((cols.cedula ?? 0) >= 1 && muestra(cols.cedula).length === 0) {
    const otra = header.findIndex((h, i) => !usada(i + 1) && /cedula|identificaci|documento|nit/.test(norm(h)) && proporcion(muestra(i + 1), (v) => ES_DIGITOS.test(v)) >= 0.7);
    if (otra >= 0) cols.cedula = otra + 1;
  }
  // El nombre del empleado es la PRIMERA columna de texto a la derecha de la cédula (SIESA
  //  «Tercero | Descripción», SIIGO «Cédula | Nombre»); un «Descripción Grp. Empleados» más
  //  lejos no lo es aunque el encabezado diga «empleado».
  if ((cols.cedula ?? 0) >= 1) {
    for (let c = cols.cedula + 1; c <= Math.min(cols.cedula + 3, header.length); c++) {
      if (!encabezado(c) || !esTexto(c)) continue;
      const otroRol = Object.entries(cols).find(([rol, col]) => col === c && rol !== "empleado");
      if (!otroRol && /nombre|descripci|empleado|trabajador|\bsn\b/.test(encabezado(c))) cols.empleado = c;
      break;
    }
  }
  // 3) «Cuenta contable» que no trae cuentas (Buk: 1, 3, 31) no es la cuenta.
  const colCuenta = cols.cuenta ?? 0;
  if (colCuenta >= 1 && proporcion(muestra(colCuenta), (v) => ES_CUENTA.test(v.replace(/\D/g, ""))) < 0.6) cols.cuenta = 0;
  // 4) Con devengo/deducción en columnas aparte, el valor sale de ellas: un «Total» a su lado
  //    es el neto de la fila (Ofimática) y un «Valor IBC período anterior» (SIESA) no es nada.
  const colValor = cols.valor ?? 0;
  if (colValor >= 1 && ((cols.devengo ?? 0) >= 1 || (cols.deduccion ?? 0) >= 1)) {
    if (/total|neto/.test(encabezado(colValor)) && (cols.neto ?? 0) < 1) cols.neto = colValor;
    cols.valor = 0;
  }
  // 4b) El TIPO solo sirve si de verdad dice devengo/deducción («Ingreso», «Ganancias»,
  //     «Deducción», «Naturaleza: Devengo»); «Tipo contrato», «Tipo MM» o una columna vacía no.
  const colTipo = cols.tipo ?? 0;
  if (colTipo >= 1 && proporcion(muestra(colTipo), (v) => /ingres|deduc|devengo|ganancia|provision|aporte|egreso|descuent|sobregiro|percep/i.test(v)) < 0.5) {
    cols.tipo = 0;
  }
  // 5) «GRUPO» con la clase contable (51/52/72/73) es el agrupador aunque haya centro de costo.
  const colGrupo = header.findIndex((h) => norm(h) === "grupo") + 1;
  if (colGrupo >= 1 && colGrupo !== cols.agrupador && proporcion(muestra(colGrupo), (v) => /^(51|52|61|72|73)$/.test(v)) >= 0.8) {
    cols.agrupador = colGrupo;
  }
  // 6) Un «Mes» que trae fechas completas es el período de la quincena (Buk), no el mes suelto.
  const colMes = cols.mes ?? 0;
  if (colMes >= 1 && (cols.periodo ?? 0) < 1 && proporcion(muestra(colMes), (v) => /^\d{4}-\d{2}-\d{2}/.test(v)) >= 0.8) {
    cols.periodo = colMes;
    cols.mes = 0;
  }
  // 6b) Rango del acumulado SIIGO: «De» y «A» con AAAAMM. Por rótulo exacto y contenido; y si el
  //     puntaje les dio otra cosa («Desde» con fechas de contrato), se limpia.
  const esAaaamm = (c: number) => proporcion(muestra(c), (v) => /^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(v)) >= 0.7;
  for (const [rol, rotulos] of [["periodoDesde", /^(de|desde)$/], ["periodoHasta", /^(a|hasta)$/]] as const) {
    if ((cols[rol] ?? 0) >= 1 && !esAaaamm(cols[rol])) cols[rol] = 0;
    if ((cols[rol] ?? 0) < 1) {
      const c = header.findIndex((h, i) => !usada(i + 1) && rotulos.test(norm(h)) && esAaaamm(i + 1));
      if (c >= 0) cols[rol] = c + 1;
    }
  }
  // 7) Los roles de fecha se leen como fechas; «Fecha Ing» (ingreso del empleado), «Fecha
  //    alta/baja/retiro» no son ninguna, y una fecha casi siempre vacía («Fecha Final TNL»
  //    de SIESA, solo en las incapacidades) tampoco decide el período.
  for (const rol of ["fecha", "fechaCorte"] as const) {
    const c = cols[rol] ?? 0;
    if (c < 1) continue;
    if (/ingres|\bing\b|alta|baja|retiro|nacim|tnl|ant\b/.test(encabezado(c))) { cols[rol] = 0; continue; }
    const llenas = muestraColumna(hoja, primera, c, 60).length;
    const total = Math.min(60, Math.max(0, hoja.filas.length - (primera - 1)));
    if (total > 0 && llenas / total < 0.3) cols[rol] = 0;
  }
  // 8) Los roles que se arrastran (mes, concepto, empleado impresos una vez por bloque) se
  //    recalculan con el mapeo ya corregido: el reparto inicial los fijó antes de estos ajustes.
  const arrastrar = (descriptor.arrastrables ?? []).filter((rol) => (cols[rol] ?? 0) >= 1);
  if (arrastrar.length) spec.arrastrarRoles = arrastrar;
  else delete spec.arrastrarRoles;
}
