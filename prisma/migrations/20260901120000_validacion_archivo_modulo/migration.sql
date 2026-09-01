-- Validación del archivo en los cargues de módulo: el total que el propio archivo declara
-- al pie NO se puede recalcular desde el detalle (la fila no es imputable y el staging se
-- purga al promover), así que se congela aquí junto con su cobertura.
-- Todas nullable y sin default: null identifica los cargues anteriores a esta validación,
-- donde el panel no se muestra en vez de afirmar «no validado».
ALTER TABLE "modulo_dato_encabezado"
  ADD COLUMN "total_declarado"      DECIMAL(18,2),
  ADD COLUMN "fila_total_declarado" INTEGER,
  ADD COLUMN "archivos_del_cargue"  INTEGER,
  ADD COLUMN "archivos_con_total"   INTEGER;
