-- Remoción de los módulos Calendario, Razonabilidad, Requerimientos y Presentaciones.
-- Se eliminan las tablas físicas de Requerimientos (plantillas, repositorios,
-- presentaciones, envíos, contactos) y de Calendario. Razonabilidad no tenía
-- tabla propia (era una vista sobre el balance), por lo que no requiere DROP.

-- Requerimientos · Plantillas (hijos → padres)
DROP TABLE IF EXISTS "items_requerimiento" CASCADE;
DROP TABLE IF EXISTS "familias_requerimiento" CASCADE;
DROP TABLE IF EXISTS "encabezados_plantilla_requerimiento" CASCADE;
DROP TABLE IF EXISTS "plantillas_requerimiento" CASCADE;

-- Requerimientos · Repositorios (hijos → padres)
DROP TABLE IF EXISTS "items_repositorio" CASCADE;
DROP TABLE IF EXISTS "familias_repositorio" CASCADE;
DROP TABLE IF EXISTS "actividades_repositorio" CASCADE;
DROP TABLE IF EXISTS "repositorios_requerimiento" CASCADE;

-- Requerimientos · Envíos y Presentaciones
DROP TABLE IF EXISTS "envios_requerimiento" CASCADE;
DROP TABLE IF EXISTS "presentaciones_requerimiento" CASCADE;

-- Contactos de cliente (solo usados por Requerimientos)
DROP TABLE IF EXISTS "contactos_cliente" CASCADE;

-- Calendario
DROP TABLE IF EXISTS "eventos_calendario" CASCADE;
