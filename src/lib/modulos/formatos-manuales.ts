// «Patrones manuales» del cliente (21/Oct/2026) — puro, sin BD.
//
// Con «Archivo manual» el analista mapea las columnas a mano. Ese mapeo se recuerda por cliente y
// módulo en `perfiles_carga_modulo` y vuelve a ofrecerse en la siguiente carga manual del mismo
// cliente. Hasta esta fecha se reconocía solo por una huella EXACTA que incluía el nombre de la hoja
// («kardex diciembre» no reconocía «kardex enero») y se guardaba al LEER el archivo. Ahora:
//  - un formato es un JUEGO DE TÍTULOS por cliente y módulo: su llave son los títulos normalizados
//    (`clavesEncabezado`, sin la hoja), y guardarlo otra vez con los mismos títulos reemplaza su mapeo;
//  - se reconoce por % de coincidencia con el MISMO motor de los patrones del aplicativo
//    (`mejorVersion` + `aplicarPatronASpec`), sin mirar el nombre de la hoja;
//  - se guarda al CONFIRMAR el borrador (`leerDatosModulo` deja la propuesta en el spec del lote).
// Los perfiles anteriores (sin títulos guardados) siguen reconociéndose por su huella exacta.
import { createHash } from "node:crypto";
import * as z from "zod";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "./descriptores";
import { SpecModuloSchema, type SpecModulo } from "./extraccion/esquema";
import { normalizarSpecModulo } from "./perfil-modulo";
import { mejorVersion, type UbicacionPatron, type VersionCandidata } from "./patrones/mejor-version";
import { aplicarPatronASpec } from "./patrones/aplicar";
import { clavesEncabezado } from "./patrones/rotulos";
import { TOKEN_FAMILIA } from "./huella-modulo";
import { tipoFormatoCartera } from "./cartera/tipo-formato";
import { monedaPorNombreHoja } from "./cartera/moneda";

/** Prefijo de las huellas por títulos: no chocan con las anteriores, que llevan la hoja. */
export const PREFIJO_HUELLA_FORMATO_MANUAL = "fm1:";

export const esHuellaFormatoManual = (huella: string): boolean => huella.startsWith(PREFIJO_HUELLA_FORMATO_MANUAL);

/** Títulos con que se identifica un formato: normalizados, sin vacíos y con los rangos de edades como uno. */
function titulosClave(descriptor: DescriptorModulo, encabezado: readonly unknown[]): string[] {
  const claves: string[] = [];
  for (const clave of clavesEncabezado(descriptor, encabezado)) {
    if (!clave) continue;
    // Cuántos rangos de vencimiento trae el reporte cambia de un corte a otro: no es otro formato.
    if (clave === TOKEN_FAMILIA && claves[claves.length - 1] === TOKEN_FAMILIA) continue;
    claves.push(clave);
  }
  return claves;
}

/**
 * Llave de un formato manual: sus títulos normalizados, sin la hoja (ni tildes, mayúsculas o
 * variantes de los rangos de edades). `null` con menos de dos títulos: no identificaría nada.
 */
export function huellaFormatoManual(descriptor: DescriptorModulo, encabezado: readonly unknown[]): string | null {
  const claves = titulosClave(descriptor, encabezado);
  if (claves.length < 2) return null;
  return PREFIJO_HUELLA_FORMATO_MANUAL + createHash("sha256").update(claves.join("|")).digest("hex").slice(0, 32);
}

/** Un formato manual guardado del cliente, tal como sale de la BD. */
export type FormatoManualGuardado = {
  id: number;
  huella: string;
  /** null = perfil anterior: solo se reconoce por la huella exacta. */
  encabezado: unknown[] | null;
  specJson: unknown;
  archivoEjemplo: string | null;
  vecesUsado: number;
  ultimoUsoEn: Date | null;
  guardadoEn: Date | null;
  guardadoPor: string | null;
  creadoEn: Date;
  creadoPor: string | null;
};

/** El mapeo reutilizable de un formato guardado, o null si es ilegible. */
export function specDeFormato(descriptor: DescriptorModulo, formato: Pick<FormatoManualGuardado, "specJson">): SpecModulo | null {
  const parsed = SpecModuloSchema.safeParse(formato.specJson);
  return parsed.success ? normalizarSpecModulo(descriptor, parsed.data) : null;
}

const momentoDe = (f: FormatoManualGuardado): number => (f.ultimoUsoEn ?? f.guardadoEn ?? f.creadoEn).getTime();

/**
 * Candidatas para `mejorVersion` desde los formatos con títulos guardados. Sin hoja (el nombre de
 * la hoja no cuenta), todas con el mismo estado y `version` = orden de uso: entre dos que empatan
 * gana la usada más recientemente. En Cartera y CxP se declara el tipo DEDUCIDO solo para comparar,
 * así se exigen sus columnas (documento, rangos); el mapeo que se aplica es el guardado tal cual.
 */
export function candidatosFormatoManual(
  descriptor: DescriptorModulo,
  formatos: readonly FormatoManualGuardado[],
): { candidatas: VersionCandidata[]; specGuardado: Map<number, SpecModulo> } {
  const specGuardado = new Map<number, SpecModulo>();
  const conTitulos = formatos
    .filter((f) => Array.isArray(f.encabezado) && f.encabezado.length > 0)
    .sort((a, b) => momentoDe(a) - momentoDe(b));
  const candidatas: VersionCandidata[] = [];
  conTitulos.forEach((formato, i) => {
    const spec = specDeFormato(descriptor, formato);
    // La lectura combinada de Inventarios exige su asistencia: nunca va por el archivo manual.
    if (!spec || spec.lecturaEstructurada) return;
    specGuardado.set(formato.id, spec);
    const paraComparar = descriptor.crucePorTercero.detalleTercero && !spec.tipoFormato
      ? { ...spec, tipoFormato: tipoFormatoCartera(spec).tipo }
      : spec;
    candidatas.push({
      id: formato.id,
      version: i + 1,
      estado: "aprobada",
      clienteOrigenId: null,
      hoja: "",
      filaEncabezado: spec.filaEncabezado,
      primeraFilaDatos: spec.primeraFilaDatos,
      encabezado: formato.encabezado as unknown[],
      spec: paraComparar,
    });
  });
  return { candidatas, specGuardado };
}

export type FormatoManualElegido = {
  formato: FormatoManualGuardado;
  ubicacion: UbicacionPatron;
  /** El mapeo guardado trasladado a las columnas de ESTE archivo. */
  spec: SpecModulo;
  porcentaje: number;
  advertencias: string[];
};

/**
 * El formato manual del cliente que corresponde a este archivo (≥ 80 % y sin columnas obligatorias
 * faltantes), o null. Busca en las hojas visibles sin mirar su nombre: `hojaElegida` (la que nombró
 * el usuario) restringe la búsqueda y `hojaPropuesta` solo desempata.
 */
export function elegirFormatoManual(
  descriptor: DescriptorModulo,
  hojas: readonly GridHoja[],
  formatos: readonly FormatoManualGuardado[],
  opciones: { hojaElegida?: string | null; hojaPropuesta?: string | null } = {},
): FormatoManualElegido | null {
  const { candidatas, specGuardado } = candidatosFormatoManual(descriptor, formatos);
  if (candidatas.length === 0) return null;
  const mejor = mejorVersion(descriptor, hojas, candidatas, opciones);
  if (!mejor?.coincidencia.elegible) return null;
  const formato = formatos.find((f) => f.id === mejor.version.id);
  const guardado = specGuardado.get(mejor.version.id);
  if (!formato || !guardado) return null;
  // Se aplica el mapeo GUARDADO, no el que llevaba el tipo deducido para comparar.
  const ubicacion: UbicacionPatron = { ...mejor, version: { ...mejor.version, spec: guardado } };
  const aplicado = aplicarPatronASpec(descriptor, ubicacion, hojas.find((h) => h.nombre === mejor.hoja));
  return {
    formato,
    ubicacion,
    spec: aplicado.spec,
    porcentaje: mejor.coincidencia.porcentaje,
    advertencias: [...aplicado.advertencias, ...avisoMoneda(aplicado.spec, mejor.hoja)],
  };
}

/**
 * Perfil ANTERIOR (sin títulos guardados) que reconoce este archivo por su huella exacta —la de
 * siempre: hoja + encabezado (`huellasCandidatas`)—, o null. Es el respaldo cuando ningún formato
 * con títulos califica; al confirmar, ese perfil gana sus títulos y pasa a reconocerse por %.
 */
export function perfilAnteriorExacto(
  descriptor: DescriptorModulo,
  formatos: readonly FormatoManualGuardado[],
  huellas: readonly string[],
): { formato: FormatoManualGuardado; spec: SpecModulo } | null {
  for (const huella of huellas) {
    const formato = formatos.find((f) => f.huella === huella);
    const spec = formato ? specDeFormato(descriptor, formato) : null;
    if (formato && spec) return { formato, spec };
  }
  return null;
}

/** La moneda del formato salió del nombre de su hoja («USD»): si esta hoja dice otra cosa, se avisa. */
function avisoMoneda(spec: SpecModulo, hoja: string): string[] {
  const deLaHoja = monedaPorNombreHoja(hoja);
  const delFormato = spec.monedaArchivo && spec.monedaArchivo !== "COP" ? spec.monedaArchivo : null;
  if (delFormato && deLaHoja !== delFormato) {
    return [`El patrón manual lee los importes en ${delFormato} y la hoja «${hoja}» no lo indica: revisa la moneda antes de leer.`];
  }
  if (!delFormato && deLaHoja) {
    return [`La hoja «${hoja}» parece estar en ${deLaHoja} y el patrón manual lee los importes en pesos: revisa la moneda antes de leer.`];
  }
  return [];
}

/** El mapeo sin lo que depende de dónde quedó en la hoja: el nombre y las filas (como desplazamiento). */
function mapeoComparable(spec: SpecModulo): string {
  const { hoja: _hoja, filaEncabezado, primeraFilaDatos, ...resto } = spec;
  void _hoja;
  return JSON.stringify({ ...resto, desplazamientoDatos: primeraFilaDatos - filaEncabezado });
}

/** ¿Dos mapeos (ya normalizados) son el mismo formato? Ignora la hoja y la fila donde empieza. */
export function mismoFormatoManual(a: SpecModulo, b: SpecModulo): boolean {
  return mapeoComparable(a) === mapeoComparable(b);
}

// ---- Propuesta que deja la lectura en el spec del lote ----

export const PropuestaFormatoManualSchema = z.object({
  version: z.literal(1),
  /** Títulos crudos del encabezado de ESTE archivo (`encabezadoParaGuardar`). */
  encabezado: z.array(z.string()),
  /** El mapeo reutilizable (`normalizarSpecModulo`): sin nada propio del cargue. */
  spec: SpecModuloSchema,
  /** Formato con títulos guardados que se aplicó, si el mapeo leído es el suyo. */
  formatoUsadoId: z.number().int().positive().optional(),
  /** Perfil anterior (huella exacta) que se aplicó. */
  perfilLegadoId: z.number().int().positive().optional(),
  porcentaje: z.number().min(0).max(100).optional(),
});
export type PropuestaFormatoManual = z.infer<typeof PropuestaFormatoManualSchema>;

/** La propuesta guardada en el spec del lote, o null (lote que no salió de un archivo manual). */
export function leerPropuestaFormatoManualDeLote(specJson: unknown): PropuestaFormatoManual | null {
  if (!specJson || typeof specJson !== "object") return null;
  const parsed = PropuestaFormatoManualSchema.safeParse((specJson as Record<string, unknown>).propuestaFormatoManual);
  return parsed.success ? parsed.data : null;
}

const pareceDato = (texto: string): boolean => /^[\s$%€()+\-.,/\d]+$/.test(texto);

/** Por qué este formato no se puede guardar como patrón manual, o null. */
export function motivoNoGuardable(descriptor: DescriptorModulo, encabezado: readonly string[], spec: SpecModulo): string | null {
  if (spec.lecturaEstructurada) return "Este formato necesita la asistencia de lectura de Inventarios: no se guarda como patrón manual.";
  if (!huellaFormatoManual(descriptor, encabezado)) {
    return "El encabezado tiene menos de dos títulos: no serviría para reconocer otro archivo.";
  }
  const titulos = encabezado.map((t) => t.trim()).filter(Boolean);
  if (titulos.filter(pareceDato).length * 2 >= titulos.length) {
    return "El encabezado que se leyó parece una fila de datos (casi todo son números): no serviría para reconocer otro archivo.";
  }
  return null;
}

// ---- Qué hacer al confirmar ----

export type EstadoFormatoManual = "nuevo" | "igual" | "reemplaza" | "no_guardable";

export type AccionFormatoManual =
  /** Formato nuevo del cliente. */
  | { tipo: "crear" }
  /** El mismo formato, con los mismos títulos: solo suma un uso. */
  | { tipo: "sumar_uso"; id: number }
  /**
   * Reescribe un formato existente: títulos, mapeo y archivo de ejemplo JUNTOS. `cambiaMapeo` fija
   * además «guardado el / por»; sin él (mismo mapeo con títulos que cambiaron, o un perfil anterior
   * que se completa) también suma el uso.
   */
  | { tipo: "actualizar"; id: number; cambiaMapeo: boolean };

export type PlanFormatoManual = {
  estado: EstadoFormatoManual;
  accion: AccionFormatoManual | null;
  /** El formato que se reemplaza o actualiza (para el aviso del borrador). */
  existente: FormatoManualGuardado | null;
  motivo: string | null;
  huella: string | null;
};

/**
 * Qué hace la confirmación con la propuesta del lote, sobre los formatos guardados del cliente:
 *  1. los mismos títulos ya guardados → mismo mapeo: sumar un uso; otro mapeo: reemplazarlo;
 *  2. se leyó con un formato que coincidió (≥ 80 %) o con un perfil anterior → ese mismo formato se
 *     actualiza (los títulos cambiaron un poco, o el perfil anterior gana sus títulos);
 *  3. si no, es un formato nuevo.
 * «igual» no pide confirmación (se cuenta el uso solo); «nuevo» y «reemplaza» dependen de la casilla.
 */
export function planFormatoManual(
  descriptor: DescriptorModulo,
  propuesta: PropuestaFormatoManual,
  formatos: readonly FormatoManualGuardado[],
): PlanFormatoManual {
  const spec = normalizarSpecModulo(descriptor, propuesta.spec);
  const motivo = motivoNoGuardable(descriptor, propuesta.encabezado, spec);
  const huella = huellaFormatoManual(descriptor, propuesta.encabezado);
  if (motivo || !huella) return { estado: "no_guardable", accion: null, existente: null, motivo: motivo ?? "No se puede guardar.", huella: null };

  const mismoMapeo = (f: FormatoManualGuardado) => {
    const guardado = specDeFormato(descriptor, f);
    return guardado != null && mismoFormatoManual(guardado, spec);
  };

  const porTitulos = formatos.find((f) => f.huella === huella);
  if (porTitulos) {
    return mismoMapeo(porTitulos)
      ? { estado: "igual", accion: { tipo: "sumar_uso", id: porTitulos.id }, existente: porTitulos, motivo: null, huella }
      : { estado: "reemplaza", accion: { tipo: "actualizar", id: porTitulos.id, cambiaMapeo: true }, existente: porTitulos, motivo: null, huella };
  }
  const usadoId = propuesta.formatoUsadoId ?? propuesta.perfilLegadoId;
  const usado = usadoId != null ? formatos.find((f) => f.id === usadoId) : undefined;
  if (usado) {
    const igual = mismoMapeo(usado);
    return { estado: igual ? "igual" : "reemplaza", accion: { tipo: "actualizar", id: usado.id, cambiaMapeo: !igual }, existente: usado, motivo: null, huella };
  }
  return { estado: "nuevo", accion: { tipo: "crear" }, existente: null, motivo: null, huella };
}

/** Si la confirmación escribe: «igual» siempre (solo cuenta el uso); «nuevo» y «reemplaza», con la casilla. */
export function debeGuardarFormatoManual(estado: EstadoFormatoManual, casilla: unknown): boolean {
  if (estado === "igual") return true;
  if (estado === "no_guardable") return false;
  return casilla === "1" || casilla === true;
}

// ---- Lo que ve la interfaz ----

/** El formato que se aplicó al analizar el archivo (modal de carga). */
export type FormatoManualAnalisis = {
  id: number;
  porcentaje: number | null;
  /** Perfil anterior: se reconoció por su huella exacta, sin %. */
  anterior: boolean;
  archivoEjemplo: string | null;
  guardadoEn: string | null;
  guardadoPor: string | null;
  vecesUsado: number;
  advertencias: string[];
};

/** Lo que el borrador muestra junto a la casilla «Guardar este patrón manual para {cliente}». */
export type FormatoManualBorrador = {
  estado: EstadoFormatoManual;
  cliente: string;
  motivo: string | null;
  existente: { archivoEjemplo: string | null; guardadoEn: string | null; guardadoPor: string | null } | null;
};

export function vistaFormatoManual(f: FormatoManualGuardado, porcentaje: number | null, advertencias: string[] = []): FormatoManualAnalisis {
  return {
    id: f.id,
    porcentaje,
    anterior: porcentaje == null,
    archivoEjemplo: f.archivoEjemplo,
    guardadoEn: (f.guardadoEn ?? f.creadoEn).toISOString(),
    guardadoPor: f.guardadoPor ?? f.creadoPor,
    vecesUsado: f.vecesUsado,
    advertencias,
  };
}
