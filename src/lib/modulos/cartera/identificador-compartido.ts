// IDENTIFICADOR COMPARTIDO de los reportes jerárquicos de SIESA — puro, sin BD.
//
// En el reporte de «vencimiento por edades» de SIESA una MISMA columna trae, según la fila,
// la cuenta contable, el NIT del tercero o el número del documento. Los dos archivos reales
// que lo usan (Zarzal y el detalle de Mineralin) se leían con el total correcto pero sin
// identificar a ningún tercero: el motor asigna un rol por columna, y aquí la columna no
// tiene un rol fijo.
//
// Lo que decide el rol de la celda, medido sobre los archivos reales:
//
//   · «#Ter.» lleno (la cantidad de terceros de la sección) → CUENTA. Es la señal más fuerte
//     y la única que sobrevive a un export sin estilos.
//   · El patrón del documento del ERP («001-FVM-00735278-000») → DOCUMENTO.
//   · Dígitos en negrita sin «#Ter.» → TERCERO … pero SOLO si el archivo trae documentos.
//
// Esa última condición es la trampa: la negrita significa cosas OPUESTAS según el archivo.
// En Zarzal y en el detalle de Mineralin marca a los TERCEROS (y sus documentos van en letra
// normal); en el resumen de Aceros Mapa marca a las CUENTAS (y los terceros van en normal,
// porque ahí no hay documentos). Una regla por celda acierta en unos y falla en otros; la que
// mira si el archivo tiene documentos acierta en los tres.
//
// Tampoco todo lo que ocupa la columna es un identificador: Mineralin rellena con «*» la
// celda del identificador en las filas de documento. Tratarlo como NIT impediría heredar el
// tercero de la cabecera y dejaría la fila sin atribuir.

export type RolCeldaCompartida = "cuenta" | "tercero" | "documento" | "vacia" | "otro";

/**
 * El número de documento del ERP: «001-FVM-00735278-000», «001-RC -00033422-000» y, en el
 * auxiliar de CxP de Zarzal, también sin tipo o con tipo numérico o alfanumérico
 * («001--00001596-000», «001-8850-00000000-000», «001-FAJ1-00016206-000»). El consecutivo de
 * al menos tres dígitos evita confundirlo con una fecha («2025-12-31»).
 */
const PATRON_DOCUMENTO = /^\d{2,4}\s*-\s*[A-Z0-9]{0,12}\s*-+\s*\d{3,}(?:\s*-+\s*\d+)?$/i;

/** Un identificador de tercero: solo dígitos, entre 5 (códigos internos) y 13 (RUC). */
const PATRON_TERCERO = /^\d{5,13}$/;

/** Un código de cuenta del PUC: de 1 a 10 dígitos. */
const PATRON_CUENTA = /^\d{1,10}$/;

/** Marcas de relleno que el ERP pone donde no hay identificador propio. */
const MARCAS_DE_RELLENO = new Set(["*", "**", "-", "—", "·", "."]);

const limpio = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** ¿La celda está vacía a efectos de identidad? (incluye las marcas de relleno del ERP). */
export function esIdentificadorVacio(valor: unknown): boolean {
  const t = limpio(valor);
  return t === "" || MARCAS_DE_RELLENO.has(t);
}

/** ¿El texto tiene la forma del número de documento del ERP? */
export function esNumeroDocumento(valor: unknown): boolean {
  return PATRON_DOCUMENTO.test(limpio(valor));
}

/**
 * ¿El archivo trae filas de DOCUMENTO? Se decide por datos, no por encabezado: basta con que
 * una fracción apreciable de las celdas de la columna tengan la forma del documento del ERP.
 * El umbral deja fuera un documento suelto que alguien haya tecleado en un resumen.
 */
export function archivoConDocumentos(celdas: readonly unknown[], umbral = 0.05): boolean {
  let conValor = 0;
  let documentos = 0;
  for (const c of celdas) {
    if (esIdentificadorVacio(c)) continue;
    conValor++;
    if (esNumeroDocumento(c)) documentos++;
  }
  return conValor > 0 && documentos / conValor >= umbral;
}

/** Prefijos (4 dígitos) de las cuentas que concilia el módulo: 130505 → 1305. */
export function prefijosCuentaDeCedula(cuentas: readonly string[]): string[] {
  return [...new Set(cuentas.map((c) => String(c).replace(/\D/g, "").slice(0, 4)).filter((c) => c.length === 4))];
}

/** Cuenta del PUC del cliente en un export SIN «#Ter.»: de 6 a 10 dígitos. */
const PATRON_CUENTA_SIN_MARCA = /^\d{6,10}$/;

/**
 * Export SIN «#Ter.» (el detalle de Mineralin de sep/2026): la cuenta no trae marca y va DEBAJO
 * de su tercero, justo encima de sus documentos, y en negrita como él. Es cuenta el código que
 * empieza por un prefijo de las cuentas del módulo (13050502 en Cartera) Y que va seguido de
 * documentos: así una cédula que empiece por 1305 sigue siendo tercero, porque debajo de ella va
 * su renglón de cuenta y no sus documentos.
 */
export function esCuentaSinMarca(valor: unknown, contexto: { prefijosCuenta: readonly string[]; siguenDocumentos: boolean }): boolean {
  const t = limpio(valor);
  return contexto.siguenDocumentos
    && PATRON_CUENTA_SIN_MARCA.test(t)
    && contexto.prefijosCuenta.some((p) => t.startsWith(p));
}

/**
 * Rol de una celda de la columna compartida.
 *
 * `hayDocumentos` es una propiedad del ARCHIVO (ver `archivoConDocumentos`), no de la fila:
 * sin ella no se puede interpretar la negrita.
 */
export function rolDeCeldaCompartida(celda: {
  valor: unknown;
  negrita: boolean;
  /** La celda de «#Ter.» (cantidad de terceros de la sección), si el archivo la trae. */
  marcaSeccion: unknown;
  hayDocumentos: boolean;
  /**
   * El archivo no trae «#Ter.» en ninguna fila: la cuenta se reconoce por su código y por los
   * documentos que la siguen (`esCuentaSinMarca`), y el tercero no depende de la negrita (en este
   * export la cuenta también va en negrita).
   */
  sinMarcaSeccion?: { prefijosCuenta: readonly string[]; siguenDocumentos: boolean };
}): RolCeldaCompartida {
  const t = limpio(celda.valor);
  if (esIdentificadorVacio(t)) return "vacia";

  if (celda.sinMarcaSeccion && celda.hayDocumentos) {
    if (esNumeroDocumento(t)) return "documento";
    if (esCuentaSinMarca(t, celda.sinMarcaSeccion)) return "cuenta";
    return PATRON_TERCERO.test(t) ? "tercero" : "otro";
  }

  // «#Ter.» lleno: es el encabezado de una sección de cuenta, venga o no en negrita.
  if (!esIdentificadorVacio(celda.marcaSeccion) && PATRON_CUENTA.test(t)) return "cuenta";

  if (esNumeroDocumento(t)) return "documento";

  if (PATRON_TERCERO.test(t) || PATRON_CUENTA.test(t)) {
    if (celda.hayDocumentos) {
      // Reporte con detalle: la negrita marca la cabecera del tercero; un número sin negrita
      // entre documentos no es un tercero confiable, pero tampoco una cuenta.
      return celda.negrita && PATRON_TERCERO.test(t) ? "tercero" : "otro";
    }
    // Reporte sin documentos (resumen por tercero con secciones de cuenta): la negrita
    // marca la cuenta y el tercero va en letra normal.
    if (celda.negrita) return "cuenta";
    return PATRON_TERCERO.test(t) ? "tercero" : "otro";
  }

  // Rótulos («Total»), marcas del ERP («SBS 1.25.0») y demás texto: no es un identificador.
  return "otro";
}
