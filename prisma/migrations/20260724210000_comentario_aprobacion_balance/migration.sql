-- Comentario de aprobación del balance: el texto OBLIGATORIO que escribe el revisor
-- al promover un borrador con «advertencia del archivo fuente». Hasta ahora se
-- guardaba en `nota`, PISANDO la nota automática del sistema («Sin alertas» /
-- «N validación(es) con alerta»): se perdía el conteo de alertas justo en los
-- cargues delicados y no había forma de distinguir un texto del otro.
ALTER TABLE "balance_prueba_encabezado"
    ADD COLUMN "comentario_aprobacion" TEXT;

-- Backfill: recupera los comentarios ya escritos. Toda `nota` que NO tenga alguno
-- de los dos formatos que genera el sistema fue escrita por un revisor.
UPDATE "balance_prueba_encabezado"
   SET "comentario_aprobacion" = "nota"
 WHERE "nota" IS NOT NULL
   AND btrim("nota") <> ''
   AND "nota" !~ '^(Sin alertas|[0-9]+ validación\(es\) con alerta)$';

-- Reconstruye la nota del sistema en esas filas: el conteo de alertas no se guardó
-- en ninguna otra columna, pero `estado` sí distingue los cargues con alerta. Es la
-- mejor reconstrucción posible sin recalcular el balance entero.
UPDATE "balance_prueba_encabezado"
   SET "nota" = CASE WHEN "estado" = 'Con alertas' THEN 'Con alertas' ELSE 'Sin alertas' END
 WHERE "comentario_aprobacion" IS NOT NULL;
