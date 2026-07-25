-- Normaliza únicamente las decisiones AUTOMÁTICAS históricas de cada grupo de
-- seis dígitos. Nunca sobrescribe una fila manual. El ganador usa el mismo orden
-- canónico de la aplicación: manual, fila exacta de nivel 6, edición más reciente,
-- mayor coincidencia y desempate estable por código/id.
BEGIN;

WITH candidatos AS (
  SELECT
    cuenta."id",
    cuenta."cliente_id",
    LEFT(cuenta."codigo", 6) AS "cuenta_6",
    cuenta."cuenta_6_russell",
    cuenta."porcentaje_coincidencia",
    ROW_NUMBER() OVER (
      PARTITION BY cuenta."cliente_id", LEFT(cuenta."codigo", 6)
      ORDER BY
        CASE WHEN cuenta."origen_mapeo" = 'manual' THEN 1 ELSE 0 END DESC,
        (cuenta."codigo" = LEFT(cuenta."codigo", 6)) DESC,
        cuenta."actualizado_en" DESC NULLS LAST,
        cuenta."porcentaje_coincidencia" DESC NULLS LAST,
        cuenta."codigo" ASC,
        cuenta."id" ASC
    ) AS "posicion"
  FROM "cuentas_cliente" AS cuenta
  WHERE cuenta."cliente_id" IS NOT NULL
    AND LENGTH(cuenta."codigo") >= 6
    AND cuenta."cuenta_6_russell" IS NOT NULL
),
ganadores AS (
  SELECT
    "cliente_id",
    "cuenta_6",
    "cuenta_6_russell",
    "porcentaje_coincidencia"
  FROM candidatos
  WHERE "posicion" = 1
)
UPDATE "cuentas_cliente" AS cuenta
SET
  "cuenta_6_russell" = ganador."cuenta_6_russell",
  "porcentaje_coincidencia" = ganador."porcentaje_coincidencia"
FROM ganadores AS ganador
WHERE cuenta."cliente_id" = ganador."cliente_id"
  AND LEFT(cuenta."codigo", 6) = ganador."cuenta_6"
  AND cuenta."origen_mapeo" IS DISTINCT FROM 'manual'
  AND (
    cuenta."cuenta_6_russell" IS DISTINCT FROM ganador."cuenta_6_russell"
    OR cuenta."porcentaje_coincidencia" IS DISTINCT FROM ganador."porcentaje_coincidencia"
  );

COMMIT;
