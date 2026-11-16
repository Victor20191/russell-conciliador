import { describe, expect, it } from "vitest";
import { alcanceDeCierres, alcanceSinRepetidos, cuentasBloqueoDelModulo, evaluarCambiosBloqueados, type FilaDetalleBloqueo } from "@/lib/conciliacion/cuentas-bloqueo";
import { alcanceCierreImpuesto, IVA, RETENCION } from "./impuestos-dian";
import { MAPEO_F350_FABRICA, cuentasDeMapeo } from "./mapeo-dian";
import { MAPEO_F300_FABRICA } from "./iva/mapeo-f300";

const cuentasDe = (mapeo: typeof MAPEO_F350_FABRICA) => [...new Set(mapeo.filter((f) => f.enCruce).flatMap((f) => cuentasDeMapeo(f)))];
const fila = (cuenta8: string, cuenta6Russell: string | null, saldoFinal: number): FilaDetalleBloqueo => ({
  cuenta8, cuenta6Russell, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal,
});

describe("alcance del cierre en firme de los impuestos DIAN", () => {
  it("Retención deja en firme 2365 y 2367 enteras: sus cuentas del cruce ya caen ahí", () => {
    expect(alcanceCierreImpuesto(RETENCION, cuentasDe(MAPEO_F350_FABRICA))).toEqual(["2365", "2367"]);
  });

  it("IVA deja en firme 2408 y 135517 enteras y, una por una, sus cuentas de ingresos del mapeo", () => {
    const alcance = alcanceCierreImpuesto(IVA, cuentasDe(MAPEO_F300_FABRICA));
    expect(alcance.slice(0, 2)).toEqual(["135517", "2408"]);
    expect(alcance).toEqual(expect.arrayContaining(["410505", "410510", "410525", "417505", "420505", "429595"]));
    // Nada de la 2408 ni la 41 o la 42 entera: solo las cuentas que el cruce concilia.
    expect(alcance.filter((c) => c.startsWith("2408") && c !== "2408")).toEqual([]);
    expect(alcance).not.toContain("41");
    expect(alcance).not.toContain("4105");
  });

  it("para mostrarlo, no repite lo que ya cubre un grupo más corto de la lista", () => {
    expect(alcanceSinRepetidos(["130505", "13", "2805", "280505", "1330", "22", "220505"])).toEqual(["13", "22", "2805"]);
    expect(alcanceSinRepetidos(["41", "420505", "410505", "4105"])).toEqual(["41", "420505"]);
    expect(alcanceSinRepetidos([])).toEqual([]);
  });

  it("sin cuentas en el cruce quedan igual los grupos enteros", () => {
    expect(alcanceCierreImpuesto(RETENCION, [])).toEqual(["2365", "2367"]);
  });

  it("con el alcance de Retención se bloquea también la cuenta de pagos (236599), que el cruce no concilia", () => {
    const detalle = [fila("23650501", "236505", -1_000), fila("23659901", "236599", 400), fila("23670501", "236705", -50), fila("24080501", "240805", -9)];
    const alcance = alcanceCierreImpuesto(RETENCION, ["236505", "236705"]);
    const bloqueadas = cuentasBloqueoDelModulo(detalle, ["2365", "2367"], alcance);
    expect(bloqueadas.map((b) => b.cuenta8)).toEqual(["23650501", "23659901", "23670501"]);
  });

  it("un balance nuevo no puede cambiar la cuenta de pagos ni traer otra cuenta 2365 con saldo", () => {
    const alcance = alcanceCierreImpuesto(RETENCION, ["236505"]);
    const bloqueadas = cuentasBloqueoDelModulo([fila("23650501", "236505", -1_000), fila("23659901", "236599", 400)], ["2365", "2367"], alcance);
    const cerradas = alcanceDeCierres([{ cuentasRussell: ["2365", "2367"], cuentasRussell6: alcance }]);
    const violaciones = evaluarCambiosBloqueados(
      bloqueadas,
      [fila("23650501", "236505", -1_000), fila("23659901", "236599", 450), fila("23651501", "236515", -20)],
      cerradas,
    );
    expect(violaciones.map((v) => `${v.cuenta8}:${v.motivo}`)).toEqual(["23659901:valores", "23651501:nueva_en_modulo"]);
  });
});
