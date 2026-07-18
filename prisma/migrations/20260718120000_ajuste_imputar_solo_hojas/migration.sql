-- Ajuste de carga de balance por cliente: imputar SOLO las hojas en exports
-- totalmente jerárquicos (SIESA con subcuenta + auxiliares como filas imputables).
-- Columna nullable, aditiva, sin default ni reescritura de datos.
-- AlterTable
ALTER TABLE "ajustes_carga_balance" ADD COLUMN     "imputar_solo_hojas" BOOLEAN;
