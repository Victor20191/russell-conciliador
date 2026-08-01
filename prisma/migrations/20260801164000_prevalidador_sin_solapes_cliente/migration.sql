-- ============================================================
-- PREVALIDADOR: impide doble conteo por prefijos cliente solapados.
-- Es una migración forward-only posterior a la persistencia por balance.
-- ============================================================

BEGIN;

-- Si una preferencia cliente-global legada produjo un solape al materializarse
-- por balance, se retiran del modelo operativo todos los overrides involucrados.
-- El valor original no se pierde: permanece en
-- `prevalidador_cuentas_cliente_legacy`. Al volver a los defaults Russell, que ya
-- son no solapados, el balance queda reparable desde la interfaz.
WITH conflictos AS (
  SELECT oa."id" AS override_a_id, ob."id" AS override_b_id
  FROM "prevalidador_cuentas_balance" base
  JOIN "prevalidador_cuentas" a ON a."activa" = true
  JOIN "prevalidador_cuentas" b
    ON b."modulo_id" = a."modulo_id"
   AND b."activa" = true
   AND b."id" > a."id"
  LEFT JOIN "prevalidador_cuentas_balance" oa
    ON oa."balance_id" = base."balance_id"
   AND oa."catalogo_id" = a."id"
  LEFT JOIN "prevalidador_cuentas_balance" ob
    ON ob."balance_id" = base."balance_id"
   AND ob."catalogo_id" = b."id"
  WHERE (
      COALESCE(oa."cuenta_cliente", a."cuenta_russell") LIKE COALESCE(ob."cuenta_cliente", b."cuenta_russell") || '%'
      OR COALESCE(ob."cuenta_cliente", b."cuenta_russell") LIKE COALESCE(oa."cuenta_cliente", a."cuenta_russell") || '%'
    )
    AND (oa."id" IS NOT NULL OR ob."id" IS NOT NULL)
), overrides_conflictivos AS (
  SELECT "override_a_id" AS id FROM conflictos WHERE "override_a_id" IS NOT NULL
  UNION
  SELECT "override_b_id" AS id FROM conflictos WHERE "override_b_id" IS NOT NULL
)
DELETE FROM "prevalidador_cuentas_balance"
WHERE "id" IN (SELECT id FROM overrides_conflictivos);

-- Al crear, editar, restablecer o borrar un override se valida la cuenta que
-- quedará efectivamente resuelta para la fila (override o cuenta Russell). Dos
-- prefijos que se contienen dentro del mismo módulo harían participar una misma
-- cuenta del detalle en dos renglones y duplicarían el total del módulo.
CREATE OR REPLACE FUNCTION "validar_solape_override_prevalidador_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  balance_objetivo INTEGER;
  catalogo_objetivo INTEGER;
  cuenta_objetivo TEXT;
  modulo_objetivo INTEGER;
  fila_activa BOOLEAN;
  cuenta_conflicto TEXT;
BEGIN
  -- Misma llave usada por las Server Actions. Serializa catálogo y overrides
  -- incluso si una escritura administrativa entra por SQL directo.
  PERFORM pg_advisory_xact_lock(1382240781, 2011087006);

  IF TG_OP = 'DELETE' THEN
    balance_objetivo := OLD."balance_id";
    catalogo_objetivo := OLD."catalogo_id";
  ELSE
    balance_objetivo := NEW."balance_id";
    catalogo_objetivo := NEW."catalogo_id";
  END IF;

  SELECT "modulo_id", "activa", "cuenta_russell"
    INTO modulo_objetivo, fila_activa, cuenta_objetivo
  FROM "prevalidador_cuentas"
  WHERE "id" = catalogo_objetivo;

  IF modulo_objetivo IS NULL THEN
    RAISE EXCEPTION 'La fila del catálogo del prevalidador no existe'
      USING ERRCODE = '23503';
  END IF;

  -- INSERT/UPDATE resuelve con el nuevo override; DELETE vuelve a la cuenta
  -- Russell cargada arriba. Una fila inactiva no participa en ningún total.
  IF TG_OP <> 'DELETE' THEN
    cuenta_objetivo := NEW."cuenta_cliente";
  END IF;
  IF NOT fila_activa THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(o."cuenta_cliente", c."cuenta_russell")
    INTO cuenta_conflicto
  FROM "prevalidador_cuentas" c
  LEFT JOIN "prevalidador_cuentas_balance" o
    ON o."balance_id" = balance_objetivo
   AND o."catalogo_id" = c."id"
  WHERE c."modulo_id" = modulo_objetivo
    AND c."activa" = true
    AND c."id" <> catalogo_objetivo
    AND (
      COALESCE(o."cuenta_cliente", c."cuenta_russell") LIKE cuenta_objetivo || '%'
      OR cuenta_objetivo LIKE COALESCE(o."cuenta_cliente", c."cuenta_russell") || '%'
    )
  LIMIT 1;

  IF cuenta_conflicto IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta cliente % se solapa con % dentro del mismo módulo',
      cuenta_objetivo, cuenta_conflicto
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "prevalidador_cuentas_balance_solape_trigger"
BEFORE INSERT OR UPDATE OF "balance_id", "catalogo_id", "cuenta_cliente" OR DELETE
ON "prevalidador_cuentas_balance"
FOR EACH ROW
EXECUTE FUNCTION "validar_solape_override_prevalidador_balance"();

-- Una edición del catálogo (alta, cambio de prefijo/módulo o reactivación) también
-- puede introducir un solape contra overrides que ya existan en otros renglones.
-- Se comprueban únicamente balances con overrides: sin ellos, la compuerta de
-- prefijos Russell instalada en la migración anterior ya garantiza la separación.
CREATE OR REPLACE FUNCTION "validar_solapes_cliente_tras_catalogo_prevalidador"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1382240781, 2011087006);

  IF NEW."activa" AND EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT o."balance_id"
      FROM "prevalidador_cuentas_balance" o
      JOIN "prevalidador_cuentas" pc ON pc."id" = o."catalogo_id"
      WHERE pc."modulo_id" = NEW."modulo_id"
    ) balances
    JOIN "prevalidador_cuentas" a
      ON a."modulo_id" = NEW."modulo_id"
     AND a."activa" = true
    JOIN "prevalidador_cuentas" b
      ON b."modulo_id" = a."modulo_id"
     AND b."activa" = true
     AND b."id" > a."id"
    LEFT JOIN "prevalidador_cuentas_balance" oa
      ON oa."balance_id" = balances."balance_id"
     AND oa."catalogo_id" = a."id"
    LEFT JOIN "prevalidador_cuentas_balance" ob
      ON ob."balance_id" = balances."balance_id"
     AND ob."catalogo_id" = b."id"
    WHERE
      COALESCE(oa."cuenta_cliente", a."cuenta_russell") LIKE COALESCE(ob."cuenta_cliente", b."cuenta_russell") || '%'
      OR COALESCE(ob."cuenta_cliente", b."cuenta_russell") LIKE COALESCE(oa."cuenta_cliente", a."cuenta_russell") || '%'
  ) THEN
    RAISE EXCEPTION 'El cambio de catálogo solapa cuentas cliente dentro de un módulo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "prevalidador_cuentas_solape_cliente_trigger"
AFTER INSERT OR UPDATE OF "modulo_id", "cuenta_russell", "activa"
ON "prevalidador_cuentas"
FOR EACH ROW
EXECUTE FUNCTION "validar_solapes_cliente_tras_catalogo_prevalidador"();

COMMIT;
