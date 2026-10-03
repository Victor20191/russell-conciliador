import { SpecModuloSchema, type SpecModulo } from "./extraccion/esquema";
import type { ResultadoAsistenciaInventario, ResumenLecturaInventario, OrigenLecturaInventario } from "./asistencia/tipos";
import { esImputable } from "./promocion";
import { controlSubtotales } from "./subtotales";

export type EstadoAsistenciaInventario = "analizando" | "requiere_respuesta" | "propuesta_lista" | "borrador_preparado" | "error_recuperable" | "confirmado";

/** Evidencia privada del original. Nunca se expone como muestra compartida del ERP. */
export type AsistenciaInventarioGuardada = {
  version: 1;
  estado: EstadoAsistenciaInventario;
  operacionId: string;
  venceEn: string;
  erpId: number;
  periodo: string;
  anexoEncabezadoId: number | null;
  instrucciones: string;
  respuestas: Record<string, string>;
  resultado: ResultadoAsistenciaInventario | null;
  aplicado: { spec: SpecModulo; resumen: ResumenLecturaInventario; revision: number; origen: OrigenLecturaInventario; encabezado: unknown[]; versionBaseId: number | null } | null;
  versionBaseId: number | null;
  encabezado: unknown[];
  error?: string;
};

export function leerAsistenciaInventario(valor: unknown): AsistenciaInventarioGuardada | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const dato = valor as Partial<AsistenciaInventarioGuardada>;
  if (dato.version !== 1 || typeof dato.erpId !== "number" || !Number.isInteger(dato.erpId)
    || typeof dato.periodo !== "string" || typeof dato.operacionId !== "string"
    || typeof dato.estado !== "string" || !["analizando", "requiere_respuesta", "propuesta_lista", "borrador_preparado", "error_recuperable", "confirmado"].includes(dato.estado)) return null;
  if (dato.resultado?.spec && !SpecModuloSchema.safeParse(dato.resultado.spec).success) return null;
  if (dato.aplicado?.spec && !SpecModuloSchema.safeParse(dato.aplicado.spec).success) return null;
  return dato as AsistenciaInventarioGuardada;
}

export function intentoInventarioVigente(asistencia: AsistenciaInventarioGuardada | null, ahora = Date.now()): boolean {
  return asistencia?.estado === "analizando" && Date.parse(asistencia.venceEn) > ahora;
}

type EdicionFila = { hoja: string | null; filaNum: number; clasificador: string | null; valor: number | { toString(): string }; datos: unknown; tipoFila: string; tipoFilaForzado: string | null; omitida: boolean | null; padreManual: number | null; motivoTipoFila?: string | null };
type FilaOriginal = { filaNum: number; clasificador: string | null; valor: number; datos: unknown; tipoFila: string; omitida?: boolean | null; motivo?: string | null };

const CLAVE_ORIGEN_INVENTARIO = "__origenInventario";
const objeto = (valor: unknown): valor is Record<string, unknown> => valor != null && typeof valor === "object" && !Array.isArray(valor);
const enteroDesde = (valor: unknown, minimo: number): valor is number => typeof valor === "number" && Number.isSafeInteger(valor) && valor >= minimo;

/** null = fila histórica sin traza; undefined = traza presente pero ilegible. */
function firmaOrigenInventario(datos: Record<string, unknown>): string | null | undefined {
  const cruda = datos[CLAVE_ORIGEN_INVENTARIO];
  if (cruda == null) return null;
  if (typeof cruda !== "string") return undefined;
  try {
    const traza: unknown = JSON.parse(cruda);
    if (!objeto(traza) || traza.version !== 1 || !enteroDesde(traza.filaAncla, 1)
      || !Array.isArray(traza.filasOrigen) || !traza.filasOrigen.every((f) => enteroDesde(f, 1))
      || !Array.isArray(traza.campos) || !["registro", "total", "subtotal"].includes(String(traza.tipo))) return undefined;
    const campos = [];
    for (const campo of traza.campos) {
      if (!objeto(campo) || typeof campo.rol !== "string" || !Array.isArray(campo.fuentes)) return undefined;
      const fuentes = [];
      for (const fuente of campo.fuentes) {
        if (!objeto(fuente) || !enteroDesde(fuente.fila, 1) || !enteroDesde(fuente.columna, 1)
          || !enteroDesde(fuente.inicio, 0) || !enteroDesde(fuente.fin, fuente.inicio)) return undefined;
        // Son dos lecturas del MISMO original: otro intervalo dentro de la celda
        // puede ser otro precio/código, aunque el ancla y la referencia coincidan.
        fuentes.push([fuente.fila, fuente.columna, fuente.inicio, fuente.fin]);
      }
      campos.push({ rol: campo.rol, fuentes });
    }
    campos.sort((a, b) => a.rol.localeCompare(b.rol));
    return JSON.stringify({ filaAncla: traza.filaAncla, filasOrigen: [...traza.filasOrigen].sort((a, b) => a - b), campos, tipo: traza.tipo });
  } catch {
    return undefined;
  }
}

function mismoOrigenInventario(actuales: Record<string, unknown>, anteriores: Record<string, unknown>, nuevas: Record<string, unknown>): boolean {
  const actual = firmaOrigenInventario(actuales);
  const anterior = firmaOrigenInventario(anteriores);
  const nueva = firmaOrigenInventario(nuevas);
  return actual !== undefined && anterior !== undefined && nueva !== undefined && actual === anterior && anterior === nueva;
}

/** Compara contra la lectura anterior para conservar también importes editados, no solo banderas. */
export function conservarEdicionesInventario(
  actuales: readonly EdicionFila[], anteriores: readonly FilaOriginal[], nuevas: readonly FilaOriginal[], hojaAnterior: string, hojaNueva: string,
) {
  const porAnterior = new Map(anteriores.map((f) => [f.filaNum, f]));
  const porNueva = new Map(nuevas.map((f) => [f.filaNum, f]));
  const conservables: EdicionFila[] = [];
  const incompatibles: number[] = [];
  const cambios: Map<number, Partial<EdicionFila>> = new Map();
  for (const fila of actuales) {
    const base = porAnterior.get(fila.filaNum);
    const diferencias: Partial<EdicionFila> = {};
    if (!base || fila.clasificador !== base.clasificador) diferencias.clasificador = fila.clasificador;
    if (!base || Number(fila.valor) !== base.valor) diferencias.valor = fila.valor;
    const datosActuales = (fila.datos ?? {}) as Record<string, unknown>;
    const datosBase = (base?.datos ?? {}) as Record<string, unknown>;
    const datosCambiados = Object.fromEntries([...new Set([...Object.keys(datosActuales), ...Object.keys(datosBase)])]
      // La evidencia del motor nunca es un ajuste humano ni se copia al mapa nuevo.
      .filter((clave) => clave !== CLAVE_ORIGEN_INVENTARIO)
      .filter((clave) => JSON.stringify(datosActuales[clave]) !== JSON.stringify(datosBase[clave]))
      .map((clave) => [clave, datosActuales[clave] ?? null]));
    if (Object.keys(datosCambiados).length > 0) diferencias.datos = datosCambiados;
    if (fila.tipoFilaForzado != null) diferencias.tipoFilaForzado = fila.tipoFilaForzado;
    if (fila.padreManual != null) diferencias.padreManual = fila.padreManual;
    if (fila.omitida !== (base?.omitida ?? null)) diferencias.omitida = fila.omitida;
    if (Object.keys(diferencias).length === 0) continue;
    const nueva = porNueva.get(fila.filaNum);
    const identidadAnterior = base?.datos as Record<string, unknown> | undefined;
    const identidadNueva = nueva?.datos as Record<string, unknown> | undefined;
    const mismaReferencia = String(identidadAnterior?.referencia ?? "") === String(identidadNueva?.referencia ?? "");
    if (!base || hojaAnterior !== hojaNueva || !nueva || !mismaReferencia || base.tipoFila !== nueva.tipoFila
      || !mismoOrigenInventario(datosActuales, datosBase, identidadNueva ?? {})
      || (fila.padreManual != null && !porNueva.has(fila.padreManual))) {
      incompatibles.push(fila.filaNum);
    } else {
      conservables.push(fila);
      cambios.set(fila.filaNum, diferencias);
    }
  }
  return { conservables, incompatibles, cambios, cantidad: conservables.length + incompatibles.length };
}

/** La comparación visible incluye los ajustes que realmente se conservarán al aplicar. */
export function compararLecturasInventario(
  actuales: readonly EdicionFila[], anteriores: readonly FilaOriginal[], nuevas: readonly FilaOriginal[],
  resumenAnterior: ResumenLecturaInventario, resumenNuevo: ResumenLecturaInventario,
  columnasNumericas: string[],
) {
  const ediciones = conservarEdicionesInventario(actuales, anteriores, nuevas, resumenAnterior.hoja ?? "", resumenNuevo.hoja ?? "");
  const proyectadas = nuevas.map((fila) => {
    const cambio = ediciones.cambios.get(fila.filaNum);
    return { ...fila, ...cambio, valor: Number(cambio?.valor ?? fila.valor), tipoFila: cambio?.tipoFilaForzado ?? fila.tipoFila,
      datos: { ...(fila.datos as Record<string, unknown>), ...(cambio?.datos as Record<string, unknown> | undefined) } };
  });
  const resumir = (filas: readonly FilaOriginal[], base: ResumenLecturaInventario): ResumenLecturaInventario => {
    const candidatas = filas.map((fila) => ({ ...fila, datos: (fila.datos ?? {}) as Record<string, unknown>, omitida: fila.omitida ?? null }));
    const imputable = (fila: (typeof candidatas)[number]) => esImputable(fila, columnasNumericas);
    const incluidas = candidatas.filter(imputable);
    const valorLeido = Math.round(incluidas.reduce((suma, fila) => suma + Number(fila.valor), 0) * 100) / 100;
    const totalDeclarado = controlSubtotales(candidatas, (fila) => imputable({ ...fila, omitida: fila.omitida ?? null })).granTotal?.subtotalArchivo ?? null;
    return { ...base, filasIncluidas: incluidas.length, filasExcluidas: filas.length - incluidas.length, valorLeido, totalDeclarado,
      diferencia: totalDeclarado == null ? null : Math.round((totalDeclarado - valorLeido) * 100) / 100 };
  };
  return {
    resumenAnterior: resumir(actuales.map((fila) => ({ ...fila, valor: Number(fila.valor), motivo: fila.motivoTipoFila ?? null })), resumenAnterior),
    resumen: resumir(proyectadas, resumenNuevo), edicionesManuales: ediciones.cantidad,
    hayEdicionesIncompatibles: ediciones.incompatibles.length > 0,
  };
}
