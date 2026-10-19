-- Veredicto «Cuadrado / Descuadrado» de la lista de borradores (18/Oct/2026): resumen de las cuatro
-- condiciones (ecuación, partida doble, clases vs archivo y agrupadoras) que la lista evalúa al leer
-- con los umbrales vigentes. Aditiva: el código anterior no la lee y un lote sin resumen queda
-- «sin verificar» hasta que se vuelva a guardar o se recalcule.

ALTER TABLE "balance_importacion_lote"
    ADD COLUMN "resumen_cuadre" JSONB;
