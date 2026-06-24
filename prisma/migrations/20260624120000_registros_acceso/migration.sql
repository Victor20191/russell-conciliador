-- ACCESOS / NAVEGACIÓN (analítica de tráfico). Capa separada de
-- `registros_auditoria` (que registra MUTACIONES): aquí se guarda QUÉ rutas
-- visita cada usuario y cuándo, incluidos los eventos de ingreso/cierre de
-- sesión (columna `tipo`: navegacion | ingreso | salida).
--
-- `usuario`/`rol` van DENORMALIZADOS para que el histórico sobreviva al borrado
-- del usuario. `usuario_id` es FK LÓGICA a usuarios (solo Int, sin restricción
-- ni cascada), como el resto de FK suaves hacia `usuarios`.

-- CreateTable
CREATE TABLE "registros_acceso" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "usuario" TEXT NOT NULL,
    "rol" TEXT,
    "ruta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ip" TEXT,
    "agente" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registros_acceso_creado_en_idx" ON "registros_acceso"("creado_en");

-- CreateIndex
CREATE INDEX "registros_acceso_usuario_id_idx" ON "registros_acceso"("usuario_id");

-- CreateIndex
CREATE INDEX "registros_acceso_ruta_idx" ON "registros_acceso"("ruta");

-- CreateIndex
CREATE INDEX "registros_acceso_tipo_idx" ON "registros_acceso"("tipo");
