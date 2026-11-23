-- Impuestos · DIAN › Anticipos bimestrales (RST): dos casillas más del recibo 2593 en el cruce contable
-- (21/Nov/2026, propuesta enviada al equipo sobre la Matriz RST).
--
-- Solo siembra datos, no cambia el esquema:
-- · 70 (retenciones de IVA que le practicaron en el bimestre) contra la 135517, por tercero, como el
--   renglón 85 del 300.
-- · 43 (componente ICA consolidado, la suma de las 99 de la hoja 2) contra la 511505 (gasto de ICA), por
--   el saldo de la cuenta.
-- (src/lib/impuestos/rst/mapeo-f2593.ts). ON CONFLICT DO NOTHING: si alguien ya editó estas filas, mandan sus cambios.

INSERT INTO "mapeo_renglon_dian" ("formulario", "concepto", "etiqueta", "seccion", "renglon_pj", "renglon_pn", "cuenta_russell", "signo", "en_cruce", "orden", "actualizado_en") VALUES
  ('2593', 'iva_retenciones', 'Retenciones por IVA que le practicaron en el bimestre', 'Retenciones de IVA', 70, NULL, '135517', '+', true, 60, CURRENT_TIMESTAMP),
  ('2593', 'ica_consolidado', 'Componente ICA consolidado (suma de las 99 de la hoja 2)', 'ICA consolidado', 43, NULL, '511505', '+', true, 70, CURRENT_TIMESTAMP)
ON CONFLICT ("formulario", "concepto") DO NOTHING;
