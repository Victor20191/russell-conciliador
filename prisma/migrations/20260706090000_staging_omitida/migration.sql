-- Omitir manual: la fila se conserva en el crudo pero se excluye de cálculos y carga.
ALTER TABLE "balance_importacion_staging" ADD COLUMN "omitida" BOOLEAN NOT NULL DEFAULT false;
