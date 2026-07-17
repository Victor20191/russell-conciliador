-- Los límites del período son fechas contables puras. Conserva los valores ISO
-- existentes y deja de depender de comparaciones de texto.
ALTER TABLE "balance_importacion_lote"
  ALTER COLUMN "periodo_inicial" TYPE DATE
    USING NULLIF(btrim("periodo_inicial"), '')::date,
  ALTER COLUMN "periodo_final" TYPE DATE
    USING NULLIF(btrim("periodo_final"), '')::date;
