-- Apertura del balance DECLARADA por el analista: 'cuenta' | 'tercero'.
-- Se captura en el borrador (obligatoria para promover) y el balance oficial la
-- hereda al confirmar. Nullable a propósito: los cargues anteriores a este dato
-- se muestran como «—» (no se rellenan con la heurística de terceros).
ALTER TABLE "balance_importacion_lote"
  ADD COLUMN IF NOT EXISTS "apertura_balance" TEXT;

ALTER TABLE "balance_prueba_encabezado"
  ADD COLUMN IF NOT EXISTS "apertura_balance" TEXT;
