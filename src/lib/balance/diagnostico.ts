// Diagnóstico DETERMINISTA del descuadre de un borrador — sin IA, reproducible y
// auditable. Correlaciona los residuales ya calculados (partida doble, ecuación,
// clases vs archivo) con los nodos del árbol que no cuadran, y busca la cuenta que
// probablemente explica cada hueco (misma magnitud en otra rama = "la plata está
// pero mal ubicada"). Es la base del "diagnóstico asistido" con IA: el modelo
// recibe ESTOS hallazgos ya aterrizados, no el archivo crudo.
import { fmt } from "@/lib/format";
import type { ValidacionContable } from "./calcular";
import type { NodoBorrador } from "./borrador";
import { esDescuadreAccionable, UMBRALES_ALERTAS_DEFECTO, type UmbralesAlertas } from "./umbrales-alertas";

const TOL_CANDIDATO = 1000; // cercanía para sugerir una cuenta ubicada en otra rama
const MAX_CUENTAS_AFECTADAS = 20; // tope de cuentas hoja que se listan por hallazgo "nodo"

export type CuentaRef = {
  codigo: string;
  nombre: string;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};
export type Hallazgo = {
  tipo: "partida_doble" | "ecuacion" | "clase" | "nodo";
  severidad: "alta" | "media";
  titulo: string;
  detalle: string;
  monto: number; // el descuadre (firmado)
  clase?: string; // para tipo "clase"
  nodo?: CuentaRef; // para tipo "nodo"
  candidato?: CuentaRef | null; // cuenta que podría explicar el hueco (otra rama)
  // Cuentas HOJA (el nivel más desagregado disponible, típicamente Auxiliar/8 dígitos)
  // que cuelgan del nodo con descuadre — se listan para que el revisor vea el detalle
  // completo (saldo inicial/débitos/créditos/saldo final) sin ir a buscarlas en el
  // listado principal. Puede venir truncada; `cuentasTotal` da el conteo real.
  cuentas?: CuentaRef[];
  cuentasTotal?: number;
};

export type PartidaDobleInfo = { debitos: number; creditos: number; diff: number; cuadra: boolean };

function aplanar(nodos: NodoBorrador[]): NodoBorrador[] {
  const out: NodoBorrador[] = [];
  const rec = (n: NodoBorrador) => { out.push(n); n.hijos.forEach(rec); };
  nodos.forEach(rec);
  return out;
}
const esDescendiente = (posible: NodoBorrador, ancestro: NodoBorrador): boolean =>
  ancestro.hijos.some((h) => h === posible || esDescendiente(posible, h));

/**
 * Produce una lista de hallazgos ordenada por severidad/monto. Pura y testeable.
 * NO decide el veredicto del cargue (eso lo hacen los gates); solo localiza y
 * explica el descuadre para el revisor.
 *
 * `umbrales` es la parametrización vigente (/config/parametros). El default de
 * fábrica está para las pruebas y para quien no necesite la configuración: en
 * runtime SIEMPRE debe llegar el valor resuelto con `getUmbralesAlertas()`.
 */
export function diagnosticarBorrador(
  v: ValidacionContable,
  arbol: NodoBorrador[],
  pd: PartidaDobleInfo,
  umbrales: UmbralesAlertas = UMBRALES_ALERTAS_DEFECTO,
): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const todos = aplanar(arbol);
  const hojas = todos.filter((n) => n.tipoFila === "movimiento");
  const ref = (n: NodoBorrador): CuentaRef => ({
    codigo: n.codigo,
    nombre: n.nombre,
    saldoInicial: n.saldoInicial,
    debitos: n.debitos,
    creditos: n.creditos,
    saldoFinal: n.saldoFinal,
  });

  // 1. Partida doble (débitos = créditos): el invariante más fuerte del balance.
  if (!pd.cuadra && esDescuadreAccionable(pd.diff, umbrales)) {
    hallazgos.push({
      tipo: "partida_doble",
      severidad: "alta",
      titulo: "Partida doble descuadrada",
      detalle: `Débitos ${fmt(pd.debitos)} vs créditos ${fmt(pd.creditos)} — deben ser iguales. Diferencia ${fmt(pd.diff)}. Suele venir del archivo origen (un movimiento cargado de un solo lado o con signo invertido).`,
      monto: pd.diff,
    });
  }

  // 2. Ecuación contable A = P + Patrimonio + Resultado.
  if (!v.ecuacionCuadra && esDescuadreAccionable(v.ecuacionDiff, umbrales)) {
    hallazgos.push({
      tipo: "ecuacion",
      severidad: "alta",
      titulo: "Ecuación contable no cuadra",
      detalle: `Activo = Pasivo + Patrimonio + Resultado difiere en ${fmt(v.ecuacionDiff)}. Equivale a la partida doble sobre saldos; revisa las clases marcadas abajo.`,
      monto: v.ecuacionDiff,
    });
  }

  // 3. Clases vs archivo (Activo/Pasivo/Patrimonio + P&L). El Resultado se omite:
  //    es derivado (ingresos − gastos − costos), así que su hueco lo explican esas
  //    tres clases, no una cuenta propia.
  const clases: { clase: string; diff: number | null; cuadra: boolean | null }[] = [
    { clase: "Activo", diff: v.activoDiff, cuadra: v.activoCuadra },
    { clase: "Pasivo", diff: v.pasivoDiff, cuadra: v.pasivoCuadra },
    { clase: "Patrimonio", diff: v.patrimonioDiff, cuadra: v.patrimonioCuadra },
    { clase: "Ingresos", diff: v.ingresosDiff, cuadra: v.ingresosCuadra },
    { clase: "Gastos", diff: v.gastosDiff, cuadra: v.gastosCuadra },
    { clase: "Costos", diff: v.costosDiff, cuadra: v.costosCuadra },
  ];
  for (const c of clases) {
    if (c.cuadra === false && c.diff != null && esDescuadreAccionable(c.diff, umbrales)) {
      hallazgos.push({
        tipo: "clase",
        severidad: "media",
        clase: c.clase,
        titulo: `${c.clase}: el total del archivo ≠ el detalle`,
        detalle: `El total de ${c.clase} en el archivo difiere de la suma del detalle en ${fmt(c.diff)}. Probablemente hay una cuenta de esta clase mal clasificada, faltante o con signo invertido.`,
        monto: c.diff,
      });
    }
  }

  // 4. Nodos con descuadre real (total ≠ suma de hijos). Para cada uno, busca una
  //    HOJA en otra rama cuyo saldo ≈ el hueco: indicio de "la plata está pero en
  //    otra rama" (detalle mal numerado por el ERP).
  const nodosDesc = todos
    .filter((n) => esDescuadreAccionable(n.descuadre, umbrales))
    .sort((a, b) => Math.abs(b.descuadre!) - Math.abs(a.descuadre!))
    .slice(0, 6);
  for (const n of nodosDesc) {
    const d = n.descuadre!;
    const candidato = hojas.find((h) => h !== n && Math.abs(h.saldoFinal - d) <= TOL_CANDIDATO && !esDescendiente(h, n)) ?? null;
    // Cuentas hoja que cuelgan de este nodo (su desglose real): se listan ordenadas por
    // magnitud para que el revisor identifique la cuenta problemática sin buscarla en el
    // listado principal. Se trunca a MAX_CUENTAS_AFECTADAS; `cuentasTotal` da el conteo real.
    const cuentasAfectadas = hojas
      .filter((h) => esDescendiente(h, n))
      .sort((a, b) => Math.abs(b.saldoFinal) - Math.abs(a.saldoFinal));
    hallazgos.push({
      tipo: "nodo",
      severidad: "media",
      nodo: ref(n),
      candidato: candidato ? ref(candidato) : null,
      cuentas: cuentasAfectadas.slice(0, MAX_CUENTAS_AFECTADAS).map(ref),
      cuentasTotal: cuentasAfectadas.length,
      titulo: `${n.codigo} «${n.nombre}» no cuadra con su desglose`,
      detalle: candidato
        ? `Su total (${fmt(n.saldoFinal)}) menos la suma de sus cuentas deja ${fmt(d)}, que coincide con ${candidato.codigo} «${candidato.nombre}» (${fmt(candidato.saldoFinal)}): el detalle podría estar ubicado en otra rama.`
        : `Su total menos la suma de sus cuentas deja ${fmt(d)} — puede ser una cuenta faltante o mal numerada que no anida por prefijo.`,
      monto: d,
    });
  }

  return hallazgos;
}
