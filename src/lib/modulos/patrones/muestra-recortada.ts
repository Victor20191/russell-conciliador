// Muestra de un patrón aprendido de un cargue: recorte anónimo del original (5/Oct/2026) — sin BD.
//
// La muestra de una versión la puede descargar cualquiera que vea los patrones, así que el
// original del cliente nunca se comparte entero. De él se guarda solo:
//  - las filas hasta el encabezado (los textos de arriba —el rótulo del reporte con el nombre y el
//    NIT de la empresa— pasan a «Texto del reporte») y las primeras `FILAS_DATOS_MUESTRA` filas de
//    datos;
//  - con NIT, cédulas, documentos y nombres cambiados por valores ficticios CONSISTENTES (el mismo
//    valor siempre da el mismo ficticio, del mismo largo), y los textos y números de las columnas
//    que el patrón no lee, por «Texto» y 0.
// Los importes, fechas, códigos de cuenta/concepto y el clasificador se conservan: la lectura
// depende de ellos y, sin el total del archivo, 100 filas no dicen el saldo del cliente.
//
// La muestra se VERIFICA antes de devolverla: se vuelve a leer con la misma ingesta, el patrón
// tiene que reconocerla y su lectura tiene que ser fila por fila la de esas filas del original.
// Si algo no coincide no hay muestra (el administrador sube una limpia, como siempre).
import ExcelJS from "exceljs";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { aplicarPatronASpec } from "./aplicar";
import { mejorVersion, type VersionCandidata } from "./mejor-version";
import { revisarMapeoMuestra } from "./revision-mapeo";
import { normalizarRotulo } from "./rotulos";
import { FILAS_DATOS_MUESTRA } from "./version";

export { FILAS_DATOS_MUESTRA };
export const TEXTO_REPORTE = "Texto del reporte";
const TEXTO_OCULTO = "Texto";
/** Un número de identificación tiene al menos esta cantidad de dígitos seguidos. */
const MIN_DIGITOS_IDENTIDAD = 5;

type Celda = string | number | boolean | null;
type ClaseIdentidad = "numero" | "nombre" | "tercero";

/** Roles cuyo contenido identifica a una persona o empresa (por nombre de rol del descriptor). */
const ROLES_IDENTIDAD: Record<string, ClaseIdentidad> = {
  nit: "numero",
  cedula: "numero",
  documento: "numero",
  nombre: "nombre",
  empleado: "nombre",
  tercero: "tercero",
};

/** Columnas (1-based, de la grilla) que la lectura usa: roles, fórmula, familias, marcas y reglas. */
export function columnasLeidas(spec: SpecModulo): Set<number> {
  const usadas = new Set<number>();
  const agregar = (c: unknown) => { if (typeof c === "number" && Number.isInteger(c) && c >= 1) usadas.add(c); };
  for (const c of Object.values(spec.columnas)) agregar(c);
  for (const termino of spec.valorFormula ?? []) agregar(termino.columna);
  for (const familia of Object.values(spec.familias ?? {})) for (const c of familia) agregar(c.columna);
  agregar(spec.subtotalesColumna);
  // Inventarios: las reglas de lectura combinada señalan columnas en cualquier nivel.
  const recorrer = (nodo: unknown) => {
    if (Array.isArray(nodo)) { nodo.forEach(recorrer); return; }
    if (nodo && typeof nodo === "object") {
      for (const [clave, valor] of Object.entries(nodo)) {
        if (clave === "columna") agregar(valor);
        else recorrer(valor);
      }
    }
  };
  recorrer(spec.lecturaEstructurada);
  return usadas;
}

/**
 * La fila (1-based) del archivo con los rótulos de la versión: la que más rótulos comparte con su
 * encabezado guardado, entre las primeras filas. Algunas versiones guardaron la fila del encabezado
 * con la numeración física del archivo y apuntan a una fila de datos; los rótulos no mienten.
 */
export function filaConRotulos(hoja: GridHoja, rotulos: readonly unknown[], hasta: number): number | null {
  const buscados = new Set(rotulos.map((r) => normalizarRotulo(String(r ?? ""))).filter(Boolean));
  if (buscados.size === 0) return null;
  let mejor: { fila: number; aciertos: number } | null = null;
  for (let i = 0; i < Math.min(hasta, hoja.filas.length); i++) {
    const enFila = new Set((hoja.filas[i] ?? []).map((c) => normalizarRotulo(String(c ?? ""))).filter(Boolean));
    let aciertos = 0;
    for (const r of buscados) if (enFila.has(r)) aciertos++;
    if (aciertos > (mejor?.aciertos ?? 0)) mejor = { fila: i + 1, aciertos };
  }
  return mejor && mejor.aciertos >= Math.min(2, buscados.size) ? mejor.fila : null;
}

/** Columnas mapeadas a un rol de identidad, con su clase. */
function columnasIdentidad(spec: SpecModulo): Map<number, ClaseIdentidad> {
  const identidad = new Map<number, ClaseIdentidad>();
  for (const [rol, clase] of Object.entries(ROLES_IDENTIDAD)) {
    const columna = spec.columnas[rol] ?? 0;
    if (columna >= 1) identidad.set(columna, clase);
  }
  return identidad;
}

/** Ficticios consistentes: el mismo valor original da siempre el mismo reemplazo. */
class Ficticios {
  private readonly digitos = new Map<string, string>();
  private readonly nombres = new Map<string, string>();

  /** Una corrida de dígitos → otra del mismo largo, que empieza en 9 (ninguna cuenta del módulo). */
  numero(corrida: string): string {
    const previo = this.digitos.get(corrida);
    if (previo) return previo;
    const ficticio = `9${String(this.digitos.size + 1).padStart(corrida.length - 1, "0")}`;
    this.digitos.set(corrida, ficticio);
    return ficticio;
  }

  nombre(original: string, prefijo: string): string {
    const clave = `${prefijo}:${original}`;
    const previo = this.nombres.get(clave);
    if (previo) return previo;
    const ficticio = `${prefijo} ${String(this.nombres.size + 1).padStart(3, "0")}`;
    this.nombres.set(clave, ficticio);
    return ficticio;
  }
}

/** Una cuenta del módulo en la columna del identificador (SIESA): se conserva para no romper la lectura. */
function esCuentaDelModulo(valor: string, prefijos: ReadonlySet<string>): boolean {
  return /^\d{6,10}$/.test(valor) && prefijos.has(valor.slice(0, 4));
}

/**
 * «Total ACME SAS» → «Total » + el reemplazo del resto. La lectura reconoce los subtotales por ese
 * rótulo (y el total de un tercero por su nombre): el prefijo se conserva y el resto se oculta.
 */
function conRotuloTotal(texto: string, ocultar: (resto: string) => string): string {
  const rotulo = /^\s*((?:sub\s*)?totale?s?)\b[\s:.-]*/i.exec(texto);
  if (!rotulo) return ocultar(texto);
  const resto = texto.slice(rotulo[0].length).trim();
  return resto ? `${rotulo[1]} ${ocultar(resto)}` : rotulo[1];
}

function anonimizarIdentidad(celda: Celda, clase: ClaseIdentidad, ficticios: Ficticios, prefijosCuenta: ReadonlySet<string>): Celda {
  if (celda == null || celda === "" || typeof celda === "boolean") return celda;
  const texto = String(celda).trim();
  if (esCuentaDelModulo(texto, prefijosCuenta)) return celda;
  if (typeof celda === "string" && /^\s*(?:sub\s*)?total/i.test(texto)) {
    return conRotuloTotal(texto, (resto) => String(anonimizarIdentidad(resto, clase, ficticios, prefijosCuenta)));
  }
  const reemplazarDigitos = (s: string) => s.replace(/\d+/g, (corrida) => (corrida.length >= MIN_DIGITOS_IDENTIDAD ? ficticios.numero(corrida) : corrida));
  if (typeof celda === "number") {
    const entero = Number.isInteger(celda) ? String(Math.abs(celda)) : null;
    if (!entero || entero.length < MIN_DIGITOS_IDENTIDAD) return celda;
    return Number(ficticios.numero(entero)) * Math.sign(celda);
  }
  const conLetras = /\p{L}/u.test(texto);
  if (clase === "numero" || !conLetras) return reemplazarDigitos(celda);
  if (clase === "nombre") return ficticios.nombre(texto, "Nombre");
  // Tercero: «900123456 EMPRESA SAS» → conserva la forma «<número> <nombre>».
  const numeroInicial = /^\s*(\d{5,})/.exec(texto)?.[1];
  const nombre = ficticios.nombre(texto, "Tercero");
  return numeroInicial ? `${ficticios.numero(numeroInicial)} ${nombre}` : nombre;
}

/**
 * La hoja recortada y anónima (pura). Conserva la negrita y escribe la grilla COMPACTA: la muestra
 * no tiene filas vacías ni columnas a la izquierda, así que las filas y columnas del patrón
 * quedan donde están en la grilla del original.
 */
export function recortarYAnonimizar(
  descriptor: DescriptorModulo,
  hoja: GridHoja,
  spec: SpecModulo,
  /**
   * Fila (1-based) donde están los rótulos en ESTE archivo (`filaConRotulos`). Puede quedar por
   * encima de la del spec (versiones guardadas con la numeración física): las filas de en medio son
   * datos que la lectura recupera, no el rótulo del reporte.
   */
  filaEncabezadoReal: number = spec.filaEncabezado,
): GridHoja {
  const encabezado = filaEncabezadoReal;
  const hasta = Math.min(hoja.filas.length, spec.primeraFilaDatos - 1 + FILAS_DATOS_MUESTRA);
  const leidas = columnasLeidas(spec);
  const identidad = columnasIdentidad(spec);
  const prefijosCuenta = new Set((descriptor.crucePorTercero.cuentasRussell6 ?? []).map((c) => c.slice(0, 4)));
  const ficticios = new Ficticios();
  // Columnas leídas como fecha o importe: un texto con letras ahí no es su dato sino, en los
  // reportes jerárquicos (SIESA), el nombre del tercero o de la cuenta impreso en esa columna.
  const tipoDeColumna = new Map<number, string>();
  for (const rol of descriptor.columnas) {
    const columna = spec.columnas[rol.nombre] ?? 0;
    if (columna >= 1 && !tipoDeColumna.has(columna)) tipoDeColumna.set(columna, rol.tipo);
  }
  // SIESA: en las filas de cuenta (marcadas con «#Ter.») la columna del identificador trae la
  // CUENTA, que es el clasificador: se conserva.
  const colMarca = spec.columnas.marcaSeccion ?? 0;
  // Una fila con importe en la columna del valor es un dato aunque esté a la altura del encabezado
  // que guardó la versión (las antiguas lo guardaron con la numeración física): se oculta como dato.
  // Si eso deja el encabezado irreconocible, la verificación lo detecta y no hay muestra.
  const colValor = (spec.columnas[descriptor.valor] ?? 0) || (spec.familias?.edades?.[0]?.columna ?? 0);
  const conImporte = (fila: readonly Celda[]) => colValor >= 1 && typeof fila[colValor - 1] === "number";
  const filas: Celda[][] = [];
  for (let i = 0; i < hasta; i++) {
    const fila = hoja.filas[i] ?? [];
    if (i < encabezado - 1 && !conImporte(fila)) {
      // Arriba del encabezado: el rótulo del reporte (empresa, NIT, fechas de generación).
      filas.push(fila.map((c) => (c == null || c === "" ? c : TEXTO_REPORTE)));
      continue;
    }
    if (i === encabezado - 1) { filas.push([...fila]); continue; }
    const filaDeCuenta = colMarca >= 1 && fila[colMarca - 1] != null && String(fila[colMarca - 1]).trim() !== "";
    filas.push(fila.map((celda, c) => {
      const columna = c + 1;
      const clase = identidad.get(columna);
      if (clase && !filaDeCuenta) return anonimizarIdentidad(celda, clase, ficticios, prefijosCuenta);
      if (celda == null || celda === "" || typeof celda === "boolean") return celda;
      if (leidas.has(columna)) {
        const tipo = tipoDeColumna.get(columna);
        const nombreFuera = typeof celda === "string" && (tipo === "fecha" || tipo === "numero" || tipo === "moneda") && /\p{L}{3,}/u.test(celda);
        return nombreFuera && !filaDeCuenta ? conRotuloTotal(celda, (resto) => ficticios.nombre(resto.trim(), "Nombre")) : celda;
      }
      return typeof celda === "number" ? 0 : conRotuloTotal(celda, () => TEXTO_OCULTO);
    }));
  }
  return {
    nombre: hoja.nombre,
    filas,
    ...(hoja.negrita ? { negrita: hoja.negrita.slice(0, hasta).map((f) => [...(f ?? [])]) } : {}),
  };
}

/** La hoja como .xlsx: fila i → fila i+1, columna c → columna c+1, con su negrita. */
export async function escribirMuestraXlsx(hoja: GridHoja): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  const hojaXlsx = libro.addWorksheet(hoja.nombre.slice(0, 31) || "Muestra");
  hoja.filas.forEach((fila, i) => {
    const filaXlsx = hojaXlsx.getRow(i + 1);
    (fila ?? []).forEach((valor, c) => {
      if (valor == null || valor === "") return;
      const celda = filaXlsx.getCell(c + 1);
      celda.value = valor;
      if (hoja.negrita?.[i]?.[c]) celda.font = { bold: true };
    });
    filaXlsx.commit();
  });
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

type FilaComparable = { filaNum: number; tipoFila: string; clasificador: string; valor: number };
const comparables = (filas: readonly { filaNum: number; tipoFila: string; clasificador: string | null; valor: number }[]): FilaComparable[] =>
  filas.map((f) => ({ filaNum: f.filaNum, tipoFila: f.tipoFila, clasificador: f.clasificador ?? "", valor: Math.round(f.valor * 100) / 100 }));

export type ResultadoMuestraRecortada =
  | { ok: true; bytes: Uint8Array; filasDatos: number }
  | { ok: false; motivo: string };

/**
 * Genera y VERIFICA la muestra de una versión a partir de la hoja del original: el patrón tiene que
 * reconocerla, leerla sin impedimentos y dar fila por fila lo mismo que esas filas del original.
 */
export async function generarMuestraRecortada(
  descriptor: DescriptorModulo,
  hojaOriginal: GridHoja,
  version: VersionCandidata,
): Promise<ResultadoMuestraRecortada> {
  // El encabezado se UBICA en el original como en cada carga (`aplicarPatronASpec`), sin confiar en
  // las filas guardadas en la versión: algunas las guardaron con la numeración física del archivo.
  // La grilla va sin `filasFisicas`, como quedará la muestra: filas 1, 2, 3… en las dos lecturas.
  const original: GridHoja = { nombre: hojaOriginal.nombre, filas: hojaOriginal.filas, ...(hojaOriginal.negrita ? { negrita: hojaOriginal.negrita } : {}) };
  const ubicacionOriginal = mejorVersion(descriptor, [original], [version], { hojaElegida: original.nombre });
  if (!ubicacionOriginal?.coincidencia.elegible) return { ok: false, motivo: "El patrón no reconoce el original." };
  const spec = aplicarPatronASpec(descriptor, ubicacionOriginal, original).spec;
  if (original.filas.length < spec.primeraFilaDatos) return { ok: false, motivo: "El original no tiene filas de datos." };
  const hasta = Math.min(original.filas.length, spec.primeraFilaDatos - 1 + FILAS_DATOS_MUESTRA);
  // Las mismas filas del original, sin anonimizar: la referencia de la lectura.
  const referencia: GridHoja = {
    nombre: original.nombre,
    filas: original.filas.slice(0, hasta),
    ...(original.negrita ? { negrita: original.negrita.slice(0, hasta) } : {}),
  };
  const esperada = revisarMapeoMuestra(descriptor, [referencia], spec, { exigirTipoFormato: true });
  if (esperada.impedimentos.length > 0 || !esperada.lectura) {
    return { ok: false, motivo: `Las primeras ${FILAS_DATOS_MUESTRA} filas del original no sirven de muestra: ${esperada.impedimentos[0] ?? "no se pudieron leer"}` };
  }

  const filaRotulos = filaConRotulos(original, version.encabezado, Math.max(spec.filaEncabezado, ubicacionOriginal.filaEncabezado) + 1) ?? spec.filaEncabezado;
  const bytes = await escribirMuestraXlsx(recortarYAnonimizar(descriptor, original, spec, filaRotulos));
  const ingesta = await ingerir(bytes.slice().buffer as ArrayBuffer, "muestra.xlsx");
  if (ingesta.modo !== "tabular") return { ok: false, motivo: "La muestra generada no se pudo leer." };
  // La muestra tiene una sola hoja (su nombre puede venir recortado a los 31 caracteres de Excel).
  const ubicacion = mejorVersion(descriptor, ingesta.hojas, [version], { hojaElegida: ingesta.hojas[0]?.nombre ?? null });
  const hojaMuestra = ubicacion ? ingesta.hojas.find((h) => h.nombre === ubicacion.hoja) : undefined;
  if (!ubicacion || !hojaMuestra || !ubicacion.coincidencia.elegible) return { ok: false, motivo: "El patrón no reconoce la muestra anónima." };
  const obtenida = revisarMapeoMuestra(descriptor, ingesta.hojas, aplicarPatronASpec(descriptor, ubicacion, hojaMuestra).spec, { exigirTipoFormato: true });
  if (obtenida.impedimentos.length > 0 || !obtenida.lectura) {
    return { ok: false, motivo: `La muestra anónima no se lee igual: ${obtenida.impedimentos[0] ?? "sin lectura"}` };
  }
  const a = comparables(esperada.lectura.filas);
  const b = comparables(obtenida.lectura.filas);
  const distinta = a.length !== b.length || a.some((f, i) => {
    const g = b[i];
    return f.filaNum !== g.filaNum || f.tipoFila !== g.tipoFila || f.clasificador !== g.clasificador || f.valor !== g.valor;
  });
  if (distinta) return { ok: false, motivo: "Al anonimizar la muestra su lectura cambia (el formato depende de los datos que se ocultan)." };
  return { ok: true, bytes, filasDatos: hasta - (spec.primeraFilaDatos - 1) };
}
