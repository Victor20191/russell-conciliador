-- Una misma marca del cruce contable explica varios renglones (23/Nov/2026, pedido del usuario): en
-- vez de crear la marca ② para la segunda diferencia, la marca ① se usa también en ese renglón con el
-- monto que explica allí. La marca sigue viviendo en su renglón (`marca_cruce_modulo.cuenta_4`); esta
-- tabla guarda los OTROS renglones, cada uno con su monto y la diferencia que tenía al agregarlo. La
-- nota, la referencia del anexo y los soportes son los de la marca. Tabla nueva: no cambia nada de lo
-- existente. Se borra con la marca (cascada).
CREATE TABLE "renglon_marca_cruce" (
    "id" SERIAL NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT 'cuenta4',
    "renglon" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "diferencia" DECIMAL(18,2) NOT NULL,
    "agregado_por" TEXT,
    "agregado_por_id" INTEGER,
    "agregado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renglon_marca_cruce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "renglon_marca_cruce_unico" ON "renglon_marca_cruce"("marca_id", "dimension", "renglon");
CREATE INDEX "renglon_marca_cruce_periodo_idx" ON "renglon_marca_cruce"("cliente_id", "modulo_codigo", "periodo");

ALTER TABLE "renglon_marca_cruce" ADD CONSTRAINT "renglon_marca_cruce_marca_id_fkey"
    FOREIGN KEY ("marca_id") REFERENCES "marca_cruce_modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
