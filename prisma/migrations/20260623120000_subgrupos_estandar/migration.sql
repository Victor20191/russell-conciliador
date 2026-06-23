-- CreateTable
CREATE TABLE "subgrupos_estandar" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "nombre_grupo" TEXT NOT NULL,
    "naturaleza" TEXT NOT NULL,

    CONSTRAINT "subgrupos_estandar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subgrupos_estandar_codigo_key" ON "subgrupos_estandar"("codigo");

-- CreateIndex
CREATE INDEX "subgrupos_estandar_grupo_idx" ON "subgrupos_estandar"("grupo");
