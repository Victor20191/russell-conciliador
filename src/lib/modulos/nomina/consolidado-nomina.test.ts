import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "../descriptores";
import { cuentasCedula6 } from "../cuentas-modulo";

// Las cuentas a las que la homologación puede llevar un concepto: las que concilian y las solo visibles.
const CUENTAS_RUSSELL_NOMINA = cuentasCedula6(MODULOS_IMPORT.NOM);
import { construirConsolidadoNomina, cuentasEfectivasRenglon, resumenCuentaArchivo } from "./consolidado-nomina";

const fila = (codigo: string, valor: number, datos: Record<string, unknown> = {}) => ({ clasificador: codigo, valor, datos });

describe("construirConsolidadoNomina", () => {
  it("un renglón por (concepto, centro), con lo guardado y la sugerencia", () => {
    const r = construirConsolidadoNomina({
      detalle: [
        fila("1", 100, { agrupador: "GYA", concepto: "Sueldo" }),
        fila("1", 50, { agrupador: "MOD", concepto: "Sueldo" }),
        fila("18", 30, { agrupador: "GYA", concepto: "Vacaciones" }),
      ],
      memoria: [
        { clasificador: "1", agrupador: "GYA", cuenta6: "510506", descripcion: "SUELDO BASICO", grupo: "sueldos" },
        { clasificador: "18", agrupador: "", cuenta6: "510539", grupo: "vacaciones" },
      ],
      reglasClase: new Map([["MOD", "72"], ["GYA", "51"]]),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    const porClave = new Map(r.renglones.map((x) => [x.clasificador, x]));
    // Memoria exacta: guardada y sugerida a la vez.
    expect(porClave.get("1 ∥ GYA")).toMatchObject({ codigo: "1", agrupador: "GYA", descripcion: "SUELDO BASICO", total: 100, cuentas: ["510506"], sugerencia: { via: "memoria_exacta", cuentas: ["510506"] } });
    // Sin memoria para MOD: la memoria de GYA llevada a la clase 72 del centro (vía 3b).
    expect(porClave.get("1 ∥ MOD")).toMatchObject({ cuentas: [], sugerencia: { via: "memoria_clase", cuentas: ["720505"], clase: "72" } });
    // Memoria base + regla de clase → transpuesta, sin estar guardada para ese centro.
    expect(porClave.get("18 ∥ GYA")).toMatchObject({ cuentas: [], sugerencia: { via: "memoria_clase", cuentas: ["510539"], grupo: "vacaciones" } });
    expect(r.agrupadores).toEqual([
      { agrupador: "GYA", filas: 2, total: 130, clase: "51", sugerida: "51" },
      { agrupador: "MOD", filas: 1, total: 50, clase: "72", sugerida: "72" },
    ]);
  });

  it("la cuenta del archivo manda; una fila sin cuenta válida queda en el renglón sin cuenta", () => {
    const r = construirConsolidadoNomina({
      detalle: [
        fila("23", 10, { cuenta: "51052703", concepto: "GASTOS DE TRANSPORTE" }),
        fila("23", 10, { cuenta: "51052703" }),
        fila("23", 10, { cuenta: "8888" }),
      ],
      memoria: [],
      reglasClase: new Map(),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    const porClave = new Map(r.renglones.map((x) => [x.clasificador, x]));
    expect(r.renglones.map((x) => x.clasificador)).toEqual(["23 # 51052703", "23"]);
    expect(porClave.get("23 # 51052703")).toMatchObject({
      codigo: "23", agrupador: "", cuentaArchivo: "51052703", total: 20, descripcion: "GASTOS DE TRANSPORTE",
      sugerencia: { via: "archivo", cuentas: ["510595"], cuentaCliente: "51052703", origenCuentaArchivo: "estructura" },
    });
    // «8888» no es una cuenta: ese valor no se va a la cuenta de las otras filas.
    // El nombre del concepto viene de su hermano con cuenta.
    expect(porClave.get("23")).toMatchObject({ cuentaArchivo: null, total: 10, descripcion: "GASTOS DE TRANSPORTE", sugerencia: { via: "sugerido_nombre" } });
    expect(r.agrupadores).toEqual([]);
  });

  it("un concepto con dos cuentas del archivo en el mismo centro se parte en dos renglones con su valor real", () => {
    const r = construirConsolidadoNomina({
      detalle: [
        fila("1", 700, { agrupador: "GYA", cuenta: "51050601", concepto: "SUELDO" }),
        fila("1", 200, { agrupador: "GYA", cuenta: "51050601" }),
        fila("1", 300, { agrupador: "GYA", cuenta: "72050601" }),
      ],
      memoria: [],
      reglasClase: new Map(),
      mapeoCliente: new Map([["51050601", "510506"], ["72050601", "720505"]]),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    expect(r.renglones.map((x) => [x.clasificador, x.total, x.sugerencia.cuentas, x.sugerencia.origenCuentaArchivo])).toEqual([
      ["1 ∥ GYA # 51050601", 900, ["510506"], "balance"],
      ["1 ∥ GYA # 72050601", 300, ["720505"], "balance"],
    ]);
  });

  it("lo guardado de un renglón con cuenta del archivo es solo lo de esa cuenta del cliente", () => {
    const r = construirConsolidadoNomina({
      detalle: [
        fila("1", 100, { cuenta: "51050601" }),
        fila("1", 50, { cuenta: "72050601" }),
      ],
      memoria: [
        { clasificador: "1", agrupador: "", cuenta6: "510506", cuentaCliente: "51050601" },
        { clasificador: "1", agrupador: "", cuenta6: "720505", cuentaCliente: "72050601" },
      ],
      reglasClase: new Map(),
      mapeoCliente: new Map([["51050601", "510506"], ["72050601", "720505"]]),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    const porClave = new Map(r.renglones.map((x) => [x.clasificador, x]));
    expect(porClave.get("1 # 51050601")?.cuentas).toEqual(["510506"]);
    expect(porClave.get("1 # 72050601")?.cuentas).toEqual(["720505"]);
    // Cada fila guardada es de su cuenta: ninguna es «memoria distinta» para la otra.
    expect(porClave.get("1 # 51050601")?.sugerencia.memoriaDistinta).toBeNull();
  });

  it("un cargue sin columna de cuenta conserva sus claves", () => {
    const r = construirConsolidadoNomina({
      detalle: [fila("1", 100, { agrupador: "GYA" }), fila("1", 20, { agrupador: "GYA", cuenta: "" }), fila("2", 5, {})],
      memoria: [],
      reglasClase: new Map(),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    expect(r.renglones.map((x) => [x.clasificador, x.total, x.cuentaArchivo])).toEqual([["1 ∥ GYA", 120, null], ["2", 5, null]]);
  });

  it("agrupadores sin regla ni forma reconocible quedan sin clase (Kakaraka 1/5/10/20)", () => {
    const r = construirConsolidadoNomina({
      detalle: [fila("1", 5, { agrupador: "10" }), fila("1", 5, { agrupador: "20" })],
      memoria: [{ clasificador: "1", agrupador: "", cuenta6: "", cuentaCliente: "0005060000", subcuentaPuc: "06", grupo: "sueldos" }],
      reglasClase: new Map(),
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    });
    expect(r.agrupadores.map((a) => [a.agrupador, a.clase, a.sugerida])).toEqual([["10", null, null], ["20", null, null]]);
    expect(r.renglones[0].sugerencia).toMatchObject({ via: "multi", subcuentaPuc: "06" });
  });
});

describe("cuenta contable del archivo: resumen y cuentas efectivas", () => {
  const consolidado = () => construirConsolidadoNomina({
    detalle: [
      fila("1", 900, { cuenta: "51050601" }), // homologada en el balance
      fila("2", 80, { cuenta: "51052703" }), // derivada por estructura
      fila("3", -40, { cuenta: "23700501" }), // libranza: control de deducciones
      fila("4", 60, {}), // sin cuenta en un archivo que sí la trae
      fila("5", 30, { cuenta: "51053001" }), // la memoria del cliente dice otra cuenta
    ],
    memoria: [
      { clasificador: "4", agrupador: "", cuenta6: "510548" },
      { clasificador: "5", agrupador: "", cuenta6: "510536" },
    ],
    reglasClase: new Map(),
    mapeoCliente: new Map([["51050601", "510506"], ["51053001", "510530"]]),
    cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
  });

  it("resume cuántos renglones cruzan por la cuenta del archivo y cuáles requieren atención", () => {
    expect(resumenCuentaArchivo(consolidado().renglones)).toEqual({
      conCuenta: 4, porArchivo: 3, porEstructura: 1, control: 1, sinResolver: 0, reemplazadas: 0, memoriaDistinta: 1, sinCuenta: 1,
    });
    const sinCuenta = construirConsolidadoNomina({ detalle: [fila("1", 5, {})], memoria: [], reglasClase: new Map(), cuentasRussell6: CUENTAS_RUSSELL_NOMINA });
    expect(resumenCuentaArchivo(sinCuenta.renglones)).toBeNull();
  });

  it("la memoria del cliente distinta se avisa, pero el renglón cruza por el archivo", () => {
    const r5 = consolidado().renglones.find((x) => x.codigo === "5");
    expect(r5?.sugerencia).toMatchObject({ via: "archivo", cuentas: ["510530"], memoriaDistinta: ["510536"] });
  });

  it("las cuentas efectivas siguen la regla del cruce, con su origen", () => {
    const porCodigo = new Map(consolidado().renglones.map((x) => [x.codigo, cuentasEfectivasRenglon(x)]));
    expect(porCodigo.get("1")).toEqual({ cuentas: ["510506"], origen: "Cuenta del archivo" });
    expect(porCodigo.get("2")).toEqual({ cuentas: ["510595"], origen: "Cuenta del archivo (por estructura PUC)" });
    expect(porCodigo.get("3")).toEqual({ cuentas: [], origen: "Control de deducciones" });
    expect(porCodigo.get("4")).toEqual({ cuentas: ["510548"], origen: "Memoria del cliente" });
  });
});
