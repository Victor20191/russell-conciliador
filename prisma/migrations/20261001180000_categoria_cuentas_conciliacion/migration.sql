-- CATEGORÍA de las cuentas que concilia cada módulo (1/Oct/2026, Nómina).
--
-- `concilia`: la cuenta forma la cédula contable, como hasta hoy. `visible`: el usuario quiere
-- ver su saldo (y lo que el módulo le asigna) pero no se concilia: va al final del cruce, colapsada,
-- sin sumar a los totales, sin marcas y sin pesar en el cierre. Aditiva: las filas existentes
-- conciliaban todas. La lista nueva de Nómina la escribe `npm run db:nomina:categorias-1oct`
-- después del despliegue (el código anterior no lee esta columna).

ALTER TABLE "cuentas_conciliacion_modulo"
    ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'concilia';

ALTER TABLE "cuentas_conciliacion_modulo"
    ADD CONSTRAINT "cuentas_conciliacion_modulo_categoria_check"
    CHECK ("categoria" IN ('concilia', 'visible'));
