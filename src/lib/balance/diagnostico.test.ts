import { describe, it, expect } from "vitest";
import { diagnosticarBorrador, type PartidaDobleInfo } from "./diagnostico";
import type { ValidacionContable } from "./calcular";
import type { NodoBorrador } from "./borrador";

function vc(over: Partial<ValidacionContable> = {}): ValidacionContable {
  return {
    activo: 0, pasivo: 0, patrimonio: 0, ingresos: 0, gastos: 0, costos: 0, resultado: 0,
    activoArchivo: null, pasivoArchivo: null, patrimonioArchivo: null,
    ingresosArchivo: null, gastosArchivo: null, costosArchivo: null, resultadoArchivo: null,
    ecuacionDiff: 0, ecuacionCuadra: true,
    activoDiff: null, activoCuadra: null, pasivoDiff: null, pasivoCuadra: null,
    patrimonioDiff: null, patrimonioCuadra: null,
    ingresosDiff: null, ingresosCuadra: null, gastosDiff: null, gastosCuadra: null,
    costosDiff: null, costosCuadra: null, resultadoDiff: null, resultadoCuadra: null,
    ...over,
  };
}
function nodo(codigo: string, nombre: string, saldoFinal: number, over: Partial<NodoBorrador> = {}): NodoBorrador {
  return { filaNum: 0, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length, tipoFila: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, descuadre: null, subtotalDuplicado: false, hijos: [], ...over };
}
const PD_OK: PartidaDobleInfo = { debitos: 100, creditos: 100, diff: 0, cuadra: true };

describe("diagnosticarBorrador", () => {
  it("reporta partida doble y ecuación descuadradas", () => {
    const h = diagnosticarBorrador(vc({ ecuacionCuadra: false, ecuacionDiff: -352 }), [], { debitos: 100, creditos: 117, diff: -17, cuadra: false });
    expect(h.map((x) => x.tipo)).toEqual(expect.arrayContaining(["partida_doble", "ecuacion"]));
  });

  it("reporta la clase cuyo total del archivo difiere del detalle (Gastos)", () => {
    const h = diagnosticarBorrador(vc({ gastosCuadra: false, gastosDiff: 11159637 }), [], PD_OK);
    expect(h.find((x) => x.tipo === "clase" && x.clase === "Gastos")?.monto).toBe(11159637);
  });

  it("no reporta clases dentro de la tolerancia ±$1000", () => {
    const h = diagnosticarBorrador(vc({ gastosCuadra: false, gastosDiff: 500 }), [], PD_OK);
    expect(h.some((x) => x.tipo === "clase")).toBe(false);
  });

  it("nodo con descuadre + candidato del mismo monto en otra rama (misfiled)", () => {
    const desacoplada = nodo("139005", "DEUDAS DIFICIL COBRO", 133, { tipoFila: "movimiento" });
    const clientes = nodo("1305", "CLIENTES", 233, { descuadre: 133, hijos: [nodo("130505", "NAL", 100, { tipoFila: "movimiento" })] });
    const raiz = nodo("13", "CXC", 0, { hijos: [clientes, desacoplada] });
    const h = diagnosticarBorrador(vc(), [raiz], PD_OK);
    const n = h.find((x) => x.tipo === "nodo");
    expect(n?.nodo?.codigo).toBe("1305");
    expect(n?.candidato?.codigo).toBe("139005"); // misma magnitud, otra rama
  });

  it("detecta lados invertidos: el control falla pero cuadra al intercambiar débito↔crédito", () => {
    // si 100 + déb 0 − créd 30 = 70 ≠ 130; al intercambiar: 100 + 30 − 0 = 130 ✓
    const h = diagnosticarBorrador(vc(), [nodo("120505", "DIF CAMBIO", 130, { tipoFila: "movimiento", saldoInicial: 100, creditos: 30 })], PD_OK);
    const li = h.find((x) => x.tipo === "lados_invertidos");
    expect(li?.nodo?.codigo).toBe("120505");
    expect(li?.monto).toBe(60); // 2 × (créd 30 − déb 0)
  });

  it("no marca lados invertidos cuando el control ya cuadra", () => {
    const h = diagnosticarBorrador(vc(), [nodo("110505", "CAJA", 130, { tipoFila: "movimiento", saldoInicial: 100, debitos: 30 })], PD_OK);
    expect(h.some((x) => x.tipo === "lados_invertidos")).toBe(false);
  });

  it("balance limpio → sin hallazgos", () => {
    expect(diagnosticarBorrador(vc(), [nodo("1", "ACTIVO", 100, { descuadre: 0 })], PD_OK)).toEqual([]);
  });
});
