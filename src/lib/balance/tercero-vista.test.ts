import { describe, expect, it } from "vitest";
import {
  agruparPorCuentaTercero,
  agruparPorTerceroBalance,
  coincideBusquedaTercero,
  resumirBalanceTercero,
  type FilaBalanceTercero,
} from "./tercero-vista";

let secuencia = 0;
function fila(parcial: Partial<FilaBalanceTercero>): FilaBalanceTercero {
  secuencia += 1;
  return {
    id: secuencia,
    cuenta2: "13",
    cuenta4: "1305",
    cuenta6: "130505",
    cuenta8: "13050501",
    nombreCuenta: "Clientes nacionales",
    cuenta6Russell: "130505",
    nitTercero: "900123456",
    nombreTercero: "ACEROS MAPA S.A.",
    saldoInicial: 0,
    debitos: 0,
    creditos: 0,
    saldoFinal: 0,
    ...parcial,
  };
}

describe("resumirBalanceTercero", () => {
  it("cuenta cuentas y terceros ÚNICOS, no filas", () => {
    const r = resumirBalanceTercero([
      fila({ cuenta8: "13050501", nitTercero: "900123456", saldoFinal: 100 }),
      fila({ cuenta8: "13050501", nitTercero: "900999999", saldoFinal: 50 }),
      fila({ cuenta8: "13050502", nitTercero: "900123456", saldoFinal: 25 }),
    ]);
    expect(r.filas).toBe(3);
    expect(r.cuentas).toBe(2);
    expect(r.terceros).toBe(2);
    expect(r.saldoFinal).toBe(175);
  });

  it("separa las filas sin NIT y su saldo (no cruzan contra el auxiliar)", () => {
    const r = resumirBalanceTercero([
      fila({ nitTercero: "900123456", saldoFinal: 100 }),
      fila({ nitTercero: null, nombreTercero: null, saldoFinal: -40 }),
      fila({ nitTercero: null, nombreTercero: "VARIOS", saldoFinal: -10 }),
    ]);
    expect(r.terceros).toBe(1);
    expect(r.filasSinNit).toBe(2);
    expect(r.saldoSinNit).toBe(-50);
  });

  it("cuenta homologadas y sin homologar por fila", () => {
    const r = resumirBalanceTercero([
      fila({ cuenta6Russell: "130505" }),
      fila({ cuenta6Russell: null }),
      fila({ cuenta6Russell: null }),
    ]);
    expect(r.homologadas).toBe(1);
    expect(r.sinHomologar).toBe(2);
  });

  it("sin filas devuelve todo en cero", () => {
    const r = resumirBalanceTercero([]);
    expect(r).toMatchObject({ filas: 0, cuentas: 0, terceros: 0, saldoFinal: 0, sinHomologar: 0 });
  });
});

describe("agruparPorCuentaTercero", () => {
  it("suma por cuenta imputable, cuenta terceros únicos y ordena por código", () => {
    const grupos = agruparPorCuentaTercero([
      fila({ cuenta8: "22050502", cuenta4: "2205", saldoFinal: -300, nitTercero: "800111222" }),
      fila({ cuenta8: "13050501", saldoFinal: 100, nitTercero: "900123456", debitos: 100 }),
      fila({ cuenta8: "13050501", saldoFinal: 40, nitTercero: "900123456", debitos: 40 }),
      fila({ cuenta8: "13050501", saldoFinal: 60, nitTercero: "900999999", debitos: 60 }),
    ]);
    expect(grupos.map((g) => g.cuenta8)).toEqual(["13050501", "22050502"]);
    expect(grupos[0]).toMatchObject({ filas: 3, terceros: 2, saldoFinal: 200, debitos: 200 });
    expect(grupos[1]).toMatchObject({ filas: 1, terceros: 1, saldoFinal: -300 });
  });

  it("una cuenta queda homologada si cualquiera de sus filas trae la cuenta Russell", () => {
    const [grupo] = agruparPorCuentaTercero([
      fila({ cuenta8: "13050501", cuenta6Russell: null }),
      fila({ cuenta8: "13050501", cuenta6Russell: "130505" }),
    ]);
    expect(grupo.cuenta6Russell).toBe("130505");
  });

  it("las filas sin NIT no inflan el conteo de terceros de la cuenta", () => {
    const [grupo] = agruparPorCuentaTercero([
      fila({ cuenta8: "13050501", nitTercero: null }),
      fila({ cuenta8: "13050501", nitTercero: null }),
      fila({ cuenta8: "13050501", nitTercero: "900123456" }),
    ]);
    expect(grupo).toMatchObject({ filas: 3, terceros: 1 });
  });
});

describe("agruparPorTerceroBalance", () => {
  it("acumula por NIT y ordena por saldo final absoluto", () => {
    const grupos = agruparPorTerceroBalance([
      fila({ nitTercero: "900111111", saldoFinal: 100 }),
      fila({ nitTercero: "900222222", saldoFinal: -900 }),
      fila({ nitTercero: "900333333", saldoFinal: 400 }),
      fila({ nitTercero: "900111111", saldoFinal: 50, cuenta8: "13050502" }),
    ]);
    expect(grupos.map((g) => g.nit)).toEqual(["900222222", "900333333", "900111111"]);
    expect(grupos[2]).toMatchObject({ filas: 2, cuentas: 2, saldoFinal: 150 });
  });

  it("todo lo que llega sin NIT cae en un solo bucket, siempre al final", () => {
    const grupos = agruparPorTerceroBalance([
      fila({ nitTercero: null, nombreTercero: "SIN IDENTIFICAR", saldoFinal: -5000 }),
      fila({ nitTercero: null, nombreTercero: null, saldoFinal: -1000 }),
      fila({ nitTercero: "900111111", saldoFinal: 10 }),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].nit).toBe("900111111");
    expect(grupos[1]).toMatchObject({ nit: null, nombre: null, filas: 2, saldoFinal: -6000 });
  });

  it("conserva el primer nombre no vacío del tercero", () => {
    const [grupo] = agruparPorTerceroBalance([
      fila({ nitTercero: "900111111", nombreTercero: null }),
      fila({ nitTercero: "900111111", nombreTercero: "ACEROS MAPA S.A." }),
      fila({ nitTercero: "900111111", nombreTercero: "Aceros Mapa" }),
    ]);
    expect(grupo.nombre).toBe("ACEROS MAPA S.A.");
  });
});

describe("coincideBusquedaTercero", () => {
  const f = fila({
    cuenta8: "13050501",
    nombreCuenta: "Clientes nacionales",
    nitTercero: "901660053",
    nombreTercero: "GRUPO RTL S.A.S.",
  });

  it("sin término, todo coincide", () => {
    expect(coincideBusquedaTercero(f, "")).toBe(true);
    expect(coincideBusquedaTercero(f, "   ")).toBe(true);
  });

  it("busca por cuenta en cualquier nivel y por nombre de cuenta", () => {
    expect(coincideBusquedaTercero(f, "1305")).toBe(true);
    expect(coincideBusquedaTercero(f, "13050501")).toBe(true);
    expect(coincideBusquedaTercero(f, "clientes")).toBe(true);
  });

  it("el NIT coincide aunque se pegue con puntos o guiones", () => {
    expect(coincideBusquedaTercero(f, "901660053")).toBe(true);
    expect(coincideBusquedaTercero(f, "901.660.053")).toBe(true);
    expect(coincideBusquedaTercero(f, "901-660-053")).toBe(true);
  });

  it("ignora acentos y mayúsculas del nombre del tercero", () => {
    const conTilde = fila({ nombreTercero: "COMPAÑÍA DE EMPAQUETADURAS" });
    expect(coincideBusquedaTercero(conTilde, "compania")).toBe(true);
    expect(coincideBusquedaTercero(conTilde, "EMPAQUE")).toBe(true);
  });

  it("descarta lo que no aparece en ningún campo", () => {
    expect(coincideBusquedaTercero(f, "inventario")).toBe(false);
  });
});
