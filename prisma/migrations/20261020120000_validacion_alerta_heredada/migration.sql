-- OK heredados (20/Oct/2026): al cargar una versión nueva del balance, el «Dar OK» de un saldo
-- contrario a la naturaleza pasa a la nueva si la cuenta tiene el MISMO saldo final. La columna dice
-- de qué versión vino (FK suave a balance_prueba_encabezado). Aditiva: el código anterior no la lee y
-- los OK ya dados quedan en null.

ALTER TABLE "validacion_alerta"
    ADD COLUMN "heredada_de_balance_id" INTEGER;
