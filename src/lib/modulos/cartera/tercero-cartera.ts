// Normalizador del IDENTIFICADOR DEL TERCERO en los reportes de cartera — puro, sin BD.
//
// `src/lib/modulos/tercero.ts` ya resuelve el caso genérico «una celda con NIT y nombre
// mezclados». Los reportes de cartera traen además decoraciones propias de cada ERP que,
// sin retirar, impiden cruzar contra el balance por tercero:
//
//   SAP Business One   «C900123456» / «c900123456»  → prefijo de tipo de socio de negocio
//   SIESA              «         900123456        » → relleno a 20 caracteres
//   SIESA (Plasmar)    «900123456-1 S2»             → sufijo de sucursal
//   World Office       «NIT 900404987 - 3» / «CC 43169753 -» → etiqueta y DV separado
//   SIIGO              NIT y dígito de verificación en columnas distintas
//   SIEVENSOFT         «EXT000123456»               → marca de cartera del exterior
//   ILIMITADA / LIBRA  « 99-3929293»                → EIN estadounidense
//   varios             «0992796928001»              → RUC ecuatoriano de 13 dígitos
//
// Lo que este módulo NO hace: decidir si dos claves distintas son el mismo tercero. Eso es
// `claveTerceroCanonica` (`src/lib/nit.ts`) más, cuando el auditor lo dice, el
// emparejamiento manual.
import { claveTerceroCanonica, nucleoNit } from "@/lib/nit";
import { normalizarTerceroModulo } from "../tercero";

export type OrigenCartera = "nacional" | "exterior";

export type TerceroCartera = {
  /** Clave de cruce; `null` cuando el texto no contiene un identificador utilizable. */
  claveCanonica: string | null;
  /** Núcleo de 9 dígitos: segunda pasada del cruce contra balances capturados en legado. */
  nucleo: string | null;
  /** Los dígitos tal como quedaron tras retirar etiquetas, prefijos y sufijos. */
  digitos: string | null;
  /** El texto del identificador tal como venía, para mostrarlo y auditarlo. */
  original: string | null;
  /** Dígito de verificación, si el reporte lo trae (pegado o en columna aparte). */
  dv: string | null;
  /** Sucursal/agencia del tercero cuando el ERP la pega al identificador. */
  sucursal: string | null;
  nombre: string | null;
  /** Cartera del exterior deducida de la FORMA del identificador (propuesta, no verdad). */
  origenSugerido: OrigenCartera | null;
  /** Rarezas que el borrador debe mostrar al auditor (no bloquean). */
  observaciones: string[];
};

type Entrada = {
  nit?: unknown;
  dv?: unknown;
  nombre?: unknown;
  sucursal?: unknown;
};

/** Etiqueta del tipo de documento delante del número («NIT», «CC», «C.C.», «Cédula»). */
const ETIQUETA_DOCUMENTO = /^(nit|c\.?c\.?|cedula|c[eé]dula|ti|ce|pas(?:aporte)?)\s*[:.\-]?\s*/i;

/** Prefijo alfabético corto delante de un número largo: SAP «C900123456», PLASMAR «B 63222913». */
const PREFIJO_SAP = /^([A-Za-z]{1,2})\s?(?=\d{5,}$)/;

/** Marca de tercero del exterior: SIEVENSOFT «EXT000123», SAP «EIN911144442», RUT, USCC, TIN, VAT. */
const PREFIJO_EXTERIOR = /^(EXT|EIN|RUT|USCC|TIN|VAT)[\s\-:]?(?=\d)/i;

/** LIBRA exporta el retorno de carro de la celda como el literal «_x000D_». */
const limpiarExcel = (v: unknown): unknown => (typeof v === "string" ? v.replace(/_x000D_/gi, " ") : v);

/**
 * Sufijo de sucursal de SIESA. El separador es OPCIONAL: el ERP lo pega al número
 * («900276962S7») tanto como lo separa («900123456-1 S2»). Sin admitir la forma pegada, 24
 * de los 87 clientes de un archivo real quedaban con una clave inventada de 10-11 dígitos
 * que no existe en ningún balance.
 */
const SUFIJO_SUCURSAL = /[\s\-]?S(\d{1,3})$/i;

/**
 * Solo se retira el sufijo si lo que queda es un identificador plausible: 8 a 11 dígitos,
 * admitiendo el dígito de verificación ya separado. Así «S7» no se come el final de un
 * código que legítimamente termine en S seguido de número.
 */
const RESTO_PLAUSIBLE_TRAS_SUCURSAL = /^\d{8,11}(?:[\s-]*\d)?$/;

/** Dígito de verificación pegado al final: «900123456-1», «900123456 - 1». */
const SUFIJO_DV = /[\s]*-[\s]*(\d)$/;

/** Guion final huérfano que World Office deja cuando la cédula no tiene DV («43169753 -»). */
const GUION_COLGANTE = /[\s]*-[\s]*$/;

/** EIN estadounidense: dos dígitos, guion, siete dígitos («99-3929293»). */
const EIN = /^\d{2}-\d{7}$/;

const texto = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/**
 * Normaliza el identificador del tercero de una fila de cartera.
 *
 * Es tolerante por diseño: cualquier fila que no traiga un identificador reconocible sale
 * con `claveCanonica: null` y su texto conservado en `nombre` — el borrador la muestra en
 * el bloque «Sin NIT» para que el auditor decida, en vez de perderla o inventarle una clave.
 */
export function normalizarTerceroCartera(entrada: Entrada): TerceroCartera {
  const observaciones: string[] = [];
  let bruto = texto(limpiarExcel(entrada.nit));
  const nombreColumna = texto(limpiarExcel(entrada.nombre)) || null;
  let sucursal = texto(entrada.sucursal) || null;
  let dv = texto(entrada.dv) || null;
  let origenSugerido: OrigenCartera | null = null;

  // Notación científica: Excel convierte los NIT largos cuando la columna es numérica. Los
  // dígitos que quedan NO son el documento —«9.001e+8» daría la clave «90018»—, así que no
  // se fabrica ninguna: la fila queda sin tercero y el cargue la reporta. Inventar una clave
  // con los dígitos del exponente junta terceros que no tienen nada que ver.
  if (/^\d(?:[.,]\d+)?e[+-]?\d+$/i.test(bruto)) {
    observaciones.push(
      "El identificador llegó en notación científica («" + bruto + "»): el archivo lo guardó como número y perdió dígitos. "
      + "Corrige el formato de esa columna en el archivo y vuelve a cargarlo.",
    );
    return {
      claveCanonica: null, nucleo: null, digitos: null, original: bruto,
      dv, sucursal, nombre: nombreColumna, origenSugerido: null, observaciones,
    };
  }

  if (!bruto) {
    return {
      claveCanonica: null, nucleo: null, digitos: null, original: null,
      dv, sucursal, nombre: nombreColumna, origenSugerido: null, observaciones,
    };
  }
  const original = bruto;

  // EIN antes de limpiar: su guion no es separador de DV y sus 9 dígitos no son un NIT.
  if (EIN.test(bruto)) {
    const digitos = bruto.replace(/\D/g, "");
    return {
      claveCanonica: digitos, nucleo: nucleoNit(digitos), digitos, original,
      dv: null, sucursal, nombre: nombreColumna,
      origenSugerido: "exterior", observaciones,
    };
  }

  if (PREFIJO_EXTERIOR.test(bruto)) {
    origenSugerido = "exterior";
    bruto = bruto.replace(PREFIJO_EXTERIOR, "");
  }
  bruto = bruto.replace(ETIQUETA_DOCUMENTO, "").trim();

  const conSucursal = SUFIJO_SUCURSAL.exec(bruto);
  if (conSucursal) {
    const resto = bruto.replace(SUFIJO_SUCURSAL, "").trim();
    if (RESTO_PLAUSIBLE_TRAS_SUCURSAL.test(resto)) {
      sucursal = sucursal ?? conSucursal[1];
      bruto = resto;
    }
  }

  const conDv = SUFIJO_DV.exec(bruto);
  if (conDv) {
    dv = dv ?? conDv[1];
    bruto = bruto.replace(SUFIJO_DV, "").trim();
  } else {
    bruto = bruto.replace(GUION_COLGANTE, "").trim();
  }

  const conPrefijo = PREFIJO_SAP.exec(bruto);
  if (conPrefijo) bruto = bruto.slice(conPrefijo[0].length);

  // Si hasta aquí no quedaron dígitos, el texto es realmente un nombre (o basura): se
  // delega al normalizador genérico, que sabe separar «NIT nombre» en una sola celda.
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 5) {
    const generico = normalizarTerceroModulo(original);
    return {
      claveCanonica: generico.nitCanonico ? claveTerceroCanonica(generico.nitCanonico) : null,
      nucleo: generico.nitCanonico ? nucleoNit(generico.nitCanonico) : null,
      digitos: generico.nitCanonico ?? null,
      original,
      dv,
      sucursal,
      nombre: nombreColumna ?? generico.nombre,
      origenSugerido,
      observaciones,
    };
  }

  // RUC ecuatoriano y demás identificadores largos: no son NIT colombianos.
  if (digitos.length >= 12 && origenSugerido == null) origenSugerido = "exterior";

  return {
    claveCanonica: claveTerceroCanonica(digitos),
    nucleo: nucleoNit(digitos),
    digitos,
    original,
    dv,
    sucursal,
    nombre: nombreColumna,
    origenSugerido,
    observaciones,
  };
}

/**
 * Clave de agrupación de una fila sin identificador: el NOMBRE normalizado con el prefijo
 * `~`, que nunca choca con una clave de dígitos. Permite conciliar a mano «CONSUMIDOR
 * FINAL» o «Genérico» sin inventarles un NIT.
 */
export function claveSinNit(nombre: string | null | undefined): string | null {
  const limpio = texto(nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return limpio ? `~${limpio}` : null;
}

/** ¿La clave corresponde a un tercero sin identificador numérico? */
export function esClaveSinNit(clave: string): boolean {
  return clave.startsWith("~");
}
