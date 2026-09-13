// VALOR e IDENTIDAD de una fila de NÓMINA — puro, sin BD.
//
// Un reporte de nómina no trae «el valor» en una sola columna. Novasoft y SIESA separan
// DEVENGOS y DEDUCCIONES; Ofimática las trae en «Percepcion»/«Deduccion» con la deducción
// en negativo; Buk y Pure Nature traen un solo «Valor» sin signo y una columna de TIPO
// («Ganancias/Provisiones/Aportes/Deducciones», «Ingreso/Deducción»); SIIGO y LIBRA traen un
// solo valor ya firmado; las interfaces contables (SIEVENSOFT, los asientos de SAP) traen
// débito y crédito. Aquí se convierte cada forma a UNA convención: devengo positivo,
// deducción negativa, y se anota la naturaleza para que el cruce sepa qué es cada cosa.
//
// Qué imputa al gasto lo decide después la CUENTA destino (F3/F4): una deducción que va a
// una cuenta de gasto (Kakaraka 207 «mayor valor pagado salario» → xx0506) resta del
// gasto, como lo hizo el auditor; la que va a pasivo (salud, pensión, libranzas) se
// controla aparte. Por eso las deducciones entran al detalle como movimiento con signo y
// no se descartan al leer.
//
// Lo que NUNCA imputa: las filas de «Neto a pagar» (Novasoft 9999xx: es la resta de las dos
// columnas, no un concepto), los pies repetidos del ERP («Procesado en: …» en todas las
// columnas) y las filas sin concepto.

export type NaturalezaNomina = "devengo" | "deduccion" | "neto";

/** Motivo por el que una fila de nómina no imputa (se guarda como agrupadora, visible). */
export type ExclusionNomina = "neto" | "pie_repetido" | "sin_concepto";

export type EvaluacionFilaNomina = {
  /** Devengo positivo, deducción negativa. */
  valor: number;
  naturaleza: NaturalezaNomina | null;
  excluir: ExclusionNomina | null;
};

/** Roles del descriptor NOM que participan aquí (los demás se ignoran). */
export type DatosNomina = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;
const normalizar = (v: unknown): string =>
  texto(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ¿El TIPO de la fila la marca como deducción? Cubre «Deducción», «Deducciones», «DEDUCION»
 * (así lo escribe SIIGO), «Descuento», «Retención», «Egreso». Todo lo demás (Ingreso,
 * Ganancias, Provisiones, Aportes, Devengo…) es devengo.
 */
export function esTipoDeduccion(tipo: unknown): boolean {
  return /deduc|descuent|retenci|egreso/.test(normalizar(tipo));
}

/** ¿El concepto es el «neto a pagar» de Novasoft (código 9999xx o nombre «Neto…»)? */
export function esConceptoNeto(codigo: unknown, concepto: unknown): boolean {
  const cod = texto(codigo);
  if (/^9999\d*$/.test(cod)) return true;
  return /^neto\b/.test(normalizar(concepto));
}

/**
 * Valor y naturaleza de la fila según las columnas que el archivo trae (las mapeadas en el
 * spec). Orden: devengo/deducción en columnas aparte → débito/crédito → valor con columna de
 * tipo → valor firmado tal cual.
 */
export function valorFilaNomina(datos: DatosNomina, mapeados: ReadonlySet<string>): { valor: number; naturaleza: NaturalezaNomina | null } {
  const tiene = (rol: string) => mapeados.has(rol);
  if (tiene("devengo") || tiene("deduccion")) {
    const devengo = num(datos.devengo) ?? 0;
    // Ofimática imprime la deducción en negativo; Novasoft y SIESA en positivo. Es la misma
    // deducción: se toma su magnitud.
    const deduccion = Math.abs(num(datos.deduccion) ?? 0);
    if (devengo !== 0 && deduccion !== 0) return { valor: redondear(devengo - deduccion), naturaleza: "devengo" };
    if (devengo !== 0) return { valor: redondear(devengo), naturaleza: "devengo" };
    if (deduccion !== 0) return { valor: redondear(-deduccion), naturaleza: "deduccion" };
    const neto = tiene("neto") ? num(datos.neto) ?? 0 : 0;
    return { valor: 0, naturaleza: neto !== 0 ? "neto" : null };
  }
  if (tiene("debito") || tiene("credito")) {
    const valor = redondear((num(datos.debito) ?? 0) - (num(datos.credito) ?? 0));
    return { valor, naturaleza: valor === 0 ? null : valor > 0 ? "devengo" : "deduccion" };
  }
  const valor = num(datos.valor) ?? 0;
  if (tiene("tipo") && texto(datos.tipo) !== "") {
    const deduccion = esTipoDeduccion(datos.tipo);
    return { valor: redondear(deduccion ? -Math.abs(valor) : valor), naturaleza: deduccion ? "deduccion" : "devengo" };
  }
  if (valor === 0) return { valor: 0, naturaleza: null };
  return { valor: redondear(valor), naturaleza: valor < 0 ? "deduccion" : "devengo" };
}

/**
 * Pie de página repetido: el ERP imprime el mismo texto en TODAS las columnas («Procesado
 * en: 2026/01/19 08:31:56» en SIIGO). Tres o más roles de texto mapeados con el mismo valor
 * no son un dato.
 */
export function esPieRepetido(datos: DatosNomina, rolesTexto: readonly string[]): boolean {
  const valores = rolesTexto.map((rol) => texto(datos[rol])).filter((v) => v !== "");
  if (valores.length < 3) return false;
  return new Set(valores).size === 1;
}

/** Evaluación completa de la fila: valor con signo, naturaleza y si se excluye. */
export function evaluarFilaNomina(datos: DatosNomina, mapeados: ReadonlySet<string>, rolesTexto: readonly string[]): EvaluacionFilaNomina {
  if (esPieRepetido(datos, rolesTexto)) return { valor: 0, naturaleza: null, excluir: "pie_repetido" };
  const { valor, naturaleza } = valorFilaNomina(datos, mapeados);
  const concepto = texto(datos.concepto) || texto(datos.codigo);
  if (esConceptoNeto(datos.codigo, datos.concepto)) return { valor: 0, naturaleza: "neto", excluir: "neto" };
  if (naturaleza === "neto") return { valor: 0, naturaleza: "neto", excluir: "neto" };
  if (concepto === "" && valor !== 0) return { valor, naturaleza, excluir: "sin_concepto" };
  return { valor, naturaleza, excluir: null };
}

// ===== Cédula del empleado =====

/**
 * Cédula normalizada: solo dígitos, sin puntos (Buk «1.000.396.862»), sin el sufijo de
 * recontratación («1037621378-1» de Ofimática, «4938867-1» de Pure Nature) y, si viene
 * dentro del nombre («ANA MARIA BETANCOURT O - CC 43590224», Santiago Corazón), la extrae de
 * ahí. `null` cuando no hay al menos 4 dígitos.
 */
export function normalizarCedula(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const enNombre = /\b(?:CC|C\.C\.?|NIT|TI|CE|PPT|PEP)\s*[:.]?\s*([\d.]{4,})/i.exec(s);
  const base = enNombre ? enNombre[1] : s;
  // «3348656 URIBE ALVAREZ» (SIIGO «EMPLEADO»): la cédula es el primer bloque de dígitos.
  const bloque = /^\s*([\d.]{4,})(?:-\d{1,2})?(?:\s|$)/.exec(base)?.[1] ?? base.replace(/-\d{1,2}$/, "");
  const digitos = bloque.replace(/\D/g, "");
  return digitos.length >= 4 ? digitos : null;
}

/** Nombre limpio cuando la cédula viene dentro («NOMBRE - CC 123» → «NOMBRE»). */
export function nombreSinCedula(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const limpio = s.replace(/\s*[-–]?\s*\b(?:CC|C\.C\.?|NIT|TI|CE|PPT|PEP)\s*[:.]?\s*[\d.]{4,}\s*$/i, "").trim();
  return limpio || null;
}
