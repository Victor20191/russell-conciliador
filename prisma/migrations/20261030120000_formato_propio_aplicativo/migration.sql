-- «Archivo manual» pasa a llamarse «Formato propio» (30/Oct/2026, decisión del usuario): es la
-- opción del aplicativo con que se mapean las columnas a mano y se guardan los formatos propios del
-- cliente. Solo cambia la etiqueta visible del aplicativo sembrado con código MANUAL; el código, su
-- id, la ficha de los clientes y los cargues no cambian. Si un administrador ya le puso otro nombre
-- desde Maestros, se respeta.
UPDATE "erps" SET "nombre" = 'Formato propio' WHERE "codigo" = 'MANUAL' AND "nombre" = 'Archivo manual';
