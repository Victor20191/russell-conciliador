import { describe, expect, it } from "vitest";
import {
  construirComparacionCuentasTerceros,
  filtrarComparacionTerceros,
  resumirComparacionTerceros,
  type ComparacionCuentaTerceros,
  type FilaCuentaBalanceVisor,
  type FilaDetalleTerceroVisor,
} from "./visor-terceros";

function cuentaBalance(over: Partial<FilaCuentaBalanceVisor> = {}): FilaCuentaBalanceVisor {
  return {
    cuenta8: "13050501",
    nombreCuenta: "Clientes nacionales",
    cuenta6Russell: "130505",
    saldoInicial: 0,
    debitos: 1000,
    creditos: 0,
    saldoFinal: 1000,
    ...over,
  };
}

function filaTercero(over: Partial<FilaDetalleTerceroVisor> = {}): FilaDetalleTerceroVisor {
  return {
    cuenta8: "13050501",
    nombreCuenta: "Clientes nacionales",
    nitTercero: "900123456",
    nombreTercero: "Cliente A",
    cuenta6Russell: "130505",
    saldoInicial: 0,
    debitos: 1000,
    creditos: 0,
    saldoFinal: 1000,
    ...over,
  };
}

/** Fila «propia» de la cuenta, como la sintetiza `prepararCapturaTercero`. */
function filaPropia(over: Partial<FilaDetalleTerceroVisor> = {}): FilaDetalleTerceroVisor {
  return filaTercero({ nitTercero: null, nombreTercero: null, ...over });
}

describe("construirComparacionCuentasTerceros", () => {
  it("marca ok una cuenta con un solo tercero cuya homologación y saldo coinciden con el balance", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance()], [filaTercero()]);
    expect(fila.enBalance).toBe(true);
    expect(fila.enTercero).toBe(true);
    expect(fila.diferenciaHomologacion).toBe(false);
    expect(fila.diferenciaSaldo).toBe(false);
    expect(fila.incompleto).toBe(false);
    expect(fila.tieneDiferencia).toBe(false);
    expect(fila.saldoConsolidadoTercero).toBe(1000);
  });

  it("suma los movimientos repetidos de una cuenta antes de comparar", () => {
    // Las dos filas del balance (repetidas) deben sumar los CUATRO componentes
    // y coincidir con el único lado tercero; no solo el saldo final.
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ debitos: 400, saldoFinal: 400 }), cuentaBalance({ debitos: 600, saldoFinal: 600 })],
      [filaTercero({ debitos: 1000, saldoFinal: 1000 })],
    );
    expect(fila.saldoFinalBalance).toBe(1000);
    expect(fila.debitosBalance).toBe(1000);
    expect(fila.tieneDiferencia).toBe(false);
    expect(fila.tieneDiferenciaImportes).toBe(false);
  });

  it("detecta homologaciones distintas entre movimientos de la misma cuenta", () => {
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ saldoFinal: 400 }), cuentaBalance({ saldoFinal: 600, cuenta6Russell: "130510" })], [filaTercero()],
    );
    expect(fila.diferenciaHomologacion).toBe(true);
    expect(fila.diferenciaSaldo).toBe(false);
  });

  it("no dobla el consolidado cuando el dataset trae la fila propia además de los terceros reales", () => {
    const filas = [filaPropia({ saldoFinal: 1500 }), filaTercero({ saldoFinal: 900 }), filaTercero({ nitTercero: "800999888", nombreTercero: "Cliente B", saldoFinal: 600 })];
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ saldoFinal: 1500 })], filas);
    // filasEfectivasTercero descarta la propia porque hay terceros reales: 900 + 600 = 1500.
    expect(fila.saldoConsolidadoTercero).toBe(1500);
    expect(fila.diferenciaSaldo).toBe(false);
    expect(fila.terceros).toHaveLength(3); // el detalle crudo se conserva completo para pintar
  });

  it("una cuenta sin terceros reales conserva su fila propia como consolidado", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ cuenta8: "14350501", saldoFinal: 300 })], [
      filaPropia({ cuenta8: "14350501", saldoFinal: 300 }),
    ]);
    expect(fila.saldoConsolidadoTercero).toBe(300);
    expect(fila.tieneDiferencia).toBe(false);
    expect(fila.terceros[0].esFilaPropia).toBe(true);
  });

  it("detecta diferencia de homologación entre la cuenta y su detalle por tercero", () => {
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ cuenta6Russell: "130505" })],
      [filaTercero({ cuenta6Russell: "417500" })],
    );
    expect(fila.diferenciaHomologacion).toBe(true);
    expect(fila.tieneDiferencia).toBe(true);
    expect(fila.diferenciaSaldo).toBe(false);
  });

  it("detecta homologación inconsistente entre los propios terceros de una cuenta", () => {
    const filas = [filaTercero({ cuenta6Russell: "130505" }), filaTercero({ nitTercero: "800999888", nombreTercero: "Cliente B", cuenta6Russell: "130510" })];
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ saldoFinal: 2000 })], filas.map((f) => ({ ...f, saldoFinal: 1000 })));
    expect(fila.homologacionInconsistente).toBe(true);
    expect(fila.cuenta6RussellTercero).toBeNull();
    expect(fila.diferenciaHomologacion).toBe(true);
  });

  it("detecta diferencia de saldo aunque la homologación coincida", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ saldoFinal: 1000 })], [filaTercero({ saldoFinal: 950 })]);
    expect(fila.diferenciaSaldo).toBe(true);
    expect(fila.diferenciaHomologacion).toBe(false);
    expect(fila.tieneDiferencia).toBe(true);
  });

  it("tolera diferencias de redondeo por debajo del épsilon", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ saldoFinal: 1000 })], [filaTercero({ saldoFinal: 1000.005 })]);
    expect(fila.diferenciaSaldo).toBe(false);
  });

  it("marca incompleto una cuenta del balance sin ninguna fila en el detalle por tercero", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ cuenta8: "51950101", nombreCuenta: "Gastos varios" })], []);
    expect(fila.enBalance).toBe(true);
    expect(fila.enTercero).toBe(false);
    expect(fila.incompleto).toBe(true);
    expect(fila.tieneDiferencia).toBe(true);
    expect(fila.diferenciaHomologacion).toBe(false); // no se inventa una diferencia sin datos del otro lado
    expect(fila.diferenciaSaldo).toBe(false);
  });

  it("marca incompleto una cuenta presente en el detalle por tercero pero ausente del balance", () => {
    const [fila] = construirComparacionCuentasTerceros([], [filaTercero({ cuenta8: "99999999", nombreCuenta: "Cuenta huérfana" })]);
    expect(fila.enBalance).toBe(false);
    expect(fila.enTercero).toBe(true);
    expect(fila.incompleto).toBe(true);
    expect(fila.nombreCuenta).toBe("Cuenta huérfana");
  });

  it("ordena el resultado por cuenta8 de forma determinista sin importar el orden de entrada", () => {
    const filas = construirComparacionCuentasTerceros(
      [cuentaBalance({ cuenta8: "20000000" }), cuentaBalance({ cuenta8: "10000000" })],
      [filaTercero({ cuenta8: "20000000" }), filaTercero({ cuenta8: "10000000" })],
    );
    expect(filas.map((f) => f.cuenta8)).toEqual(["10000000", "20000000"]);
  });
});

describe("comparación de los cuatro componentes (SI/Db/Cr/SF): tieneDiferenciaImportes/diferenciasMontos", () => {
  it("no inventa diferencia de importes cuando los cuatro componentes coinciden", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance()], [filaTercero()]);
    expect(fila.tieneDiferenciaImportes).toBe(false);
    expect(fila.diferenciasMontos).toEqual({ saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 });
    expect(fila.montosBalance).toEqual({ saldoInicial: 0, debitos: 1000, creditos: 0, saldoFinal: 1000 });
    expect(fila.montosTercero).toEqual({ saldoInicial: 0, debitos: 1000, creditos: 0, saldoFinal: 1000 });
  });

  it("débito y crédito compensados: el saldo final cuadra pero los movimientos difieren", () => {
    // El balance registra 900/0 y el tercero 1200/300: mismo saldo final (900) por compensación.
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ debitos: 900, creditos: 0, saldoFinal: 900 })],
      [filaTercero({ debitos: 1200, creditos: 300, saldoFinal: 900 })],
    );
    expect(fila.diferenciaSaldo).toBe(false); // compatibilidad: el SF antiguo no ve el problema
    expect(fila.tieneDiferenciaImportes).toBe(true); // la nueva comparación sí lo detecta
    expect(fila.tieneDiferencia).toBe(true);
    expect(fila.diferenciasMontos).toEqual({ saldoInicial: 0, debitos: -300, creditos: -300, saldoFinal: 0 });
  });

  it("saldo inicial diferente con débito, crédito y saldo final iguales", () => {
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ saldoInicial: 500, debitos: 1000, creditos: 0, saldoFinal: 1500 })],
      [filaTercero({ saldoInicial: 300, debitos: 1000, creditos: 0, saldoFinal: 1500 })],
    );
    expect(fila.diferenciaSaldo).toBe(false);
    expect(fila.tieneDiferenciaImportes).toBe(true);
    expect(fila.diferenciasMontos).toEqual({ saldoInicial: 200, debitos: 0, creditos: 0, saldoFinal: 0 });
  });

  it("un centavo de diferencia en el saldo final es inconsistencia: no hay umbral de materialidad", () => {
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ saldoFinal: 1000 })],
      [filaTercero({ saldoFinal: 999.99 })],
    );
    expect(fila.diferenciaSaldo).toBe(false); // el umbral antiguo (> 0.01) tolera exactamente un centavo
    expect(fila.tieneDiferenciaImportes).toBe(true);
    expect(fila.diferenciasMontos.saldoFinal).toBe(0.01);
  });

  it("compara los importes por su signo, no por su valor absoluto", () => {
    const [fila] = construirComparacionCuentasTerceros(
      [cuentaBalance({ saldoInicial: -100, debitos: 0, creditos: 0, saldoFinal: -100 })],
      [filaTercero({ saldoInicial: 100, debitos: 0, creditos: 0, saldoFinal: 100 })],
    );
    expect(fila.tieneDiferenciaImportes).toBe(true);
    expect(fila.diferenciasMontos).toEqual({ saldoInicial: -200, debitos: 0, creditos: 0, saldoFinal: -200 });
  });

  it("no inventa diferencia de importes cuando falta un lado (incompleta)", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ cuenta8: "51950101" })], []);
    expect(fila.tieneDiferenciaImportes).toBe(false);
    expect(fila.diferenciasMontos).toEqual({ saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 });
    expect(fila.montosTercero).toEqual({ saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 });
  });

  it("deduplica la fila propia en montosTercero cuando conviven con terceros reales", () => {
    const filas = [filaPropia({ saldoFinal: 1500, debitos: 1500, saldoInicial: 0 }), filaTercero({ saldoFinal: 900, debitos: 900 }), filaTercero({ nitTercero: "800999888", nombreTercero: "Cliente B", saldoFinal: 600, debitos: 600 })];
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ debitos: 1500, saldoFinal: 1500 })], filas);
    expect(fila.montosTercero).toEqual({ saldoInicial: 0, debitos: 1500, creditos: 0, saldoFinal: 1500 });
    expect(fila.tieneDiferenciaImportes).toBe(false);
  });

  it("una cuenta sin terceros reales conserva su fila propia en montosTercero", () => {
    const [fila] = construirComparacionCuentasTerceros([cuentaBalance({ cuenta8: "14350501", saldoFinal: 300 })], [
      filaPropia({ cuenta8: "14350501", saldoFinal: 300 }),
    ]);
    expect(fila.montosTercero).toEqual({ saldoInicial: 0, debitos: 1000, creditos: 0, saldoFinal: 300 });
    expect(fila.tieneDiferenciaImportes).toBe(false);
  });
});

describe("resumirComparacionTerceros", () => {
  it("agrega totales, diferencias, incompletas y ambos saldos", () => {
    const filas = construirComparacionCuentasTerceros(
      [cuentaBalance({ cuenta8: "10000000", saldoFinal: 1000 }), cuentaBalance({ cuenta8: "20000000", saldoFinal: 500 })],
      [filaTercero({ cuenta8: "10000000", saldoFinal: 1000 })], // 20000000 queda incompleta
    );
    const resumen = resumirComparacionTerceros(filas);
    expect(resumen.totalCuentas).toBe(2);
    expect(resumen.incompletas).toBe(1);
    expect(resumen.conDiferencia).toBe(1);
    expect(resumen.saldoBalance).toBe(1500);
    expect(resumen.saldoTercero).toBe(1000);
  });
});

describe("filtrarComparacionTerceros", () => {
  const base: ComparacionCuentaTerceros[] = construirComparacionCuentasTerceros(
    [cuentaBalance({ cuenta8: "13050501", nombreCuenta: "Clientes nacionales" }), cuentaBalance({ cuenta8: "13050502", nombreCuenta: "Clientes exterior", saldoFinal: 2000 })],
    [filaTercero({ cuenta8: "13050501" }), filaTercero({ cuenta8: "13050502", nitTercero: "800111222", nombreTercero: "Foránea SAS", saldoFinal: 1500 })],
  );

  it("sin filtros devuelve todas las filas", () => {
    expect(filtrarComparacionTerceros(base, {})).toHaveLength(2);
  });

  it("soloDiferencias descarta las cuentas sin diferencia", () => {
    const filtradas = filtrarComparacionTerceros(base, { soloDiferencias: true });
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].cuenta8).toBe("13050502");
  });

  it("q busca por cuenta, nombre de cuenta, NIT o nombre del tercero (insensible a mayúsculas)", () => {
    expect(filtrarComparacionTerceros(base, { q: "13050501" })).toHaveLength(1);
    expect(filtrarComparacionTerceros(base, { q: "exterior" })).toHaveLength(1);
    expect(filtrarComparacionTerceros(base, { q: "800111222" })).toHaveLength(1);
    expect(filtrarComparacionTerceros(base, { q: "FORÁNEA" })).toHaveLength(1);
    expect(filtrarComparacionTerceros(base, { q: "no existe" })).toHaveLength(0);
  });
});
