import { describe, expect, it } from "vitest";
import { construirCruceAperturas, esDiferenciaReal, seleccionarParesAperturas, type CandidatoApertura, type FilaCuentaCruce, type FilaTerceroCruce } from "./cruce-aperturas";
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
  // CAMBIO DELIBERADO de criterio: antes una cuenta ausente se marcaba `solo_*` aunque
  // el lado presente viniera en ceros. Ausencia y ceros son el MISMO hecho económico
  // (no hubo movimiento), y contarlo llenaba el informe de ruido: 771 de 1.729 filas
  // reales, el 45 %. La ausencia sigue siendo diferencia cuando hay importes de por medio.
  it("NO marca diferencia si la cuenta falta en un archivo y en el otro viene en ceros", () => {
    const cero = { ...cuenta, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };
    expect(construirCruceAperturas([cero], []).filas[0].estado).toBe("cuadra");
    expect(construirCruceAperturas([], [{ ...tercero, ...cero }]).filas[0].estado).toBe("cuadra");
    // Y el par entero queda consistente: es lo único que los separaba.
    expect(construirCruceAperturas([cero], []).cuadra).toBe(true);
  });

  it("sigue marcando la cuenta ausente cuando el lado presente trae importes", () => {
    expect(construirCruceAperturas([cuenta], []).filas[0].estado).toBe("solo_cuenta");
    expect(construirCruceAperturas([], [tercero]).filas[0].estado).toBe("solo_tercero");
    expect(construirCruceAperturas([cuenta], []).cuadra).toBe(false);
  });

  it("basta UN componente distinto de cero para que la ausencia sea diferencia", () => {
    // Caso real: filas que solo mueven saldo inicial o créditos. Si se mirara únicamente
    // el saldo final se colarían como cuadre.
    const soloSaldoInicial = { ...cuenta, saldoInicial: 1, debitos: 0, creditos: 0, saldoFinal: 0 };
    const soloCreditos = { ...cuenta, saldoInicial: 0, debitos: 0, creditos: -1, saldoFinal: 0 };
    expect(construirCruceAperturas([soloSaldoInicial], []).filas[0].estado).toBe("solo_cuenta");
    expect(construirCruceAperturas([soloCreditos], []).filas[0].estado).toBe("solo_cuenta");
  });

  it("una cuenta en ceros a AMBOS lados tampoco es diferencia", () => {
    const cero = { ...cuenta, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };
    expect(construirCruceAperturas([cero], [{ ...tercero, ...cero }]).filas[0].estado).toBe("cuadra");
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

describe("depuración de informes ya guardados", () => {
  // Los informes calculados con el criterio anterior siguen en BD: un par marcado
  // inconsistente no se recalcula (regla de adherencia), así que la lectura los filtra
  // con el MISMO predicado. Caso real: el par de IGB guardó 1.348 filas, 765 de ellas
  // cuentas ausentes de un archivo y en ceros en el otro.
  const ceros = { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };
  const guardada = (diff: typeof ceros) => ({ cuenta8: "11050505", nombre: "CAJA GENERAL", cuenta: ceros, tercero: ceros, diff, estado: "solo_tercero" as const, sinDesgloseTercero: false });

  it("descarta la fila legada cuya diferencia es toda cero", () => {
    expect(esDiferenciaReal(guardada(ceros))).toBe(false);
  });

  it("conserva la fila legada con cualquier componente distinto de cero", () => {
    expect(esDiferenciaReal(guardada({ ...ceros, debitos: 39_361_058 }))).toBe(true);
    expect(esDiferenciaReal(guardada({ ...ceros, saldoInicial: -0.01 }))).toBe(true);
  });

  it("filtra una lista mixta dejando solo las diferencias reales", () => {
    const filas = [guardada(ceros), guardada({ ...ceros, creditos: -1 }), guardada(ceros)];
    expect(filas.filter(esDiferenciaReal)).toHaveLength(1);
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
