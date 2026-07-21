-- Correcciones por CUENTA memorizadas del cliente (perfil de carga a nivel de fila):
-- cada ajuste manual del borrador (reclasificar, invertir lados, desacoplar,
-- omitir/rescatar, re-parentar) se memoriza por cliente+cuenta y se re-aplica solo
-- en las próximas lecturas de balances del mismo cliente.
CREATE TABLE "correcciones_carga_balance" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "cuenta" TEXT NOT NULL,
    "nombre" TEXT,
    "tipo_fila_forzado" TEXT,
    "invertir_lados" BOOLEAN NOT NULL DEFAULT false,
    "desacoplada" BOOLEAN,
    "omitida" BOOLEAN,
    "padre_codigo" TEXT,
    "veces_aplicada" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_en" TIMESTAMPTZ(3),
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "correcciones_carga_balance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correcciones_carga_balance_cliente_id_cuenta_key" ON "correcciones_carga_balance"("cliente_id", "cuenta");

-- Contador informativo en el encabezado del lote: filas del staging corregidas
-- automáticamente con las correcciones memorizadas del cliente (banner del borrador).
ALTER TABLE "balance_importacion_lote" ADD COLUMN "correcciones_aplicadas" INTEGER NOT NULL DEFAULT 0;
