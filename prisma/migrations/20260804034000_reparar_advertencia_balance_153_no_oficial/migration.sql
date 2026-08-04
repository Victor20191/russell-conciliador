-- La primera reparación no modificó el balance porque esta versión promovida
-- conserva `es_oficial = false` en el dato histórico. Mantiene los mismos
-- controles estrictos y corrige esa única precondición comprobada en la fila.
WITH "diagnostico_153" AS (
  SELECT
    "encabezado_id",
    COALESCE(
      SUM("saldo_final") FILTER (WHERE LEFT("cuenta_8", 1) NOT IN ('8', '9')),
      0
    ) AS "diferencia_ecuacion",
    COALESCE(SUM("debitos"), 0) - COALESCE(SUM("creditos"), 0) AS "diferencia_movimientos"
  FROM "balance_prueba_detalle"
  WHERE "encabezado_id" = 153
  GROUP BY "encabezado_id"
)
UPDATE "balance_prueba_encabezado" AS "balance"
SET
  "advertencia_archivo_fuente" = true,
  "diferencia_archivo_fuente" = "diagnostico_153"."diferencia_ecuacion"
FROM "diagnostico_153"
WHERE "balance"."id" = "diagnostico_153"."encabezado_id"
  AND "balance"."id" = 153
  AND "balance"."nombre_cliente" = 'CORPORACION PARQUE EXPLORA'
  AND "balance"."periodo" = 'Junio 2026'
  AND "balance"."version" = 'v3'
  AND "balance"."es_oficial" = false
  AND "balance"."archivo" = '24. PARQUE EXPLORA.xlsx'
  AND "balance"."filas_totales" = 769
  AND ABS("balance"."suma_activo" - 16105527465.28::numeric) < 0.01
  AND "balance"."comentario_aprobacion" = 'Comentario 3 de agosto'
  AND "balance"."nota" = '3 validación(es) con alerta'
  AND "balance"."cuadrado" = false
  AND "balance"."advertencia_archivo_fuente" = false
  AND "balance"."diferencia_archivo_fuente" IS NULL
  AND ABS("diagnostico_153"."diferencia_ecuacion" - 2808623852.78::numeric) < 0.01
  AND ABS("diagnostico_153"."diferencia_movimientos") <= 1000;
