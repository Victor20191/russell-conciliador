-- CreateTable
CREATE TABLE "mapeo_balance_cliente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "cuenta_6" TEXT NOT NULL,
    "cuenta_6_russell" TEXT NOT NULL,
    "porcentaje_coincidencia" DECIMAL(5,2),
    "origen" TEXT NOT NULL DEFAULT 'automatico',
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mapeo_balance_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mapeo_balance_cliente_cliente_id_idx" ON "mapeo_balance_cliente"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "mapeo_balance_cliente_cliente_id_cuenta_6_key" ON "mapeo_balance_cliente"("cliente_id", "cuenta_6");
