// Diagnóstico DETERMINISTA del descuadre de un borrador — sin IA, reproducible y
// auditable. Correlaciona los residuales ya calculados (partida doble, ecuación,
// clases vs archivo) con los nodos del árbol que no cuadran, y busca la cuenta que
// probablemente explica cada hueco (misma magnitud en otra rama = "la plata está
// pero mal ubicada"). Es la base del "diagnóstico asistido" con IA: el modelo
// recibe ESTOS hallazgos ya aterrizados, no el archivo crudo.
import { fmt } from "@/lib/format";
import type { ValidacionContable } from "./calcular";
import type { NodoBorrador } from "./borrador";
import { esDescuadreAccionable } from "./umbrales-alertas";

const TOL_CANDIDATO = 1000; // cercanía para sugerir una cuenta ubicada en otra rama

export type CuentaRef = { codigo: string; nombre: string; saldoFinal: number };
export type Hallazgo = {
  tipo: "partida_doble" | "ecuacion" | "clase" | "nodo" | "lados_invertidos";
  severidad: "alta" | "media";
  titulo: string;
  detalle: string;
  monto: number; // el descuadre (firmado)
  clase?: string; // para tipo "clase"
  nodo?: CuentaRef; // para tipo "nodo"
  candidato?: CuentaRef | null; // cuenta que podría explicar el hueco (otra rama)
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
 */
export function diagnosticarBorrador(v: ValidacionContable, arbol: NodoBorrador[], pd: PartidaDobleInfo): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const todos = aplanar(arbol);
  const hojas = todos.filter((n) => n.tipoFila === "movimiento");
  const ref = (n: NodoBorrador): CuentaRef => ({ codigo: n.codigo, nombre: n.nombre, saldoFinal: n.saldoFinal });
  // El control por cuenta (si + déb − créd = saldo) es una identidad EXACTA:
  // tolerancia de $1 (redondeo), no el margen de cuadre global.
  const controlOk = (si: number, db: number, cr: number, saldo: number) => Math.abs(si + db - cr - saldo) <= 1;

  // 0. LADOS INVERTIDOS (débito↔crédito): movimiento cuyo control NO cuadra con el
  //    saldo pero SÍ al intercambiar débito y crédito. Es la causa exacta —y
  //    fácilmente corregible— de muchos descuadres de partida doble; se reporta
  //    primero. Cada uno desbalancea la partida doble en 2×(créd − déb).
  const invertidos = hojas.filter(
    (n) => !controlOk(n.saldoInicial, n.debitos, n.creditos, n.saldoFinal) && controlOk(n.saldoInicial, n.creditos, n.debitos, n.saldoFinal),
  );
  for (const n of invertidos.slice(0, 12)) {
    const monto = 2 * (n.creditos - n.debitos);
    if (!esDescuadreAccionable(monto)) continue;
    hallazgos.push({
      tipo: "lados_invertidos",
      severidad: "alta",
      nodo: ref(n),
      monto,
      titulo: `${n.codigo} «${n.nombre}»: débito y crédito invertidos`,
      detalle: `El movimiento no cuadra con su saldo (${fmt(n.saldoFinal)}) pero SÍ al intercambiar débito ↔ crédito (déb ${fmt(n.debitos)} / créd ${fmt(n.creditos)}). Corrige el lado: hoy descuadra la partida doble en ${fmt(monto)}.`,
    });
  }

  // 1. Partida doble (débitos = créditos): el invariante más fuerte del balance.
  if (!pd.cuadra && esDescuadreAccionable(pd.diff)) {
    hallazgos.push({
      tipo: "partida_doble",
      severidad: "alta",
      titulo: "Partida doble descuadrada",
      detalle: `Débitos ${fmt(pd.debitos)} vs créditos ${fmt(pd.creditos)} — deben ser iguales. Diferencia ${fmt(pd.diff)}. Suele venir del archivo origen (un movimiento cargado de un solo lado o con signo invertido).`,
      monto: pd.diff,
    });
  }

  // 2. Ecuación contable A = P + Patrimonio + Resultado.
  if (!v.ecuacionCuadra && esDescuadreAccionable(v.ecuacionDiff)) {
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
    if (c.cuadra === false && c.diff != null && esDescuadreAccionable(c.diff)) {
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
    .filter((n) => esDescuadreAccionable(n.descuadre))
    .sort((a, b) => Math.abs(b.descuadre!) - Math.abs(a.descuadre!))
    .slice(0, 6);
  for (const n of nodosDesc) {
    const d = n.descuadre!;
    const candidato = hojas.find((h) => h !== n && Math.abs(h.saldoFinal - d) <= TOL_CANDIDATO && !esDescendiente(h, n)) ?? null;
    hallazgos.push({
      tipo: "nodo",
      severidad: "media",
      nodo: ref(n),
      candidato: candidato ? ref(candidato) : null,
      titulo: `${n.codigo} «${n.nombre}» no cuadra con su desglose`,
      detalle: candidato
        ? `Su total (${fmt(n.saldoFinal)}) menos la suma de sus cuentas deja ${fmt(d)}, que coincide con ${candidato.codigo} «${candidato.nombre}» (${fmt(candidato.saldoFinal)}): el detalle podría estar ubicado en otra rama.`
        : `Su total menos la suma de sus cuentas deja ${fmt(d)} — puede ser una cuenta faltante o mal numerada que no anida por prefijo.`,
      monto: d,
    });
  }

  return hallazgos;
}
