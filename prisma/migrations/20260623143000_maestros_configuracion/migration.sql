-- Configuración · Maestros
-- Registra el módulo lógico y sus permisos. No crea tablas nuevas: los
-- maestros usan las tablas físicas existentes en español (usuarios,
-- jerarquia_usuarios, erps y sectores).

INSERT INTO "modulos_plataforma"
  ("clave", "etiqueta", "descripcion", "grupo", "icono", "orden", "habilitado_no_administradores", "bloqueable_no_administradores")
VALUES
  ('maestros', 'Maestros', 'Catálogos base de responsables, ERP y sectores.', 'Configuración', 'box', 120, true, true)
ON CONFLICT ("clave") DO UPDATE SET
  "etiqueta" = EXCLUDED."etiqueta",
  "descripcion" = EXCLUDED."descripcion",
  "grupo" = EXCLUDED."grupo",
  "icono" = EXCLUDED."icono",
  "orden" = EXCLUDED."orden",
  "bloqueable_no_administradores" = EXCLUDED."bloqueable_no_administradores",
  "actualizado_en" = CURRENT_TIMESTAMP;

INSERT INTO "permisos"
  ("codigo", "modulo", "accion", "etiqueta", "descripcion", "activo", "creado_en")
VALUES
  ('maestros:ver', 'maestros', 'ver', 'Ver maestros', 'Consultar los catálogos maestros de personas, ERP y sectores.', true, CURRENT_TIMESTAMP),
  ('maestros:administrar', 'maestros', 'administrar', 'Administrar maestros', 'Crear, editar y eliminar maestros de personas, ERP y sectores.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE SET
  "modulo" = EXCLUDED."modulo",
  "accion" = EXCLUDED."accion",
  "etiqueta" = EXCLUDED."etiqueta",
  "descripcion" = EXCLUDED."descripcion",
  "activo" = true;

INSERT INTO "roles_permisos" ("rol_id", "permiso_id", "creado_en")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r."codigo" IN ('Administrador', 'Superadministrador')
  AND p."codigo" IN ('maestros:ver', 'maestros:administrar')
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
