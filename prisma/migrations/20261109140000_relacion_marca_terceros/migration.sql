-- Varios terceros del cruce por tercero relacionados con una marca existente (9/Nov/2026, decisión
-- del usuario). La marca ② de la cédula puede explicar la suma de las diferencias de varios NIT: se
-- seleccionan, se relacionan con ella y se deja un comentario sobre ellos. Cada tercero relacionado
-- cuenta como explicado por la diferencia que tenía al relacionarlo. Tablas nuevas: no cambia nada de
-- lo existente. Se borran con la marca (cascada).
CREATE TABLE "relacion_marca_tercero" (
    "id" SERIAL NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "comentario" TEXT,
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "relacion_marca_tercero_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tercero_relacion_marca" (
    "id" SERIAL NOT NULL,
    "relacion_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT,
    "diferencia" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "tercero_relacion_marca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relacion_marca_tercero_marca_id_key" ON "relacion_marca_tercero"("marca_id");
CREATE UNIQUE INDEX "tercero_relacion_marca_unico" ON "tercero_relacion_marca"("cliente_id", "modulo_codigo", "periodo", "clave");
CREATE INDEX "tercero_relacion_marca_relacion_idx" ON "tercero_relacion_marca"("relacion_id");

ALTER TABLE "relacion_marca_tercero" ADD CONSTRAINT "relacion_marca_tercero_marca_id_fkey"
    FOREIGN KEY ("marca_id") REFERENCES "marca_cruce_modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tercero_relacion_marca" ADD CONSTRAINT "tercero_relacion_marca_relacion_id_fkey"
    FOREIGN KEY ("relacion_id") REFERENCES "relacion_marca_tercero"("id") ON DELETE CASCADE ON UPDATE CASCADE;
