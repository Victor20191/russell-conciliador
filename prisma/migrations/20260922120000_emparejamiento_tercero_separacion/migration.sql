-- SEPARACIÓN de terceros en el cruce por tercero.
--
-- El cruce une solo los pares donde una clave es la otra más su dígito de verificación (por DV)
-- o donde comparten los nueve primeros dígitos (por núcleo). Cuando el auditor comprueba que NO
-- son el mismo tercero, los separa: esa decisión es memoria del cliente y vive en la misma tabla
-- de los emparejamientos, con `tipo = 'separacion'`. Misma llave única (cliente, módulo, período,
-- clave del auxiliar): una clave del auxiliar está unida a algo o separada de su unión automática.
-- Aditiva: las filas existentes son uniones.

ALTER TABLE "emparejamiento_tercero_modulo"
    ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'union';

ALTER TABLE "emparejamiento_tercero_modulo"
    ADD CONSTRAINT "emparejamiento_tercero_modulo_tipo_check"
    CHECK ("tipo" IN ('union', 'separacion'));
