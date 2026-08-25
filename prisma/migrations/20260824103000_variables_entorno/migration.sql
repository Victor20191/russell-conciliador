-- CreateTable
CREATE TABLE "public"."variables_entorno" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT,
    "es_secreto" BOOLEAN NOT NULL DEFAULT false,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "variables_entorno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "variables_entorno_clave_key" ON "public"."variables_entorno"("clave");
