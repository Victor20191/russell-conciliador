// Sugeridor HEURÍSTICO de columnas (sin IA): detecta la fila de encabezado y mapea cada
// columna al rol del descriptor cuyo sinónimo/etiqueta mejor coincide con el texto del
// encabezado. Da un punto de partida para el wizard; el usuario lo corrige a mano.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo, RolColumna } from "../descriptores";
import { esRotuloEdad } from "../cartera/edades";
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
      const clase = descriptor.codigo === "CAR" ? esRotuloEdad(celda)?.clase : undefined;
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
  let total = 0;
  const desde = Math.max(0, spec.primeraFilaDatos - 1);
  const hasta = Math.min(hoja.filas.length, desde + maxFilas);
  for (let r = desde; r < hasta; r++) {
    const fila = hoja.filas[r] ?? [];
    const clave = String(fila[colClave - 1] ?? "").trim();
    const documento = String(fila[colDocumento - 1] ?? "").trim();
    if (!clave && !documento) continue;
    total++;
    if (clave && !documento) soloClave++;
    else if (!clave && documento) soloDocumento++;
  }
  if (total === 0) return "columna";
  const UMBRAL = 0.15;
  return soloClave / total > UMBRAL && soloDocumento / total > UMBRAL ? "cabecera" : "columna";
}

/**
 * Sugiere un `SpecModulo` para una hoja: detecta encabezado y asigna columnas a roles de
 * forma greedy (mayor puntaje primero; cada columna y cada rol se usan una sola vez).
 */
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
    // El arrastre se propone SIEMPRE, no solo en los reportes jerárquicos. En cartera un
    // renglón pertenece por fuerza a algún tercero, y varios ERP imprimen el identificador
    // una sola vez por bloque aunque la fila que lo trae sea ya un documento (World Office
    // deja así 21 filas por 115 millones). Donde cada fila trae lo suyo, heredar no cambia
    // nada: solo actúa cuando la celda viene vacía.
    base.arrastrarRoles = descriptor.arrastrables.filter((rol) => (columnas[rol] ?? 0) >= 1);
    if (base.arrastrarRoles.length === 0) delete base.arrastrarRoles;
  }

  return invalidarValorAmbiguoIngresos(descriptor, hoja, base).spec;
}

/** Roles requeridos que quedaron sin mapear (para avisar/bloquear en el wizard). */
export function rolesRequeridosFaltantes(descriptor: DescriptorModulo, spec: SpecModulo): string[] {
  return descriptor.columnas.filter((rc) => rc.requerido && (spec.columnas[rc.nombre] ?? 0) < 1).map((rc) => rc.nombre);
}
