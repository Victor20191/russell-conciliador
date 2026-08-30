// Esquema del SPEC de mapeo de columnas de un módulo — genérico, dirigido por el
// descriptor (`src/lib/modulos/descriptores.ts`). El spec dice qué COLUMNA (1-based;
// 0 = «no existe») tiene cada rol del módulo, más la hoja y las filas de encabezado/datos.
// Es lo que el wizard edita, el perfil guarda por huella, y el transform aplica.
import * as z from "zod";

/**
 * Mapeo de columnas de un módulo. `columnas` se llavea por el `nombre` interno del
 * `RolColumna` del descriptor → índice de columna 1-based (A=1); 0 = la columna no existe
 * en el archivo. Sin PUC ni partida doble: es puro «qué columna es qué».
 */
export const SpecModuloSchema = z.object({
  hoja: z.string(),
  filaEncabezado: z.number().int().min(1),
  primeraFilaDatos: z.number().int().min(1),
  columnas: z.record(z.string(), z.number().int().min(0)),
  // Cómo llega el CLASIFICADOR (tipo):
  //  - "columna"  : en su propia columna, valor en cada fila (por defecto).
  //  - "arrastrar": AGRUPADO en su columna (celda combinada tipo SAP); aparece una vez
  //                 por bloque y las filas de abajo lo heredan (forward-fill).
  //  - "seccion"  : en RENGLONES de sección (encabezados de grupo, a veces en negrita)
  //                 intercalados con los ítems, en la MISMA columna que otro campo
  //                 (p. ej. el código). El label de la sección se hereda a los ítems.
  //  - "global"   : el archivo NO trae tipo; todo se toma como un ÚNICO inventario global
  //                 (todas las filas con el mismo clasificador). No usa columna.
  clasificadorModo: z.enum(["columna", "arrastrar", "seccion", "global"]).optional(),
  // Modo "seccion": un renglón es ENCABEZADO DE SECCIÓN si su clasificador tiene texto y,
  // además, la columna de este rol viene VACÍA (p. ej. "descripcion" vacía = es un título,
  // no un ítem). Si el archivo trae negrita, también se detecta por negrita.
  seccionColumnaVaciaRol: z.string().optional(),
  // Legado: equivalente a clasificadorModo="arrastrar" (se respeta si viene en perfiles viejos).
  arrastrarClasificador: z.boolean().optional(),
  // Detección de filas de SUBTOTAL por clasificador (se excluyen del consolidado y sirven
  // de CONTROL contra la Σ de los movimientos de su bloque):
  //  - "auto" (por defecto): por rótulo («Total X»), o por suma del bloque + fila sin
  //                          detalle / en negrita.
  //  - "rotulo": solo las filas que digan «Total»/«Subtotal».
  //  - "nunca" : desactivada (queda solo la negrita del transform).
  subtotales: z.enum(["auto", "rotulo", "nunca"]).optional(),
});
export type SpecModulo = z.infer<typeof SpecModuloSchema>;

/**
 * Extracción DIRECTA (PDF / no tabular): filas ya normalizadas por la IA, cada una un
 * objeto rol→valor. El transform las valida/deriva igual que las tabulares.
 */
export const ExtraccionDirectaModuloSchema = z.object({
  filas: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});
export type ExtraccionDirectaModulo = z.infer<typeof ExtraccionDirectaModuloSchema>;

/** Spec vacío coherente con un descriptor (todas las columnas en 0 = sin mapear). */
export function specVacio(hoja: string, roles: string[]): SpecModulo {
  return {
    hoja,
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: Object.fromEntries(roles.map((r) => [r, 0])),
  };
}
