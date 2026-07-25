-- El estándar del balance es NIF por regla de negocio y deja de ser una
-- preferencia editable.
BEGIN;

ALTER TABLE "ajustes_carga_balance"
  ALTER COLUMN "estandar" SET DEFAULT 'NIF';

UPDATE "ajustes_carga_balance"
SET "estandar" = 'NIF'
WHERE "estandar" IS DISTINCT FROM 'NIF';

ALTER TABLE "ajustes_carga_balance"
  ALTER COLUMN "estandar" SET NOT NULL,
  ADD CONSTRAINT "ajustes_carga_balance_estandar_nif_check"
    CHECK ("estandar" = 'NIF');

-- Perfil base para todos los clientes existentes. Los perfiles estructurales
-- siguen creándose por huella cuando se asocia un archivo tabular.
INSERT INTO "ajustes_carga_balance" (
  "cliente_id",
  "estandar",
  "creado_en",
  "actualizado_en"
)
SELECT
  "id",
  'NIF',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "clientes"
ON CONFLICT ("cliente_id") DO NOTHING;

-- Garantía a nivel de base de datos: todo cliente que se cree en adelante,
-- incluso por importación o por un proceso externo a la interfaz, nace con su
-- perfil base. La aplicación conserva además su upsert defensivo al cargar.
CREATE OR REPLACE FUNCTION "crear_perfil_base_balance_cliente"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "ajustes_carga_balance" (
    "cliente_id",
    "estandar",
    "creado_en",
    "actualizado_en"
  )
  VALUES (
    NEW."id",
    'NIF',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("cliente_id") DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "crear_perfil_base_balance_al_crear_cliente"
AFTER INSERT ON "clientes"
FOR EACH ROW
EXECUTE FUNCTION "crear_perfil_base_balance_cliente"();

COMMIT;
