-- Revisión durable de reubicaciones manuales que cruzan clases contables.
ALTER TABLE "balance_importacion_staging"
  ADD COLUMN "justificacion_reubicacion" TEXT,
  ADD COLUMN "reubicacion_revisada_por" TEXT,
  ADD COLUMN "reubicacion_revisada_por_id" INTEGER,
  ADD COLUMN "reubicacion_revisada_en" TIMESTAMPTZ(3);
