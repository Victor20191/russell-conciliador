-- «Patrones manuales» del cliente (21/Oct/2026). Aditiva.
--
-- La memoria de «Archivo manual» (`perfiles_carga_modulo`) pasa a guardarse al CONFIRMAR el cargue y
-- a reconocerse por % de coincidencia de los títulos, sin mirar la hoja. Para eso guarda los títulos
-- crudos del encabezado del archivo de ejemplo y quién y cuándo guardó el mapeo vigente
-- (`actualizado_en` cambia con cada uso y no sirve para eso). Los perfiles existentes quedan en null:
-- siguen reconociéndose por su huella exacta y el script `db:formatos-manuales:encabezado` completa
-- el encabezado de los que conservan su archivo original.
ALTER TABLE "perfiles_carga_modulo" ADD COLUMN "encabezado_json" JSONB;
ALTER TABLE "perfiles_carga_modulo" ADD COLUMN "guardado_en" TIMESTAMPTZ(3);
ALTER TABLE "perfiles_carga_modulo" ADD COLUMN "guardado_por" TEXT;
ALTER TABLE "perfiles_carga_modulo" ADD COLUMN "guardado_por_id" INTEGER;
