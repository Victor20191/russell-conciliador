// Renglones del ARCHIVO que no son ítems, en la tabla del detalle de un módulo — puro.
//
// Los reportes intercalan entre sus ítems renglones que ordenan el papel: la cuenta con el total
// de sus terceros (SIESA), las filas de porcentajes, el pie del ERP, el encabezado de cada
// tercero. El motor ya los deja fuera del total, pero mostrarlos con el aspecto de un ítem hacía
// creer que sumaban. Aquí se decide cuáles se ocultan, cómo se rotulan y qué control aportan.
import { CLAVE_SALDO_DECLARADO } from "./cartera/detalle-cartera";

type FilaRenglon = { tipoFila?: string | null; motivo?: string | null };

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0;

/** ¿Renglón que solo ordena el reporte (cuenta de SIESA, porcentajes, pie)? Se oculta de entrada. */
export function esRenglonEstructura(fila: FilaRenglon): boolean {
  return fila.tipoFila === "agrupadora" && (fila.motivo === "seccion_cuenta" || fila.motivo === "sin_identificador");
}

/** Rótulo, para la columna de acciones, de un renglón que no suma. */
export function etiquetaRenglonNoSuma(motivo: string | null | undefined): string {
  if (motivo === "seccion_cuenta") return "cuenta del archivo · no suma";
  if (motivo?.startsWith("subtotal_tercero")) return "encabezado del tercero · no suma";
  if (motivo === "sin_identificador") return "sin identificación · no suma";
  return `${razonNoSuma(motivo) ?? "agrupadora"} · no suma`;
}

/**
 * Rótulo del grupo cuyas filas NO suman ninguna (`GrupoBorrador.motivoSinItems`): se ve sin abrir
 * el grupo, que era la única forma de enterarse de que estaba tachado por dentro.
 */
export function etiquetaSinItems(motivo: string | null | undefined): string {
  if (motivo === "en_cero") return "todo en cero";
  const razon = motivo === "omitidas" ? "omitido a mano" : razonNoSuma(motivo);
  return `todo en cero · ${razon ?? "no suma"}`;
}

/** La misma razón, explicada para el tooltip del grupo. */
export function explicacionSinItems(motivo: string | null | undefined): string {
  if (motivo === "neto") return "El neto del empleado es devengos − deducciones: sumarlo contaría la plata dos veces.";
  if (motivo === "omitidas") return "Sus filas se omitieron a mano.";
  if (motivo === "en_cero") return "Sus filas vienen en cero.";
  if (motivo === "fuera_de_periodo") return "Sus filas quedaron fuera del rango del cargue.";
  if (motivo === "pie_repetido") return "Son el pie que el ERP repite en cada página.";
  if (motivo === "sin_concepto") return "Sus filas no traen concepto.";
  const razon = razonNoSuma(motivo);
  return razon ? `El motor las leyó como ${razon}.` : "El motor las apartó del total.";
}

/**
 * Por qué una fila quedó fuera del total, en palabras. `null` cuando el motivo no es uno de los
 * conocidos (ahí el rótulo cae en «agrupadora»). Nómina aporta los cuatro primeros: el neto del
 * empleado es el resultado de devengos − deducciones y sumarlo contaría la plata dos veces.
 */
export function razonNoSuma(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  if (motivo === "neto") return "neto del empleado";
  if (motivo === "pie_repetido") return "pie del reporte";
  if (motivo === "sin_concepto") return "fila sin concepto";
  if (motivo === "fuera_de_periodo") return "fuera del período del cargue";
  if (motivo === "seccion_cuenta") return "cuenta del archivo";
  if (motivo === "sin_identificador") return "sin identificación";
  if (motivo.startsWith("subtotal_tercero")) return "encabezado del tercero";
  if (motivo.startsWith("gran_total")) return "total del archivo";
  if (motivo.startsWith("subtotal")) return "subtotal del archivo";
  if (motivo.startsWith("cola_control")) return "cuadro de cierre del archivo";
  return null;
}

/**
 * Total que el archivo imprime en el renglón de cada cuenta. Si la repite (al cambiar de página),
 * vale el primero: sumarlos duplicaría la cifra.
 */
export function totalesDeclaradosPorCuenta(
  filas: readonly (FilaRenglon & { clasificador?: string | null; datos: Record<string, unknown> })[],
  valorRol: string,
): Map<string, number> {
  const salida = new Map<string, number>();
  for (const fila of filas) {
    if (fila.tipoFila !== "agrupadora" || fila.motivo !== "seccion_cuenta") continue;
    const cuenta = fila.clasificador?.trim();
    const bruto = fila.datos[valorRol];
    const valor = typeof bruto === "number" ? bruto : typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : Number.NaN;
    if (!cuenta || !Number.isFinite(valor) || salida.has(cuenta)) continue;
    salida.set(cuenta, valor);
  }
  return salida;
}

export type ControlSeccion = { declarado: number; diferencia: number; cuadra: boolean };

/**
 * Lo que suman los ítems de la cuenta contra lo que el archivo declara, con un peso de tolerancia.
 * Con el signo invertido también cuadra: es la convención de signo del reporte, no un faltante.
 */
export function controlSeccion(declarado: number, subtotal: number, tolerancia = 1): ControlSeccion {
  const diferencia = redondear(subtotal - declarado);
  return { declarado, diferencia, cuadra: Math.abs(diferencia) <= tolerancia || Math.abs(subtotal + declarado) <= tolerancia };
}

/** Encabezado de tercero ya cargado (Cartera, CxP): conserva el saldo que declara y no suma. */
export function esEncabezadoTercero(fila: { valor: number; datos: Record<string, unknown> }): boolean {
  return fila.valor === 0 && fila.datos[CLAVE_SALDO_DECLARADO] != null;
}

/** Posición de la columna del valor entre las visibles (-1 si está oculta o no existe). */
export function indiceColumnaValor<C extends { esValor?: boolean }>(columnas: readonly C[]): number {
  return columnas.findIndex((c) => c.esValor === true);
}
