-- Ajustes de plataforma simples (clave→valor) que persisten en BD (FS de solo
-- lectura en Vercel). Hoy guarda el modelo de IA del hook que vuelca los commits
-- del día a /novedades (clave "novedades.modelo_ia").
CREATE TABLE "configuracion_plataforma" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracion_plataforma_clave_key" ON "configuracion_plataforma"("clave");
