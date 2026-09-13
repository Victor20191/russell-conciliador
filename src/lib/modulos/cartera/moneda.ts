// MONEDA de los importes de un auxiliar por tercero — puro, sin BD.
//
// La firma concilia en pesos (D3 de Cartera): la cartera y las cuentas por pagar del exterior se
// facturan en divisa y se convierten con UNA TRM de cierre que digita quien carga (se le sugiere
// la oficial). En los archivos reales la divisa llega de dos formas:
//  - una hoja entera en dólares, sin columna de moneda (hoja «USD» de Plasmar);
//  - un importe suelto con el código escrito en la celda, dentro de un archivo en pesos
//    («USD (54,323.40)» de SAP en Redplas).

export const MONEDA_LOCAL = "COP";

const ALIAS: Record<string, string> = {
  COP: "COP", PESO: "COP", PESOS: "COP", COL: "COP", "$": "COP",
  USD: "USD", "US$": "USD", "U$S": "USD", DOLAR: "USD", DOLARES: "USD",
  EUR: "EUR", EURO: "EUR", EUROS: "EUR", "€": "EUR",
};

/** Código ISO de la moneda escrita en una celda o un nombre de hoja; `null` si no se reconoce. */
export function normalizarMoneda(valor: unknown): string | null {
  const texto = String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return null;
  if (ALIAS[texto]) return ALIAS[texto];
  return /^[A-Z]{3}$/.test(texto) ? texto : null;
}

export function esMonedaExtranjera(moneda: string | null | undefined): boolean {
  return moneda != null && moneda !== "" && moneda !== MONEDA_LOCAL;
}

/** Moneda que declara el nombre de una hoja para todo su contenido («USD», «Dólares», «EUR»). */
export function monedaPorNombreHoja(nombre: string): string | null {
  const moneda = normalizarMoneda(nombre);
  return moneda === "USD" || moneda === "EUR" ? moneda : null;
}

const MONTO_CON_CODIGO = /^([A-Z]{3})\s*(\()?\s*(-)?\s*([\d.,]+)\s*(\))?$/;

/** «54,323.40» y «1.200,00»: el último separador seguido de uno o dos dígitos es el decimal. */
function numeroConSeparadores(texto: string): number | null {
  const posicion = Math.max(texto.lastIndexOf("."), texto.lastIndexOf(","));
  const cola = posicion >= 0 ? texto.length - posicion - 1 : 0;
  const entero = cola >= 1 && cola <= 2 ? texto.slice(0, posicion) : texto;
  const decimales = cola >= 1 && cola <= 2 ? texto.slice(posicion + 1) : "";
  const digitos = entero.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digitos) || (decimales && !/^\d+$/.test(decimales))) return null;
  return Number(`${digitos}.${decimales || "0"}`);
}

/** Importe escrito con su código de divisa: «USD (54,323.40)» → `{ moneda: "USD", valor: -54323.4 }`. */
export function montoConDivisa(valor: unknown): { moneda: string; valor: number } | null {
  if (typeof valor !== "string") return null;
  const m = MONTO_CON_CODIGO.exec(valor.trim().toUpperCase());
  if (!m) return null;
  const numero = numeroConSeparadores(m[4]);
  if (numero == null) return null;
  const negativo = (m[2] === "(" && m[5] === ")") || m[3] === "-";
  return { moneda: m[1], valor: negativo ? -numero : numero };
}

/** Convierte un importe en divisa a pesos con la TRM de cierre, al centavo. */
export function aPesos(valor: number, trm: number): number {
  return Math.round(valor * trm * 100) / 100 + 0 || 0;
}

/** TRM de cierre utilizable: pesos por unidad de divisa, positiva y plausible. */
export function validarTrm(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 10_000) / 10_000 : null;
}
