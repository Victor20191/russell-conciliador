-- Consolidación de módulos: un clasificador puede cruzar con VARIAS cuentas de 4 díg
-- (p. ej. inventario globalizado contra 1405+1430+1435). La unicidad pasa de
-- (cliente, módulo, clasificador) a (cliente, módulo, clasificador, cuenta_4).
DROP INDEX "consolidacion_modulo_cliente_cliente_id_modulo_codigo_clasi_key";

CREATE UNIQUE INDEX "consolidacion_modulo_cliente_clasif_cuenta_key"
  ON "consolidacion_modulo_cliente" ("cliente_id", "modulo_codigo", "clasificador", "cuenta_4");

CREATE INDEX "consolidacion_modulo_cliente_cliente_id_modulo_codigo_clasi_idx"
  ON "consolidacion_modulo_cliente" ("cliente_id", "modulo_codigo", "clasificador");
