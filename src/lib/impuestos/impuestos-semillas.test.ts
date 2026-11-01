import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, MAPEO_F350_FABRICA, TERCEROS_DIAN_FABRICA, type FilaMapeoDian } from "./mapeo-dian";

/** Lo que siembra la migración, leído del propio SQL: el código y la BD no pueden divergir. */
const SQL = readFileSync(join(process.cwd(), "prisma/migrations/20261031120000_impuestos_configuracion/migration.sql"), "utf8");

const texto = (v: string) => (v === "NULL" ? null : v.slice(1, -1).replace(/''/g, "'"));
const numero = (v: string) => (v === "NULL" ? null : Number(v));

function mapeoSembrado(): FilaMapeoDian[] {
  const fila = /\('350', ('(?:[^']|'')*'), ('(?:[^']|'')*'), ('(?:[^']|'')*'), (NULL|\d+), (NULL|\d+), (NULL|'\d{6}'), '([+-])', (true|false), (\d+), CURRENT_TIMESTAMP\)/g;
  return [...SQL.matchAll(fila)].map((m) => ({
    concepto: texto(m[1]) as string,
    etiqueta: texto(m[2]) as string,
    seccion: texto(m[3]) as string,
    renglonPj: numero(m[4]),
    renglonPn: numero(m[5]),
    cuentaRussell: texto(m[6]),
    signo: m[7] as "+" | "-",
    enCruce: m[8] === "true",
    orden: Number(m[9]),
  }));
}

describe("semillas de la migración de Impuestos", () => {
  it("el mapeo sembrado es el de fábrica", () => {
    expect(mapeoSembrado()).toEqual([...MAPEO_F350_FABRICA]);
  });

  it("los NIT de la DIAN sembrados son los de fábrica", () => {
    const nits = [...SQL.matchAll(/\('(\d{9})', '((?:[^']|'')*)'\)/g)].map((m) => ({ nit: m[1], etiqueta: m[2].replace(/''/g, "'") }));
    expect(nits).toEqual([...TERCEROS_DIAN_FABRICA]);
  });

  it("las cuentas que no restan la DIAN son las de fábrica", () => {
    const cuentas = [...SQL.matchAll(/\('(\d{6})', false, CURRENT_TIMESTAMP\)/g)].map((m) => m[1]);
    expect(cuentas).toEqual([...CUENTAS_SIN_RESTA_DIAN_FABRICA]);
  });

  it("la migración es aditiva", () => {
    expect(SQL).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN/i);
  });
});
