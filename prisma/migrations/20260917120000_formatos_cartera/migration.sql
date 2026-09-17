-- Tipo de formato de cada archivo de un cargue de Cartera o CxP (por documento, por edades o
-- por documento y edades): decide qué controles se validan. Aditiva y nula: los cargues
-- anteriores quedan en null y su tipo se deduce de las filas.
ALTER TABLE "modulo_dato_encabezado" ADD COLUMN "formatos_cartera" JSONB;
