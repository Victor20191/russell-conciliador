import { describe, expect, it } from "vitest";
import { fmtContable } from "@/lib/format";
import { COLUMNA_DIFERENCIA } from "./cartera/columnas-cartera";
import { descriptorModulo } from "./descriptores";
import { motivosNovedadFila, reglasNovedadDe, type ContextoNovedad } from "./motivos-novedad";

const INV = descriptorModulo("INV")!;
const etiquetas = new Map(INV.columnas.map((c) => [c.nombre, c.etiqueta]));
const contexto = (extra: Partial<ContextoNovedad> = {}): ContextoNovedad => ({
  reglas: reglasNovedadDe(INV),
  etiqueta: (rol) => etiquetas.get(rol) ?? rol,
  rolValor: INV.valor,
  totalizadoras: new Map(),
  control: { grupos: [], granTotal: null },
  ...extra,
});
const fila = (datos: Record<string, unknown>, extra: { tipoFila?: string; omitida?: boolean } = {}) => ({ filaNum: 10, tipoFila: "movimiento", ...extra, datos });

describe("por qué una fila del borrador es novedad", () => {
  it("costo cero con existencias señala la cantidad y el importe que está en cero", () => {
    expect(motivosNovedadFila(fila({ cantidad: 46, valorUnitario: 0, valorTotal: 0 }), contexto())).toEqual([
      { texto: "Costo cero con existencias", campos: ["cantidad", "valorUnitario", "valorTotal"] },
    ]);
  });

  it("sin existencias y con costo, costo unitario 1 y negativos, con el campo de cada uno", () => {
    expect(motivosNovedadFila(fila({ cantidad: 0, valorUnitario: 1, valorTotal: -0.02 }), contexto())).toEqual([
      { texto: "Negativo en valor total", campos: ["valorTotal"] },
      { texto: "Sin existencias y con costo", campos: ["cantidad", "valorTotal"] },
      { texto: "Costo unitario 1", campos: ["valorUnitario"] },
    ]);
  });

  it("el valor total que no cuadra dice la diferencia y señala también la columna Diferencia", () => {
    const [motivo] = motivosNovedadFila(fila({ cantidad: 3, valorUnitario: 228899.236666, valorTotal: 757803.72 }), contexto());
    expect(motivo).toEqual({ texto: `Valor total no cuadra con cantidad × valor unitario: diferencia ${fmtContable(71106.01)}`, campos: ["valorTotal", "cantidad", "valorUnitario", COLUMNA_DIFERENCIA] });
  });

  it("una fila omitida o que no es ítem no tiene novedades de sus importes", () => {
    const datos = { cantidad: 46, valorUnitario: 0, valorTotal: -5 };
    expect(motivosNovedadFila(fila(datos, { omitida: true }), contexto())).toEqual([]);
    expect(motivosNovedadFila(fila(datos, { tipoFila: "total" }), contexto())).toEqual([]);
  });

  it("la fila que parece el total y los totales del archivo que no cuadran se señalan en el valor", () => {
    const totalizadora = motivosNovedadFila(fila({ cantidad: 1, valorUnitario: 50, valorTotal: 50 }), contexto({ totalizadoras: new Map([[10, { resto: 50 }]]) }));
    expect(totalizadora).toEqual([{ texto: `Parece el total del archivo: vale lo que suman las demás filas (${fmtContable(50)})`, campos: ["valorTotal"] }]);
    const control = { grupos: [{ clasificador: "MP", filaSubtotal: 10, bloque: { desde: 2, hasta: 9, items: 8 }, sumaMovimientos: 90, subtotalArchivo: 100, diferencia: 10, estado: "descuadre" as const }], granTotal: null };
    expect(motivosNovedadFila(fila({}, { tipoFila: "total" }), contexto({ control }))).toEqual([{ texto: `Subtotal del archivo que no cuadra con su bloque: diferencia ${fmtContable(10)}`, campos: ["valorTotal"] }]);
  });

  it("una fila sin novedad no trae motivos", () => {
    expect(motivosNovedadFila(fila({ cantidad: 3, valorUnitario: 100, valorTotal: 300 }), contexto())).toEqual([]);
  });
});
