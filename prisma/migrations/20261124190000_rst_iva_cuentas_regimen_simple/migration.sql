-- Impuestos · DIAN › Anticipos bimestrales (RST): el IVA del recibo 2593 se cruza contra las cuentas de IVA
-- del Régimen Simple del plan Russell (24/Nov/2026), en vez de las genéricas.
--
-- Solo cambia datos, no el esquema:
-- · 66 (IVA generado): 240805 + 240815 → 240855 + 240856.
-- · 67 (impuestos descontables): 240810 + 240820 → 240857 + 240858.
-- (src/lib/impuestos/rst/mapeo-f2593.ts). Solo cambia la fila si todavía tiene las cuentas genéricas: si
-- alguien ya la editó en Mapeo cuentas DIAN, se respeta.

UPDATE "mapeo_renglon_dian" SET "cuenta_russell" = '240855+240856', "actualizado_en" = CURRENT_TIMESTAMP WHERE "formulario" = '2593' AND "concepto" = 'iva_generado' AND "cuenta_russell" = '240805+240815';
UPDATE "mapeo_renglon_dian" SET "cuenta_russell" = '240857+240858', "actualizado_en" = CURRENT_TIMESTAMP WHERE "formulario" = '2593' AND "concepto" = 'iva_descontable' AND "cuenta_russell" = '240810+240820';
