-- Impuestos · IVA (formularios 300 y 490). Aditiva salvo el cambio de la llave única de las
-- revisiones: la única vieja se suelta y la reemplaza una que incluye el impuesto.
-- · revision_retencion pasa a revision_impuesto: una sola tabla de revisiones para Retención en la
--   fuente (RET) e IVA, con la columna `impuesto`. Las revisiones existentes quedan como RET.
-- · formulario_dian_cargado.impuesto: el 490 se comparte entre impuestos; lo existente es RET.
-- · periodo_sin_formulario no cambia: `formulario` ('350' | '300') ya distingue el impuesto.
-- · Semillas del mapeo del formulario 300 (src/lib/impuestos/iva/mapeo-f300.ts;
--   impuestos-semillas.test.ts comprueba que coincidan).

-- Revisiones: una tabla para todos los impuestos.
ALTER TABLE "revision_retencion" RENAME TO "revision_impuesto";
ALTER TABLE "revision_impuesto" RENAME CONSTRAINT "revision_retencion_pkey" TO "revision_impuesto_pkey";
ALTER SEQUENCE "revision_retencion_id_seq" RENAME TO "revision_impuesto_id_seq";
ALTER INDEX "revision_retencion_cliente_id_anio_idx" RENAME TO "revision_impuesto_cliente_id_anio_idx";
ALTER TABLE "revision_impuesto" ADD COLUMN "impuesto" TEXT NOT NULL DEFAULT 'RET';
DROP INDEX "revision_retencion_cliente_id_anio_mes_corte_key";
CREATE UNIQUE INDEX "revision_impuesto_cliente_id_impuesto_anio_mes_corte_key" ON "revision_impuesto"("cliente_id", "impuesto", "anio", "mes_corte");

-- Formularios cargados: el impuesto al que pertenecen.
ALTER TABLE "formulario_dian_cargado" ADD COLUMN "impuesto" TEXT NOT NULL DEFAULT 'RET';
CREATE INDEX "formulario_dian_cargado_cliente_id_impuesto_anio_estado_idx" ON "formulario_dian_cargado"("cliente_id", "impuesto", "anio", "estado");

-- Semillas: mapeo del formulario 300 → cuenta Russell.
INSERT INTO "mapeo_renglon_dian" ("formulario", "concepto", "etiqueta", "seccion", "renglon_pj", "renglon_pn", "cuenta_russell", "signo", "en_cruce", "orden", "actualizado_en") VALUES
  ('300', 'ing_gravadas_5', 'Por operaciones gravadas al 5%', 'Ingresos', 27, NULL, '410510', '+', true, 10, CURRENT_TIMESTAMP),
  ('300', 'ing_gravadas_general', 'Por operaciones gravadas a la tarifa general', 'Ingresos', 28, NULL, '410505', '+', true, 20, CURRENT_TIMESTAMP),
  ('300', 'ing_aiu', 'A.I.U. por operaciones gravadas (base gravable especial)', 'Ingresos', 29, NULL, '410520', '+', true, 30, CURRENT_TIMESTAMP),
  ('300', 'ing_exportacion_bienes', 'Por exportación de bienes', 'Ingresos', 30, NULL, '410525', '+', true, 40, CURRENT_TIMESTAMP),
  ('300', 'ing_exportacion_servicios', 'Por exportación de servicios', 'Ingresos', 31, NULL, '410525', '+', true, 50, CURRENT_TIMESTAMP),
  ('300', 'ing_comercializadoras', 'Por ventas a sociedades de comercialización internacional', 'Ingresos', 32, NULL, '410525', '+', true, 60, CURRENT_TIMESTAMP),
  ('300', 'ing_zonas_francas', 'Por ventas a zonas francas', 'Ingresos', 33, NULL, '410525', '+', true, 70, CURRENT_TIMESTAMP),
  ('300', 'ing_juegos_azar', 'Por juegos de suerte y azar', 'Ingresos', 34, NULL, '410505', '+', true, 80, CURRENT_TIMESTAMP),
  ('300', 'ing_exentas', 'Por operaciones exentas', 'Ingresos', 35, NULL, '410525', '+', true, 90, CURRENT_TIMESTAMP),
  ('300', 'ing_cerveza', 'Por venta de cerveza de producción nacional o importada', 'Ingresos', 36, NULL, '410505', '+', true, 100, CURRENT_TIMESTAMP),
  ('300', 'ing_gaseosas', 'Por venta de gaseosas y similares', 'Ingresos', 37, NULL, '410505', '+', true, 110, CURRENT_TIMESTAMP),
  ('300', 'ing_licores', 'Por venta de licores, aperitivos, vinos y similares', 'Ingresos', 38, NULL, '410510', '+', true, 120, CURRENT_TIMESTAMP),
  ('300', 'ing_excluidas', 'Por operaciones excluidas', 'Ingresos', 39, NULL, '410530', '+', true, 130, CURRENT_TIMESTAMP),
  ('300', 'ing_no_gravadas', 'Por operaciones no gravadas', 'Ingresos', 40, NULL, '420505+421005+421020+421095+421505+422005+423005+423505+424515+425005+429595', '+', true, 140, CURRENT_TIMESTAMP),
  ('300', 'ing_devoluciones', 'Devoluciones en ventas anuladas, rescindidas o resueltas', 'Ingresos', 42, NULL, '417505', '-', true, 150, CURRENT_TIMESTAMP),
  ('300', 'gen_tarifa_5', 'A la tarifa del 5%', 'Impuesto generado', 58, NULL, '240807', '+', true, 160, CURRENT_TIMESTAMP),
  ('300', 'gen_tarifa_general', 'A la tarifa general', 'Impuesto generado', 59, NULL, '240830', '+', true, 170, CURRENT_TIMESTAMP),
  ('300', 'gen_aiu', 'Sobre A.I.U. en operaciones gravadas (base gravable especial)', 'Impuesto generado', 60, NULL, '240808', '+', true, 180, CURRENT_TIMESTAMP),
  ('300', 'gen_juegos_azar', 'En juegos de suerte y azar', 'Impuesto generado', 61, NULL, '240834', '+', true, 190, CURRENT_TIMESTAMP),
  ('300', 'gen_cerveza', 'En venta de cerveza de producción nacional o importada', 'Impuesto generado', 62, NULL, '240835', '+', true, 200, CURRENT_TIMESTAMP),
  ('300', 'gen_gaseosas', 'En venta de gaseosas y similares', 'Impuesto generado', 63, NULL, '240836', '+', true, 210, CURRENT_TIMESTAMP),
  ('300', 'gen_licores_5', 'En venta de licores, aperitivos, vinos y similares 5%', 'Impuesto generado', 64, NULL, '240837', '+', true, 220, CURRENT_TIMESTAMP),
  ('300', 'gen_retiro_inventario', 'En retiro de inventario para activos fijos, consumo, muestras gratis o donaciones', 'Impuesto generado', 65, NULL, '240809', '+', true, 230, CURRENT_TIMESTAMP),
  ('300', 'gen_recuperado_devoluciones', 'IVA recuperado en devoluciones en compras anuladas, rescindidas o resueltas', 'Impuesto generado', 66, NULL, '240815', '+', true, 240, CURRENT_TIMESTAMP),
  ('300', 'desc_importaciones_5', 'Por importaciones gravadas a la tarifa del 5%', 'Impuesto descontable', 68, NULL, '240845', '+', true, 250, CURRENT_TIMESTAMP),
  ('300', 'desc_importaciones_general', 'Por importaciones gravadas a la tarifa general', 'Impuesto descontable', 69, NULL, '240844', '+', true, 260, CURRENT_TIMESTAMP),
  ('300', 'desc_zonas_francas', 'De bienes y servicios gravados provenientes de zonas francas', 'Impuesto descontable', 70, NULL, '240847', '+', true, 270, CURRENT_TIMESTAMP),
  ('300', 'desc_compras_bienes_5', 'Por compras de bienes gravados a la tarifa del 5%', 'Impuesto descontable', 71, NULL, '240841', '+', true, 280, CURRENT_TIMESTAMP),
  ('300', 'desc_compras_bienes_general', 'Por compras de bienes gravados a la tarifa general', 'Impuesto descontable', 72, NULL, '240840', '+', true, 290, CURRENT_TIMESTAMP),
  ('300', 'desc_licores', 'Por licores, aperitivos, vinos y similares', 'Impuesto descontable', 73, NULL, '240848', '+', true, 300, CURRENT_TIMESTAMP),
  ('300', 'desc_servicios_5', 'Por servicios gravados a la tarifa del 5%', 'Impuesto descontable', 74, NULL, '240843', '+', true, 310, CURRENT_TIMESTAMP),
  ('300', 'desc_servicios_general', 'Por servicios gravados a la tarifa general', 'Impuesto descontable', 75, NULL, '240842', '+', true, 320, CURRENT_TIMESTAMP),
  ('300', 'desc_hidrocarburos', 'Descuento IVA exploración hidrocarburos art. 485-2 E.T.', 'Impuesto descontable', 76, NULL, '240849', '+', true, 330, CURRENT_TIMESTAMP),
  ('300', 'desc_no_residentes', 'IVA retenido por servicios prestados en Colombia por no domiciliados o no residentes', 'Impuesto descontable', 78, NULL, '240846', '+', true, 340, CURRENT_TIMESTAMP),
  ('300', 'desc_devoluciones_ventas', 'IVA resultante por devoluciones en ventas anuladas, rescindidas o resueltas', 'Impuesto descontable', 79, NULL, '240820', '+', true, 350, CURRENT_TIMESTAMP),
  ('300', 'desc_ajuste_perdidas', 'Ajuste impuestos descontables (pérdidas, hurto o castigo de inventarios)', 'Impuesto descontable', 80, NULL, '240850', '-', true, 360, CURRENT_TIMESTAMP),
  ('300', 'saldo_favor_anterior', 'Saldo a favor del período fiscal anterior', 'Liquidación privada', 84, NULL, NULL, '+', false, 370, CURRENT_TIMESTAMP),
  ('300', 'retenciones_iva', 'Retenciones por IVA que le practicaron', 'Retención de IVA', 85, NULL, '135517', '+', true, 380, CURRENT_TIMESTAMP),
  ('300', 'sanciones', 'Sanciones', 'Liquidación privada', 87, NULL, NULL, '+', false, 390, CURRENT_TIMESTAMP)
ON CONFLICT ("formulario", "concepto") DO NOTHING;
