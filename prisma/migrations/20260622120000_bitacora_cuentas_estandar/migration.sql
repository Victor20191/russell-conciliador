-- Bitácora DEDICADA del plan de cuentas estándar (cuentas_estandar): registra
-- todos los movimientos (crear/editar/eliminar) hechos sobre las cuentas
-- estándar de Russell, para evidenciar la trazabilidad completa de la
-- parametrización. Solo el Administrador opera esa tabla.
--
-- FK LÓGICAS (sin restricción física) hacia usuarios/cuentas_estandar: la
-- bitácora se CONSERVA aunque luego se borre la cuenta o el usuario. La columna
-- "codigo" preserva la referencia legible cuando "cuenta_id" ya no existe.

-- CreateTable
CREATE TABLE "bitacora_cuentas_estandar" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER,
    "codigo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "usuario_id" INTEGER,
    "detalle" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_cuentas_estandar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bitacora_cuentas_estandar_cuenta_id_idx" ON "bitacora_cuentas_estandar"("cuenta_id");

-- CreateIndex
CREATE INDEX "bitacora_cuentas_estandar_creado_en_idx" ON "bitacora_cuentas_estandar"("creado_en");
