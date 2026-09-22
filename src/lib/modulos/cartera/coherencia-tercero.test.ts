import { describe, expect, it } from "vitest";
import { construirCruceTerceroCartera, type MovimientoContableTercero, type SaldoModuloTercero } from "./cruce-tercero-cartera";
import { nombresParecidos, notaDeSugerencia, senalIdentificador, sugerirEmparejamientosTercero } from "./coherencia-tercero";

const CAR = ["130505", "130510", "280505"];

const contable = (clave: string | null, valor: number, nombre: string | null = null, cuenta6 = "130505"): MovimientoContableTercero =>
  ({ clave, cuenta6, valor, nombre });
const modulo = (clave: string | null, saldo: number, nombre: string | null = null, extra: Partial<SaldoModuloTercero> = {}): SaldoModuloTercero =>
  ({ clave, saldo, nombre, origenCartera: null, cuenta6: null, ...extra });

const cruce = (c: MovimientoContableTercero[], m: SaldoModuloTercero[], separaciones?: { claveModulo: string; claveBalance: string }[]) =>
  construirCruceTerceroCartera({ contable: c, modulo: m, cuentasModulo: CAR, separaciones });

describe("señales", () => {
  it("distingue NIT con DV, NIT con sufijo y mismos nueve dígitos", () => {
    expect(senalIdentificador("41954149", "419541491")).toBe("nit_dv"); // DV de 41954149 = 1
    expect(senalIdentificador("419541491", "41954149")).toBe("nit_dv");
    expect(senalIdentificador("41954149", "419541495")).toBe("nit_prefijo"); // 5 no es el DV
    expect(senalIdentificador("900123456", "90012345601")).toBe("nit_prefijo"); // sucursal 01
    expect(senalIdentificador("900123456", "900123456011")).toBe("nucleo"); // tres de más, pero comparten los nueve
    expect(senalIdentificador("12345678", "12345678011")).toBeNull(); // tres dígitos de más sin núcleo común: otro documento
    expect(senalIdentificador("1128385972", "1128385973")).toBe("nucleo");
    expect(senalIdentificador("900123456", "900123456")).toBeNull();
    expect(senalIdentificador("~ACME", "900123456")).toBeNull();
  });

  it("compara nombres por tokens: contenido, parecido y distinto", () => {
    expect(nombresParecidos("RACING MOSTER/GAITAN REYES LINA MARCELA", "GAITAN REYES LINA MARCELA")).toBe(true);
    expect(nombresParecidos("APORTES EN LÍNEA S.A.", "Aportes en Linea SAS")).toBe(true);
    expect(nombresParecidos("BOTIA PIRATOVA DAVID FELIPE", "BOTIA PIRATOVA DAVID")).toBe(true);
    expect(nombresParecidos("EMPAQUETADURAS DARROW SAS", "SOTO PIEDRAHITA ESTEFANY")).toBe(false);
    expect(nombresParecidos("DE LA", "LA DE")).toBe(false); // sin tokens con peso
    expect(nombresParecidos(null, "ALGO")).toBe(false);
  });
});

describe("sugerirEmparejamientosTercero", () => {
  it("propone por saldo idéntico y NIT con sufijo, con confianza alta", () => {
    // 419541495: el 5 no es el DV de 41954149 (sería 1), así que no se une solo; es un sufijo.
    const r = cruce(
      [contable("419541495", 1_000_000, "ACME SAS"), contable("800000001", 50, "OTRO")],
      [modulo("41954149", 1_000_000, "ACME S.A.S."), modulo("700000001", 20, "NADIE")],
    );
    expect(r.porDv).toBe(0);
    expect(r.porNucleo).toBe(0);
    expect(r.sugerencias).toEqual([{
      claveModulo: "41954149",
      nombreModulo: "ACME S.A.S.",
      saldoModulo: 1_000_000,
      claveBalance: "419541495",
      nombreBalance: "ACME SAS",
      saldoContable: 1_000_000,
      senales: ["nit_prefijo", "saldo", "nombre"],
      confianza: "alta",
    }]);
    expect(r.filas.find((f) => f.clave === "41954149")?.sugerencia).toMatchObject({ clave: "419541495", confianza: "alta" });
    expect(r.filas.find((f) => f.clave === "419541495")?.sugerencia).toMatchObject({ clave: "41954149", confianza: "alta" });
  });

  it("solo el saldo, si es único en cada lado, es una propuesta de confianza media", () => {
    const r = cruce(
      [contable("435145978", 10_886_932), contable("890903938", -8_205_295)],
      [modulo("~CLIENTE X", 10_886_932, "CLIENTE X"), modulo("~CLIENTE Y", 5, "CLIENTE Y")],
    );
    expect(r.sugerencias).toEqual([expect.objectContaining({ claveModulo: "~CLIENTE X", claveBalance: "435145978", senales: ["saldo"], confianza: "media" })]);
  });

  it("un saldo repetido en un lado no cuenta como señal", () => {
    const r = cruce(
      [contable("100000001", 500), contable("100000002", 500)],
      [modulo("~UNO", 500, "UNO")],
    );
    expect(r.sugerencias).toEqual([]);
  });

  it("no propone cuando hay empate entre candidatos ni cuando la propuesta no es recíproca", () => {
    // Dos terceros del balance con el mismo nombre y sin saldo en común: empate → nada.
    const empate = cruce(
      [contable("900000001", 10, "BANCOLOMBIA S.A."), contable("900000002", 20, "Bancolombia SA")],
      [modulo("~BANCOLOMBIA", 30, "BANCOLOMBIA")],
    );
    expect(empate.sugerencias).toEqual([]);

    // El del auxiliar prefiere A (dos señales), pero A prefiere a otro del auxiliar con más señales.
    const noReciproco = cruce(
      [contable("419541495", 1_000, "ACME SAS")],
      [modulo("~ACME", 1_000, "ACME"), modulo("41954149", 1_000, "ACME SAS")],
    );
    // 41954149 (sufijo + nombre; el saldo 1.000 está repetido en el auxiliar) gana a ~ACME (solo nombre).
    expect(noReciproco.sugerencias).toEqual([expect.objectContaining({ claveModulo: "41954149", claveBalance: "419541495", senales: ["nit_prefijo", "nombre"] })]);
  });

  it("no propone lo que ya se unió por DV ni lo que el auditor separó", () => {
    const unido = cruce([contable("419541491", 100)], [modulo("41954149", 100, "GAITAN REYES LINA")]);
    expect(unido.porDv).toBe(1);
    expect(unido.sugerencias).toEqual([]);

    const separado = cruce(
      [contable("419541491", 100)],
      [modulo("41954149", 100, "GAITAN REYES LINA")],
      [{ claveModulo: "41954149", claveBalance: "419541491" }],
    );
    expect(separado.porDv).toBe(0);
    expect(separado.sugerencias).toEqual([]);
    expect(separado.filas.map((f) => [f.clave, f.estado, f.separadoDe])).toEqual([["41954149", "solo_modulo", []], ["419541491", "solo_contable", ["41954149"]]]);
  });

  it("ordena por confianza y saldo, y la nota deja las señales en palabras", () => {
    const r = cruce(
      [contable("419541495", 100, "ACME SAS"), contable("435145978", 10_000)],
      [modulo("41954149", 100, "ACME S.A.S."), modulo("~CLIENTE X", 10_000, "CLIENTE X")],
    );
    expect(r.sugerencias.map((s) => [s.claveModulo, s.confianza])).toEqual([["41954149", "alta"], ["~CLIENTE X", "media"]]);
    expect(notaDeSugerencia(r.sugerencias[0])).toBe("Validación de coherencia (confianza alta): NIT con sufijo, mismo saldo, nombre parecido.");
  });

  it("acepta filas sueltas directamente", () => {
    const r = cruce([contable("435145978", 10_886_932)], [modulo("~CLIENTE X", 10_886_932, "CLIENTE X")]);
    for (const f of r.filas) f.sugerencia = null;
    expect(sugerirEmparejamientosTercero(r.filas)).toHaveLength(1);
    expect(sugerirEmparejamientosTercero(r.filas.filter((f) => f.estado === "solo_contable"))).toEqual([]);
  });
});
