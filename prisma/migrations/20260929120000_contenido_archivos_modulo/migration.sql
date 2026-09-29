-- Qué trae cada archivo de un cargue de módulo (29/Sep/2026).
--
-- Ingresos puede llegar en un archivo con facturas y notas crédito, o en dos: facturas y, aparte,
-- SOLO notas crédito (que muchos ERP imprimen en positivo y se invierten al leer). Cada carga
-- declara qué trae su archivo, y el cargue guarda aquí la lista:
-- `[{ loteId, archivo, contenido, signoInvertido, filas, total, previo? }]`.
--
-- ADITIVA y nula, sin datos: los cargues anteriores quedan en null y el código anterior no la lee.
ALTER TABLE "modulo_dato_encabezado" ADD COLUMN "contenido_archivos" JSONB;
