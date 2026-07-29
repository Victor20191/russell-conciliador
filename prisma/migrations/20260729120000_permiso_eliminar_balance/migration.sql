-- El borrado de balances oficiales y perfiles de carga es una operación
-- destructiva independiente de cargar/editar. Se concede de fábrica solo a
-- administradores de plataforma y permanece configurable en la matriz RBAC.

INSERT INTO "permisos"
  ("codigo", "modulo", "accion", "etiqueta", "descripcion", "activo", "creado_en")
VALUES
  (
    'balance:eliminar',
    'balance',
    'eliminar',
    'Eliminar balances y perfiles de carga',
    'Eliminar una versión, un período completo o el historial de balances y perfiles de carga de un cliente.',
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("codigo") DO UPDATE SET
  "modulo" = EXCLUDED."modulo",
  "accion" = EXCLUDED."accion",
  "etiqueta" = EXCLUDED."etiqueta",
  "descripcion" = EXCLUDED."descripcion",
  "activo" = true;

INSERT INTO "roles_permisos" ("rol_id", "permiso_id", "creado_en")
SELECT rol."id", permiso."id", CURRENT_TIMESTAMP
FROM "roles" AS rol
CROSS JOIN "permisos" AS permiso
WHERE rol."codigo" IN ('Administrador', 'Superadministrador')
  AND permiso."codigo" = 'balance:eliminar'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
