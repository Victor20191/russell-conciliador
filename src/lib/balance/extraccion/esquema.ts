// Contrato de I/O de la extracción asistida por IA de balances.
//
// Dos modos de salida del modelo (ambos forzados con Structured Outputs vía
// `zodOutputFormat` en el orquestador, validados además aquí con Zod):
//   - MappingSpec: para archivos TABULARES (xlsx/xls/xlsb/csv/json). El modelo
//     solo describe la ESTRUCTURA; la transformación masiva la hace el código.
//   - ExtraccionDirecta: para PDF / archivos sin estructura tabular fiable. El
//     modelo devuelve las filas ya normalizadas.
//
// Estos tipos no dependen del SDK de Anthropic → el módulo es testeable en Node.
import { z } from "zod";

// Procedencia de un metadato: parámetro del modal, fuente del archivo, inferido
// (p. ej. DV calculado), o no determinado.
export const FUENTES = ["PARAMETRO", "FUENTE", "INFERIDO", "NINGUNO"] as const;
export const FuenteSchema = z.enum(FUENTES);
export type Fuente = z.infer<typeof FuenteSchema>;

export const OrigenSchema = z.object({
  valor: z.string().nullable(),
  fuente: FuenteSchema,
});
export type Origen = z.infer<typeof OrigenSchema>;

export const ESTANDARES = ["NIIF", "PCGA", "AUTO", "DESCONOCIDO"] as const;
export const EstandarSchema = z.enum(ESTANDARES);
export type Estandar = z.infer<typeof EstandarSchema>;

export const CONVENCIONES_SIGNO = ["firmado", "magnitud"] as const;
export const SignoSchema = z.enum(CONVENCIONES_SIGNO);
export type ConvencionSigno = z.infer<typeof SignoSchema>;

// Excepción del ETL: fila no importable o conflicto de metadato (SALIDA B del prompt).
export const ExcepcionSchema = z.object({
  hoja: z.string().nullable(),
  fila: z.number().int().nullable(),
  campo: z.string().nullable(),
  valor: z.string().nullable(),
  regla: z.string(),
  accion: z.string(),
});
export type Excepcion = z.infer<typeof ExcepcionSchema>;

// Mapa de columnas: índices de columna 1-based (A=1). null = la columna no existe.
export const ColumnasSchema = z.object({
  codigo: z.number().int().nullable(),
  nombre: z.number().int().nullable(),
  saldoInicial: z.number().int().nullable(),
  debitos: z.number().int().nullable(),
  creditos: z.number().int().nullable(),
  // Saldo final como columna única firmada…
  saldoFinal: z.number().int().nullable(),
  // …o partido en débito/crédito (saldo = débito − crédito).
  saldoFinalDebito: z.number().int().nullable(),
  saldoFinalCredito: z.number().int().nullable(),
  // Centro operativo y tercero (si existe tercero → puede requerir agregación).
  centro: z.number().int().nullable(),
  tercero: z.number().int().nullable(),
});
export type Columnas = z.infer<typeof ColumnasSchema>;

// Cómo reconocer una fila de DETALLE (cuenta imputable) vs. una fila padre/total.
export const ReglaDetalleSchema = z.object({
  // "longitud": cuenta de detalle = longitud >= longitudMin (mínimo inclusivo).
  // "columna": una columna marcadora con cierto valor (cueclasificacion=I, indicador=1).
  tipo: z.enum(["longitud", "columna"]),
  longitudMin: z.number().int().nullable(), // longitud mínima inclusiva de una cuenta de detalle
  columna: z.number().int().nullable(),
  valor: z.string().nullable(),
});
export type ReglaDetalle = z.infer<typeof ReglaDetalleSchema>;

// SALIDA del modelo para archivos TABULARES: solo describe la estructura.
export const MappingSpecSchema = z.object({
  hoja: z.string(),
  filaEncabezado: z.number().int(), // fila (1-based) del encabezado (la última si está partido)
  primeraFilaDatos: z.number().int(), // primera fila (1-based) con datos
  columnas: ColumnasSchema,
  signoCredito: SignoSchema,
  reglaDetalle: ReglaDetalleSchema,
  agregarPorTercero: z.boolean(),
  nit: OrigenSchema,
  periodoInicial: OrigenSchema, // ISO yyyy-mm-dd en `valor`, o null
  periodoFinal: OrigenSchema,
  centroOperativo: OrigenSchema,
  estandar: EstandarSchema,
  importable: z.boolean(), // false p. ej. Antioqueña (solo movimientos), IDOM (libro diario)
  motivoNoImportable: z.string().nullable(),
  excepciones: z.array(ExcepcionSchema),
  confianza: z.number(), // 0..1
  notas: z.string().nullable(),
});
export type MappingSpec = z.infer<typeof MappingSpecSchema>;

// Una fila ya normalizada (10 columnas del prompt, sin NIT/periodo que son del cabecera).
export const FilaExtraidaSchema = z.object({
  cuenta: z.string(),
  nombre: z.string(),
  saldoInicial: z.number(),
  debitos: z.number(),
  creditos: z.number(),
  saldo: z.number(),
  centro: z.string().nullable(),
});
export type FilaExtraida = z.infer<typeof FilaExtraidaSchema>;

// SALIDA del modelo para PDF / sin estructura: filas ya extraídas + cabecera.
export const ExtraccionDirectaSchema = z.object({
  nit: OrigenSchema,
  periodoInicial: OrigenSchema,
  periodoFinal: OrigenSchema,
  centroOperativo: OrigenSchema,
  estandar: EstandarSchema,
  agregarPorTercero: z.boolean(),
  filas: z.array(FilaExtraidaSchema),
  importable: z.boolean(),
  motivoNoImportable: z.string().nullable(),
  excepciones: z.array(ExcepcionSchema),
  notas: z.string().nullable(),
});
export type ExtraccionDirecta = z.infer<typeof ExtraccionDirectaSchema>;

// RESUMEN_AUDITORIA (SALIDA C) — lo arma el código a partir del resultado.
export type ResumenAuditoria = {
  filasLeidas: number;
  filasExcluidas: number; // por jerarquía/totales/encabezados
  filasImportables: number;
  filasDescuadre: number; // no cumplen la ecuación de control
  nit: Origen;
  periodoInicial: Origen;
  periodoFinal: Origen;
  centro: Origen;
  estandar: Estandar;
  convencionCredito: ConvencionSigno;
};
