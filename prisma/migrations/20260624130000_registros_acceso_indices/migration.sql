-- Afinación de índices de `registros_acceso`: se sustituyen los índices de una
-- sola columna (usuario_id, ruta, tipo) por índices COMPUESTOS alineados a las
-- consultas reales del tablero, y se conserva el de `creado_en` (rango + orden +
-- purga por antigüedad). Menos índices que mantener en cada INSERT (tabla de
-- alta escritura) y mejor selectividad en las lecturas.

-- DropIndex
DROP INDEX "registros_acceso_usuario_id_idx";

-- DropIndex
DROP INDEX "registros_acceso_ruta_idx";

-- DropIndex
DROP INDEX "registros_acceso_tipo_idx";

-- CreateIndex
CREATE INDEX "registros_acceso_tipo_creado_en_idx" ON "registros_acceso"("tipo", "creado_en");

-- CreateIndex
CREATE INDEX "registros_acceso_usuario_creado_en_idx" ON "registros_acceso"("usuario", "creado_en");
