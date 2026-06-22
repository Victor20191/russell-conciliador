-- Mueve el módulo de mapeo del balance desde Trabajo a Configuración en
-- el catálogo persistido de publicación de módulos. La ruta operativa
-- /balance conserva solo ejecución/consulta; la parametrización vive en /config.

UPDATE "modulos_plataforma"
SET "grupo" = 'Configuración',
    "orden" = 125,
    "actualizado_en" = CURRENT_TIMESTAMP
WHERE "clave" = 'mapeo';
