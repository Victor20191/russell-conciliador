import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La migración corre contra producción con el código anterior todavía desplegado: tiene que ser
// ADITIVA (una tabla nueva, sin tocar datos ni tablas existentes) y dejar el catálogo congelado
// tan protegido como el historial de revisiones que acompaña.
const sql = readFileSync(
  new URL("../../../../prisma/migrations/20260928180000_prevalidador_catalogo_congelado/migration.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../../../../prisma/schema.prisma", import.meta.url), "utf8");
// Sin los comentarios, para que el texto explicativo no dispare ni tape ninguna regla.
const codigo = sql.replace(/--.*$/gm, "");

describe("migración 20260928180000_prevalidador_catalogo_congelado", () => {
  it("es aditiva: crea su tabla y no escribe ni altera nada existente", () => {
    expect(codigo).toMatch(/CREATE TABLE "prevalidador_catalogos_revision"/);
    expect(codigo).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(codigo).not.toMatch(/\bUPDATE\s+"/i);
    expect(codigo).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(codigo).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    const alteradas = [...codigo.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1]);
    expect(alteradas.every((t) => t === "prevalidador_catalogos_revision")).toBe(true);
  });

  it("una sola fila por revisión, borrada en cascada con ella", () => {
    expect(codigo).toMatch(/CREATE UNIQUE INDEX "[^"]+"\s+ON "prevalidador_catalogos_revision"\("revision_id"\)/);
    expect(codigo).toMatch(/REFERENCES "prevalidador_revisiones_balance"\("id"\)\s+ON DELETE CASCADE/);
  });

  it("exige un catálogo no vacío y un origen conocido", () => {
    expect(codigo).toMatch(/jsonb_typeof\("catalogo"\) = 'array' AND jsonb_array_length\("catalogo"\) > 0/);
    expect(codigo).toMatch(/"origen" IN \('aprobacion', 'respaldo'\)/);
  });

  it("es append-only: solo inserta para una revisión aprobada y solo se borra en cascada", () => {
    expect(codigo).toMatch(/BEFORE INSERT OR UPDATE OR DELETE\s+ON "prevalidador_catalogos_revision"/);
    expect(codigo).toMatch(/r\."estado" = 'aprobada'/);
    expect(codigo).toMatch(/TG_OP = 'DELETE' AND NOT EXISTS/);
    expect(codigo).toMatch(/append-only/);
  });

  it("el esquema de Prisma usa los mismos nombres físicos en español", () => {
    const modelo = /model PrevalidadorCatalogoRevision \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(modelo).toMatch(/@@map\("prevalidador_catalogos_revision"\)/);
    for (const columna of ["revision_id", "catalogo", "origen", "creado_en"]) {
      expect(modelo, columna).toContain(`@map("${columna}")`);
      expect(codigo, columna).toContain(`"${columna}"`);
    }
    expect(modelo).toMatch(/onDelete: Cascade/);
  });
});
