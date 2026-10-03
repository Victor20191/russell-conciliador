-- Solo metadata aditiva. Los originales y las muestras compartidas permanecen separados.
ALTER TABLE "archivos_originales_modulo"
ADD COLUMN "asistencia_json" JSONB,
ADD COLUMN "revision_asistencia" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "versiones_patron_archivo_modulo"
ADD COLUMN "archivo_origen_id" INTEGER,
ADD COLUMN "version_base_id" INTEGER;
