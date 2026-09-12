import { describe, expect, it } from "vitest";
import {
  CLAVE_EDADES,
  CLAVES_CARTERA,
  datosConExtrasCartera,
  filaCarteraDesdeDetalle,
  leerEdades,
  leerSaldoDeclarado,
  rotulosDeEdades,
} from "./detalle-cartera";

describe("datosConExtrasCartera", () => {
  it("un módulo sin nada que añadir escribe el JSON de siempre", () => {
    // Identidad por referencia: INV/AFI/NOM no pagan ni una copia por esto.
    const datos = { tipo: "MERCANCIA", referencia: "REF-1" };
    expect(datosConExtrasCartera(datos, {})).toBe(datos);
  });

  it("guarda los baldes con el rótulo literal del ERP", () => {
    const r = datosConExtrasCartera(
      { nit: "900123456" },
      { familias: { edades: { "1 - 30 DIAS": 100, "POR VENCER": 200 } }, sumaFamilia: 300 },
    );
    expect(r[CLAVE_EDADES]).toEqual({ "1 - 30 DIAS": 100, "POR VENCER": 200 });
    expect(r.nit).toBe("900123456");
  });

  it("no pisa los roles del descriptor", () => {
    const datos = { nit: "900123456", total: 500 };
    const r = datosConExtrasCartera(datos, { valorReportado: 499, origenValor: "columna_y_familia" });
    expect(r.nit).toBe("900123456");
    expect(r.total).toBe(500);
    expect(Object.keys(r).filter((k) => !k.startsWith("_"))).toEqual(["nit", "total"]);
  });

  it("todas las claves reservadas empiezan por «_», para no chocar con un rol", () => {
    expect(CLAVES_CARTERA.every((c) => c.startsWith("_"))).toBe(true);
  });

  it("un cero declarado no se pierde: es un dato, no un vacío", () => {
    const r = datosConExtrasCartera({}, { saldoDeclarado: 0, sumaFamilia: 0 });
    expect(leerSaldoDeclarado(r)).toBe(0);
  });
});

describe("leerEdades", () => {
  it("descarta lo que no sea un par rótulo → número", () => {
    expect(leerEdades({ [CLAVE_EDADES]: { "1 - 30": 100, malo: "x", nulo: null } })).toEqual({ "1 - 30": 100 });
  });

  it("tolera un JSON sin baldes o con basura en su lugar", () => {
    expect(leerEdades({})).toBeNull();
    expect(leerEdades({ [CLAVE_EDADES]: "no es un objeto" })).toBeNull();
    expect(leerEdades({ [CLAVE_EDADES]: [1, 2] })).toBeNull();
    expect(leerEdades({ [CLAVE_EDADES]: {} })).toBeNull();
  });
});

describe("filaCarteraDesdeDetalle · ida y vuelta", () => {
  it("reconstruye lo que el transform calculó", () => {
    const datos = datosConExtrasCartera(
      { nit: "900123456", nombre: "CLIENTE UNO", dv: "7", diasVencidos: 45 },
      {
        familias: { edades: { "1 - 30 DIAS": 100, "POR VENCER": 200 } },
        sumaFamilia: 300,
        valorReportado: 299,
        origenValor: "columna_y_familia",
      },
    );
    const fila = filaCarteraDesdeDetalle(
      { filaNum: 7, valor: 300, datos, nivel: "documento", imputable: true, cuentaCliente: "130505", origenCartera: "nacional" },
      "tercero",
    );
    expect(fila).toMatchObject({
      filaNum: 7, valor: 300, imputable: true, nivel: "documento",
      cuentaCliente: "130505", origenCartera: "nacional",
      edades: { "1 - 30 DIAS": 100, "POR VENCER": 200 },
      sumaEdades: 300, saldoReportado: 299, diasVencidos: 45,
      nit: "900123456", nombre: "CLIENTE UNO", dv: "7",
    });
  });

  it("una cabecera conserva su saldo declarado", () => {
    const datos = datosConExtrasCartera({ nit: "900123456" }, { saldoDeclarado: 1_500_000 });
    const fila = filaCarteraDesdeDetalle({ filaNum: 1, valor: 0, datos, imputable: false }, "documento");
    expect(fila.saldoDeclarado).toBe(1_500_000);
    expect(fila.imputable).toBe(false);
  });

  it("cae al nivel por defecto cuando la columna viene vacía (cargues anteriores)", () => {
    const fila = filaCarteraDesdeDetalle({ filaNum: 1, valor: 10, datos: {}, nivel: null }, "tercero");
    expect(fila.nivel).toBe("tercero");
  });

  it("un nivel desconocido no se propaga", () => {
    const fila = filaCarteraDesdeDetalle({ filaNum: 1, valor: 10, datos: {}, nivel: "inventado" }, "documento");
    expect(fila.nivel).toBe("documento");
  });

  it("sin columna de cuenta cae al rol `cuenta` del JSON", () => {
    const fila = filaCarteraDesdeDetalle({ filaNum: 1, valor: 10, datos: { cuenta: "13050505" } }, "documento");
    expect(fila.cuentaCliente).toBe("13050505");
  });

  it("`imputable` solo es falso cuando lo dice explícitamente", () => {
    expect(filaCarteraDesdeDetalle({ filaNum: 1, valor: 1, datos: {} }, "documento").imputable).toBe(true);
    expect(filaCarteraDesdeDetalle({ filaNum: 1, valor: 1, datos: {}, imputable: null }, "documento").imputable).toBe(true);
    expect(filaCarteraDesdeDetalle({ filaNum: 1, valor: 1, datos: {}, imputable: false }, "documento").imputable).toBe(false);
  });
});

describe("rotulosDeEdades", () => {
  it("reúne los rótulos en el orden en que aparecen, sin repetir", () => {
    const filas = [
      { datos: datosConExtrasCartera({}, { familias: { edades: { Corriente: 1, "De 1 a 90": 0 } } }) },
      { datos: datosConExtrasCartera({}, { familias: { edades: { "De 1 a 90": 5, "De 91 a 180": 2 } } }) },
    ];
    expect(rotulosDeEdades(filas)).toEqual(["Corriente", "De 1 a 90", "De 91 a 180"]);
  });

  it("sin baldes devuelve una lista vacía", () => {
    expect(rotulosDeEdades([{ datos: { nit: "900123456" } }])).toEqual([]);
  });
});
