-- CreateTable
CREATE TABLE "formularios_dian_cliente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "formulario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formularios_dian_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formularios_dian_cliente_cliente_id_formulario_id_key" ON "formularios_dian_cliente"("cliente_id", "formulario_id");

-- AddForeignKey
ALTER TABLE "formularios_dian_cliente" ADD CONSTRAINT "formularios_dian_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formularios_dian_cliente" ADD CONSTRAINT "formularios_dian_cliente_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formularios_dian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
