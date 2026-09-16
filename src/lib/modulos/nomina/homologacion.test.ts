import { describe, expect, it } from "vitest";
import { CUENTAS_RUSSELL_NOMINA, MODULOS_IMPORT } from "../descriptores";
import { cuentasCedula6 } from "../cuentas-modulo";
import {
  claseDeCuentaCliente,
  codigoConceptoCanonico,
  cuentaPorGrupo,
  cuentaRussellPorEstructura,
  destinoDeCuentaCliente,
  esCuentaComodin,
  resolverCuentaClienteARussell,
  resolverCuentaConcepto,
  sinClaseDeGasto,
  subcuentaPucDe,
  sugerirClaseAgrupador,
  sugerirReparto,
  transponerClase,
  type ContextoHomologacion,
} from "./homologacion";

const ctxVacio: ContextoHomologacion = { memoria: [], cuentasRussell6: CUENTAS_RUSSELL_NOMINA };

describe("codigoConceptoCanonico", () => {
  it("quita espacios y ceros a la izquierda de los códigos numéricos", () => {
    expect(codigoConceptoCanonico(" 01 ")).toBe("1");
    expect(codigoConceptoCanonico("001")).toBe("1");
    expect(codigoConceptoCanonico("207")).toBe("207");
    expect(codigoConceptoCanonico(1)).toBe("1");
    expect(codigoConceptoCanonico("000")).toBe("0");
    expect(codigoConceptoCanonico("1.0")).toBe("1");
  });
  it("conserva los códigos con letras", () => {
    expect(codigoConceptoCanonico("A01")).toBe("A01");
    expect(codigoConceptoCanonico(" HED ")).toBe("HED");
    expect(codigoConceptoCanonico("")).toBe("");
  });
});

describe("estructura de la cuenta del cliente", () => {
  it("subcuentaPucDe y claseDeCuentaCliente", () => {
    expect(subcuentaPucDe("51050601")).toBe("06");
    expect(subcuentaPucDe("520518")).toBe("18");
    expect(subcuentaPucDe("0005060000")).toBe("06");
    expect(subcuentaPucDe("5105")).toBeNull();
    expect(claseDeCuentaCliente("51050601")).toBe("51");
    expect(claseDeCuentaCliente("0005060000")).toBeNull();
    expect(claseDeCuentaCliente("23703001")).toBe("23");
  });
  it("comodines y destino", () => {
    expect(esCuentaComodin("8888")).toBe(true);
    expect(esCuentaComodin("999")).toBe(true);
    expect(esCuentaComodin("51050601")).toBe(false);
    expect(destinoDeCuentaCliente("51050601")).toBe("gasto");
    expect(destinoDeCuentaCliente("72050501")).toBe("gasto");
    expect(destinoDeCuentaCliente("0005060000")).toBe("gasto");
    expect(destinoDeCuentaCliente("23703001")).toBe("control");
    expect(destinoDeCuentaCliente("13659500")).toBe("control");
    expect(destinoDeCuentaCliente("42100502")).toBe("control");
  });
});

describe("transponerClase / cuentaPorGrupo", () => {
  it("5105 ↔ 5205 comparten sufijo; 7205 numera por posición; 73 es una sola cuenta", () => {
    expect(transponerClase("510506", "52")).toBe("520506");
    expect(transponerClase("510506", "72")).toBe("720505");
    expect(transponerClase("510530", "72")).toBe("720510");
    expect(transponerClase("510536", "72")).toBe("720515");
    expect(transponerClase("510539", "72")).toBe("720520");
    expect(transponerClase("510568", "72")).toBe("720525");
    expect(transponerClase("510569", "72")).toBe("720530");
    expect(transponerClase("510570", "72")).toBe("720535");
    expect(transponerClase("510595", "72")).toBe("720540");
    expect(transponerClase("720510", "51")).toBe("510530");
    expect(transponerClase("720540", "52")).toBe("520595");
    expect(transponerClase("520506", "73")).toBe("730505");
    expect(transponerClase("730505", "51")).toBe("510506");
  });
  it("devuelve null fuera del gasto de personal", () => {
    expect(transponerClase("130505", "51")).toBeNull();
    expect(transponerClase("5105", "51")).toBeNull();
  });
  it("cuentaPorGrupo con los sufijos del catálogo", () => {
    expect(cuentaPorGrupo("sueldos", "51")).toBe("510506");
    expect(cuentaPorGrupo("horas_extras", "52")).toBe("520506");
    expect(cuentaPorGrupo("cesantias", "72")).toBe("720510");
    expect(cuentaPorGrupo("prima", "51")).toBe("510536");
    expect(cuentaPorGrupo("vacaciones", "52")).toBe("520539");
    expect(cuentaPorGrupo("aportes_eps", "72")).toBe("720530");
    expect(cuentaPorGrupo("auxilio_transporte", "51")).toBe("510595");
    expect(cuentaPorGrupo("bonificaciones", "73")).toBe("730505");
    expect(cuentaPorGrupo("inexistente", "51")).toBeNull();
  });
  it("todas las cuentas por grupo y clase pertenecen al módulo (D1)", () => {
    for (const grupo of ["sueldos", "cesantias", "prima", "vacaciones", "aportes_arl", "aportes_eps", "aportes_pension", "otros"]) {
      for (const clase of ["51", "52", "72", "73"] as const) {
        expect(CUENTAS_RUSSELL_NOMINA, `${grupo}/${clase}`).toContain(cuentaPorGrupo(grupo, clase));
      }
    }
  });
});

describe("cuentaRussellPorEstructura / resolverCuentaClienteARussell", () => {
  it("deriva por clase + subcuenta PUC", () => {
    expect(cuentaRussellPorEstructura("52050601")).toBe("520506");
    expect(cuentaRussellPorEstructura("72051501")).toBe("720505");
    expect(cuentaRussellPorEstructura("51053001")).toBe("510530");
    expect(cuentaRussellPorEstructura("51052703")).toBe("510595");
    expect(cuentaRussellPorEstructura("72056901")).toBe("720530");
    expect(cuentaRussellPorEstructura("61050506")).toBeNull();
    expect(cuentaRussellPorEstructura("0005060000")).toBeNull();
    expect(cuentaRussellPorEstructura("23703001")).toBeNull();
  });
  it("la memoria del balance manda sobre la estructura", () => {
    const mapeo = new Map([["51052703", "510506"], ["520506", "520595"]]);
    expect(resolverCuentaClienteARussell("51052703", mapeo)).toEqual({ cuenta6: "510506", origen: "balance" });
    expect(resolverCuentaClienteARussell("52050601", mapeo)).toEqual({ cuenta6: "520595", origen: "balance" });
    expect(resolverCuentaClienteARussell("72050601", mapeo)).toEqual({ cuenta6: "720505", origen: "estructura" });
    expect(resolverCuentaClienteARussell("8888", mapeo)).toBeNull();
  });
});

describe("sugerirClaseAgrupador", () => {
  it.each([
    ["GYA", "51"], ["ADMON", "51"], ["GA", "51"], ["CA", "51"], ["Administrativo", "51"], ["51", "51"], ["5105", "51"],
    ["GV", "52"], ["CV", "52"], ["VENTAS", "52"], ["Gasto de venta", "52"], ["52", "52"],
    ["MOD", "72"], ["CP", "72"], ["PRODUCCIÓN", "72"], ["Planta", "72"], ["72", "72"],
    ["MOI", "73"], ["73", "73"],
  ])("«%s» → %s", (v, esperado) => {
    expect(sugerirClaseAgrupador(v)).toBe(esperado);
  });
  it("no adivina con centros numéricos sin clase", () => {
    expect(sugerirClaseAgrupador("1")).toBeNull();
    expect(sugerirClaseAgrupador("10")).toBeNull();
    expect(sugerirClaseAgrupador("AS")).toBeNull();
    expect(sugerirClaseAgrupador("")).toBeNull();
  });
});

describe("resolverCuentaConcepto", () => {
  it("vía 1: cuenta del archivo homologada en el balance", () => {
    const r = resolverCuentaConcepto(
      { clasificador: "1", nombre: "BASICO", cuentaArchivo: "51050601" },
      { ...ctxVacio, mapeoCliente: new Map([["510506", "510506"]]) },
    );
    expect(r).toMatchObject({ cuentas: ["510506"], via: "archivo", destino: "gasto", clase: "51", grupo: "sueldos", subcuentaPuc: "06", cuentaCliente: "51050601" });
  });

  it("vía 1: cuenta del archivo sin memoria del balance se deriva por estructura", () => {
    const r = resolverCuentaConcepto({ clasificador: "23", nombre: "GASTOS DE TRANSPORTE", cuentaArchivo: "51052703" }, ctxVacio);
    expect(r).toMatchObject({ cuentas: ["510595"], via: "archivo", destino: "gasto", grupo: "auxilio_transporte", subcuentaPuc: "27" });
    expect(r.motivo).toMatch(/estructura/);
  });

  it("vía 1: cuenta de pasivo va al control de deducciones", () => {
    const r = resolverCuentaConcepto({ clasificador: "234", nombre: "CREDITO OPTICA", cuentaArchivo: "2370300300" }, ctxVacio);
    expect(r).toMatchObject({ cuentas: [], via: "archivo", destino: "control", cuentaCliente: "2370300300", subcuentaPuc: "30" });
  });

  it("vía 1 (Buk): la columna de la clase del agrupador", () => {
    const r = resolverCuentaConcepto(
      { clasificador: "Sueldo", agrupador: "MOD", cuentasPorClaseArchivo: { "51": "51050601", "72": "72050601" } },
      { ...ctxVacio, reglasClase: new Map([["MOD", "72"]]) },
    );
    expect(r).toMatchObject({ cuentas: ["720505"], via: "archivo", clase: "72" });
  });

  it("vía 2: memoria exacta (concepto, agrupador)", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [
        { clasificador: "100", agrupador: "CA", cuenta6: "510506" },
        { clasificador: "100", agrupador: "CV", cuenta6: "520506" },
      ],
    };
    expect(resolverCuentaConcepto({ clasificador: "100", agrupador: "CV" }, ctx)).toMatchObject({ cuentas: ["520506"], via: "memoria_exacta", clase: "52" });
    expect(resolverCuentaConcepto({ clasificador: "100", agrupador: "ca" }, ctx)).toMatchObject({ cuentas: ["510506"], via: "memoria_exacta" });
  });

  it("vía 3: memoria base + regla de clase transpone la cuenta", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [{ clasificador: "18", agrupador: "", cuenta6: "510539", grupo: "vacaciones" }],
      reglasClase: new Map([["CP", "72"], ["GV", "52"]]),
    };
    expect(resolverCuentaConcepto({ clasificador: "018", agrupador: "CP" }, ctx)).toMatchObject({ cuentas: ["720520"], via: "memoria_clase", clase: "72", grupo: "vacaciones" });
    expect(resolverCuentaConcepto({ clasificador: "18", agrupador: "GV" }, ctx)).toMatchObject({ cuentas: ["520539"], via: "memoria_clase" });
    // Sin regla para el agrupador: la memoria base tal cual.
    expect(resolverCuentaConcepto({ clasificador: "18", agrupador: "XX" }, ctx)).toMatchObject({ cuentas: ["510539"], via: "memoria_exacta" });
  });

  it("vía 4: memoria con varias cuentas y sin regla → multi (reparto)", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [
        { clasificador: "1", agrupador: "", cuenta6: "510506" },
        { clasificador: "1", agrupador: "", cuenta6: "520506" },
      ],
    };
    const r = resolverCuentaConcepto({ clasificador: "1", agrupador: "10" }, ctx);
    expect(r).toMatchObject({ cuentas: ["510506", "520506"], via: "multi", destino: "gasto" });
  });

  it("Kakaraka (SIIGO clase «00»): la memoria trae subcuenta sin clase → candidatas por clase", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [{ clasificador: "1", agrupador: "", cuenta6: "", cuentaCliente: "0005060000", grupo: "sueldos", subcuentaPuc: "06" }],
    };
    const r = resolverCuentaConcepto({ clasificador: "01", nombre: "SALARIO BASICO" }, ctx);
    expect(r.via).toBe("multi");
    expect(r.cuentas).toEqual(["510506", "520506", "720505", "730505"]);
    expect(r.subcuentaPuc).toBe("06");
    // Con regla de clase, se decide.
    const conRegla = resolverCuentaConcepto({ clasificador: "1" }, { ...ctx, reglasClase: new Map([["5", "52"]]) });
    expect(conRegla.via).toBe("multi"); // sin agrupador no hay regla aplicable
    const conAgrupador = resolverCuentaConcepto({ clasificador: "1", agrupador: "5" }, { ...ctx, reglasClase: new Map([["5", "52"]]) });
    expect(conAgrupador).toMatchObject({ cuentas: ["520506"], via: "memoria_clase", clase: "52" });
  });

  it("memoria de control (libranza a pasivo)", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [{ clasificador: "202", agrupador: "", cuenta6: "", cuentaCliente: "2370300100", subcuentaPuc: "30" }],
    };
    expect(resolverCuentaConcepto({ clasificador: "202" }, ctx)).toMatchObject({ cuentas: [], destino: "control", cuentaCliente: "2370300100" });
  });

  it("vía 5: sugerencia por nombre, clase 51 por defecto o la de la regla", () => {
    expect(resolverCuentaConcepto({ clasificador: "X", nombre: "Prima de servicios" }, ctxVacio)).toMatchObject({ cuentas: ["510536"], via: "sugerido_nombre", clase: "51", grupo: "prima" });
    expect(resolverCuentaConcepto({ clasificador: "X", nombre: "Cesantías", agrupador: "MOD" }, { ...ctxVacio, reglasClase: new Map([["MOD", "72"]]) })).toMatchObject({ cuentas: ["720510"], via: "sugerido_nombre", clase: "72" });
  });

  it("sin nada → sin_cuenta", () => {
    expect(resolverCuentaConcepto({ clasificador: "999", nombre: "PRESTAMO EMPLEADOS" }, ctxVacio)).toMatchObject({ cuentas: [], via: "sin_cuenta", destino: null });
  });
});

describe("sugerirReparto", () => {
  it("proporcional al movimiento del balance y con Σ exacta", () => {
    const r = sugerirReparto(1_000_001, { "510506": 300, "520506": 700 });
    expect(r["510506"] + r["520506"]).toBe(1_000_001);
    expect(r["520506"]).toBe(700_001);
    expect(r["510506"]).toBe(300_000);
  });
  it("sin movimiento reparte por partes iguales", () => {
    expect(sugerirReparto(100, { a: 0, b: 0 })).toEqual({ a: 50, b: 50 });
    expect(sugerirReparto(100, {})).toEqual({});
  });
  it("valores negativos del balance cuentan por su magnitud", () => {
    const r = sugerirReparto(-900, { a: -100, b: 200 });
    expect(r).toEqual({ a: -300, b: -600 });
  });
});

describe("destino «fuera» y memoria de otros centros", () => {
  it("INCODOL: la memoria del centro AS va a 61 (asistencial), que el módulo no concilia", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [
        { clasificador: "100", agrupador: "AS", cuenta6: "", cuentaCliente: "61050506", subcuentaPuc: "05", grupo: "sueldos" },
        { clasificador: "100", agrupador: "CA", cuenta6: "510506", cuentaCliente: "51050601", grupo: "sueldos" },
      ],
    };
    expect(resolverCuentaConcepto({ clasificador: "100", agrupador: "AS", nombre: "SALARIO BASICO" }, ctx)).toMatchObject({ cuentas: [], via: "memoria_exacta", destino: "fuera", cuentaCliente: "61050506" });
    expect(resolverCuentaConcepto({ clasificador: "100", agrupador: "CA" }, ctx)).toMatchObject({ cuentas: ["510506"], via: "memoria_exacta", destino: "gasto" });
    // Cuenta del archivo de clase 61 → fuera, no «sin cuenta».
    expect(resolverCuentaConcepto({ clasificador: "X", cuentaArchivo: "61050506" }, ctxVacio)).toMatchObject({ via: "archivo", destino: "fuera" });
  });

  it("KP: el catálogo viene por ÁREA y el archivo trae el centro de costo → memoria de otros centros", () => {
    const ctx: ContextoHomologacion = {
      ...ctxVacio,
      memoria: [
        { clasificador: "1", agrupador: "ADMON", cuenta6: "510506", cuentaCliente: "51050601" },
        { clasificador: "1", agrupador: "PRODUCCIÓN", cuenta6: "720505", cuentaCliente: "72050601" },
        { clasificador: "23", agrupador: "ADMON", cuenta6: "510595", cuentaCliente: "51052703" },
      ],
      reglasClase: new Map([["100602 - SELLADORES", "72"]]),
    };
    // Sin regla para el centro y dos cuentas distintas: reparto.
    expect(resolverCuentaConcepto({ clasificador: "1", agrupador: "100101 - DIRECTORES" }, ctx)).toMatchObject({ cuentas: ["510506", "720505"], via: "multi" });
    // Con regla de clase: la cuenta de esa clase.
    expect(resolverCuentaConcepto({ clasificador: "1", agrupador: "100602 - SELLADORES" }, ctx)).toMatchObject({ cuentas: ["720505"], via: "memoria_clase", clase: "72" });
    // Una sola cuenta en otros centros: se usa.
    expect(resolverCuentaConcepto({ clasificador: "23", agrupador: "100101 - DIRECTORES" }, ctx)).toMatchObject({ cuentas: ["510595"], via: "memoria_clase" });
    // Con regla y sin cuenta de esa clase en la memoria: se transpone.
    expect(resolverCuentaConcepto({ clasificador: "23", agrupador: "100602 - SELLADORES" }, ctx)).toMatchObject({ cuentas: ["720540"], via: "memoria_clase", clase: "72" });
  });
});

describe("pasivos laborales en la cédula de Nómina (16/Sep/2026)", () => {
  const cedula = cuentasCedula6(MODULOS_IMPORT.NOM);
  const ctx: ContextoHomologacion = {
    memoria: [],
    cuentasRussell6: cedula,
    mapeoCliente: new Map([["25101001", "251010"], ["23700501", "237005"]]),
  };

  it("una cuenta del archivo homologada a 251010 cruza en la cédula", () => {
    const r = resolverCuentaConcepto({ clasificador: "40", nombre: "CESANTIAS", cuentaArchivo: "25101001" }, ctx);
    expect(r).toMatchObject({ cuentas: ["251010"], via: "archivo", destino: "gasto", cuentaCliente: "25101001" });
  });

  it("los demás pasivos siguen en el control de deducciones", () => {
    const r = resolverCuentaConcepto({ clasificador: "234", nombre: "LIBRANZA", cuentaArchivo: "23700501" }, ctx);
    expect(r).toMatchObject({ destino: "control", cuentas: [] });
    // Sin la cuenta en la cédula, la 251010 también sería control (comportamiento anterior).
    const sinPasivos = resolverCuentaConcepto({ clasificador: "40", cuentaArchivo: "25101001" }, { ...ctx, cuentasRussell6: CUENTAS_RUSSELL_NOMINA });
    expect(sinPasivos.destino).toBe("control");
  });

  it("la memoria con 251010 no se transpone de clase", () => {
    const memoria = [
      { clasificador: "40", agrupador: "", cuenta6: "251010", grupo: "cesantias" },
      { clasificador: "41", agrupador: "", cuenta6: "510530", grupo: "cesantias" },
    ];
    const reglasClase = new Map([["MOD", "72" as const]]);
    const r40 = resolverCuentaConcepto({ clasificador: "40", agrupador: "MOD" }, { ...ctx, memoria, reglasClase });
    expect(r40).toMatchObject({ cuentas: ["251010"], destino: "gasto" });
    const r41 = resolverCuentaConcepto({ clasificador: "41", agrupador: "MOD" }, { ...ctx, memoria, reglasClase });
    expect(r41).toMatchObject({ cuentas: ["720510"], via: "memoria_clase" });
  });

  it("la memoria de otros centros conserva el pasivo junto a la cuenta de la clase", () => {
    const memoria = [
      { clasificador: "40", agrupador: "ADMON", cuenta6: "510530" },
      { clasificador: "40", agrupador: "ADMON", cuenta6: "251010" },
    ];
    const r = resolverCuentaConcepto({ clasificador: "40", agrupador: "PLANTA" }, { ...ctx, memoria, reglasClase: new Map([["PLANTA", "72" as const]]) });
    expect(r.cuentas.sort()).toEqual(["251010", "720510"]);
    expect(r.via).toBe("multi");
  });

  it("sinClaseDeGasto distingue los pasivos de las cuentas de gasto", () => {
    expect(sinClaseDeGasto("251010")).toBe(true);
    expect(sinClaseDeGasto("510506")).toBe(false);
    expect(sinClaseDeGasto("7305")).toBe(false);
  });
});
