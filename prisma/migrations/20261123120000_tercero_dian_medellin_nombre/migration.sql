-- Impuestos · DIAN: corrige el nombre del NIT 800197384 en la lista de la DIAN (23/Nov/2026).
--
-- El nombre que puso la migración 20261119180000 repetía «Hospital» y traía «De» e «Y» en mayúscula.
-- Solo cambia el nombre que se muestra; el NIT y lo que se resta en el cruce no cambian. Si alguien ya
-- cambió el nombre (quitó el NIT y lo volvió a agregar con otro), no lo toca.

UPDATE "tercero_dian" SET "etiqueta" = 'U.A.E. Admon Local de Impuestos y Aduanas Nacionales de Medellin (Usado por Hospital Manuel Uribe Angel)' WHERE "nit" = '800197384' AND "etiqueta" = 'U.A.E. Admon Local De Impuestos Y Aduanas Nacionales De Medellin (Usado por Hospital Hospital Manuel Uribe Angel)';
