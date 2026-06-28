-- Se elimina el "centro operativo" del balance de comprobación: ya no se usa en
-- ninguna parte de la lógica (formulario, extracción asistida ni persistencia).
ALTER TABLE "balance_prueba_encabezado" DROP COLUMN IF EXISTS "centro_operativo";
