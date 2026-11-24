-- Corrige el día de despliegue que la migración 20261123200000 les puso a las versiones ya publicadas
-- (23/Nov/2026). Debía ser el día de la publicación en Colombia, pero en producción `publicado_en`
-- sigue siendo TIMESTAMP sin zona con la hora UTC «a secas» (la conversión de 20260716234000 no quedó
-- en esa columna): `publicado_en AT TIME ZONE 'America/Bogota'` lo leyó como hora de Colombia y las
-- publicaciones hechas de noche cayeron al día siguiente (la 2.5.0, publicada el 3/Oct a las 7:54 p. m.,
-- quedó desplegada el 4/Oct). Se calcula según el tipo real de la columna, para que sirva en cualquier
-- base. Solo toca las versiones publicadas; nadie ha editado aún esta fecha a mano (el campo nació hoy).
DO $$
DECLARE
  tipo text;
BEGIN
  SELECT data_type INTO tipo
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'versiones_plataforma'
    AND column_name = 'publicado_en';

  IF tipo = 'timestamp without time zone' THEN
    -- Hora UTC sin zona: primero se vuelve instante (AT TIME ZONE 'UTC') y luego hora de Colombia.
    UPDATE "versiones_plataforma"
    SET "desplegado_en" = (((("publicado_en" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'))::date + TIME '12:00') AT TIME ZONE 'UTC'
    WHERE "publicado_en" IS NOT NULL;
  ELSE
    UPDATE "versiones_plataforma"
    SET "desplegado_en" = (("publicado_en" AT TIME ZONE 'America/Bogota')::date + TIME '12:00') AT TIME ZONE 'UTC'
    WHERE "publicado_en" IS NOT NULL;
  END IF;
END $$;
