import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoPrevalidadorDeFabrica, PREVALIDADOR_CATALOGO_FABRICA } from "@/lib/balance/prevalidador/catalogo";
import planRussell from "../../../prisma/data/subgrupos-russell.json";
import { MODULOS_IMPORT, descriptorModulo } from "./descriptores";
import {
  aplicarSubgruposConciliacion,
  leerSubgruposConciliacionGuardados,
  moduloConSubgruposConciliacion,
  normalizarSubgrupoConciliacion,
  subgruposConciliacionDe,
  subgruposConciliacionDeFabrica,
  subgruposDeCuentasRussellCierre,
  subgruposFijosDe,
} from "./cuentas-conciliacion";
import {
  cedulaModulo,
  claveCedula,
  cuentaAsignableCedula,
  esCuentaExtraPosible,
  opcionesCedula,
  prefijosCuentaModulo,
  subgruposCedula,
} from "./cuentas-modulo";

const catalogo = catalogoPrevalidadorDeFabrica();
const prefijos = (codigo: string) => prefijosCuentaModulo(codigo, catalogo);
const plan = planRussell.subgrupos.map((s) => ({ codigo: s.codigo, nombre: s.nombre }));
const d = (codigo: string) => {
  const descriptor = descriptorModulo(codigo);
  if (!descriptor) throw new Error(`sin descriptor ${codigo}`);
  return descriptor;
};
const modulos4 = Object.keys(MODULOS_IMPORT).filter((c) => moduloConSubgruposConciliacion(d(c))).sort();

const SQL = readFileSync(join(process.cwd(), "prisma/migrations/20260929180000_subgrupos_conciliacion_modulo/migration.sql"), "utf8");

/** Las filas `('MOD', 'código')` del bloque del SQL que empieza en `desde` y termina en `hasta`. */
function valoresDelBloque(desde: string, hasta: string): [string, string][] {
  const inicio = SQL.indexOf(desde);
  const fin = SQL.indexOf(hasta, inicio + desde.length);
  expect(inicio, desde).toBeGreaterThanOrEqual(0);
  expect(fin, hasta).toBeGreaterThan(inicio);
  return [...SQL.slice(inicio, fin).matchAll(/\('([A-Z]{3})', '(\d+)'\)/g)].map((m) => [m[1], m[2]]);
}

describe("subgrupos de conciliación por módulo (cédula a 4)", () => {
  it("solo Inventarios y Activos fijos concilian por subgrupo; la 1592 es fija", () => {
    expect(modulos4).toEqual(["AFI", "INV"]);
    expect(subgruposFijosDe(d("AFI"))).toEqual(["1592"]);
    expect(subgruposFijosDe(d("INV"))).toEqual([]);
    expect(subgruposConciliacionDe(d("INV"))).toBeNull();
    expect(subgruposConciliacionDe(d("NOM"))).toBeNull();
  });

  it("la migración siembra solo esos módulos, con los prefijos de fábrica y sin los fijos", () => {
    const seccionReglas = SQL.slice(SQL.indexOf('WITH "reglas"'), SQL.indexOf('"fabrica"'));
    const enReglas = [...seccionReglas.matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]).sort();
    expect(enReglas).toEqual(modulos4);

    const fabrica = valoresDelBloque('"fabrica"', '"prefijos"');
    const esperadoFabrica = PREVALIDADOR_CATALOGO_FABRICA
      .filter((f) => modulos4.includes(f.moduloCodigo))
      .map((f) => [f.moduloCodigo, f.cuentaRussell]);
    expect(fabrica.sort()).toEqual(esperadoFabrica.sort());

    const abiertos = valoresDelBloque('"abiertos"', "INSERT INTO");
    const esperadoAbiertos = modulos4.flatMap((c) => subgruposFijosDe(d(c)).map((s) => [c, s]));
    expect(abiertos.sort()).toEqual(esperadoAbiertos.sort());

    expect(SQL).toContain(`CHECK ("subgrupo" ~ '^[0-9]{4}$')`);
    expect(SQL).toContain('ON CONFLICT ("modulo_codigo", "subgrupo") DO NOTHING');
  });

  it("con la siembra de fábrica, la cédula concilia exactamente lo mismo que por la regla", () => {
    const cuentas6 = ["140505", "143505", "146505", "152005", "159205", "159299", "151605", "133005"];
    for (const codigo of modulos4) {
      const siembra = subgruposConciliacionDeFabrica(d(codigo), plan) ?? [];
      const antes = cedulaModulo(d(codigo), prefijos(codigo));
      const despues = cedulaModulo(aplicarSubgruposConciliacion(d(codigo), siembra), prefijos(codigo));
      expect(despues.lista4, codigo).not.toBeNull();
      expect([...subgruposCedula(despues, plan)].sort(), codigo).toEqual([...subgruposCedula(antes, plan)].sort());
      expect(opcionesCedula(despues, plan, []), codigo).toEqual(opcionesCedula(antes, plan, []));
      expect(despues.adicionales4.size, codigo).toBe(0);
      for (const s of plan) {
        expect(cuentaAsignableCedula(despues, s.codigo), `${codigo} ${s.codigo}`).toBe(cuentaAsignableCedula(antes, s.codigo));
        expect(esCuentaExtraPosible(despues, s.codigo), `${codigo} ${s.codigo}`).toBe(esCuentaExtraPosible(antes, s.codigo));
      }
      for (const c of cuentas6) expect(claveCedula(despues, c), `${codigo} ${c}`).toBe(claveCedula(antes, c));
    }
    // Según el plan del repositorio: los 9 subgrupos de la 14 y los de la 15 sin la 1592.
    expect(subgruposConciliacionDeFabrica(d("INV"), plan)).toEqual(["1405", "1410", "1430", "1435", "1455", "1460", "1465", "1470", "1499"]);
    expect(subgruposConciliacionDeFabrica(d("AFI"), plan)).toHaveLength(11);
    expect(subgruposConciliacionDeFabrica(d("AFI"), plan)).not.toContain("1592");
    expect(subgruposConciliacionDeFabrica(d("NOM"), plan)).toBeNull();
  });

  it("aplicar la lista no muta el descriptor y no aplica a los módulos a 6", () => {
    const inv = d("INV");
    const resuelto = aplicarSubgruposConciliacion(inv, ["14.35", "1405", "1405"]);
    expect(resuelto.cedula?.subgrupos4).toEqual(["1405", "1435"]);
    expect(inv.cedula?.subgrupos4).toBeUndefined();
    expect(subgruposConciliacionDe(resuelto)).toEqual(["1405", "1435"]);
    expect(aplicarSubgruposConciliacion(inv, null)).toBe(inv);
    expect(aplicarSubgruposConciliacion(d("CXP"), ["2205"])).toBe(d("CXP"));
    // Lo que se congela en el cierre no lleva los fijos.
    expect(subgruposConciliacionDe(aplicarSubgruposConciliacion(d("AFI"), ["1520", "1592"]))).toEqual(["1520"]);
  });

  it("lee la copia del cierre y, en los cierres anteriores, lo que quedó en firme", () => {
    expect(leerSubgruposConciliacionGuardados(["1435", "1405"])).toEqual(["1405", "1435"]);
    expect(leerSubgruposConciliacionGuardados(null)).toBeNull();
    expect(leerSubgruposConciliacionGuardados(["1405", "140505"])).toBeNull();
    expect(leerSubgruposConciliacionGuardados([{ subgrupo: "1405" }])).toBeNull();
    expect(subgruposDeCuentasRussellCierre(["1520", "1504", "1592"])).toEqual(["1504", "1520", "1592"]);
    expect(subgruposDeCuentasRussellCierre([])).toBeNull();
    expect(subgruposDeCuentasRussellCierre(null)).toBeNull();
    expect(normalizarSubgrupoConciliacion("14.35")).toBe("1435");
    expect(normalizarSubgrupoConciliacion("143505")).toBeNull();
  });
});
