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
  //  - "manual": en una carga nueva, el usuario ubica una coordenada exacta
  //              (`subtotalesColumna` + `subtotalesFila`) y el servidor vuelve a leer su
  //              contenido (`subtotalesTexto`) del original. El perfil reutilizable retiene
  //              columna+texto para describir el formato, pero nunca la fila del archivo.
  subtotales: z.enum(["auto", "rotulo", "nunca", "manual"]).optional(),
  subtotalesColumna: z.number().int().min(1).optional(),
  subtotalesTexto: z.string().max(80).optional(),
  // Coordenada EFÍMERA del archivo actual. Autoriza exactamente una fila como gran total;
  // nunca se copia al perfil reutilizable porque la posición puede cambiar en otro archivo.
  subtotalesFila: z.number().int().min(1).max(1_048_576).optional(),

  // ===== Columnas cuyo número y rótulos los pone el ARCHIVO (ver `FamiliaDinamica`) =====
  // Llaveado por el nombre de la familia («edades»). Un módulo que no declara familias en
  // su descriptor las descarta al normalizar, así que esto es inerte para INV/AFI/NOM/…
  familias: z.record(
    z.string(),
    z.array(z.object({
      columna: z.number().int().min(1),
      // Rótulo LITERAL del ERP («De 1 a 90», «<== 90-», «POR VENCER»): es la llave con la
      // que el detalle guarda el valor y la que se pinta como encabezado de la columna.
      etiqueta: z.string().min(1).max(80),
      // Qué hace ese balde con el saldo del tercero. `excluir` = el archivo lo imprime pero
      // ya está contado en los demás (p. ej. «Deuda dudosa» de SAP).
      clase: z.enum(["corriente", "vencido", "saldo_favor", "excluir"]).optional(),
    })),
  ).optional(),
  // Cómo viene la antigüedad: en columnas («ancho»), como etiqueta de una columna
  // («largo»), o no viene. Solo informa a la UI y a las validaciones.
  edadesModo: z.enum(["ancho", "largo", "ninguna"]).optional(),

  // ===== Forma del identificador del tercero (módulos que concilian por NIT) =====
  //  - "columna"  : el NIT viene en cada fila (por defecto).
  //  - "cabecera" : una fila trae el tercero y sus documentos van DEBAJO sin NIT (SAP,
  //                 SIESA detalle); las filas de abajo lo heredan por forward-fill.
  terceroModo: z.enum(["columna", "cabecera"]).optional(),
  // Roles adicionales que se arrastran hacia abajo cuando el archivo los imprime una sola
  // vez. Se validan contra `descriptor.arrastrables`.
  arrastrarRoles: z.array(z.string()).optional(),

  // Señales que marcan un renglón de SECCIÓN, en orden de preferencia. Amplía el modo
  // "seccion" del clasificador, que hasta ahora solo sabía mirar una columna vacía.
  //  - "columnaVacia" : el comportamiento actual (`seccionColumnaVaciaRol`).
  //  - "columnaLlena" : otra columna trae dato SOLO en las secciones (SIESA: «#Ter.»).
  //  - "negrita"      : el ERP marca en negrita los encabezados de cuenta.
  seccionSenal: z.array(z.enum(["columnaVacia", "columnaLlena", "negrita"])).optional(),
  seccionColumnaLlenaRol: z.string().optional(),

  // Qué representa una fila del archivo y de dónde viene la cartera. Los declara el
  // usuario al cargar; el cruce y las reglas de anexo dependen de ellos.
  nivel: z.enum(["tercero", "documento"]).optional(),
  origenCartera: z.enum(["nacional", "exterior", "mixta"]).optional(),
  // Convención de signo del archivo: true cuando el ERP imprime la deuda en NEGATIVO (SAP
  // Business One, ILIMITADA). El módulo guarda siempre deuda +, anticipo −; se sugiere por
  // voto y se memoriza en el perfil del cliente.
  invertirSigno: z.boolean().optional(),
  // Moneda de los importes cuando NO son pesos (hoja «USD» de Plasmar): se leen en la divisa y
  // se convierten con la TRM de cierre. Es del formato y se memoriza en el perfil.
  monedaArchivo: z.string().regex(/^[A-Z]{3}$/).optional(),
  // TRM de cierre (pesos por unidad de divisa) y fecha de corte de ESTE archivo: son del cargue,
  // no del formato, así que nunca se guardan en el perfil del cliente.
  trmCierre: z.number().positive().optional(),
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Fila ROTULADA de tercero (SEVEN): «PROVEEDOR | NIT | nombre» en columnas de otros roles, con
  // los documentos debajo. El identificador solo existe en esas filas.
  filaTercero: z.object({
    columnaRotulo: z.number().int().positive(),
    texto: z.string().min(1),
    columnaClave: z.number().int().positive(),
    columnaNombre: z.number().int().positive().optional(),
  }).optional(),
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
