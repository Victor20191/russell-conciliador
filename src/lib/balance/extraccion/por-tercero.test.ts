import { describe, expect, it } from "vitest";
import { extraerBalancePorTercero, specCargaASpecPorTercero, type SpecPorTercero } from "./por-tercero";
import type { GridHoja } from "./ingesta";
import type { SpecCarga } from "./esquema";

// Grilla sintética: fila 1 encabezado, fila 2 fila de nota, datos desde la fila 3.
// Columnas: 1=cuenta, 2=nombre, 3=tercero, 4=saldoInicial, 5=debitos, 6=creditos, 7=saldoFinal
function hojaCon(filas: (string | number | null)[][]): GridHoja {
  return { nombre: "Balance", filas };
}

const SPEC_BASE: SpecPorTercero = {
  filaEncabezado: 1,
  primeraFilaDatos: 3,
  columnas: { cuenta: 1, nombre: 2, tercero: 3, saldoInicial: 4, debitos: 5, creditos: 6, saldoFinal: 7 },
};

describe("extraerBalancePorTercero", () => {
  it("extrae el NIT canónico de una celda 'NIT nombre'", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].nitTercero).toBe("900123456");
    expect(res.filas[0].nombreTercero).toBe("Acme SAS");
  });

  it("NO colapsa por cuenta: dos filas de la misma cuenta con terceros distintos → dos filas", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
      ["13050501", "Clientes nacionales", "800654321-1 Beta Ltda", 0, 500, 0, 500],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filas).toHaveLength(2);
    expect(res.filas[0].nitTercero).toBe("900123456");
    expect(res.filas[1].nitTercero).toBe("800654321");
    // ninguna fila se suma con la otra
    expect(res.filas[0].debitos).toBe(1000);
    expect(res.filas[1].debitos).toBe(500);
  });

  it("una variación de DV del mismo tercero entre filas produce el mismo nitTercero", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
      ["13050502", "Clientes exterior", "900123456-1 Acme SAS", 0, 200, 0, 200],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filas).toHaveLength(2);
    expect(res.filas[0].nitTercero).toBe(res.filas[1].nitTercero);
    expect(res.filas[0].nitTercero).toBe("900123456");
  });

  it("fila sin tercero deja nitTercero en null", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "", 0, 1000, 0, 1000],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].nitTercero).toBeNull();
    expect(res.filas[0].nombreTercero).toBeNull();
  });

  it("descompone la cuenta en niveles PUC 2/4/6/8", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filas[0]).toMatchObject({ cuenta2: "13", cuenta4: "1305", cuenta6: "130505", cuenta8: "13050501" });
  });

  it("cuenta filasLeidas y filasExcluidas (fila de total sin código numérico)", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
      ["13050502", "Clientes exterior", "800654321-1 Beta Ltda", 0, 500, 0, 500],
      ["TOTAL", "Total general", "", 0, 1500, 0, 1500],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filasLeidas).toBe(3);
    expect(res.filasExcluidas).toBe(1);
    expect(res.filas).toHaveLength(2);
  });

  it("salta filas vacías sin contarlas", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 0, 1000],
      [null, null, null, null, null, null, null],
      ["13050502", "Clientes exterior", "800654321-1 Beta Ltda", 0, 500, 0, 500],
    ]);
    const res = extraerBalancePorTercero(hoja, SPEC_BASE);
    expect(res.filasLeidas).toBe(2);
    expect(res.filasExcluidas).toBe(0);
    expect(res.filas).toHaveLength(2);
  });

  it("sin columna de tercero mapeada, todas las filas quedan sin tercero", () => {
    const spec: SpecPorTercero = { ...SPEC_BASE, columnas: { ...SPEC_BASE.columnas, tercero: undefined } };
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", 0, 1000, 0, 1000],
    ]);
    const res = extraerBalancePorTercero(hoja, spec);
    expect(res.filas[0].nitTercero).toBeNull();
  });

  it("signoCredito invertido intercambia débitos y créditos leídos", () => {
    const hoja = hojaCon([
      ["Cuenta", "Nombre", "Tercero", "SI", "Db", "Cr", "SF"],
      [],
      ["13050501", "Clientes nacionales", "900123456-7 Acme SAS", 0, 1000, 200, 800],
    ]);
    const res = extraerBalancePorTercero(hoja, { ...SPEC_BASE, signoCredito: "invertido" });
    expect(res.filas[0].debitos).toBe(200);
    expect(res.filas[0].creditos).toBe(1000);
  });
});

const SPEC_CARGA_BASE: SpecCarga = {
  hoja: "Balance",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: {
    codigo: 1,
    codigoFragmentos: [],
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 7,
  },
  signoCredito: "firmado",
  reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
  agregarPorTercero: false,
};

describe("specCargaASpecPorTercero", () => {
  it("convierte un spec editable válido al contrato de extraerBalancePorTercero", () => {
    const res = specCargaASpecPorTercero(SPEC_CARGA_BASE);
    expect(res).toEqual({
      ok: true,
      spec: {
        filaEncabezado: 1,
        primeraFilaDatos: 2,
        columnas: { cuenta: 1, nombre: 2, tercero: 7, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6 },
        signoCredito: "natural",
      },
    });
  });

  it("columnas opcionales en 0 quedan undefined (no existen en el archivo)", () => {
    const spec: SpecCarga = {
      ...SPEC_CARGA_BASE,
      columnas: { ...SPEC_CARGA_BASE.columnas, nombre: 0, saldoInicial: 0, debitos: 0, creditos: 0 },
    };
    const res = specCargaASpecPorTercero(spec);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.spec.columnas.nombre).toBeUndefined();
      expect(res.spec.columnas.saldoInicial).toBeUndefined();
      expect(res.spec.columnas.debitos).toBeUndefined();
      expect(res.spec.columnas.creditos).toBeUndefined();
    }
  });

  it("rechaza si falta la columna de tercero", () => {
    const spec: SpecCarga = { ...SPEC_CARGA_BASE, columnas: { ...SPEC_CARGA_BASE.columnas, tercero: 0 } };
    const res = specCargaASpecPorTercero(spec);
    expect(res).toEqual({ ok: false, message: expect.stringContaining("tercero") });
  });

  it("rechaza el código de cuenta fragmentado", () => {
    const spec: SpecCarga = {
      ...SPEC_CARGA_BASE,
      columnas: { ...SPEC_CARGA_BASE.columnas, codigo: 0, codigoFragmentos: [1, 2, 3] },
    };
    const res = specCargaASpecPorTercero(spec);
    expect(res).toEqual({ ok: false, message: expect.stringContaining("fragmentado") });
  });

  it("rechaza sin columna de código y sin fragmentos", () => {
    const spec: SpecCarga = { ...SPEC_CARGA_BASE, columnas: { ...SPEC_CARGA_BASE.columnas, codigo: 0 } };
    const res = specCargaASpecPorTercero(spec);
    expect(res).toEqual({ ok: false, message: expect.stringContaining("código de cuenta") });
  });

  it("rechaza sin columna de saldo final única (viene partido en débito/crédito)", () => {
    const spec: SpecCarga = {
      ...SPEC_CARGA_BASE,
      columnas: { ...SPEC_CARGA_BASE.columnas, saldoFinal: 0, saldoFinalDebito: 6, saldoFinalCredito: 7 },
    };
    const res = specCargaASpecPorTercero(spec);
    expect(res).toEqual({ ok: false, message: expect.stringContaining("saldo final") });
  });
});
