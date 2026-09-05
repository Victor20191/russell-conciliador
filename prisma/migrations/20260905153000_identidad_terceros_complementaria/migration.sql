-- Metadatos complementarios: sin actualizar filas, llaves ni importes históricos.
ALTER TABLE "balance_importacion_staging_tercero" ADD COLUMN "identidad_tercero" JSONB;
ALTER TABLE "balance_tercero_detalle" ADD COLUMN "identidad_tercero" JSONB;
ALTER TABLE "perfiles_carga_balance"
  ADD COLUMN "col_nombre_tercero" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "col_tipo_documento_tercero" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "col_dv_tercero" INTEGER NOT NULL DEFAULT 0;
