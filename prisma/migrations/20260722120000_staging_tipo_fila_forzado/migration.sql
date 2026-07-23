-- Conserva en el staging la clasificación decidida manualmente por el auditor.
ALTER TABLE "balance_importacion_staging"
ADD COLUMN "tipo_fila_forzado" TEXT;

ALTER TABLE "balance_importacion_staging"
ADD CONSTRAINT "balance_importacion_staging_tipo_fila_forzado_check"
CHECK ("tipo_fila_forzado" IS NULL OR "tipo_fila_forzado" IN ('agrupadora', 'movimiento'));

-- Recupera la marca manual en borradores existentes cuyo cliente ya tiene una
-- corrección de tipo memorizada. El tipo visible ya podía estar guardado, pero no
-- existía una forma de distinguirlo de una detección automática.
UPDATE "balance_importacion_staging" AS s
SET "tipo_fila_forzado" = c."tipo_fila_forzado"
FROM "balance_importacion_lote" AS l
JOIN "correcciones_carga_balance" AS c
  ON c."cliente_id" = l."cliente_id"
WHERE l."lote_id" = s."lote_id"
  AND c."cuenta" = s."codigo"
  AND c."tipo_fila_forzado" IN ('agrupadora', 'movimiento');
