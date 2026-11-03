-- Parámetro del cliente: ¿maneja balance por terceros? (aditiva; todos los clientes existentes quedan en true).
ALTER TABLE "clientes" ADD COLUMN "balance_por_terceros" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "clientes" ADD COLUMN "balance_terceros_nota" TEXT;
ALTER TABLE "clientes" ADD COLUMN "balance_terceros_por" INTEGER;
ALTER TABLE "clientes" ADD COLUMN "balance_terceros_en" TIMESTAMPTZ(3);
