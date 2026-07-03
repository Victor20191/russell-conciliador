-- AlterTable: desacople manual de una cuenta (anidar por prefijo, no por orden)
ALTER TABLE "balance_importacion_staging" ADD COLUMN "desacoplada" BOOLEAN NOT NULL DEFAULT false;
