import { describe, expect, it } from "vitest";
import { alcanceCruceTercero, CUENTA_ARCHIVO_VACIA, type EntradaAlcanceTercero } from "./alcance-cruce-tercero";
import type { MovimientoContableTercero, SaldoModuloTercero } from "./cruce-tercero-cartera";

const contable = (clave: string | null, cuenta6: string, valor: number): MovimientoContableTercero =>
  ({ clave, cuenta6, valor, nombre: null });
const modulo = (clave: string | null, saldo: number, extra: Partial<SaldoModuloTercero> & { cuentas6?: string[] } = {}) =>
  ({ clave, saldo, nombre: null, origenCartera: null, cuenta6: extra.cuentas6?.[0] ?? null, ...extra });

const base = (extra: Partial<EntradaAlcanceTercero> = {}): EntradaAlcanceTercero => ({
  cuentasModulo: [
    { cuenta: "220505", origen: "nacional" },
    { cuenta: "221005", origen: "exterior" },
    { cuenta: "233595", origen: null },
  ],
  cuentasPeriodo: [],
  fueraDePrefijos: new Set(),
  nombres: new Map([["220505", "Proveedores nacionales"], ["220510", "Otros proveedores"]]),
  contable: [],
  modulo: [],
  ...extra,
});

describe("alcanceCruceTercero", () => {
  it("lista todas las cuentas del módulo, también las que están en cero", () => {
    const r = alcanceCruceTercero(base({ contable: [contable("900", "220505", 100)] }));
    expect(r.cuentas.map((c) => c.cuenta)).toEqual(["220505", "221005", "233595"]);
    expect(r.cuentas[0]).toMatchObject({ nombre: "Proveedores nacionales", origen: "nacional", fuente: "modulo", contable: { total: 100, terceros: 1, sinTercero: 0 } });
    expect(r.cuentas[1]).toMatchObject({ origen: "exterior", contable: { total: 0, terceros: 0 }, auxiliar: { total: 0, terceros: 0 } });
  });

  it("marca las cuentas asignadas solo para el período y las de la lista fuera de los prefijos", () => {
    const r = alcanceCruceTercero(base({
      cuentasModulo: [{ cuenta: "220505", origen: null }, { cuenta: "251010", origen: null }],
      cuentasPeriodo: ["210510"],
      fueraDePrefijos: new Set(["251010"]),
    }));
    expect(r.cuentas.map((c) => [c.cuenta, c.fuente, c.fueraDePrefijos])).toEqual([
      ["210510", "periodo", false],
      ["220505", "modulo", false],
      ["251010", "modulo", true],
    ]);
  });

  it("separa en el balance lo que entra, la fila sin tercero y las cuentas del grupo que no son del módulo", () => {
    const r = alcanceCruceTercero(base({
      contable: [
        contable("900", "220505", 100),
        contable("901", "220505", 50),
        contable("902", "220505", 0),
        contable(null, "233595", 30),
        contable("903", "220510", 70),
        contable(null, "220510", 5),
      ],
    }));
    expect(r.cuentas[0].contable).toEqual({ total: 150, terceros: 2, sinTercero: 0 });
    expect(r.cuentas[2].contable).toEqual({ total: 0, terceros: 0, sinTercero: 30 });
    expect(r.fueraDelModulo).toEqual([{ cuenta: "220510", nombre: "Otros proveedores", total: 75, terceros: 1 }]);
  });

  it("atribuye el auxiliar a la cuenta asignada a su cuenta del archivo", () => {
    const r = alcanceCruceTercero(base({
      contable: [contable("900", "220505", 150)],
      modulo: [
        modulo("900", 100, { cuentas6: ["220505"], cuentaArchivo: "22050501" }),
        modulo("901", 40, { cuentas6: ["220505"], cuentaArchivo: "22050502" }),
        modulo(null, 7, { cuentas6: ["220505"], cuentaArchivo: "22050501" }),
      ],
    }));
    expect(r.cuentas[0].auxiliar).toEqual({ total: 140, terceros: 2, sinTercero: 7, cuentasArchivo: ["22050501", "22050502"] });
    expect(r.cuentas[0].grupo).toBeNull();
    expect(r.grupos).toEqual([]);
  });

  it("agrupa las cuentas asignadas juntas y encadena los grupos que comparten una cuenta", () => {
    const r = alcanceCruceTercero(base({
      contable: [contable("900", "220505", 100), contable("902", "221005", 50), contable("902", "233595", 10)],
      modulo: [
        // Auxiliar sin columna de cuenta: todo cae en el renglón «(sin clasificar)» del Consolidado.
        modulo("902", 60, { cuentas6: ["221005", "233595"], cuentaArchivo: null }),
        modulo("900", 90, { cuentas6: ["220505", "221005"], cuentaArchivo: "GLOBAL" }),
        modulo("903", 5, { cuentas6: ["233595"], cuentaArchivo: "23359501" }),
      ],
    }));
    expect(r.cuentas.map((c) => c.grupo)).toEqual([0, 0, 0]);
    expect(r.grupos).toEqual([{
      cuentas: ["220505", "221005", "233595"],
      contable: { total: 160, terceros: 2 },
      auxiliar: { total: 155, terceros: 3, sinTercero: 0 },
      compartido: 150,
      cuentasArchivo: ["(sin clasificar)", "GLOBAL"],
    }]);
    expect(r.cuentas[2].auxiliar).toMatchObject({ total: 5, cuentasArchivo: ["23359501"] });
  });

  it("reporta las cuentas del archivo sin una cuenta del módulo asignada", () => {
    const r = alcanceCruceTercero(base({
      modulo: [
        modulo("900", 100, { sinCuentaDelModulo: true, cuentaArchivo: "23359501" }),
        modulo("901", 20, { sinCuentaDelModulo: true, cuentaArchivo: "23359501" }),
        modulo("902", 9, { sinCuentaDelModulo: true, cuentaArchivo: null }),
      ],
    }));
    expect(r.archivoSinAsignar).toEqual([
      { cuentaArchivo: CUENTA_ARCHIVO_VACIA, total: 9, terceros: 1 },
      { cuentaArchivo: "23359501", total: 120, terceros: 2 },
    ]);
    expect(r.cuentas.every((c) => c.auxiliar.total === 0)).toBe(true);
  });

  it("sin lista del módulo toma las cuentas del balance y no desglosa un auxiliar sin cuentas", () => {
    const r = alcanceCruceTercero(base({
      cuentasModulo: null,
      contable: [contable("900", "413505", 10), contable("901", "414005", 5)],
      modulo: [modulo("900", 10), modulo("901", 5)],
    }));
    expect(r.cuentas.map((c) => c.cuenta)).toEqual(["413505", "414005"]);
    expect(r.fueraDelModulo).toEqual([]);
    expect(r.auxiliarSinDesglose).toEqual({ total: 15, terceros: 2, sinTercero: 0 });
  });
});
