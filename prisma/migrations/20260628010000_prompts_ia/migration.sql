-- Prompts de IA editables por el Superadministrador. Guarda el contenido vigente
-- de cada prompt de sistema (extracción de balances, mapeo de cuentas) y su valor
-- predeterminado, para poder verlos/editarlos desde la UI y que persistan en
-- producción (FS de solo lectura en Vercel).
CREATE TABLE "prompts_ia" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "predeterminado" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompts_ia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prompts_ia_clave_key" ON "prompts_ia"("clave");
