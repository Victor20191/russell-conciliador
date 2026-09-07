ALTER TABLE "reportes_ejecutivos_uso_ia"
  ADD COLUMN "clave_alcance" TEXT,
  ADD COLUMN "metadatos" JSONB;
CREATE INDEX "reportes_ejecutivos_uso_ia_clave_alcance_creado_en_idx"
  ON "reportes_ejecutivos_uso_ia"("clave_alcance", "creado_en");
