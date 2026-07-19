-- Notas / observaciones de carga por cliente (texto libre): particularidades del
-- formato que el analista quiere recordar; se muestran al cargar/revisar el balance.
ALTER TABLE "ajustes_carga_balance" ADD COLUMN "observaciones" TEXT;
