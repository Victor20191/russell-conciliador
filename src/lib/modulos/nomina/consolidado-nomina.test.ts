import { describe, expect, it } from "vitest";
import { CUENTAS_RUSSELL_NOMINA } from "../descriptores";
import { construirConsolidadoNomina } from "./consolidado-nomina";

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

  it("la cuenta del archivo (moda del grupo) manda y las filas sin agrupador van a la clave simple", () => {
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
    expect(r.renglones).toHaveLength(1);
    expect(r.renglones[0]).toMatchObject({ clasificador: "23", agrupador: "", descripcion: "GASTOS DE TRANSPORTE", sugerencia: { via: "archivo", cuentas: ["510595"], cuentaCliente: "51052703" } });
    expect(r.agrupadores).toEqual([]);
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
