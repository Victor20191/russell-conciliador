-- Limpieza de residuo RBAC tras remover Calendario, Razonabilidad,
-- Requerimientos y Presentaciones. El catálogo (src/lib/rbac/*) ya no
-- los define; aquí se eliminan las filas previamente sembradas para que
-- la BD refleje el catálogo. Idempotente: en una BD nueva no borra nada.

-- Permisos de los módulos removidos. El FK roles_permisos.permiso_id
-- tiene ON DELETE CASCADE, por lo que las concesiones rol×permiso se
-- eliminan automáticamente al borrar el permiso.
DELETE FROM "permisos"
WHERE "modulo" IN ('razonabilidad', 'requerimientos', 'presentaciones', 'calendario');

-- Estados de publicación de los módulos removidos.
DELETE FROM "modulos_plataforma"
WHERE "clave" IN ('razonabilidad', 'requerimientos', 'presentaciones', 'calendario');
