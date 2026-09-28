-- Catálogo del prevalidador con que se APROBÓ una revisión (28/Sep/2026).
--
-- Hasta hoy la huella de cada aprobación incluía el catálogo COMPLETO vigente de todos los
-- módulos, así que cambiar cualquier fila (la base de cálculo de Ingresos, una etiqueta, una
-- cuenta nueva) dejaba desactualizadas las aprobaciones de TODOS los balances. Desde ahora cada
-- aprobación guarda aquí el catálogo con que se aprobó y, mientras siga vigente, el balance se
-- calcula con él.
--
-- ADITIVA y sin datos: el código anterior no conoce la tabla y nunca la toca. Las aprobaciones
-- ya existentes las respalda `scripts/prevalidador-base-saldo.ts`, que solo congela una si su
-- huella, recalculada con el catálogo actual, coincide con la guardada (así prueba que ese es el
-- catálogo con que se aprobó); una migración a ciegas no podría comprobarlo.

CREATE TABLE "prevalidador_catalogos_revision" (
  "id" SERIAL NOT NULL,
  "revision_id" INTEGER NOT NULL,
  "catalogo" JSONB NOT NULL,
  "origen" TEXT NOT NULL DEFAULT 'aprobacion',
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prevalidador_catalogos_revision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prevalidador_catalogos_revision_catalogo_chk"
    CHECK (jsonb_typeof("catalogo") = 'array' AND jsonb_array_length("catalogo") > 0),
  CONSTRAINT "prevalidador_catalogos_revision_origen_chk"
    CHECK ("origen" IN ('aprobacion', 'respaldo'))
);

CREATE UNIQUE INDEX "prevalidador_catalogos_revision_revision_id_key"
  ON "prevalidador_catalogos_revision"("revision_id");

ALTER TABLE "prevalidador_catalogos_revision"
  ADD CONSTRAINT "prevalidador_catalogos_revision_revision_id_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "prevalidador_revisiones_balance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only, como el historial de revisiones: solo una revisión «aprobada» guarda catálogo, y
-- solo se borra cuando desaparece su revisión (cascada balance → revisión → catálogo).
CREATE OR REPLACE FUNCTION "proteger_catalogo_revision_prevalidador"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "prevalidador_revisiones_balance" r
      WHERE r."id" = NEW."revision_id" AND r."estado" = 'aprobada'
    ) THEN
      RAISE EXCEPTION 'Solo una revisión aprobada conserva el catálogo del prevalidador'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "prevalidador_revisiones_balance" WHERE "id" = OLD."revision_id"
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'El catálogo congelado del prevalidador es append-only'
    USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS "prevalidador_catalogos_revision_append_only_trigger"
ON "prevalidador_catalogos_revision";

CREATE TRIGGER "prevalidador_catalogos_revision_append_only_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON "prevalidador_catalogos_revision"
FOR EACH ROW
EXECUTE FUNCTION "proteger_catalogo_revision_prevalidador"();
