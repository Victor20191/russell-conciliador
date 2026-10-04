import { describe, expect, it } from "vitest";
import { construirCruceContable, type ClasificadorCruce } from "../cruce-contable";
import { emparejarCedulaActivos, hayReclasificacionEntreColumnas, totalesColumnasActivos } from "./cedula-activos";

// Las parejas de fábrica del módulo (RELACION_DEPRECIACION_AFI).
const PARES = new Map([
  ["1516", "159205"],
  ["1520", "159210"],
  ["1524", "159215"],
  ["1528", "159220"],
]);

const NOMBRES: Record<string, string> = {
  "1504": "Terrenos",
  "1516": "Construcciones y edificaciones",
  "1520": "Maquinaria y equipo",
  "1524": "Equipo de oficina",
  "159205": "Depreciación de construcciones",
  "159210": "Depreciación de maquinaria",
  "159299": "Depreciación de otros",
};

/** El cruce tal como sale hoy (un renglón por cuenta), que es la entrada del emparejamiento. */
function cruce(contablePorCuenta: Record<string, number>, consolidado: ClasificadorCruce[], extra?: { noModularPorCuenta?: Record<string, number> }) {
  return construirCruceContable({
    contablePorCuenta,
    noModularPorCuenta: extra?.noModularPorCuenta,
    consolidado,
    nombrePorCuenta: (c) => NOMBRES[c] ?? null,
    agruparMultiAsignados: true,
  });
}

const costo = (clasificador: string, total: number, cuentas4: string[]): ClasificadorCruce => ({ clasificador, total, cuentas4 });
const dep = (clasificador: string, total: number, cuentas4: string[]): ClasificadorCruce => ({ clasificador, total, cuentas4, relacionado: true });

describe("emparejarCedulaActivos", () => {
  it("funde la depreciación en el renglón del activo y presenta el neto", () => {
    const r = emparejarCedulaActivos(
      cruce({ "1516": 1_000, "159205": 300 }, [costo("EDIFICIOS", 1_000, ["1516"]), dep("EDIFICIOS · depreciación", 300, ["159205"])]),
      PARES,
    );
    expect(r.filas).toHaveLength(1);
    const f = r.filas[0];
    expect(f.cuenta4).toBe("1516");
    expect(f.columnas).toMatchObject({
      costo: { contable: 1_000, inventario: 1_000, diferencia: 0, cuadra: true },
      depreciacion: { contable: 300, inventario: 300, cuentas: ["159205"], diferencia: 0, cuadra: true },
    });
    // El neto es lo que concilia: 1.000 − 300 de cada lado.
    expect(f).toMatchObject({ contable: 700, inventario: 700, diferencia: 0, cuadra: true, estado: "cuadra" });
    expect(r.totales).toMatchObject({ contable: 700, inventario: 700, diferencia: 0 });
  });

  it("el renglón cuadra por el neto aunque las dos columnas estén cruzadas, y lo avisa", () => {
    const r = emparejarCedulaActivos(
      cruce({ "1516": 1_000, "159205": 300 }, [costo("EDIFICIOS", 900, ["1516"]), dep("EDIFICIOS · depreciación", 200, ["159205"])]),
      PARES,
    );
    const f = r.filas[0];
    expect(f).toMatchObject({ contable: 700, inventario: 700, diferencia: 0, cuadra: true });
    expect(f.columnas?.costo.diferencia).toBe(100);
    expect(f.columnas?.depreciacion.diferencia).toBe(100);
    expect(hayReclasificacionEntreColumnas(f)).toBe(true);
  });

  it("no avisa de reclasificación cuando el renglón ya no cuadra", () => {
    const r = emparejarCedulaActivos(
      cruce({ "1516": 1_000, "159205": 300 }, [costo("EDIFICIOS", 900, ["1516"])]),
      PARES,
    );
    const f = r.filas[0];
    expect(f).toMatchObject({ contable: 700, inventario: 900, diferencia: -200, cuadra: false });
    expect(hayReclasificacionEntreColumnas(f)).toBe(false);
  });

  it("un activo sin pareja conserva su renglón con la depreciación en cero", () => {
    const r = emparejarCedulaActivos(cruce({ "1504": 30_847_594_499 }, [costo("TERRENOS", 30_847_594_499, ["1504"])]), PARES);
    expect(r.filas[0]).toMatchObject({ cuenta4: "1504", contable: 30_847_594_499, inventario: 30_847_594_499, cuadra: true });
    expect(r.filas[0].columnas?.depreciacion).toMatchObject({ contable: 0, inventario: 0, cuentas: [] });
  });

  it("un activo sin depreciación en el módulo acusa la diferencia en el neto", () => {
    // La fila [1] de la cédula del usuario: el balance trae el costo y el módulo no trae nada.
    const r = emparejarCedulaActivos(cruce({ "1520": 107_957_790 }, []), PARES);
    expect(r.filas[0]).toMatchObject({ cuenta4: "1520", contable: 107_957_790, inventario: 0, diferencia: 107_957_790, estado: "solo_contable" });
  });

  it("una 1592 cuyo activo no tiene renglón abre el del activo, con el costo en cero", () => {
    const r = emparejarCedulaActivos(cruce({ "159205": 300 }, []), PARES);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ cuenta4: "1516", contable: -300, inventario: 0, diferencia: -300 });
    expect(r.filas[0].columnas).toMatchObject({ costo: { contable: 0 }, depreciacion: { contable: 300, cuentas: ["159205"] } });
  });

  it("una 1592 que ninguna pareja reclama queda en su propio renglón, restando del neto", () => {
    const r = emparejarCedulaActivos(cruce({ "1516": 1_000, "159299": 50 }, []), PARES);
    expect(r.filas.map((f) => f.cuenta4)).toEqual(["1516", "159299"]);
    // Sigue siendo depreciación aunque no esté en la relación: va a su columna y resta.
    expect(r.filas[1].columnas).toMatchObject({ costo: { contable: 0 }, depreciacion: { contable: 50 } });
    expect(r.filas[1]).toMatchObject({ contable: -50, nombre: "Depreciación de otros" });
    expect(r.totales.contable).toBe(950);
  });

  it("la depreciación de una fila agrupada se suma al grupo", () => {
    // El módulo trae un solo valor para 1516 y 1520 (la fila fusionada de la imagen).
    const r = emparejarCedulaActivos(
      cruce({ "1516": 900, "1520": 100, "159205": 200, "159210": 100 }, [
        costo("INMUEBLES", 1_000, ["1516", "1520"]),
        dep("INMUEBLES · depreciación", 300, ["159205", "159210"]),
      ]),
      PARES,
    );
    expect(r.filas).toHaveLength(1);
    const f = r.filas[0];
    expect(f.cuenta4).toBe("1516+1520");
    expect(f.columnas?.depreciacion).toMatchObject({ contable: 300, inventario: 300, cuentas: ["159205", "159210"] });
    expect(f).toMatchObject({ contable: 700, inventario: 700, cuadra: true });
    expect(r.sinEmparejar).toEqual([]);
  });

  it("una depreciación agrupada entre activos de renglones distintos no se parte y se informa", () => {
    const r = emparejarCedulaActivos(
      cruce({ "1516": 900, "1520": 100, "159205": 200, "159210": 100 }, [
        costo("EDIFICIOS", 900, ["1516"]),
        costo("MAQUINARIA", 100, ["1520"]),
        dep("TODO · depreciación", 300, ["159205", "159210"]),
      ]),
      PARES,
    );
    expect(r.sinEmparejar).toEqual(["159205+159210"]);
    expect(r.filas.map((f) => f.cuenta4)).toEqual(["1516", "1520", "159205+159210"]);
  });

  it("lo no modular de cada columna se resta del neto", () => {
    const r = emparejarCedulaActivos(
      cruce(
        { "1516": 1_000, "159205": 300 },
        [costo("EDIFICIOS", 800, ["1516"]), dep("EDIFICIOS · depreciación", 300, ["159205"])],
        { noModularPorCuenta: { "1516": 200 } },
      ),
      PARES,
    );
    const f = r.filas[0];
    // Bruta 700 − 500 = 200; excluidos 200 del costo, el renglón cuadra.
    expect(f).toMatchObject({ contable: 700, inventario: 500, noModular: 200, diferenciaBruta: 200, diferencia: 0, cuadra: true });
  });

  it("el saldo del módulo sin cuenta sigue al final, todo como costo", () => {
    const r = emparejarCedulaActivos(cruce({ "1516": 1_000 }, [costo("EDIFICIOS", 1_000, ["1516"]), costo("SIN ASIGNAR", 40, [])]), PARES);
    const ultima = r.filas[r.filas.length - 1];
    expect(ultima.cuenta4).toBe("SIN_CUENTA");
    expect(ultima.columnas).toMatchObject({ costo: { inventario: 40 }, depreciacion: { contable: 0, inventario: 0 } });
  });

  it("sin parejas configuradas devuelve el cruce intacto", () => {
    const base = cruce({ "1516": 1_000, "159205": 300 }, []);
    const r = emparejarCedulaActivos(base, new Map());
    expect(r.filas).toEqual(base.filas);
    expect(r.totales).toEqual(base.totales);
  });
});

describe("totalesColumnasActivos", () => {
  it("suma las dos columnas de todos los renglones", () => {
    const r = emparejarCedulaActivos(
      cruce({ "1504": 500, "1516": 1_000, "159205": 300, "1524": 200, "159215": 50 }, [
        costo("TERRENOS", 500, ["1504"]),
        costo("EDIFICIOS", 1_000, ["1516"]),
        dep("EDIFICIOS · depreciación", 300, ["159205"]),
        costo("OFICINA", 200, ["1524"]),
        dep("OFICINA · depreciación", 50, ["159215"]),
      ]),
      PARES,
    );
    const t = totalesColumnasActivos(r.filas);
    expect(t.costo).toMatchObject({ contable: 1_700, inventario: 1_700 });
    expect(t.depreciacion).toMatchObject({ contable: 350, inventario: 350 });
    // El neto de la cédula es la resta de los dos totales.
    expect(r.totales.contable).toBe(1_350);
  });
});
