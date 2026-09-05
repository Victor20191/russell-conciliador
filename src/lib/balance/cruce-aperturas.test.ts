import { describe, expect, it } from "vitest";
import { construirCruceAperturas, seleccionarParesAperturas, type CandidatoApertura, type FilaCuentaCruce, type FilaTerceroCruce } from "./cruce-aperturas";
import { CAMPOS_MONTOS } from "./montos-cruce";

const cuenta: FilaCuentaCruce = { cuenta8: "11051001010101", nombreCuenta: "Caja", saldoInicial: 100, debitos: 50, creditos: -10, saldoFinal: 140 };
const tercero: FilaTerceroCruce = { ...cuenta, nitTercero: "900123456", nombreTercero: "Tercero" };
const c: CandidatoApertura = { id: 1, clienteId: 151, loteId: "cuenta", aperturaBalance: "cuenta", periodoInicio: new Date("2025-12-01"), periodoFin: new Date("2025-12-31") };
const t: CandidatoApertura = { ...c, id: 2, aperturaBalance: "tercero", loteId: "tercero" };
const captura = { id: 20, clienteId: 151, loteId: "tercero" };

describe("comparación independiente de los cuatro componentes", () => {
  it("cuadra cuando los cuatro coinciden", () => expect(construirCruceAperturas([cuenta], [tercero]).cuadra).toBe(true));
  it.each(CAMPOS_MONTOS)("detecta un centavo de diferencia en %s", (campo) => {
    const r = construirCruceAperturas([cuenta], [{ ...tercero, [campo]: tercero[campo] + 0.01 }]);
    expect(r.cuadra).toBe(false);
    expect(r.filas[0].diff[campo]).toBe(-0.01);
  });
  it("detecta movimientos compensados aunque saldo final y totales netos coincidan", () => {
    const r = construirCruceAperturas([cuenta], [{ ...tercero, debitos: 80, creditos: -40 }]);
    expect(r.filas[0].diff).toEqual({ saldoInicial: 0, debitos: -30, creditos: 30, saldoFinal: 0 });
    expect(r.cuadra).toBe(false);
  });
  it("mantiene signos; no compara valores absolutos", () => {
    expect(construirCruceAperturas([cuenta], [{ ...tercero, creditos: 10 }]).filas[0].diff.creditos).toBe(-20);
  });
  it("marca cuentas ausentes aun con importe cero", () => {
    const cero = { ...cuenta, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };
    expect(construirCruceAperturas([cero], []).filas[0].estado).toBe("solo_cuenta");
    expect(construirCruceAperturas([], [{ ...tercero, ...cero }]).filas[0].estado).toBe("solo_tercero");
  });
  it("suma movimientos repetidos sin deduplicarlos ni recortar códigos largos", () => {
    const r = construirCruceAperturas([cuenta, cuenta], [tercero, tercero]);
    expect(r.cuadra).toBe(true);
    expect(r.filas[0].cuenta8).toBe(cuenta.cuenta8);
    expect(r.filas[0].cuenta.debitos).toBe(100);
  });
  it("no mezcla dos cuentas que comparten los primeros ocho dígitos", () => {
    expect(construirCruceAperturas([cuenta], [{ ...tercero, cuenta8: "11051001010102" }]).filas.map((f) => f.estado)).toEqual(["solo_cuenta", "solo_tercero"]);
  });
  it("deduplica solo la fila propia cuando hay terceros reales", () => {
    const propia = { ...tercero, nitTercero: null, nombreTercero: null };
    const r = construirCruceAperturas([cuenta], [propia, tercero]);
    expect(r.cuadra).toBe(true);
    expect(r.filas[0].sinDesgloseTercero).toBe(false);
    expect(construirCruceAperturas([cuenta], [propia]).filas[0].sinDesgloseTercero).toBe(true);
  });
  it("no confunde al Genérico con la fila propia", () => {
    expect(construirCruceAperturas([cuenta], [{ ...tercero, nitTercero: null, nombreTercero: "Genérico" }]).filas[0].sinDesgloseTercero).toBe(false);
  });
  it("rechaza datos inválidos en lugar de declarar cuadre", () => {
    expect(() => construirCruceAperturas([cuenta], [{ ...tercero, debitos: NaN }])).toThrow();
  });
  it("el ruido binario no genera alertas en importes a centavos", () => {
    expect(construirCruceAperturas([{ ...cuenta, debitos: 0.1 + 0.2 }], [{ ...tercero, debitos: 0.3 }]).cuadra).toBe(true);
  });
});

describe("selección de pares de archivos", () => {
  it.each([1, 2])("compara confirmados en cualquier orden, al revisar %s", (id) => {
    expect(seleccionarParesAperturas(id, [t, c], [captura])).toEqual([{ balanceCuentaId: 1, balanceTerceroId: 2, terceroId: 20 }]);
  });
  it("un cargue por terceros y su subproducto no forman una pareja", () => {
    expect(seleccionarParesAperturas(2, [t], [captura])).toEqual([]);
    expect(seleccionarParesAperturas(1, [{ ...c, loteId: t.loteId }, t], [captura])).toEqual([]);
  });
  it("sin captura, un archivo declarado tercero no se convierte en por cuenta", () => {
    expect(seleccionarParesAperturas(2, [c, t], [])).toEqual([]);
  });
  it("no cruza clientes, intervalos o aperturas desconocidas", () => {
    for (const falso of [{ ...t, clienteId: 999 }, { ...t, periodoInicio: new Date("2025-01-01") }, { ...t, aperturaBalance: null }]) {
      expect(seleccionarParesAperturas(1, [c, falso], [captura])).toEqual([]);
    }
  });
  it("una nueva versión se compara sin sustituir ni borrar las parejas anteriores", () => {
    const c3 = { ...c, id: 3, loteId: "cuenta-v3" };
    expect(seleccionarParesAperturas(2, [c, t, c3], [captura])).toHaveLength(2);
    expect(seleccionarParesAperturas(3, [c, t, c3], [captura])).toEqual([{ balanceCuentaId: 3, balanceTerceroId: 2, terceroId: 20 }]);
  });
});
