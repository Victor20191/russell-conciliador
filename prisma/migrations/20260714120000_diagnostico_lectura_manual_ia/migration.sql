-- Cierra los gaps de MEDICIÓN de la huella diagnóstica de lectura:
--  - manual_reclasificadas / manual_invertidas: reclasificar (agrupadora↔movimiento)
--    e invertir (débito↔crédito) mutan el staging sin dejar marca durable, así que
--    se acumulan al momento de aplicarse (los otros 3 contadores se toman al cerrar).
--  - diagnostico_ia: hipótesis del diagnóstico asistido con IA del descuadre (última
--    corrida), antes efímero en el cliente — persistirlo permite analizar recurrencias.
ALTER TABLE "balance_lectura_diagnostico"
    ADD COLUMN "manual_reclasificadas" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "manual_invertidas" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "diagnostico_ia" JSONB;
