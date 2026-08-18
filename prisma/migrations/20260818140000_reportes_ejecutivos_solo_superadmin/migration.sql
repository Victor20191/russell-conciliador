-- Los reportes ejecutivos combinan actividad global de usuarios, clientes y
-- novedades de la plataforma. Su generación manual queda reservada al
-- Superadministrador, incluso si la matriz anterior también la concedía al
-- Administrador.

INSERT INTO "permisos"
  ("codigo", "modulo", "accion", "etiqueta", "descripcion", "activo", "creado_en")
VALUES
  (
    'auditoria:reporte_ejecutivo',
    'auditoria',
    'reporte_ejecutivo',
    'Generar reporte ejecutivo de uso y adopción',
    'Generar reportes globales de actividad, adopción y novedades de la plataforma.',
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("codigo") DO UPDATE SET
  "modulo" = EXCLUDED."modulo",
  "accion" = EXCLUDED."accion",
  "etiqueta" = EXCLUDED."etiqueta",
  "descripcion" = EXCLUDED."descripcion",
  "activo" = true;

DELETE FROM "roles_permisos" AS rol_permiso
USING "roles" AS rol, "permisos" AS permiso
WHERE rol_permiso."rol_id" = rol."id"
  AND rol_permiso."permiso_id" = permiso."id"
  AND permiso."codigo" = 'auditoria:reporte_ejecutivo'
  AND rol."codigo" <> 'Superadministrador';

INSERT INTO "roles_permisos" ("rol_id", "permiso_id", "creado_en")
SELECT rol."id", permiso."id", CURRENT_TIMESTAMP
FROM "roles" AS rol
CROSS JOIN "permisos" AS permiso
WHERE rol."codigo" = 'Superadministrador'
  AND permiso."codigo" = 'auditoria:reporte_ejecutivo'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
