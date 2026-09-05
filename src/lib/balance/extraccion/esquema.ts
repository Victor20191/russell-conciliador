// Contrato de I/O de la extracción asistida por IA de balances.
//
// Dos modos de salida del modelo (ambos forzados con Structured Outputs vía
// `zodOutputFormat` en el orquestador, validados además aquí con Zod):
//   - MappingSpec: para archivos TABULARES (xlsx/xlsm/xls/csv/json). El modelo
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

export const ESTANDARES = ["NIF", "NIIF", "PCGA", "AUTO", "DESCONOCIDO"] as const;
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

// Mapa de columnas: índices de columna 1-based (A=1). 0 = la columna no existe.
// (Se usa 0 en vez de null para no exceder el límite de 16 parámetros con
// uniones/nullables de Structured Outputs.)
export const ColumnasSchema = z
  .object({
    codigo: z.number().int(),
    // Código PUC FRAGMENTADO en varias columnas de jerarquía (SIIGO «Balance de prueba
    // auxiliares»: GRUPO|CUENTA|SUBCUENTA|AUXILIAR|SUBAUXILIAR). Índices 1-based EN ORDEN
    // (grupo→auxiliar); el código real es su concatenación (`11`+`05`+`10`+`01` →
    // `11051001`). Vacío `[]` cuando el código viene en UNA sola columna (usa `codigo`).
    codigoFragmentos: z.array(z.number().int()),
    nombre: z.number().int(),
    saldoInicial: z.number().int(),
    debitos: z.number().int(),
    creditos: z.number().int(),
    // Saldo final como columna única firmada…
    saldoFinal: z.number().int(),
    // …o partido en débito/crédito (saldo = débito − crédito).
    saldoFinalDebito: z.number().int(),
    saldoFinalCredito: z.number().int(),
    // Tercero (si existe → puede requerir agregación por cuenta).
    tercero: z.number().int(),
  })
  .describe("Índices de columna 1-based (A=1). Usa 0 cuando la columna no exista (no null).");
// Complementos del editor/perfil. El contrato de IA permanece igual; estos roles
// no participan en detección, agregación ni validación contable.
export const ColumnasCargaSchema = ColumnasSchema.extend({
  nombreTercero: z.number().int().min(0).optional(),
  tipoDocumentoTercero: z.number().int().min(0).optional(),
  dvTercero: z.number().int().min(0).optional(),
});
export type Columnas = z.infer<typeof ColumnasCargaSchema>;

// Cómo reconocer una fila de DETALLE (cuenta de MOVIMIENTO/hoja) vs. una fila
// padre/agrupadora. La plataforma detecta las hojas de forma DETERMINISTA por
// PREFIJO (una cuenta es agrupadora si su código es prefijo de otro más largo
// del archivo —tiene hijos—; es hoja, movimiento real, si nadie cuelga de ella),
// con un piso de 6 dígitos (nivel de imputación del PUC). El modelo NO necesita
// estimar longitudes: solo debe indicar una columna marcadora de imputable si el
// archivo la trae (esa tiene prioridad sobre el prefijo).
export const ReglaDetalleSchema = z.object({
  // "prefijo": detección estructural por jerarquía (default; la hace el código).
  // "columna": una columna marcadora con cierto valor (cueclasificacion=I,
  //   indicador=1, Rompimiento=Cuenta, Movimiento_Diario…).
  // "movimiento": el archivo trae SOLO cuentas de movimiento (lista plana, sin
  //   agrupadoras) → toda fila numérica se toma como movimiento (opción del usuario).
  tipo: z.enum(["prefijo", "columna", "movimiento"]),
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
  estandar: EstandarSchema,
  importable: z.boolean(), // false p. ej. Antioqueña (solo movimientos), IDOM (libro diario)
  motivoNoImportable: z.string().nullable(),
  excepciones: z.array(ExcepcionSchema),
  confianza: z
    .number() // 0..1
    .describe(
      "Calibración honesta del mapeo (0..1). 0.9+ SOLO si el encabezado es inequívoco y cada columna de montos (saldo inicial, débitos, créditos, saldo final) se identificó sin duda. Usa <0.75 si dudaste entre columnas de débitos/créditos/saldos, del signo del crédito, o de primeraFilaDatos. Un valor bajo NO penaliza: escala la lectura a un modelo mayor. No infles la confianza.",
    ),
  notas: z.string().nullable(),
});
export type MappingSpec = Omit<z.infer<typeof MappingSpecSchema>, "columnas"> & { columnas: Columnas };

// Subconjunto EDITABLE/PERSISTIBLE del MappingSpec: lo que el usuario puede
// ajustar en el editor de estructura y lo que se guarda en el perfil de carga
// del cliente (los metadatos de una corrida —confianza, excepciones, notas,
// NIT/período— NO forman parte del layout).
export const SpecCargaSchema = MappingSpecSchema.pick({
  hoja: true,
  filaEncabezado: true,
  primeraFilaDatos: true,
  columnas: true,
  signoCredito: true,
  reglaDetalle: true,
  agregarPorTercero: true,
}).extend({ columnas: ColumnasCargaSchema });
export type SpecCarga = z.infer<typeof SpecCargaSchema>;

// Una fila ya normalizada (columnas del prompt, sin NIT/periodo que son del cabecera).
export const FilaExtraidaSchema = z.object({
  cuenta: z.string(),
  nombre: z.string(),
  saldoInicial: z.number(),
  debitos: z.number(),
  creditos: z.number(),
  saldo: z.number(),
});
export type FilaExtraida = z.infer<typeof FilaExtraidaSchema>;

// SALIDA del modelo para PDF / sin estructura: filas ya extraídas + cabecera.
export const ExtraccionDirectaSchema = z.object({
  nit: OrigenSchema,
  periodoInicial: OrigenSchema,
  periodoFinal: OrigenSchema,
  estandar: EstandarSchema,
  agregarPorTercero: z.boolean(),
  filas: z.array(FilaExtraidaSchema),
  importable: z.boolean(),
  motivoNoImportable: z.string().nullable(),
  excepciones: z.array(ExcepcionSchema),
  notas: z.string().nullable(),
});
export type ExtraccionDirecta = z.infer<typeof ExtraccionDirectaSchema>;

// Cuadre del balance contra la fila TOTALES del archivo (validación OBLIGATORIA
// del cargue). Suma los débitos/créditos de SOLO las cuentas de movimiento
// (hojas) y los compara con la fila TOTALES. Solo aplica a archivos tabulares con
// fila de totales y columnas de débito/crédito; si no se detecta una fila de
// totales, `detectado=false` y NO bloquea (se valida solo por partida doble). La
// tolerancia por columna es max(1 COP, 0.5% del total) para absorber redondeos.
export type CuadreTotales = {
  detectado: boolean; // se halló una fila TOTALES utilizable en el archivo
  totalDebitos: number; // débitos de la fila TOTALES del archivo
  totalCreditos: number; // créditos de la fila TOTALES del archivo
  sumaDebitos: number; // suma de débitos de las cuentas de movimiento (hojas)
  sumaCreditos: number; // suma de créditos de las cuentas de movimiento (hojas)
  diferenciaDebitos: number; // sumaDebitos − totalDebitos
  diferenciaCreditos: number; // sumaCreditos − totalCreditos
  toleranciaDebitos: number;
  toleranciaCreditos: number;
  cuadra: boolean; // detectado && ambas diferencias dentro de tolerancia
  // Partida doble de los movimientos: Σ débitos debe ser EXACTAMENTE igual a Σ
  // créditos (tolerancia 1 COP por redondeo, sin %). Independiente de la fila
  // TOTALES: aplica aunque el archivo no la traiga.
  diferenciaPartidaDoble: number; // sumaDebitos − sumaCreditos
  partidaDobleCuadra: boolean; // |diferenciaPartidaDoble| ≤ 1
};

// Cuadre no aplicable (archivo sin fila TOTALES o sin columnas de movimiento, p.
// ej. extracción directa de PDF). No bloquea el cargue.
export const CUADRE_NO_APLICA: CuadreTotales = {
  detectado: false,
  totalDebitos: 0,
  totalCreditos: 0,
  sumaDebitos: 0,
  sumaCreditos: 0,
  diferenciaDebitos: 0,
  diferenciaCreditos: 0,
  toleranciaDebitos: 0,
  toleranciaCreditos: 0,
  cuadra: false,
  diferenciaPartidaDoble: 0,
  partidaDobleCuadra: true, // no aplica → no alertar
};

// RESUMEN_AUDITORIA (SALIDA C) — lo arma el código a partir del resultado.
export type ResumenAuditoria = {
  filasLeidas: number;
  filasExcluidas: number; // por jerarquía/totales/encabezados
  filasImportables: number;
  filasDescuadre: number; // no cumplen la ecuación de control
  cuentasMovimiento: number; // hojas detectadas (cuentas de movimiento real)
  cuentasAgrupadoras: number; // cuentas que son prefijo de otra (no se importan)
  nit: Origen;
  periodoInicial: Origen;
  periodoFinal: Origen;
  estandar: Estandar;
  convencionCredito: ConvencionSigno;
};
