-- Documento de cada registro de la bitácora (24/Nov/2026, pedido del usuario): para el reporte
-- para gerencia, homologar dos balances del mismo cliente el mismo día son dos operaciones, no
-- una. Los pasos que trabajan un documento anotan cuál («balance:12», «cargue:34»,
-- «revision:5», «lote:<id>») y el reporte agrupa por él; sin documento, por cliente. Columna
-- nueva y opcional: los registros existentes quedan en NULL y nada más cambia.
ALTER TABLE "registros_auditoria" ADD COLUMN "documento" TEXT;
