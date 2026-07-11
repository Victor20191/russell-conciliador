-- TRI-ESTADO durable para el omitir manual: null = sin tocar (elegible para el
-- auto-marcado del re-listado con guiones), true = omitida, false = RESCATADA a mano.
-- Antes era BOOLEAN NOT NULL DEFAULT false y un rescate (false) era indistinguible
-- del default => el auto-marcado re-tachaba la fila al recargar.
ALTER TABLE "balance_importacion_staging" ALTER COLUMN "omitida" DROP NOT NULL;
ALTER TABLE "balance_importacion_staging" ALTER COLUMN "omitida" DROP DEFAULT;
-- false hasta hoy = «sin tocar» (default) -> NULL. Los true (omitidos a mano) se conservan.
UPDATE "balance_importacion_staging" SET "omitida" = NULL WHERE "omitida" = false;
