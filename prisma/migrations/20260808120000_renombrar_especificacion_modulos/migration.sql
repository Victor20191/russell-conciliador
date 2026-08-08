-- Conserva los datos existentes y alinea los nombres fisicos con la
-- convencion obligatoria en espanol del esquema Prisma.
ALTER TABLE "modulo_importacion_lote"
RENAME COLUMN "spec_json" TO "especificacion_json";

ALTER TABLE "perfiles_carga_modulo"
RENAME COLUMN "spec_json" TO "especificacion_json";
