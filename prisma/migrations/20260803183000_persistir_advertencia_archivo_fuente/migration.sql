ALTER TABLE "balance_prueba_encabezado"
ADD COLUMN "advertencia_archivo_fuente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "diferencia_archivo_fuente" DECIMAL(18, 2);

ALTER TABLE "balance_prueba_encabezado"
ADD CONSTRAINT "balance_prueba_encabezado_advertencia_archivo_fuente_check"
CHECK (
  "advertencia_archivo_fuente" = ("diferencia_archivo_fuente" IS NOT NULL)
);
