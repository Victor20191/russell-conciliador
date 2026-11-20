import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, MAPEO_F350_FABRICA, TERCEROS_DIAN_FABRICA, type FilaMapeoDian } from "./mapeo-dian";
import { MAPEO_F300_FABRICA } from "./iva/mapeo-f300";
import { MAPEO_F2593_FABRICA } from "./rst/mapeo-f2593";

/** Lo que siembran las migraciones, leído del propio SQL: el código y la BD no pueden divergir. */
const leer = (carpeta: string) => readFileSync(join(process.cwd(), "prisma/migrations", carpeta, "migration.sql"), "utf8");
const SQL = leer("20261031120000_impuestos_configuracion");
const SQL_IVA = leer("20261108120000_impuestos_iva");
const SQL_RST = leer("20261119120000_rst_mapeo_2593");
const SQL_NIT_MEDELLIN = leer("20261119180000_tercero_dian_medellin");

const texto = (v: string) => (v === "NULL" ? null : v.slice(1, -1).replace(/''/g, "'"));
const numero = (v: string) => (v === "NULL" ? null : Number(v));

function mapeoSembrado(sql: string, formulario: "350" | "300" | "2593"): FilaMapeoDian[] {
  const fila = new RegExp(
    String.raw`\('${formulario}', ('(?:[^']|'')*'), ('(?:[^']|'')*'), ('(?:[^']|'')*'), (NULL|\d+), (NULL|\d+), (NULL|'\d{6}(?:\+\d{6})*'), '([+-])', (true|false), (\d+), CURRENT_TIMESTAMP\)`,
    "g",
  );
  return [...sql.matchAll(fila)].map((m) => ({
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
    expect(mapeoSembrado(SQL, "350")).toEqual([...MAPEO_F350_FABRICA]);
  });

  it("los NIT de la DIAN sembrados, con los nombres que les cambiaron migraciones posteriores, son los de fábrica", () => {
    const renombres = new Map(
      [...SQL_NIT_MEDELLIN.matchAll(/UPDATE "tercero_dian" SET "etiqueta" = '((?:[^']|'')*)' WHERE "nit" = '(\d{9})';/g)].map((m) => [m[2], m[1].replace(/''/g, "'")]),
    );
    expect(renombres.size).toBe(1);
    const nits = [...SQL.matchAll(/\('(\d{9})', '((?:[^']|'')*)'\)/g)].map((m) => ({ nit: m[1], etiqueta: renombres.get(m[1]) ?? m[2].replace(/''/g, "'") }));
    expect(nits).toEqual([...TERCEROS_DIAN_FABRICA]);
  });

  it("el cambio de nombre del NIT de Medellín solo toca la etiqueta", () => {
    expect(SQL_NIT_MEDELLIN).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER\b|\bINSERT\b/i);
  });

  it("las cuentas que no restan la DIAN son las de fábrica", () => {
    const cuentas = [SQL, SQL_RST].flatMap((sql) => [...sql.matchAll(/\('(\d{6})', false, CURRENT_TIMESTAMP\)/g)].map((m) => m[1]));
    expect(cuentas).toEqual([...CUENTAS_SIN_RESTA_DIAN_FABRICA]);
  });

  it("la migración es aditiva", () => {
    expect(SQL).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN/i);
  });
});

describe("semillas de la migración de IVA", () => {
  it("el mapeo del 300 sembrado es el de fábrica", () => {
    expect(mapeoSembrado(SQL_IVA, "300")).toEqual([...MAPEO_F300_FABRICA]);
  });

  it("solo suelta la llave única vieja de las revisiones; no borra datos", () => {
    const drops = [...SQL_IVA.matchAll(/\bDROP\b[^;]*;/gi)].map((m) => m[0]);
    expect(drops).toEqual(['DROP INDEX "revision_retencion_cliente_id_anio_mes_corte_key";']);
    expect(SQL_IVA).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN/i);
  });

  it("las revisiones y los formularios que ya existen quedan como Retención en la fuente", () => {
    expect(SQL_IVA).toContain(`ALTER TABLE "revision_impuesto" ADD COLUMN "impuesto" TEXT NOT NULL DEFAULT 'RET';`);
    expect(SQL_IVA).toContain(`ALTER TABLE "formulario_dian_cargado" ADD COLUMN "impuesto" TEXT NOT NULL DEFAULT 'RET';`);
  });
});

describe("semillas de la migración del cruce del RST", () => {
  it("el mapeo del 2593 sembrado es el de fábrica", () => {
    expect(mapeoSembrado(SQL_RST, "2593")).toEqual([...MAPEO_F2593_FABRICA]);
  });

  it("solo inserta datos y respeta lo que ya se editó", () => {
    expect(SQL_RST).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bALTER\b|\bUPDATE\b/i);
    expect(SQL_RST.match(/ON CONFLICT \("[a-z_]+"/g)).toHaveLength(2);
  });
});
