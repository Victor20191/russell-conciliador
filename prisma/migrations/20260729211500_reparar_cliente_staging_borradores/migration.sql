-- Repara borradores históricos cuyo encabezado ya tenía cliente asignado, pero
-- cuyas filas quedaron con cliente_id nulo por el flujo anterior. El encabezado
-- es la identidad autoritativa del lote; no toca borradores aún sin asignar ni
-- filas que ya tengan una identidad explícita.
UPDATE "balance_importacion_staging" AS staging
SET "cliente_id" = lote."cliente_id"
FROM "balance_importacion_lote" AS lote
WHERE staging."lote_id" = lote."lote_id"
  AND lote."cliente_id" IS NOT NULL
  AND staging."cliente_id" IS NULL;
