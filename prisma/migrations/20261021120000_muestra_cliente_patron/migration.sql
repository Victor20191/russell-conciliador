-- De qué cliente salió la muestra de una versión de patrón (21/Oct/2026). Aditiva.
--
-- Solo de CONSULTA: «muestra del cliente X» no restringe el uso de la versión a ese cliente (eso
-- sigue siendo `cliente_origen_id`). Las versiones existentes quedan en null: no se rellenan solas;
-- un administrador puede indicarlo a mano. FK suave a `clientes`, como `cliente_origen_id`; el
-- nombre es una foto tomada al guardar, como `cliente_origen_nombre`.
ALTER TABLE "versiones_patron_archivo_modulo" ADD COLUMN "muestra_cliente_id" INTEGER;
ALTER TABLE "versiones_patron_archivo_modulo" ADD COLUMN "muestra_cliente_nombre" TEXT;
