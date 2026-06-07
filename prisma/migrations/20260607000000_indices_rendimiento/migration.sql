-- Índices de rendimiento para columnas usadas en ORDER BY y FK sin índice automático.
-- PostgreSQL no crea índices automáticamente en FK; solo en PK y UNIQUE.

-- Índice en filas_conciliacion(conciliacion_id): mejora las consultas de filas por
-- conciliación (JOIN implícito al cargar detalle de una conciliación con muchas filas).
CREATE INDEX "filas_conciliacion_conciliacion_id_idx" ON "filas_conciliacion"("conciliacion_id");

-- Índice en registros_auditoria(creado_en): mejora el ORDER BY creado_en DESC
-- usado en el dashboard (actividad del equipo) y páginas de auditoría.
CREATE INDEX "registros_auditoria_creado_en_idx" ON "registros_auditoria"("creado_en");

-- Índice en conciliaciones(creado_en): mejora el ORDER BY creado_en DESC
-- usado en el dashboard y listados de conciliaciones.
CREATE INDEX "conciliaciones_creado_en_idx" ON "conciliaciones"("creado_en");
