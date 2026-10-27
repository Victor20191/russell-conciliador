-- Las notificaciones históricas no tienen destinatario verificable. Se conservan
-- sin backfill y no aparecen en la campana personal; no se inventan permisos.
ALTER TABLE "notificaciones"
  ADD COLUMN "destinatario_id" INTEGER,
  ADD COLUMN "cliente_id" INTEGER,
  ADD COLUMN "entidad_tipo" TEXT,
  ADD COLUMN "entidad_id" INTEGER;

CREATE INDEX "notificaciones_destinatario_no_leida_creado_idx"
  ON "notificaciones"("destinatario_id", "no_leida", "creado_en");
