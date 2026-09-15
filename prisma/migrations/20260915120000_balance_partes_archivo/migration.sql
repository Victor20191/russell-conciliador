-- Balance partido en varios archivos (el ERP no genera uno solo por peso). Aditiva.

-- Partes que componen un borrador: nombre, tamaño y rango de `fila_num` de cada archivo
-- dentro del staging. Null = borrador de un solo archivo (todos los existentes).
ALTER TABLE "balance_importacion_lote" ADD COLUMN IF NOT EXISTS "partes_archivo" JSONB;

-- Copia de esas partes en el balance confirmado, para conservar qué archivos lo formaron
-- después de purgar el staging. Null = cargue de un solo archivo.
ALTER TABLE "balance_prueba_encabezado" ADD COLUMN IF NOT EXISTS "archivos_cargue" JSONB;
