-- Conversaciones: comentarios polimórficos + menciones.
-- Una conversación se ancla a cualquier registro de negocio por
-- (entidad_tipo, entidad_id); `ancla` ubica el comentario dentro del
-- registro (cuenta, renglón). El autor es FK real a usuarios; las
-- menciones (@usuario) viven en su propia tabla para consultar
-- "mis menciones", marcarlas leídas y notificar al usuario arrobado.

-- CreateTable
CREATE TABLE "comentarios" (
    "id" SERIAL NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" INTEGER NOT NULL,
    "ancla" TEXT,
    "autor_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "comentario_padre_id" INTEGER,
    "es_ia" BOOLEAN NOT NULL DEFAULT false,
    "editado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menciones_comentario" (
    "id" SERIAL NOT NULL,
    "comentario_id" INTEGER NOT NULL,
    "usuario_mencionado_id" INTEGER NOT NULL,
    "leido_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menciones_comentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comentarios_entidad_tipo_entidad_id_idx" ON "comentarios"("entidad_tipo", "entidad_id");

-- CreateIndex
CREATE INDEX "comentarios_autor_id_idx" ON "comentarios"("autor_id");

-- CreateIndex
CREATE INDEX "menciones_comentario_usuario_mencionado_id_idx" ON "menciones_comentario"("usuario_mencionado_id");

-- CreateIndex
CREATE UNIQUE INDEX "menciones_comentario_comentario_id_usuario_mencionado_id_key" ON "menciones_comentario"("comentario_id", "usuario_mencionado_id");

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_comentario_padre_id_fkey" FOREIGN KEY ("comentario_padre_id") REFERENCES "comentarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menciones_comentario" ADD CONSTRAINT "menciones_comentario_comentario_id_fkey" FOREIGN KEY ("comentario_id") REFERENCES "comentarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menciones_comentario" ADD CONSTRAINT "menciones_comentario_usuario_mencionado_id_fkey" FOREIGN KEY ("usuario_mencionado_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
