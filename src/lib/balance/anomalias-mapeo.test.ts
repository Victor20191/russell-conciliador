import { describe, it, expect } from "vitest";
import { detectarAnomaliasMapeo, type CuentaMapeo } from "./anomalias-mapeo";

const cuenta = (code: string, cuenta6Russell: string | null, origenMapeo: string | null = "automatico"): CuentaMapeo => ({
  code, level: code.length >= 8 ? 8 : code.length === 6 ? 6 : 4, cuenta6Russell, origenMapeo,
});

describe("detectarAnomaliasMapeo", () => {
  it("no reporta la auxiliar que hereda la regla de su grupo", () => {
    // Es el 99,85% de los datos reales: si esto fallara, el filtro sería inútil.
    expect(detectarAnomaliasMapeo([
      cuenta("110505", "110505"),
      cuenta("11050501", "110505"),
      cuenta("11050502", "110505"),
    ])).toEqual([]);
  });

  it("reporta la divergencia MANUAL que cruza de clase: esa sí gobierna", () => {
    // Caso real de ABC CORPORATION: un gasto homologado contra un activo, a mano.
    const r = detectarAnomaliasMapeo([
      cuenta("616560", "151605", "manual"),
      cuenta("61656010", "152005", "manual"),
    ]);
    expect(r).toEqual([{
      code: "61656010", motivo: "divergente",
      cuenta6Russell: "152005", cuenta6RussellDelGrupo: "151605", cruzaClase: true,
    }]);
  });

  it("NO reporta la automática que cruza de clase: `reglaMapeoAplicable` ya la descarta", () => {
    // Caso real de GRUPO FORMARTE: la memoria guarda 4160050115 → 616005 (ingreso →
    // costo) por un acierto flojo de la cascada, pero esa fila nunca llega a aplicarse:
    // la cuenta vuelve al barrido y el balance queda en 410530. Marcarla sería reportar
    // algo que no ocurre — eran 12 de 21 sobre los datos reales.
    expect(detectarAnomaliasMapeo([
      cuenta("416005", "410530"),
      cuenta("4160050115", "616005"),
    ])).toEqual([]);
  });

  it("reporta la divergencia dentro de la misma clase, sin marcarla como cruce", () => {
    // Caso real de IGB: sigue siendo activo, pero no es lo que dice su grupo. Como no
    // cruza de clase, gobierna aunque sea automatica.
    const r = detectarAnomaliasMapeo([
      cuenta("120535", "120595"),
      cuenta("12053506", "129905"),
    ]);
    expect(r).toMatchObject([{ code: "12053506", motivo: "divergente", cruzaClase: false }]);
  });

  it("NO reporta una excepción declarada a mano: es legítima y ya se ve en la vista editable", () => {
    expect(detectarAnomaliasMapeo([
      cuenta("120535", "120595"),
      cuenta("12053506", "129905", "manual_cuenta"),
    ])).toEqual([]);
  });

  it("reporta la auxiliar cuyo grupo no existe en la memoria", () => {
    const r = detectarAnomaliasMapeo([cuenta("11200501", "112005")]);
    expect(r).toEqual([{
      code: "11200501", motivo: "sin-grupo",
      cuenta6Russell: "112005", cuenta6RussellDelGrupo: null, cruzaClase: false,
    }]);
  });

  it("ignora las cuentas sin homologar y las que no son auxiliares", () => {
    expect(detectarAnomaliasMapeo([
      cuenta("1105", null),
      cuenta("110505", null),
      cuenta("11050501", null),
    ])).toEqual([]);
  });

  it("un grupo sin estándar asignado deja a sus auxiliares como «sin-grupo»", () => {
    // La fila del grupo existe pero no homologa: no hay regla que heredar.
    const r = detectarAnomaliasMapeo([cuenta("120535", null), cuenta("12053506", "129905")]);
    expect(r).toMatchObject([{ code: "12053506", motivo: "sin-grupo" }]);
  });

  it("ordena primero los cruces de clase", () => {
    const r = detectarAnomaliasMapeo([
      cuenta("120535", "120595"), cuenta("12053506", "129905"),   // divergente, misma clase
      cuenta("729910", "720540", "manual"), cuenta("72991001", "260595", "manual"),   // cruza de clase, manual
    ]);
    expect(r.map((a) => a.code)).toEqual(["72991001", "12053506"]);
  });
});
