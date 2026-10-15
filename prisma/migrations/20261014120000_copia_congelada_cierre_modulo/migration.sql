-- COPIA CONGELADA de una conciliación de módulo en firme (14/Oct/2026).
--
-- Al cerrar la conciliación se guardan los insumos del cruce que se comparten entre períodos o que
-- se leían en vivo: el Consolidado ya fundido con el período, las reglas del prevalidador del
-- módulo, las clases por centro y la homologación del cliente de Nómina, las agrupadoras excluidas
-- del balance y el umbral del cruce por tercero. Mientras el cierre esté en firme el cruce del
-- período lee esta copia, así que lo que se cambie desde otro mes ya no altera una conciliación
-- cerrada. Aditiva: los cierres anteriores quedan con la columna en null y siguen leyendo en vivo.

ALTER TABLE "conciliacion_modulo_cierre"
    ADD COLUMN "copia_congelada" JSONB;

ALTER TABLE "conciliacion_modulo_cierre"
    ADD CONSTRAINT "conciliacion_modulo_cierre_copia_congelada_check"
    CHECK ("copia_congelada" IS NULL OR jsonb_typeof("copia_congelada") = 'object');
