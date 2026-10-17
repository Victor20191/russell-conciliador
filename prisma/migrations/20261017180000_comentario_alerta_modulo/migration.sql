-- COMENTARIOS DE LAS ALERTAS que lo exigen para cerrar la conciliación de un módulo (17/Oct/2026).
--
-- Inventarios: valores negativos, costo cero con existencias, sin existencias y con costo, y costo
-- unitario 1. Un comentario por tipo de alerta y período (mínimo 10 caracteres, lo valida la
-- acción). `referencias` y `valor` congelan cómo estaba la alerta al escribirlo, para avisar si
-- cambia en una versión nueva. Aditiva: una tabla nueva, sin tocar las existentes.

CREATE TABLE "comentario_alerta_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "referencias" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "comentado_por" TEXT,
    "comentado_por_id" INTEGER,
    "comentado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentario_alerta_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comentario_alerta_modulo_comentario_check" CHECK (char_length(btrim("comentario")) >= 10),
    CONSTRAINT "comentario_alerta_modulo_referencias_check" CHECK ("referencias" >= 0)
);

CREATE UNIQUE INDEX "comentario_alerta_modulo_unico"
    ON "comentario_alerta_modulo"("cliente_id", "modulo_codigo", "periodo", "tipo");
