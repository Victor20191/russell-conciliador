// Sugeridor HEURÍSTICO de columnas (sin IA): detecta la fila de encabezado y mapea cada
// columna al rol del descriptor cuyo sinónimo/etiqueta mejor coincide con el texto del
// encabezado. Da un punto de partida para el wizard; el usuario lo corrige a mano.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo, RolColumna } from "../descriptores";
import { esRotuloEdad } from "../cartera/edades";
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

  return invalidarValorAmbiguoIngresos(descriptor, hoja, base).spec;
}

/** Roles requeridos que quedaron sin mapear (para avisar/bloquear en el wizard). */
export function rolesRequeridosFaltantes(descriptor: DescriptorModulo, spec: SpecModulo): string[] {
  return descriptor.columnas.filter((rc) => rc.requerido && (spec.columnas[rc.nombre] ?? 0) < 1).map((rc) => rc.nombre);
}
