-- Día en que una versión de Novedades quedó desplegada (23/Nov/2026, pedido del usuario). El reporte
-- para gerencia cuenta como avances del período las versiones publicadas cuya fecha de despliegue cae
-- en él, para que dos reportes de fechas distintas no repitan los mismos avances. La fecha de
-- publicación (`publicado_en`) se pone sola al publicar y no siempre coincide con el despliegue real
-- (la 3.0.0 se desplegó el 19/Oct y siguió en borrador), por eso esta va aparte y es editable.
-- Columna nueva y opcional: no cambia nada de lo existente. Las versiones ya publicadas toman el día
-- de su publicación en Colombia, guardado a mediodía UTC como el resto de fechas de este campo.
ALTER TABLE "versiones_plataforma" ADD COLUMN "desplegado_en" TIMESTAMPTZ(3);

UPDATE "versiones_plataforma"
SET "desplegado_en" = (("publicado_en" AT TIME ZONE 'America/Bogota')::date + TIME '12:00') AT TIME ZONE 'UTC'
WHERE "publicado_en" IS NOT NULL AND "desplegado_en" IS NULL;
