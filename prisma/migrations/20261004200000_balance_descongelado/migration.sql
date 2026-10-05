-- DESCONGELAR un balance para corregirlo (4/Oct/2026). Quién, cuándo y por qué, para el aviso de la
-- pantalla mientras la versión sigue sin congelar; congelarla de nuevo los limpia. Aditiva: el
-- código anterior no lee estas columnas.

ALTER TABLE "balance_prueba_encabezado"
    ADD COLUMN "descongelado_por" TEXT,
    ADD COLUMN "descongelado_por_id" INTEGER,
    ADD COLUMN "descongelado_en" TIMESTAMPTZ(3),
    ADD COLUMN "justificacion_descongelado" TEXT;
