-- Carga masiva de conceptos de nómina (cliente / código / concepto / cuenta).
--
-- El mapeo del consolidado ya vivía en `consolidacion_modulo_cliente`: el CLIENTE
-- (`cliente_id`), el CÓDIGO del concepto (`clasificador`, que en Nómina pasa a ser el
-- código y no el texto) y la CUENTA Russell de 4 díg (`cuenta_4`). Lo único que faltaba
-- era el nombre legible del concepto, que ahora llega en la carga masiva.
--
-- Columna OPCIONAL: las filas existentes quedan en NULL (el clasificador se explica solo)
-- y ninguna carga previa se invalida.

ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "descripcion" TEXT;
