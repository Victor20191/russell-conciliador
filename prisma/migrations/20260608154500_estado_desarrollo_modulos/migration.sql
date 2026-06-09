-- Ajusta la semántica visible del control: los módulos no publicados se
-- tratan como "En desarrollo" y solo quedan visibles para Superadministrador.

UPDATE "modulos_plataforma"
SET "descripcion" = 'Control de visibilidad para usuarios no superadministradores.',
    "actualizado_en" = CURRENT_TIMESTAMP
WHERE "clave" = 'publicacion_modulos';

UPDATE "permisos"
SET "descripcion" = 'Consultar qué módulos están publicados para usuarios no superadministradores.'
WHERE "codigo" = 'publicacion_modulos:ver';

UPDATE "permisos"
SET "descripcion" = 'Marcar módulos como publicados o en desarrollo para usuarios no superadministradores.'
WHERE "codigo" = 'publicacion_modulos:configurar';
