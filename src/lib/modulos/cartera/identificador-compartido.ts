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
}): RolCeldaCompartida {
  const t = limpio(celda.valor);
  if (esIdentificadorVacio(t)) return "vacia";

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
