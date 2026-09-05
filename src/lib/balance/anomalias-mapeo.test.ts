import { describe, it, expect } from "vitest";
import { detectarAnomaliasMapeo, planAlinearConGrupo, type CuentaMapeo } from "./anomalias-mapeo";

const cuenta = (
  code: string,
  cuenta6Russell: string | null,
  origenMapeo: string | null = "automatico",
  extra: Partial<Pick<CuentaMapeo, "coincidencia" | "actualizadoEn">> = {},
): CuentaMapeo => ({
  id: Number(code.slice(-6)), code, level: code.length >= 8 ? 8 : code.length === 6 ? 6 : 4,
  cuenta6Russell, coincidencia: null, origenMapeo, actualizadoEn: null, ...extra,
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

  it("usa una auxiliar como regla canónica cuando no existe fila exacta del grupo", () => {
    // Es el mismo criterio de construirConfigMapeoCliente: una fila aplicable también
    // puede gobernar su prefijo aunque no exista una cuenta física de seis dígitos.
    expect(detectarAnomaliasMapeo([cuenta("11200501", "112005")])).toEqual([]);
  });

  it("ignora las cuentas sin homologar y las que no son auxiliares", () => {
    expect(detectarAnomaliasMapeo([
      cuenta("1105", null),
      cuenta("110505", null),
      cuenta("11050501", null),
    ])).toEqual([]);
  });

  it("una fila de grupo sin estándar no invalida la regla aplicable de su auxiliar", () => {
    expect(detectarAnomaliasMapeo([
      cuenta("120535", null),
      cuenta("12053506", "129905"),
    ])).toEqual([]);
  });

  it("compara auxiliares contra la misma regla canónica aun sin fila de nivel 6", () => {
    const r = detectarAnomaliasMapeo([
      cuenta("12053501", "120595", "manual"),
      cuenta("12053506", "129905", "automatico"),
    ]);
    expect(r).toMatchObject([{
      code: "12053506", motivo: "divergente",
      cuenta6RussellDelGrupo: "120595", cruzaClase: false,
    }]);
  });

  it("respeta la recencia canónica antes que coincidencia e id", () => {
    const r = detectarAnomaliasMapeo([
      cuenta("12053501", "120595", "automatico", { coincidencia: 90, actualizadoEn: "2026-01-01T12:00:00.000Z" }),
      cuenta("12053502", "129905", "automatico", { coincidencia: 10, actualizadoEn: "2026-02-01T12:00:00.000Z" }),
    ]);
    expect(r).toMatchObject([{
      code: "12053501", motivo: "divergente",
      cuenta6RussellDelGrupo: "129905", cruzaClase: false,
    }]);
  });

  it("ordena primero los cruces de clase", () => {
    const r = detectarAnomaliasMapeo([
      cuenta("120535", "120595"), cuenta("12053506", "129905"),   // divergente, misma clase
      cuenta("729910", "720540", "manual"), cuenta("72991001", "260595", "manual"),   // cruza de clase, manual
    ]);
    expect(r.map((a) => a.code)).toEqual(["72991001", "12053506"]);
  });
});

describe("planAlinearConGrupo", () => {
  it("copia la regla MANUAL del grupo como manual al 100%, igual que propaga una regla de grupo", () => {
    // El caso de operación: 616560 → 151605 y 61656010 → 152005. Alinear deja la
    // auxiliar exactamente como sus hermanas.
    const plan = planAlinearConGrupo([
      cuenta("616560", "151605", "manual"),
      cuenta("61656010", "152005", "manual"),
    ], "61656010");
    expect(plan).toEqual({ cuenta6Russell: "151605", coincidencia: 100, origenMapeo: "manual", reglaCode: "616560" });
  });

  it("bajo un grupo AUTOMÁTICO queda automática con la coincidencia del grupo, nunca manual", () => {
    // Una fila `manual` aquí ganaría la elección del grupo (manual > automático) y
    // congelaría a todas sus hermanas en el estándar viejo: la trampa que se evita.
    const plan = planAlinearConGrupo([
      cuenta("120535", "120595", "automatico", { coincidencia: 92 }),
      cuenta("12053506", "129905", "automatico", { coincidencia: 60 }),
    ], "12053506");
    expect(plan).toEqual({ cuenta6Russell: "120595", coincidencia: 92, origenMapeo: "automatico", reglaCode: "120535" });
  });

  it("usa la misma regla canónica que la detección aunque no exista fila de nivel 6", () => {
    const cuentas = [
      cuenta("12053501", "120595", "automatico", { coincidencia: 90, actualizadoEn: "2026-01-01T12:00:00.000Z" }),
      cuenta("12053502", "129905", "automatico", { coincidencia: 10, actualizadoEn: "2026-02-01T12:00:00.000Z" }),
    ];
    const anomalia = detectarAnomaliasMapeo(cuentas)[0];
    const plan = planAlinearConGrupo(cuentas, anomalia.code);
    expect(anomalia.code).toBe("12053501");
    expect(plan?.cuenta6Russell).toBe(anomalia.cuenta6RussellDelGrupo);
    expect(plan).toMatchObject({ coincidencia: 10, origenMapeo: "automatico", reglaCode: "12053502" });
  });

  it("ignora excepciones y automáticas que cruzan de clase al elegir la regla del grupo", () => {
    const plan = planAlinearConGrupo([
      cuenta("416005", "616005", "automatico"),           // cruza de clase: no gobierna
      cuenta("41600501", "410530", "manual_cuenta"),     // excepción: no participa
      cuenta("41600502", "410505", "automatico", { coincidencia: 70 }),
      cuenta("41600503", "410595", "automatico", { coincidencia: 40 }),
    ], "41600503");
    expect(plan).toEqual({ cuenta6Russell: "410505", coincidencia: 70, origenMapeo: "automatico", reglaCode: "41600502" });
  });

  it("devuelve null cuando el grupo no tiene regla vigente", () => {
    expect(planAlinearConGrupo([cuenta("110505", null), cuenta("11050501", "110599")], "11050599")).toEqual({
      cuenta6Russell: "110599", coincidencia: null, origenMapeo: "automatico", reglaCode: "11050501",
    });
    expect(planAlinearConGrupo([cuenta("110505", null)], "11050501")).toBeNull();
    expect(planAlinearConGrupo([], "11050501")).toBeNull();
  });
});
