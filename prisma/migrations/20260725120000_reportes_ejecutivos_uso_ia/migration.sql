-- CreateTable
CREATE TABLE "reportes_ejecutivos_uso_ia" (
    "id" SERIAL NOT NULL,
    "huella_contexto" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "periodo_desde" TIMESTAMPTZ(3) NOT NULL,
    "periodo_hasta" TIMESTAMPTZ(3) NOT NULL,
    "total_acciones" INTEGER NOT NULL,
    "total_usuarios" INTEGER NOT NULL,
    "total_novedades" INTEGER NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reportes_ejecutivos_uso_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reportes_ejecutivos_uso_ia_huella_contexto_key" ON "reportes_ejecutivos_uso_ia"("huella_contexto");

-- CreateIndex
CREATE INDEX "reportes_ejecutivos_uso_ia_modelo_idx" ON "reportes_ejecutivos_uso_ia"("modelo");
