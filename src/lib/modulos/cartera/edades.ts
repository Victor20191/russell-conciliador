// Rótulos de RANGO DE VENCIMIENTO («edades») de un reporte de cartera — puro, sin BD.
//
// Cada ERP rotula sus baldes de antigüedad a su manera y con distinta cantidad: de 4
// («0-30 / 31-60 / 61-90 / Más de 90») a 9 («1 - 30 DIAS … 211 - 240 DIAS / POR VENCER»),
// y ninguno de los catorce archivos reales analizados coincide con otro. Por eso las
// edades NO son columnas fijas del descriptor: son una FAMILIA dinámica que se descubre
// del encabezado, y este módulo es el que las reconoce.
//
// La CLASE de cada balde importa para el total: lo corriente y lo vencido suman cartera,
// el saldo a favor también (es el neto del tercero), pero una columna de «Deuda dudosa»
// —que SAP imprime al lado y ya está contada dentro de los otros baldes— duplicaría el
// saldo, así que se excluye por defecto y el usuario puede cambiarlo en el wizard.

/** Qué representa un balde de edad dentro del saldo del tercero. */
export type ClaseEdad = "corriente" | "vencido" | "saldo_favor" | "excluir";

export type RotuloEdad = {
  clase: ClaseEdad;
  /** Límite inferior del rango en días, cuando el rótulo lo declara. */
  desde?: number;
  /** Límite superior del rango en días; ausente en los baldes abiertos («181+»). */
  hasta?: number;
};

/** Texto comparable: minúsculas, sin tildes, espacios colapsados. Conserva los símbolos. */
function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefijo redundante que algunos ERP anteponen a cada balde («Vencido 1 a 30» de SIIGO
 * Nube, «Saldo vencido»). Se retira antes de medir el rango para que el patrón numérico
 * no tenga que anclarse al primer carácter.
 */
const PREFIJO_REDUNDANTE = /^(?:saldo\s+)?(?:vencid[oa]s?|vcto\.?|vence)\s+/;

/** Un rango cerrado: «1 - 30 DIAS», «De 1 a 90», «0-20», «30 A 60 DIAS», «121 - 150». */
const RANGO_CERRADO = /^(?:de\s+)?(\d{1,4})\s*(?:-|a|al|hasta)\s*(\d{1,4})(?:\s*d[ií]as?)?$/;

/** Un rango abierto por arriba: «Más de 90», «181+», «De 361 o mas», «mayor a 360». */
const RANGO_ABIERTO = [
  /^(?:m[aá]s\s+de|mayor(?:\s+a)?|superior\s+a|desde)\s*(\d{1,4})(?:\s*d[ií]as?)?$/,
  // El «días» va en medio en esta forma («241 DIAS O MAS»), no al final: sin admitirlo, el
  // balde no se reconoce, su importe sale del saldo y además la columna queda libre para
  // que otro rol se la lleve.
  /^(?:de\s+)?(\d{1,4})\s*(?:d[ií]as?\s*)?(?:\+|o\s+m[aá]s|y\s+m[aá]s|en\s+adelante)$/,
];

/** Lo NO vencido: «POR VENCER», «Sin vencer», «Corriente», «Abono futuro», «Vigente». */
const CORRIENTE = /^(?:por\s+vencer|sin\s+vencer|no\s+vencid[oa]s?|corriente|vigente|al\s+d[ií]a|abono\s+futuro|saldo\s+por\s+vencer|cartera\s+corriente)$/;

/** Saldo a favor del cliente presentado como columna aparte (SIIGO Nube). */
const SALDO_FAVOR = /saldo\s+a\s+favor|anticip/;

/**
 * Columnas que el reporte imprime al lado de los baldes pero que YA están contadas en
 * ellos (o que no son cartera): sumarlas duplicaría el saldo. Se proponen excluidas.
 */
const EXCLUIBLE = /dudos|castig|provisi|deterior|posfechad|cupo|reserva/;

/**
 * Rótulos de SIIGO Escritorio, que numera los días en negativo respecto del vencimiento:
 * «<== 90-» (más de 90 días vencidos), «DE 89- A 60-», «DE 29- A 1-» y «0 ==>» (por
 * vencer). El guion va pegado al número como signo, no como separador de rango.
 */
const SIIGO_ABIERTO_VENCIDO = /^<\s*=+\s*(\d{1,4})\s*-$/;
const SIIGO_RANGO = /^de\s+(\d{1,4})\s*-\s+a\s+(\d{1,4})\s*-$/;
const SIIGO_CORRIENTE = /^0\s*=+\s*>$/;

/**
 * ¿El encabezado de esta columna es un rango de vencimiento? Devuelve su clase y, cuando
 * el rótulo lo declara, los límites en días; `null` si no es un balde de edad.
 *
 * Es deliberadamente conservador: reconocer de más metería una columna de importe normal
 * («Saldo», «Deuda») dentro de la familia y el total del tercero se contaría dos veces.
 */
export function esRotuloEdad(encabezado: unknown): RotuloEdad | null {
  const texto = normalizar(encabezado);
  if (!texto) return null;

  // SIIGO Escritorio antes que nada: sus rótulos llevan símbolos que los demás patrones
  // no contemplan y su guion final se confundiría con un separador de rango.
  if (SIIGO_CORRIENTE.test(texto)) return { clase: "corriente", desde: 0 };
  const siigoAbierto = SIIGO_ABIERTO_VENCIDO.exec(texto);
  if (siigoAbierto) return { clase: "vencido", desde: Number(siigoAbierto[1]) };
  const siigoRango = SIIGO_RANGO.exec(texto);
  if (siigoRango) {
    const a = Number(siigoRango[1]);
    const b = Number(siigoRango[2]);
    return { clase: "vencido", desde: Math.min(a, b), hasta: Math.max(a, b) };
  }

  if (SALDO_FAVOR.test(texto)) return { clase: "saldo_favor" };
  if (EXCLUIBLE.test(texto)) return { clase: "excluir" };
  if (CORRIENTE.test(texto)) return { clase: "corriente", desde: 0 };

  const sinPrefijo = texto.replace(PREFIJO_REDUNDANTE, "").trim();
  if (!sinPrefijo) return null;
  // «Vencido» a secas (supra-encabezado de SIESA) no es un balde: no trae rango.
  if (sinPrefijo === texto && PREFIJO_REDUNDANTE.test(`${texto} `)) return null;

  const cerrado = RANGO_CERRADO.exec(sinPrefijo);
  if (cerrado) {
    const desde = Number(cerrado[1]);
    const hasta = Number(cerrado[2]);
    if (hasta < desde) return null; // «2025 - 12» y otros restos no son un rango de días
    return { clase: desde === 0 && hasta === 0 ? "corriente" : "vencido", desde, hasta };
  }
  for (const patron of RANGO_ABIERTO) {
    const abierto = patron.exec(sinPrefijo);
    if (abierto) return { clase: "vencido", desde: Number(abierto[1]) };
  }
  return null;
}

/** Orden natural de los baldes: primero lo corriente, luego por antigüedad creciente. */
export function ordenarRotulos<T extends { rotulo: RotuloEdad }>(items: readonly T[]): T[] {
  const peso = (r: RotuloEdad): number => {
    if (r.clase === "corriente") return -2;
    if (r.clase === "saldo_favor") return -1;
    if (r.clase === "excluir") return Number.MAX_SAFE_INTEGER;
    return r.desde ?? 0;
  };
  return [...items].sort((a, b) => peso(a.rotulo) - peso(b.rotulo));
}

/** ¿La clase del balde suma al saldo del tercero? (todo salvo lo marcado «excluir»). */
export function claseSuma(clase: ClaseEdad): boolean {
  return clase !== "excluir";
}
