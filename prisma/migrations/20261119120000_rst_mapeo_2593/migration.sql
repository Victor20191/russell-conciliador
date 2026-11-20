-- Impuestos · DIAN › Anticipos bimestrales (RST): cruce contable del recibo 2593 (19/Nov/2026).
--
-- Solo siembra datos, no cambia el esquema:
-- · mapeo_renglon_dian: las cinco casillas del 2593 que se cruzan con la contabilidad (44, 59, 66, 67 y 39),
--   con las cuentas Russell de la Matriz RST y las decisiones del equipo del 18/Nov/2026
--   (src/lib/impuestos/rst/mapeo-f2593.ts). El 67 resta en el subtotal del IVA.
-- · cuenta_russell_dian: en la 135595 no se tacha el tercero DIAN (el anticipo es lo pagado a la DIAN).
-- ON CONFLICT DO NOTHING: si alguien ya editó estas filas, mandan sus cambios.

INSERT INTO "mapeo_renglon_dian" ("formulario", "concepto", "etiqueta", "seccion", "renglon_pj", "renglon_pn", "cuenta_russell", "signo", "en_cruce", "orden", "actualizado_en") VALUES
  ('2593', 'anticipo_nacional', 'Valor del anticipo componente SIMPLE nacional', 'Anticipo SIMPLE', 44, NULL, '135595', '+', true, 10, CURRENT_TIMESTAMP),
  ('2593', 'consumo_impuesto', 'Impuesto nacional al consumo 8%', 'Impuesto nacional al consumo', 59, NULL, '249505', '+', true, 20, CURRENT_TIMESTAMP),
  ('2593', 'iva_generado', 'IVA generado en el bimestre por operaciones gravadas', 'Impuesto sobre las ventas', 66, NULL, '240805+240815', '+', true, 30, CURRENT_TIMESTAMP),
  ('2593', 'iva_descontable', 'Impuestos descontables del bimestre', 'Impuesto sobre las ventas', 67, NULL, '240810+240820', '-', true, 40, CURRENT_TIMESTAMP),
  ('2593', 'ingresos_brutos', 'Ingresos brutos bimestrales (26 a 35)', 'Ingresos brutos', 39, NULL, '410505+410510+410515+410520+410525+410530+417505+420505+421005+421020+421095+422005+423005+423505+424515+425005+429595', '+', true, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("formulario", "concepto") DO NOTHING;

INSERT INTO "cuenta_russell_dian" ("cuenta_russell", "restar_tercero_dian", "actualizado_en") VALUES
  ('135595', false, CURRENT_TIMESTAMP)
ON CONFLICT ("cuenta_russell") DO NOTHING;
