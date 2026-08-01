-- ============================================================
-- PREVALIDADOR: persistencia por balance, revisión y trazabilidad.
-- Esta migración es FORWARD-ONLY y parte de
-- `20260801120000_prevalidador_homologacion`; no reescribe la migración aplicada.
-- ============================================================

-- El catálogo solo admite los seis módulos ERP aprobados y prefijos PUC de nivel
-- 2/4. `base_calculo` queda cerrado al dominio que entiende el motor.
ALTER TABLE "prevalidador_cuentas"
  ADD CONSTRAINT "prevalidador_cuentas_cuenta_russell_check"
    CHECK ("cuenta_russell" ~ '^[0-9]{2}([0-9]{2})?$'),
  ADD CONSTRAINT "prevalidador_cuentas_base_calculo_check"
    CHECK ("base_calculo" IN ('saldo', 'movimiento')),
  ADD CONSTRAINT "prevalidador_cuentas_orden_check"
    CHECK ("orden" BETWEEN 0 AND 9999);

-- Detecta cualquier solapamiento preexistente antes de instalar la compuerta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "prevalidador_cuentas" a
    JOIN "prevalidador_cuentas" b
      ON b."modulo_id" = a."modulo_id"
     AND b."id" > a."id"
     AND (
       b."cuenta_russell" LIKE a."cuenta_russell" || '%'
       OR a."cuenta_russell" LIKE b."cuenta_russell" || '%'
     )
  ) THEN
    RAISE EXCEPTION 'El catálogo del prevalidador contiene prefijos solapados dentro del mismo módulo';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "validar_catalogo_prevalidador"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  codigo_modulo TEXT;
BEGIN
  SELECT "codigo" INTO codigo_modulo
  FROM "modulos"
  WHERE "id" = NEW."modulo_id";

  IF codigo_modulo IS NULL OR codigo_modulo NOT IN ('ING', 'CAR', 'INV', 'AFI', 'CXP', 'NOM') THEN
    RAISE EXCEPTION 'El módulo no pertenece a los seis módulos aprobados del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "prevalidador_cuentas" p
    WHERE p."modulo_id" = NEW."modulo_id"
      AND p."id" <> COALESCE(NEW."id", -1)
      AND (
        p."cuenta_russell" LIKE NEW."cuenta_russell" || '%'
        OR NEW."cuenta_russell" LIKE p."cuenta_russell" || '%'
      )
  ) THEN
    RAISE EXCEPTION 'La cuenta se solapa con otro prefijo del mismo módulo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "prevalidador_cuentas_validar_trigger"
BEFORE INSERT OR UPDATE OF "modulo_id", "cuenta_russell"
ON "prevalidador_cuentas"
FOR EACH ROW
EXECUTE FUNCTION "validar_catalogo_prevalidador"();

-- --------------------------------------------------------------------------
-- Overrides: el modelo anterior era cliente-global. Se conserva íntegro como
-- archivo legado y se materializa su valor vigente en cada balance existente.
-- Las filas inválidas o sin balance quedan en el archivo y no contaminan el
-- nuevo modelo operativo.
-- --------------------------------------------------------------------------
ALTER TABLE "prevalidador_cuentas_cliente"
  RENAME TO "prevalidador_cuentas_cliente_legacy";

ALTER INDEX "prevalidador_cuentas_cliente_pkey"
  RENAME TO "prevalidador_cuentas_cliente_legacy_pkey";
ALTER INDEX "prevalidador_cuentas_cliente_cliente_id_catalogo_id_key"
  RENAME TO "prevalidador_cuentas_cliente_legacy_cliente_id_catalogo_id_key";
ALTER INDEX "prevalidador_cuentas_cliente_cliente_id_idx"
  RENAME TO "prevalidador_cuentas_cliente_legacy_cliente_id_idx";

ALTER TABLE "prevalidador_cuentas_cliente_legacy"
  DROP CONSTRAINT "prevalidador_cuentas_cliente_catalogo_id_fkey";

ALTER TABLE "prevalidador_cuentas_cliente_legacy"
  ADD COLUMN "archivado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "prevalidador_cuentas_balance" (
  "id" SERIAL NOT NULL,
  "balance_id" INTEGER NOT NULL,
  "catalogo_id" INTEGER NOT NULL,
  "cuenta_cliente" TEXT NOT NULL,
  "actualizado_por" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prevalidador_cuentas_balance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prevalidador_cuentas_balance_cuenta_cliente_check"
    CHECK ("cuenta_cliente" ~ '^[0-9]{2}([0-9]{2})?$')
);

CREATE UNIQUE INDEX "prevalidador_cuentas_balance_balance_id_catalogo_id_key"
  ON "prevalidador_cuentas_balance"("balance_id", "catalogo_id");

CREATE INDEX "prevalidador_cuentas_balance_balance_id_idx"
  ON "prevalidador_cuentas_balance"("balance_id");

ALTER TABLE "prevalidador_cuentas_balance"
  ADD CONSTRAINT "prevalidador_cuentas_balance_balance_id_fkey"
    FOREIGN KEY ("balance_id") REFERENCES "balance_prueba_encabezado"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prevalidador_cuentas_balance_catalogo_id_fkey"
    FOREIGN KEY ("catalogo_id") REFERENCES "prevalidador_cuentas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Replica la preferencia global en cada balance histórico del cliente. Solo se
-- activan prefijos válidos, de la misma longitud que la regla y presentes de
-- verdad en el detalle de ese balance. Todo el legado permanece archivado arriba.
INSERT INTO "prevalidador_cuentas_balance" (
  "balance_id",
  "catalogo_id",
  "cuenta_cliente",
  "actualizado_por",
  "creado_en",
  "actualizado_en"
)
SELECT
  b."id",
  l."catalogo_id",
  l."cuenta_cliente",
  l."actualizado_por",
  l."creado_en",
  l."actualizado_en"
FROM "prevalidador_cuentas_cliente_legacy" l
JOIN "prevalidador_cuentas" c ON c."id" = l."catalogo_id"
JOIN "balance_prueba_encabezado" b ON b."cliente_id" = l."cliente_id"
WHERE l."cuenta_cliente" ~ '^[0-9]{2}([0-9]{2})?$'
  AND char_length(l."cuenta_cliente") = char_length(c."cuenta_russell")
  AND EXISTS (
    SELECT 1
    FROM "balance_prueba_detalle" d
    WHERE d."encabezado_id" = b."id"
      AND left(d."cuenta_8", char_length(l."cuenta_cliente")) = l."cuenta_cliente"
  )
ON CONFLICT ("balance_id", "catalogo_id") DO NOTHING;

-- Defensa de BD para escrituras que no pasen por la Server Action: misma longitud,
-- prefijo existente y balance todavía editable.
CREATE OR REPLACE FUNCTION "validar_override_prevalidador_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cuenta_russell TEXT;
  balance_congelado BOOLEAN;
BEGIN
  SELECT "cuenta_russell" INTO cuenta_russell
  FROM "prevalidador_cuentas"
  WHERE "id" = NEW."catalogo_id";

  SELECT "esta_congelado" INTO balance_congelado
  FROM "balance_prueba_encabezado"
  WHERE "id" = NEW."balance_id";

  IF cuenta_russell IS NULL OR balance_congelado IS NULL THEN
    RAISE EXCEPTION 'Balance o fila de catálogo inexistente'
      USING ERRCODE = '23503';
  END IF;

  IF balance_congelado THEN
    RAISE EXCEPTION 'El balance está congelado y no admite cambios del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  IF char_length(NEW."cuenta_cliente") <> char_length(cuenta_russell) THEN
    RAISE EXCEPTION 'La cuenta del cliente debe tener el mismo nivel que la cuenta Russell'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "balance_prueba_detalle" d
    WHERE d."encabezado_id" = NEW."balance_id"
      AND left(d."cuenta_8", char_length(NEW."cuenta_cliente")) = NEW."cuenta_cliente"
  ) THEN
    RAISE EXCEPTION 'La cuenta del cliente no existe en el balance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "prevalidador_cuentas_balance_validar_trigger"
BEFORE INSERT OR UPDATE OF "balance_id", "catalogo_id", "cuenta_cliente"
ON "prevalidador_cuentas_balance"
FOR EACH ROW
EXECUTE FUNCTION "validar_override_prevalidador_balance"();

-- Una edición directa del catálogo tampoco puede dejar overrides existentes con
-- otro nivel o significado. Borrar la fila sigue permitido y arrastra sus
-- overrides por la FK declarada arriba.
CREATE OR REPLACE FUNCTION "bloquear_cambio_catalogo_prevalidador_con_overrides"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW."modulo_id" IS DISTINCT FROM OLD."modulo_id"
    OR NEW."cuenta_russell" IS DISTINCT FROM OLD."cuenta_russell"
  ) AND EXISTS (
    SELECT 1
    FROM "prevalidador_cuentas_balance" o
    WHERE o."catalogo_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar módulo o prefijo mientras existan overrides de balance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "prevalidador_cuentas_bloquear_overrides_trigger"
BEFORE UPDATE OF "modulo_id", "cuenta_russell"
ON "prevalidador_cuentas"
FOR EACH ROW
EXECUTE FUNCTION "bloquear_cambio_catalogo_prevalidador_con_overrides"();

-- --------------------------------------------------------------------------
-- Revisión/aprobación append-only. La huella permite invalidar una aprobación
-- cuando cambia el detalle, el catálogo o un override. `instantanea` conserva el
-- resultado que el servidor volvió a calcular dentro de la misma transacción.
-- --------------------------------------------------------------------------
CREATE TABLE "prevalidador_revisiones_balance" (
  "id" SERIAL NOT NULL,
  "balance_id" INTEGER NOT NULL,
  "estado" TEXT NOT NULL,
  "justificacion" TEXT NOT NULL,
  "huella" TEXT NOT NULL,
  "instantanea" JSONB,
  "actor" TEXT NOT NULL,
  "actor_id" INTEGER,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prevalidador_revisiones_balance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prevalidador_revisiones_balance_estado_check"
    CHECK ("estado" IN ('aprobada', 'revocada')),
  CONSTRAINT "prevalidador_revisiones_balance_justificacion_check"
    CHECK (char_length(btrim("justificacion")) BETWEEN 3 AND 2000),
  CONSTRAINT "prevalidador_revisiones_balance_huella_check"
    CHECK ("huella" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "prevalidador_revisiones_balance_balance_id_creado_en_idx"
  ON "prevalidador_revisiones_balance"("balance_id", "creado_en");

CREATE INDEX "prevalidador_revisiones_balance_huella_idx"
  ON "prevalidador_revisiones_balance"("huella");

ALTER TABLE "prevalidador_revisiones_balance"
  ADD CONSTRAINT "prevalidador_revisiones_balance_balance_id_fkey"
    FOREIGN KEY ("balance_id") REFERENCES "balance_prueba_encabezado"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- La conciliación podrá registrar qué balance prevalidado habilitó el proceso.
ALTER TABLE "conciliaciones"
  ADD COLUMN "balance_prevalidado_id" INTEGER;

CREATE INDEX "conciliaciones_balance_prevalidado_id_idx"
  ON "conciliaciones"("balance_prevalidado_id");

ALTER TABLE "conciliaciones"
  ADD CONSTRAINT "conciliaciones_balance_prevalidado_id_fkey"
    FOREIGN KEY ("balance_prevalidado_id") REFERENCES "balance_prueba_encabezado"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
