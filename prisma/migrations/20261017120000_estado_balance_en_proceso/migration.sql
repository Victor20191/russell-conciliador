-- «Cerrar balance» y «Abrir balance» (17/Oct/2026): un balance cargado está «En proceso»,
-- «En proceso con alertas» o «Cerrado». Antes guardaba «Única», «Última», «Con alertas»,
-- «Congelado» y «Descongelado». Solo cambia el rótulo: `esta_congelado` sigue siendo la bandera
-- que bloquea la edición, y la pantalla traduce los rótulos viejos aunque esta migración no corra.

ALTER TABLE "balance_prueba_encabezado" ALTER COLUMN "estado" SET DEFAULT 'En proceso';

UPDATE "balance_prueba_encabezado"
SET "estado" = CASE
  WHEN "esta_congelado" THEN 'Cerrado'
  WHEN "estado" IN ('Con alertas', 'En proceso con alertas') THEN 'En proceso con alertas'
  ELSE 'En proceso'
END
WHERE "estado" IS DISTINCT FROM CASE
  WHEN "esta_congelado" THEN 'Cerrado'
  WHEN "estado" IN ('Con alertas', 'En proceso con alertas') THEN 'En proceso con alertas'
  ELSE 'En proceso'
END;
