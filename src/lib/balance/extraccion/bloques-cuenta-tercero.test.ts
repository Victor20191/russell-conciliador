import { describe, it, expect } from "vitest";
import { clasificarBloquesCuentaTercero, mismoNombre, type FilaBloque } from "./bloques-cuenta-tercero";

let indice = 0;
function f(crudo: string, nombre: string, importes: [number, number, number, number], conIdentidad = false): FilaBloque {
  const [saldoInicial, debitos, creditos, saldoFinal] = importes;
  return { indice: indice++, codigo: crudo.replace(/-/g, ""), crudo, conIdentidad, nombre, saldoInicial, debitos, creditos, saldoFinal };
}

describe("clasificarBloquesCuentaTercero", () => {
  it("cuenta plana + repetición con guiones + «*SIN NOMBRE*» + terceros con NIT (QUIFARMA 11050501)", () => {
    const filas = [
      f("11050501", "CAJA GENERAL", [3_223_950, 0, 3_105_950, 118_000]),
      f("1105-05-01", "CAJA GENERAL", [3_223_950, 0, 3_105_950, 118_000]),
      f("1105-05-01", "*SIN NOMBRE*", [16_850, 0, 0, 16_850]),
      f("1105-05-01", "JESSICA FERNANDA CAMARGO PEREZ", [-486_400, 0, 761_300, -1_247_700], true),
      f("1105-05-01", "QUIFARMA S.A.S", [3_693_500, 0, 2_344_650, 1_348_850], true),
    ];
    const r = clasificarBloquesCuentaTercero(filas);
    expect([...r.repeticiones]).toEqual([filas[1].indice]);
    expect([...r.tercerosSinDocumento]).toEqual([filas[2].indice]);
    expect(r.nombreCuenta.get("11050501")).toBe("CAJA GENERAL");
    expect(r.codigos.has("11050501")).toBe(true);
  });

  it("sin fila plana, la fila con guiones es la cuenta y el «*SIN NOMBRE*» con sus mismos importes es su tercero", () => {
    const filas = [
      f("1130-05-18", "INVERSION RENTA FIJA VIRTUAL", [0, 800, 800, 0]),
      f("1130-05-18", "*SIN NOMBRE*", [0, 800, 800, 0]),
    ];
    const r = clasificarBloquesCuentaTercero(filas);
    expect(r.repeticiones.size).toBe(0);
    expect([...r.tercerosSinDocumento]).toEqual([filas[1].indice]);
  });

  it("plana + guiones + «*SIN NOMBRE*» idénticos: la primera notación nueva repite la cuenta, la siguiente es el tercero", () => {
    const filas = [
      f("14980505", "CARGUE DE INVENTARIOS", [0, 502, 250, 252]),
      f("1498-05-05", "CARGUE DE INVENTARIOS", [0, 502, 250, 252]),
      f("1498-05-05", "*SIN NOMBRE*", [0, 502, 250, 252]),
    ];
    const r = clasificarBloquesCuentaTercero(filas);
    expect([...r.repeticiones]).toEqual([filas[1].indice]);
    expect([...r.tercerosSinDocumento]).toEqual([filas[2].indice]);
  });

  it("la repetición se reconoce por importes aunque el nombre cambie («GRAVADOS» / «MATERIAL DE EMPAQUE»)", () => {
    const filas = [
      f("14600101", "GRAVADOS", [2_000, 100, 0, 2_100]),
      f("1460-01-01", "MATERIAL DE EMPAQUE", [2_000, 100, 0, 2_100]),
      f("1460-01-01", "*SIN NOMBRE*", [-500, 0, 0, -500]),
      f("1460-01-01", "ETIPRESS", [2_500, 100, 0, 2_600], true),
    ];
    const r = clasificarBloquesCuentaTercero(filas);
    expect([...r.repeticiones]).toEqual([filas[1].indice]);
    expect([...r.tercerosSinDocumento]).toEqual([filas[2].indice]);
  });

  it("si el detalle no suma la cuenta (sucursales), no toca el código", () => {
    const filas = [
      f("130505", "Sucursal A", [100, 20, 0, 120]),
      f("130505", "Sucursal B", [200, 30, 0, 230]),
      f("130505", "Detalle informativo", [300, 50, 0, 350], true),
    ];
    const r = clasificarBloquesCuentaTercero(filas);
    expect(r.repeticiones.size).toBe(0);
    expect(r.tercerosSinDocumento.size).toBe(0);
    expect(r.codigos.has("130505")).toBe(false);
  });

  it("un código con una sola fila sin tercero no se marca", () => {
    const r = clasificarBloquesCuentaTercero([f("11051003", "CAJA MENOR CALI", [300, 0, 0, 300])]);
    expect(r.repeticiones.size + r.tercerosSinDocumento.size).toBe(0);
    expect(r.codigos.size).toBe(0);
    expect(r.nombreCuenta.get("11051003")).toBe("CAJA MENOR CALI");
  });
});

describe("mismoNombre", () => {
  it("ignora mayúsculas y espacios", () => {
    expect(mismoNombre(" Caja  general ", "CAJA GENERAL")).toBe(true);
    expect(mismoNombre("CAJA GENERAL", "QUIFARMA S.A.S")).toBe(false);
  });
});
