ALTER TABLE "usuarios"
ADD COLUMN "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ultimo_intento_fallido" TIMESTAMP(3),
ADD COLUMN "bloqueado_hasta" TIMESTAMP(3);
