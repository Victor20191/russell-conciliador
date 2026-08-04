-- ============================================================
-- PREVALIDADOR: corrige la ambigüedad que impedía guardar la cuenta del cliente.
--
-- `validar_override_prevalidador_balance()` declaraba una variable PL/pgSQL con
-- el MISMO nombre que la columna que leía (`cuenta_russell`). Postgres no puede
-- resolver la referencia y aborta con 42702 («column reference is ambiguous»),
-- de modo que TODA inserción o edición de un override fallaba con el mensaje
-- genérico de error de base de datos. Se renombran las variables locales con el
-- prefijo `v_` y se deja el cuerpo sin más cambios de comportamiento.
--
-- Migración forward-only: reemplaza la función; los triggers ya declarados en
-- `20260801153000_prevalidador_persistencia_balance` la siguen usando.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION "validar_override_prevalidador_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cuenta_russell TEXT;
  v_balance_congelado BOOLEAN;
BEGIN
  SELECT "cuenta_russell" INTO v_cuenta_russell
  FROM "prevalidador_cuentas"
  WHERE "id" = NEW."catalogo_id";

  SELECT "esta_congelado" INTO v_balance_congelado
  FROM "balance_prueba_encabezado"
  WHERE "id" = NEW."balance_id";

  IF v_cuenta_russell IS NULL OR v_balance_congelado IS NULL THEN
    RAISE EXCEPTION 'Balance o fila de catálogo inexistente'
      USING ERRCODE = '23503';
  END IF;

  IF v_balance_congelado THEN
    RAISE EXCEPTION 'El balance está congelado y no admite cambios del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  IF char_length(NEW."cuenta_cliente") <> char_length(v_cuenta_russell) THEN
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

COMMIT;
