-- Clasificadores NO MODULARES del renglón del SALDO SIN CUENTA del cruce contable.
--
-- Lo que el Consolidado no tiene asignado a ninguna cuenta ahora suma en el cruce, en un renglón
-- propio (clave `SIN_CUENTA`), para que la diferencia real se vea. Lo que no deba contar se marca
-- no modular por clasificador: su total se descuenta del lado del módulo.
--
-- Como las cuentas no modulares, cuelga de la MARCA del renglón (FK dura en cascada): sin marca no
-- hay exclusión y retirar la marca la retira. Va en su propia tabla porque
-- `cuenta_no_modular_cruce.cuenta_8` se lee como cuenta del cliente en el balance: un clasificador
-- numérico allí (p. ej. 241205) excluiría la cuenta del balance del mismo código. Aditiva.

CREATE TABLE "clasificador_no_modular_cruce" (
    "id" SERIAL NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "clasificador" TEXT NOT NULL,
    "total_al_marcar" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clasificador_no_modular_cruce_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clasificador_no_modular_cruce_marca_id_fkey"
      FOREIGN KEY ("marca_id") REFERENCES "marca_cruce_modulo"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un clasificador no se excluye dos veces en la misma marca.
CREATE UNIQUE INDEX "clasificador_no_modular_cruce_unica" ON "clasificador_no_modular_cruce"("marca_id", "clasificador");
CREATE INDEX "clasificador_no_modular_cruce_marca_id_idx" ON "clasificador_no_modular_cruce"("marca_id");
