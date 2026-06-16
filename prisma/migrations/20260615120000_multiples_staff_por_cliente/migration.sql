-- Permitir VARIOS staff por un mismo cliente.
--
-- La unicidad de responsable pasa de (cliente, función) a
-- (cliente, función, usuario): así un cliente admite dos o más staff
-- distintos, sin poder duplicar a la misma persona en la misma función.
-- La regla "un solo senior y un solo gerente por cliente" se conserva en la
-- validación de la Server Action (validarResponsables), no en el índice.

DROP INDEX "asignaciones_cliente_cliente_id_funcion_key";

CREATE UNIQUE INDEX "asignaciones_cliente_cliente_id_funcion_usuario_id_key" ON "asignaciones_cliente"("cliente_id", "funcion", "usuario_id");
