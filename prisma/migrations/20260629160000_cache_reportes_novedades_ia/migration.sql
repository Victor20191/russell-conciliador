CREATE TABLE "reportes_novedades_ia" (
    "id" SERIAL NOT NULL,
    "huella_contexto" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "total_versiones" INTEGER NOT NULL,
    "total_cambios" INTEGER NOT NULL,
    "cambios_incluidos" INTEGER NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_novedades_ia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reportes_novedades_ia_huella_contexto_key" ON "reportes_novedades_ia"("huella_contexto");
CREATE INDEX "reportes_novedades_ia_modelo_idx" ON "reportes_novedades_ia"("modelo");
