-- ANEXO EXPLÍCITO en los módulos.
--
-- Hasta ahora, si una confirmación se AGREGABA al encabezado vigente o creaba una VERSIÓN
-- nueva lo decidía el sistema comparando llaves `(clasificador, referencia)`: sin llaves
-- repetidas concluía «ítems nuevos» y anexaba. Esa inferencia falla justo donde el
-- clasificador cambia — re-subir el mismo archivo con el mapeo de columnas corregido
-- renombra todas las llaves, y el módulo se duplicaba en silencio.
--
-- A partir de aquí la intención la declara el usuario con «Agregar archivo». Esta columna
-- guarda el encabezado destino de esa declaración; `NULL` es la carga normal, que ya nunca
-- anexa. FK suave (solo el Int, sin REFERENCES) igual que el resto de referencias hacia
-- encabezados en este esquema: la confirmación revalida el destino y avisa si ya no existe.
ALTER TABLE "modulo_importacion_lote"
    ADD COLUMN "anexo_encabezado_id" INTEGER;
