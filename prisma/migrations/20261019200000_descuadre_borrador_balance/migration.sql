-- Justificación del descuadre (19/Oct/2026): cuando el borrador se carga «Descuadrado» por algo
-- distinto del archivo fuente (ecuación, partida doble, clases vs archivo o agrupadoras), el
-- balance guarda qué condiciones fallaban, por cuánto y con qué umbrales, junto al comentario
-- obligatorio. Aditiva: el código anterior no la lee y los balances ya cargados quedan en null.

ALTER TABLE "balance_prueba_encabezado"
    ADD COLUMN "descuadre_borrador" JSONB;
