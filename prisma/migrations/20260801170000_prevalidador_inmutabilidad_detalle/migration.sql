-- ============================================================
-- PREVALIDADOR: inmutabilidad física del detalle y revisiones.
-- ============================================================

BEGIN;

-- La cabecera congelada es inmutable también para SQL directo. Además, borrar o
-- mover la última fila que respalda un override dejaría una cuenta cliente
-- inexistente; se bloquea antes de producir ese estado huérfano. Al borrar la
-- cabecera completa, la FK en cascada puede retirar el detalle porque la cabecera
-- ya no es visible para este trigger.
CREATE OR REPLACE FUNCTION "proteger_detalle_balance_prevalidador"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  congelado BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "esta_congelado" INTO congelado
    FROM "balance_prueba_encabezado"
    WHERE "id" = OLD."encabezado_id";

    IF NOT FOUND THEN RETURN OLD; END IF;
    IF congelado THEN
      RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "prevalidador_cuentas_balance" o
      WHERE o."balance_id" = OLD."encabezado_id"
        AND OLD."cuenta_8" LIKE o."cuenta_cliente" || '%'
        AND NOT EXISTS (
          SELECT 1
          FROM "balance_prueba_detalle" d
          WHERE d."encabezado_id" = OLD."encabezado_id"
            AND d."id" <> OLD."id"
            AND d."cuenta_8" LIKE o."cuenta_cliente" || '%'
        )
    ) THEN
      RAISE EXCEPTION 'La cuenta es el último respaldo de un override del prevalidador'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT "esta_congelado" INTO congelado
    FROM "balance_prueba_encabezado"
    WHERE "id" = OLD."encabezado_id";
    IF congelado THEN
      RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT "esta_congelado" INTO congelado
  FROM "balance_prueba_encabezado"
  WHERE "id" = NEW."encabezado_id";
  IF congelado THEN
    RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD."encabezado_id" IS DISTINCT FROM NEW."encabezado_id" OR OLD."cuenta_8" IS DISTINCT FROM NEW."cuenta_8")
     AND EXISTS (
       SELECT 1
       FROM "prevalidador_cuentas_balance" o
       WHERE o."balance_id" = OLD."encabezado_id"
         AND OLD."cuenta_8" LIKE o."cuenta_cliente" || '%'
         AND NOT (
           NEW."encabezado_id" = OLD."encabezado_id"
           AND NEW."cuenta_8" LIKE o."cuenta_cliente" || '%'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM "balance_prueba_detalle" d
           WHERE d."encabezado_id" = OLD."encabezado_id"
             AND d."id" <> OLD."id"
             AND d."cuenta_8" LIKE o."cuenta_cliente" || '%'
         )
     ) THEN
    RAISE EXCEPTION 'El cambio deja sin respaldo un override del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "balance_prueba_detalle_proteger_prevalidador_trigger"
ON "balance_prueba_detalle";

CREATE TRIGGER "balance_prueba_detalle_proteger_prevalidador_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON "balance_prueba_detalle"
FOR EACH ROW
EXECUTE FUNCTION "proteger_detalle_balance_prevalidador"();

-- Las revisiones son un historial append-only. Solo se permite su eliminación
-- cuando desaparece la cabecera padre por la FK en cascada.
CREATE OR REPLACE FUNCTION "proteger_historial_revisiones_prevalidador"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "balance_prueba_encabezado" WHERE "id" = OLD."balance_id"
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Las revisiones del prevalidador son append-only'
    USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS "prevalidador_revisiones_balance_append_only_trigger"
ON "prevalidador_revisiones_balance";

CREATE TRIGGER "prevalidador_revisiones_balance_append_only_trigger"
BEFORE UPDATE OR DELETE
ON "prevalidador_revisiones_balance"
FOR EACH ROW
EXECUTE FUNCTION "proteger_historial_revisiones_prevalidador"();

-- Una conciliación conserva el vínculo al balance y, por esa vía, a la revisión
-- y snapshot que la autorizaron. Los balances todavía no usados pueden borrarse;
-- los usados como evidencia quedan protegidos.
ALTER TABLE "conciliaciones"
  DROP CONSTRAINT "conciliaciones_balance_prevalidado_id_fkey",
  ADD CONSTRAINT "conciliaciones_balance_prevalidado_id_fkey"
    FOREIGN KEY ("balance_prevalidado_id") REFERENCES "balance_prueba_encabezado"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
