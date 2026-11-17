-- Régimen Simple de Tributación del cliente (17/Nov/2026, pedido del usuario): marca Sí/No en la
-- ficha del cliente. Todos los clientes existentes y los nuevos quedan en No por defecto.
ALTER TABLE "clientes" ADD COLUMN "regimen_simple_tributacion" BOOLEAN NOT NULL DEFAULT false;
