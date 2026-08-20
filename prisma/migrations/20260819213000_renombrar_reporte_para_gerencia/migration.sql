-- Actualiza únicamente la etiqueta visible; conserva el código canónico del
-- permiso para no romper autorizaciones, roles ni integraciones existentes.
UPDATE "permisos"
SET "etiqueta" = 'Generar reporte para gerencia sobre uso y avances'
WHERE "codigo" = 'auditoria:reporte_ejecutivo';
