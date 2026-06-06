-- Migra todas las claves primarias de la aplicación a INTEGER autoincremental.
-- Los códigos de negocio se conservan como columnas únicas y las relaciones
-- se remapean antes de eliminar los identificadores TEXT anteriores.

BEGIN;

-- 1. Crear un id numérico temporal, determinista y consecutivo desde 1.
DO $$
DECLARE
  registro record;
BEGIN
  FOR registro IN
    SELECT *
    FROM (
      VALUES
        ('usuarios', 'id'),
        ('intentos_inicio_sesion', 'id'),
        ('roles', 'codigo'),
        ('permisos', 'codigo'),
        ('roles_permisos', 'id'),
        ('equipos', 'id'),
        ('integrantes_equipo', 'id'),
        ('asignaciones_cliente', 'id'),
        ('clientes', 'id'),
        ('modulos', 'id'),
        ('campos_modulo', 'id'),
        ('modulos_cliente', 'id'),
        ('conciliaciones', 'id'),
        ('filas_conciliacion', 'id'),
        ('comentarios_conciliacion', 'id'),
        ('notificaciones', 'id'),
        ('registros_auditoria', 'id'),
        ('cuentas_estandar', 'codigo'),
        ('balances', 'id'),
        ('formularios_dian', 'id'),
        ('periodos_dian', 'id'),
        ('secciones_dian', 'id'),
        ('renglones_dian', 'id'),
        ('mapeos_dian', 'id'),
        ('comentarios_dian', 'id'),
        ('cuentas_cliente', 'id'),
        ('opciones_russell', 'codigo'),
        ('contactos_cliente', 'id'),
        ('plantillas_requerimiento', 'id'),
        ('encabezados_plantilla_requerimiento', 'id'),
        ('familias_requerimiento', 'id'),
        ('items_requerimiento', 'id'),
        ('envios_requerimiento', 'id'),
        ('repositorios_requerimiento', 'id'),
        ('familias_repositorio', 'id'),
        ('items_repositorio', 'id'),
        ('actividades_repositorio', 'id'),
        ('presentaciones_requerimiento', 'id'),
        ('eventos_calendario', 'id')
    ) AS tablas(tabla, clave_anterior)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN id_nuevo INTEGER', registro.tabla);
    EXECUTE format(
      'WITH numerados AS (
         SELECT %1$I AS clave_anterior,
                row_number() OVER (ORDER BY %1$I)::INTEGER AS id_nuevo
         FROM %2$I
       )
       UPDATE %2$I AS destino
       SET id_nuevo = numerados.id_nuevo
       FROM numerados
       WHERE destino.%1$I = numerados.clave_anterior',
      registro.clave_anterior,
      registro.tabla
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id_nuevo SET NOT NULL', registro.tabla);
  END LOOP;
END
$$;

-- 2. Construir las nuevas referencias numéricas mientras aún existen las
-- claves TEXT anteriores.
ALTER TABLE "roles_permisos"
  ADD COLUMN "rol_id_nuevo" INTEGER,
  ADD COLUMN "permiso_id_nuevo" INTEGER;
UPDATE "roles_permisos" rp
SET "rol_id_nuevo" = r."id_nuevo",
    "permiso_id_nuevo" = p."id_nuevo"
FROM "roles" r, "permisos" p
WHERE rp."rol_codigo" = r."codigo"
  AND rp."permiso_codigo" = p."codigo";

ALTER TABLE "integrantes_equipo"
  ADD COLUMN "equipo_id_nuevo" INTEGER,
  ADD COLUMN "usuario_id_nuevo" INTEGER,
  ADD COLUMN "rol_id_nuevo" INTEGER;
UPDATE "integrantes_equipo" i
SET "equipo_id_nuevo" = e."id_nuevo",
    "usuario_id_nuevo" = u."id_nuevo"
FROM "equipos" e, "usuarios" u
WHERE i."equipo_id" = e."id"
  AND i."usuario_id" = u."id";
UPDATE "integrantes_equipo" i
SET "rol_id_nuevo" = r."id_nuevo"
FROM "roles" r
WHERE i."rol_codigo" = r."codigo";

ALTER TABLE "equipos" ADD COLUMN "lider_usuario_id_nuevo" INTEGER;
UPDATE "equipos" e
SET "lider_usuario_id_nuevo" = u."id_nuevo"
FROM "usuarios" u
WHERE e."lider_usuario_id" = u."id";

ALTER TABLE "asignaciones_cliente"
  ADD COLUMN "cliente_id_nuevo" INTEGER,
  ADD COLUMN "equipo_id_nuevo" INTEGER,
  ADD COLUMN "usuario_id_nuevo" INTEGER,
  ADD COLUMN "asignado_por_id_nuevo" INTEGER;
UPDATE "asignaciones_cliente" a
SET "cliente_id_nuevo" = c."id_nuevo"
FROM "clientes" c
WHERE a."cliente_id" = c."id";
UPDATE "asignaciones_cliente" a
SET "equipo_id_nuevo" = e."id_nuevo"
FROM "equipos" e
WHERE a."equipo_id" = e."id";
UPDATE "asignaciones_cliente" a
SET "usuario_id_nuevo" = u."id_nuevo"
FROM "usuarios" u
WHERE a."usuario_id" = u."id";
UPDATE "asignaciones_cliente" a
SET "asignado_por_id_nuevo" = u."id_nuevo"
FROM "usuarios" u
WHERE a."asignado_por_id" = u."id";

ALTER TABLE "campos_modulo" ADD COLUMN "modulo_id_nuevo" INTEGER;
UPDATE "campos_modulo" f
SET "modulo_id_nuevo" = m."id_nuevo"
FROM "modulos" m
WHERE f."modulo_id" = m."id";

ALTER TABLE "modulos_cliente"
  ADD COLUMN "cliente_id_nuevo" INTEGER,
  ADD COLUMN "modulo_id_nuevo" INTEGER;
UPDATE "modulos_cliente" cm
SET "cliente_id_nuevo" = c."id_nuevo",
    "modulo_id_nuevo" = m."id_nuevo"
FROM "clientes" c, "modulos" m
WHERE cm."cliente_id" = c."id"
  AND cm."modulo_id" = m."id";

ALTER TABLE "conciliaciones" ADD COLUMN "cliente_id_nuevo" INTEGER;
UPDATE "conciliaciones" r
SET "cliente_id_nuevo" = c."id_nuevo"
FROM "clientes" c
WHERE r."cliente_id" = c."id";

ALTER TABLE "filas_conciliacion" ADD COLUMN "conciliacion_id_nuevo" INTEGER;
UPDATE "filas_conciliacion" f
SET "conciliacion_id_nuevo" = r."id_nuevo"
FROM "conciliaciones" r
WHERE f."conciliacion_id" = r."id";

ALTER TABLE "comentarios_conciliacion" ADD COLUMN "conciliacion_id_nuevo" INTEGER;
UPDATE "comentarios_conciliacion" c
SET "conciliacion_id_nuevo" = r."id_nuevo"
FROM "conciliaciones" r
WHERE c."conciliacion_id" = r."id";

ALTER TABLE "periodos_dian" ADD COLUMN "formulario_id_nuevo" INTEGER;
UPDATE "periodos_dian" p
SET "formulario_id_nuevo" = f."id_nuevo"
FROM "formularios_dian" f
WHERE p."formulario_id" = f."id";

ALTER TABLE "secciones_dian" ADD COLUMN "formulario_id_nuevo" INTEGER;
UPDATE "secciones_dian" s
SET "formulario_id_nuevo" = f."id_nuevo"
FROM "formularios_dian" f
WHERE s."formulario_id" = f."id";

ALTER TABLE "renglones_dian" ADD COLUMN "seccion_id_nuevo" INTEGER;
UPDATE "renglones_dian" r
SET "seccion_id_nuevo" = s."id_nuevo"
FROM "secciones_dian" s
WHERE r."seccion_id" = s."id";

ALTER TABLE "mapeos_dian" ADD COLUMN "formulario_id_nuevo" INTEGER;
UPDATE "mapeos_dian" m
SET "formulario_id_nuevo" = f."id_nuevo"
FROM "formularios_dian" f
WHERE m."formulario_id" = f."id";

ALTER TABLE "comentarios_dian" ADD COLUMN "formulario_id_nuevo" INTEGER;
UPDATE "comentarios_dian" c
SET "formulario_id_nuevo" = f."id_nuevo"
FROM "formularios_dian" f
WHERE c."formulario_id" = f."id";

ALTER TABLE "cuentas_cliente" ADD COLUMN "opcion_russell_id_nuevo" INTEGER;
UPDATE "cuentas_cliente" c
SET "opcion_russell_id_nuevo" = o."id_nuevo"
FROM "opciones_russell" o
WHERE c."codigo_russell" = o."codigo";

ALTER TABLE "encabezados_plantilla_requerimiento" ADD COLUMN "plantilla_id_nuevo" INTEGER;
UPDATE "encabezados_plantilla_requerimiento" h
SET "plantilla_id_nuevo" = t."id_nuevo"
FROM "plantillas_requerimiento" t
WHERE h."plantilla_id" = t."id";

ALTER TABLE "familias_requerimiento" ADD COLUMN "plantilla_id_nuevo" INTEGER;
UPDATE "familias_requerimiento" f
SET "plantilla_id_nuevo" = t."id_nuevo"
FROM "plantillas_requerimiento" t
WHERE f."plantilla_id" = t."id";

ALTER TABLE "items_requerimiento" ADD COLUMN "familia_id_nuevo" INTEGER;
UPDATE "items_requerimiento" i
SET "familia_id_nuevo" = f."id_nuevo"
FROM "familias_requerimiento" f
WHERE i."familia_id" = f."id";

ALTER TABLE "familias_repositorio" ADD COLUMN "repositorio_id_nuevo" INTEGER;
UPDATE "familias_repositorio" f
SET "repositorio_id_nuevo" = r."id_nuevo"
FROM "repositorios_requerimiento" r
WHERE f."repositorio_id" = r."id";

ALTER TABLE "items_repositorio" ADD COLUMN "familia_id_nuevo" INTEGER;
UPDATE "items_repositorio" i
SET "familia_id_nuevo" = f."id_nuevo"
FROM "familias_repositorio" f
WHERE i."familia_id" = f."id";

ALTER TABLE "actividades_repositorio" ADD COLUMN "repositorio_id_nuevo" INTEGER;
UPDATE "actividades_repositorio" a
SET "repositorio_id_nuevo" = r."id_nuevo"
FROM "repositorios_requerimiento" r
WHERE a."repositorio_id" = r."id";

-- Abortamos antes de alterar constraints si una referencia obligatoria no
-- pudo resolverse.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "roles_permisos"
    WHERE "rol_id_nuevo" IS NULL OR "permiso_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "integrantes_equipo"
    WHERE "equipo_id_nuevo" IS NULL OR "usuario_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "asignaciones_cliente"
    WHERE "cliente_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "campos_modulo"
    WHERE "modulo_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "modulos_cliente"
    WHERE "cliente_id_nuevo" IS NULL OR "modulo_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "filas_conciliacion"
    WHERE "conciliacion_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "comentarios_conciliacion"
    WHERE "conciliacion_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "periodos_dian"
    WHERE "formulario_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "secciones_dian"
    WHERE "formulario_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "renglones_dian"
    WHERE "seccion_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "mapeos_dian"
    WHERE "formulario_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "comentarios_dian"
    WHERE "formulario_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "encabezados_plantilla_requerimiento"
    WHERE "plantilla_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "familias_requerimiento"
    WHERE "plantilla_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "items_requerimiento"
    WHERE "familia_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "familias_repositorio"
    WHERE "repositorio_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "items_repositorio"
    WHERE "familia_id_nuevo" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "actividades_repositorio"
    WHERE "repositorio_id_nuevo" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se pudieron remapear todas las relaciones obligatorias';
  END IF;
END
$$;

-- 3. Retirar FKs y PKs anteriores. Se recrean con columnas INTEGER.
DO $$
DECLARE
  restriccion record;
BEGIN
  FOR restriccion IN
    SELECT conrelid::regclass AS tabla, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', restriccion.tabla, restriccion.conname);
  END LOOP;
END
$$;

DO $$
DECLARE
  restriccion record;
BEGIN
  FOR restriccion IN
    SELECT conrelid::regclass AS tabla, conname
    FROM pg_constraint
    WHERE contype = 'p'
      AND connamespace = 'public'::regnamespace
      AND conrelid <> '_prisma_migrations'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', restriccion.tabla, restriccion.conname);
  END LOOP;
END
$$;

-- 4. Conservar como códigos únicos las PK naturales anteriores.
ALTER TABLE "clientes" RENAME COLUMN "id" TO "codigo";
ALTER TABLE "modulos" RENAME COLUMN "id" TO "codigo";
ALTER TABLE "conciliaciones" RENAME COLUMN "id" TO "codigo";
ALTER TABLE "formularios_dian" RENAME COLUMN "id" TO "clave";
ALTER TABLE "secciones_dian" RENAME COLUMN "id" TO "clave";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "id" TO "clave";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "id" TO "codigo";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "id" TO "codigo";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "id" TO "codigo";

-- 5. Eliminar las PK TEXT técnicas. Sus equivalencias ya están remapeadas.
ALTER TABLE "usuarios" DROP COLUMN "id";
ALTER TABLE "intentos_inicio_sesion" DROP COLUMN "id";
ALTER TABLE "roles_permisos" DROP COLUMN "id";
ALTER TABLE "equipos" DROP COLUMN "id";
ALTER TABLE "integrantes_equipo" DROP COLUMN "id";
ALTER TABLE "asignaciones_cliente" DROP COLUMN "id";
ALTER TABLE "campos_modulo" DROP COLUMN "id";
ALTER TABLE "modulos_cliente" DROP COLUMN "id";
ALTER TABLE "filas_conciliacion" DROP COLUMN "id";
ALTER TABLE "comentarios_conciliacion" DROP COLUMN "id";
ALTER TABLE "notificaciones" DROP COLUMN "id";
ALTER TABLE "registros_auditoria" DROP COLUMN "id";
ALTER TABLE "balances" DROP COLUMN "id";
ALTER TABLE "periodos_dian" DROP COLUMN "id";
ALTER TABLE "renglones_dian" DROP COLUMN "id";
ALTER TABLE "mapeos_dian" DROP COLUMN "id";
ALTER TABLE "comentarios_dian" DROP COLUMN "id";
ALTER TABLE "cuentas_cliente" DROP COLUMN "id";
ALTER TABLE "contactos_cliente" DROP COLUMN "id";
ALTER TABLE "encabezados_plantilla_requerimiento" DROP COLUMN "id";
ALTER TABLE "familias_requerimiento" DROP COLUMN "id";
ALTER TABLE "items_requerimiento" DROP COLUMN "id";
ALTER TABLE "familias_repositorio" DROP COLUMN "id";
ALTER TABLE "items_repositorio" DROP COLUMN "id";
ALTER TABLE "actividades_repositorio" DROP COLUMN "id";
ALTER TABLE "eventos_calendario" DROP COLUMN "id";

-- 6. Publicar el nuevo id y convertirlo en identity + PK en cada tabla.
DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'usuarios',
    'intentos_inicio_sesion',
    'roles',
    'permisos',
    'roles_permisos',
    'equipos',
    'integrantes_equipo',
    'asignaciones_cliente',
    'clientes',
    'modulos',
    'campos_modulo',
    'modulos_cliente',
    'conciliaciones',
    'filas_conciliacion',
    'comentarios_conciliacion',
    'notificaciones',
    'registros_auditoria',
    'cuentas_estandar',
    'balances',
    'formularios_dian',
    'periodos_dian',
    'secciones_dian',
    'renglones_dian',
    'mapeos_dian',
    'comentarios_dian',
    'cuentas_cliente',
    'opciones_russell',
    'contactos_cliente',
    'plantillas_requerimiento',
    'encabezados_plantilla_requerimiento',
    'familias_requerimiento',
    'items_requerimiento',
    'envios_requerimiento',
    'repositorios_requerimiento',
    'familias_repositorio',
    'items_repositorio',
    'actividades_repositorio',
    'presentaciones_requerimiento',
    'eventos_calendario'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN id_nuevo TO id', tabla);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY', tabla);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY (id)', tabla, tabla || '_pkey');
    EXECUTE format(
      'SELECT setval(
         pg_get_serial_sequence(%L, %L),
         GREATEST(COALESCE(MAX(id), 0) + 1, 1),
         false
       ) FROM %I',
      'public.' || tabla,
      'id',
      tabla
    );
  END LOOP;
END
$$;

-- 7. Sustituir columnas de relación TEXT por sus equivalentes INTEGER.
ALTER TABLE "roles_permisos"
  DROP COLUMN "rol_codigo",
  DROP COLUMN "permiso_codigo";
ALTER TABLE "roles_permisos" RENAME COLUMN "rol_id_nuevo" TO "rol_id";
ALTER TABLE "roles_permisos" RENAME COLUMN "permiso_id_nuevo" TO "permiso_id";
ALTER TABLE "roles_permisos" ALTER COLUMN "rol_id" SET NOT NULL;
ALTER TABLE "roles_permisos" ALTER COLUMN "permiso_id" SET NOT NULL;

ALTER TABLE "equipos" DROP COLUMN "lider_usuario_id";
ALTER TABLE "equipos" RENAME COLUMN "lider_usuario_id_nuevo" TO "lider_usuario_id";

ALTER TABLE "integrantes_equipo"
  DROP COLUMN "equipo_id",
  DROP COLUMN "usuario_id",
  DROP COLUMN "rol_codigo";
ALTER TABLE "integrantes_equipo" RENAME COLUMN "equipo_id_nuevo" TO "equipo_id";
ALTER TABLE "integrantes_equipo" RENAME COLUMN "usuario_id_nuevo" TO "usuario_id";
ALTER TABLE "integrantes_equipo" RENAME COLUMN "rol_id_nuevo" TO "rol_id";
ALTER TABLE "integrantes_equipo" ALTER COLUMN "equipo_id" SET NOT NULL;
ALTER TABLE "integrantes_equipo" ALTER COLUMN "usuario_id" SET NOT NULL;

ALTER TABLE "asignaciones_cliente"
  DROP COLUMN "cliente_id",
  DROP COLUMN "equipo_id",
  DROP COLUMN "usuario_id",
  DROP COLUMN "asignado_por_id";
ALTER TABLE "asignaciones_cliente" RENAME COLUMN "cliente_id_nuevo" TO "cliente_id";
ALTER TABLE "asignaciones_cliente" RENAME COLUMN "equipo_id_nuevo" TO "equipo_id";
ALTER TABLE "asignaciones_cliente" RENAME COLUMN "usuario_id_nuevo" TO "usuario_id";
ALTER TABLE "asignaciones_cliente" RENAME COLUMN "asignado_por_id_nuevo" TO "asignado_por_id";
ALTER TABLE "asignaciones_cliente" ALTER COLUMN "cliente_id" SET NOT NULL;

ALTER TABLE "campos_modulo" DROP COLUMN "modulo_id";
ALTER TABLE "campos_modulo" RENAME COLUMN "modulo_id_nuevo" TO "modulo_id";
ALTER TABLE "campos_modulo" ALTER COLUMN "modulo_id" SET NOT NULL;

ALTER TABLE "modulos_cliente"
  DROP COLUMN "cliente_id",
  DROP COLUMN "modulo_id";
ALTER TABLE "modulos_cliente" RENAME COLUMN "cliente_id_nuevo" TO "cliente_id";
ALTER TABLE "modulos_cliente" RENAME COLUMN "modulo_id_nuevo" TO "modulo_id";
ALTER TABLE "modulos_cliente" ALTER COLUMN "cliente_id" SET NOT NULL;
ALTER TABLE "modulos_cliente" ALTER COLUMN "modulo_id" SET NOT NULL;

ALTER TABLE "conciliaciones" DROP COLUMN "cliente_id";
ALTER TABLE "conciliaciones" RENAME COLUMN "cliente_id_nuevo" TO "cliente_id";

ALTER TABLE "filas_conciliacion" DROP COLUMN "conciliacion_id";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "conciliacion_id_nuevo" TO "conciliacion_id";
ALTER TABLE "filas_conciliacion" ALTER COLUMN "conciliacion_id" SET NOT NULL;

ALTER TABLE "comentarios_conciliacion" DROP COLUMN "conciliacion_id";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "conciliacion_id_nuevo" TO "conciliacion_id";
ALTER TABLE "comentarios_conciliacion" ALTER COLUMN "conciliacion_id" SET NOT NULL;

ALTER TABLE "periodos_dian" DROP COLUMN "formulario_id";
ALTER TABLE "periodos_dian" RENAME COLUMN "formulario_id_nuevo" TO "formulario_id";
ALTER TABLE "periodos_dian" ALTER COLUMN "formulario_id" SET NOT NULL;

ALTER TABLE "secciones_dian" DROP COLUMN "formulario_id";
ALTER TABLE "secciones_dian" RENAME COLUMN "formulario_id_nuevo" TO "formulario_id";
ALTER TABLE "secciones_dian" ALTER COLUMN "formulario_id" SET NOT NULL;

ALTER TABLE "renglones_dian" DROP COLUMN "seccion_id";
ALTER TABLE "renglones_dian" RENAME COLUMN "seccion_id_nuevo" TO "seccion_id";
ALTER TABLE "renglones_dian" ALTER COLUMN "seccion_id" SET NOT NULL;

ALTER TABLE "mapeos_dian" DROP COLUMN "formulario_id";
ALTER TABLE "mapeos_dian" RENAME COLUMN "formulario_id_nuevo" TO "formulario_id";
ALTER TABLE "mapeos_dian" ALTER COLUMN "formulario_id" SET NOT NULL;

ALTER TABLE "comentarios_dian" DROP COLUMN "formulario_id";
ALTER TABLE "comentarios_dian" RENAME COLUMN "formulario_id_nuevo" TO "formulario_id";
ALTER TABLE "comentarios_dian" ALTER COLUMN "formulario_id" SET NOT NULL;

ALTER TABLE "cuentas_cliente" DROP COLUMN "codigo_russell";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "opcion_russell_id_nuevo" TO "opcion_russell_id";

ALTER TABLE "encabezados_plantilla_requerimiento" DROP COLUMN "plantilla_id";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "plantilla_id_nuevo" TO "plantilla_id";
ALTER TABLE "encabezados_plantilla_requerimiento" ALTER COLUMN "plantilla_id" SET NOT NULL;

ALTER TABLE "familias_requerimiento" DROP COLUMN "plantilla_id";
ALTER TABLE "familias_requerimiento" RENAME COLUMN "plantilla_id_nuevo" TO "plantilla_id";
ALTER TABLE "familias_requerimiento" ALTER COLUMN "plantilla_id" SET NOT NULL;

ALTER TABLE "items_requerimiento" DROP COLUMN "familia_id";
ALTER TABLE "items_requerimiento" RENAME COLUMN "familia_id_nuevo" TO "familia_id";
ALTER TABLE "items_requerimiento" ALTER COLUMN "familia_id" SET NOT NULL;

ALTER TABLE "familias_repositorio" DROP COLUMN "repositorio_id";
ALTER TABLE "familias_repositorio" RENAME COLUMN "repositorio_id_nuevo" TO "repositorio_id";
ALTER TABLE "familias_repositorio" ALTER COLUMN "repositorio_id" SET NOT NULL;

ALTER TABLE "items_repositorio" DROP COLUMN "familia_id";
ALTER TABLE "items_repositorio" RENAME COLUMN "familia_id_nuevo" TO "familia_id";
ALTER TABLE "items_repositorio" ALTER COLUMN "familia_id" SET NOT NULL;

ALTER TABLE "actividades_repositorio" DROP COLUMN "repositorio_id";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "repositorio_id_nuevo" TO "repositorio_id";
ALTER TABLE "actividades_repositorio" ALTER COLUMN "repositorio_id" SET NOT NULL;

ALTER TABLE "eventos_calendario" RENAME COLUMN "cliente_id" TO "cliente_clave";

-- 8. Códigos de negocio únicos.
ALTER TABLE "roles" ADD CONSTRAINT "roles_codigo_key" UNIQUE ("codigo");
ALTER TABLE "permisos" ADD CONSTRAINT "permisos_codigo_key" UNIQUE ("codigo");
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_codigo_key" UNIQUE ("codigo");
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_codigo_key" UNIQUE ("codigo");
ALTER TABLE "conciliaciones" ADD CONSTRAINT "conciliaciones_codigo_key" UNIQUE ("codigo");
ALTER TABLE "cuentas_estandar" ADD CONSTRAINT "cuentas_estandar_codigo_key" UNIQUE ("codigo");
ALTER TABLE "formularios_dian" ADD CONSTRAINT "formularios_dian_clave_key" UNIQUE ("clave");
ALTER TABLE "secciones_dian" ADD CONSTRAINT "secciones_dian_clave_key" UNIQUE ("clave");
ALTER TABLE "opciones_russell" ADD CONSTRAINT "opciones_russell_codigo_key" UNIQUE ("codigo");
ALTER TABLE "plantillas_requerimiento" ADD CONSTRAINT "plantillas_requerimiento_clave_key" UNIQUE ("clave");
ALTER TABLE "envios_requerimiento" ADD CONSTRAINT "envios_requerimiento_codigo_key" UNIQUE ("codigo");
ALTER TABLE "repositorios_requerimiento" ADD CONSTRAINT "repositorios_requerimiento_codigo_key" UNIQUE ("codigo");
ALTER TABLE "presentaciones_requerimiento" ADD CONSTRAINT "presentaciones_requerimiento_codigo_key" UNIQUE ("codigo");

-- 9. Unicidad e índices que dependían de las columnas de relación anteriores.
CREATE UNIQUE INDEX "roles_permisos_rol_id_permiso_id_key"
  ON "roles_permisos"("rol_id", "permiso_id");
CREATE INDEX "roles_permisos_permiso_id_idx" ON "roles_permisos"("permiso_id");
CREATE INDEX "equipos_lider_usuario_id_idx" ON "equipos"("lider_usuario_id");
CREATE UNIQUE INDEX "integrantes_equipo_equipo_id_usuario_id_key"
  ON "integrantes_equipo"("equipo_id", "usuario_id");
CREATE INDEX "integrantes_equipo_usuario_id_idx" ON "integrantes_equipo"("usuario_id");
CREATE UNIQUE INDEX "asignaciones_cliente_cliente_id_equipo_id_usuario_id_key"
  ON "asignaciones_cliente"("cliente_id", "equipo_id", "usuario_id");
CREATE INDEX "asignaciones_cliente_cliente_id_idx" ON "asignaciones_cliente"("cliente_id");
CREATE INDEX "asignaciones_cliente_equipo_id_idx" ON "asignaciones_cliente"("equipo_id");
CREATE INDEX "asignaciones_cliente_usuario_id_activo_idx"
  ON "asignaciones_cliente"("usuario_id", "activo");
CREATE UNIQUE INDEX "campos_modulo_modulo_id_clave_key"
  ON "campos_modulo"("modulo_id", "clave");
CREATE UNIQUE INDEX "modulos_cliente_cliente_id_modulo_id_key"
  ON "modulos_cliente"("cliente_id", "modulo_id");
CREATE UNIQUE INDEX "periodos_dian_formulario_id_clave_periodo_key"
  ON "periodos_dian"("formulario_id", "clave_periodo");
CREATE UNIQUE INDEX "encabezados_plantilla_requerimiento_plantilla_id_key"
  ON "encabezados_plantilla_requerimiento"("plantilla_id");

-- 10. Foreign keys numéricas.
ALTER TABLE "roles_permisos"
  ADD CONSTRAINT "roles_permisos_rol_id_fkey"
  FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "roles_permisos_permiso_id_fkey"
  FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integrantes_equipo"
  ADD CONSTRAINT "integrantes_equipo_equipo_id_fkey"
  FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "integrantes_equipo_rol_id_fkey"
  FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asignaciones_cliente"
  ADD CONSTRAINT "asignaciones_cliente_equipo_id_fkey"
  FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campos_modulo"
  ADD CONSTRAINT "campos_modulo_modulo_id_fkey"
  FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modulos_cliente"
  ADD CONSTRAINT "modulos_cliente_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "modulos_cliente_modulo_id_fkey"
  FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conciliaciones"
  ADD CONSTRAINT "conciliaciones_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "filas_conciliacion"
  ADD CONSTRAINT "filas_conciliacion_conciliacion_id_fkey"
  FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comentarios_conciliacion"
  ADD CONSTRAINT "comentarios_conciliacion_conciliacion_id_fkey"
  FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "periodos_dian"
  ADD CONSTRAINT "periodos_dian_formulario_id_fkey"
  FOREIGN KEY ("formulario_id") REFERENCES "formularios_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "secciones_dian"
  ADD CONSTRAINT "secciones_dian_formulario_id_fkey"
  FOREIGN KEY ("formulario_id") REFERENCES "formularios_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "renglones_dian"
  ADD CONSTRAINT "renglones_dian_seccion_id_fkey"
  FOREIGN KEY ("seccion_id") REFERENCES "secciones_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mapeos_dian"
  ADD CONSTRAINT "mapeos_dian_formulario_id_fkey"
  FOREIGN KEY ("formulario_id") REFERENCES "formularios_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comentarios_dian"
  ADD CONSTRAINT "comentarios_dian_formulario_id_fkey"
  FOREIGN KEY ("formulario_id") REFERENCES "formularios_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cuentas_cliente"
  ADD CONSTRAINT "cuentas_cliente_opcion_russell_id_fkey"
  FOREIGN KEY ("opcion_russell_id") REFERENCES "opciones_russell"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "encabezados_plantilla_requerimiento"
  ADD CONSTRAINT "encabezados_plantilla_requerimiento_plantilla_id_fkey"
  FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_requerimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "familias_requerimiento"
  ADD CONSTRAINT "familias_requerimiento_plantilla_id_fkey"
  FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_requerimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "items_requerimiento"
  ADD CONSTRAINT "items_requerimiento_familia_id_fkey"
  FOREIGN KEY ("familia_id") REFERENCES "familias_requerimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "familias_repositorio"
  ADD CONSTRAINT "familias_repositorio_repositorio_id_fkey"
  FOREIGN KEY ("repositorio_id") REFERENCES "repositorios_requerimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "items_repositorio"
  ADD CONSTRAINT "items_repositorio_familia_id_fkey"
  FOREIGN KEY ("familia_id") REFERENCES "familias_repositorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "actividades_repositorio"
  ADD CONSTRAINT "actividades_repositorio_repositorio_id_fkey"
  FOREIGN KEY ("repositorio_id") REFERENCES "repositorios_requerimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
