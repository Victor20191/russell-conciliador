import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, MAPEO_F350_FABRICA, TERCEROS_DIAN_FABRICA, type FilaMapeoDian } from "./mapeo-dian";
import { MAPEO_F300_FABRICA } from "./iva/mapeo-f300";

/** Lo que siembran las migraciones, leído del propio SQL: el código y la BD no pueden divergir. */
const leer = (carpeta: string) => readFileSync(join(process.cwd(), "prisma/migrations", carpeta, "migration.sql"), "utf8");
const SQL = leer("20261031120000_impuestos_configuracion");
const SQL_IVA = leer("20261108120000_impuestos_iva");

const texto = (v: string) => (v === "NULL" ? null : v.slice(1, -1).replace(/''/g, "'"));
const numero = (v: string) => (v === "NULL" ? null : Number(v));

function mapeoSembrado(sql: string, formulario: "350" | "300"): FilaMapeoDian[] {
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
