-- ============================================================================
-- Borrado de las CARGAS DE BALANCE de los clientes
-- ----------------------------------------------------------------------------
-- Equivale al borrado ejecutado el 2026-06-28. Elimina:
--   * balance_prueba_detalle    (detalle del balance de comprobación)
--   * balance_prueba_encabezado (cargues por cliente/periodo/version)
--   * mapeo_balance_cliente      (memoria de parametrizacion cuenta -> cuenta estandar)
--
-- NO toca el plan estandar "general":
--   * cuentas_estandar           (plan estandar Russell)  <-- INTACTO
--   * subgrupos_estandar                                  <-- INTACTO
--   * bitacora_cuentas_estandar                           <-- INTACTO
--
-- Notas:
--   - balance_prueba_detalle tiene FK con ON DELETE CASCADE hacia
--     balance_prueba_encabezado; aun asi se borra explicito primero para que el
--     conteo de filas afectadas sea claro y el orden no dependa de la cascada.
--   - Es un borrado GLOBAL (todos los clientes). Para un cliente puntual, ver la
--     variante por cliente al final del archivo.
--   - Irreversible. Hacer respaldo antes si se requiere.
-- ============================================================================

-- 1) Conteos previos (verificacion / antes)
SELECT 'balance_prueba_detalle'    AS tabla, COUNT(*) AS filas FROM balance_prueba_detalle
UNION ALL
SELECT 'balance_prueba_encabezado' AS tabla, COUNT(*) AS filas FROM balance_prueba_encabezado
UNION ALL
SELECT 'mapeo_balance_cliente'     AS tabla, COUNT(*) AS filas FROM mapeo_balance_cliente
UNION ALL
SELECT 'cuentas_estandar (NO TOCAR)' AS tabla, COUNT(*) AS filas FROM cuentas_estandar;

-- 2) Borrado atomico
BEGIN;

DELETE FROM balance_prueba_detalle;
DELETE FROM balance_prueba_encabezado;
DELETE FROM mapeo_balance_cliente;

COMMIT;

-- 3) Verificacion posterior (deben quedar en 0, y cuentas_estandar intacto)
SELECT 'balance_prueba_detalle'    AS tabla, COUNT(*) AS filas FROM balance_prueba_detalle
UNION ALL
SELECT 'balance_prueba_encabezado' AS tabla, COUNT(*) AS filas FROM balance_prueba_encabezado
UNION ALL
SELECT 'mapeo_balance_cliente'     AS tabla, COUNT(*) AS filas FROM mapeo_balance_cliente
UNION ALL
SELECT 'cuentas_estandar (NO TOCAR)' AS tabla, COUNT(*) AS filas FROM cuentas_estandar;


-- ============================================================================
-- VARIANTE: borrar solo las cargas de UN cliente (reemplazar :cliente_id)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DELETE FROM balance_prueba_detalle
--     WHERE encabezado_id IN (
--       SELECT id FROM balance_prueba_encabezado WHERE cliente_id = :cliente_id
--     );
--   DELETE FROM balance_prueba_encabezado WHERE cliente_id = :cliente_id;
--   DELETE FROM mapeo_balance_cliente     WHERE cliente_id = :cliente_id;
-- COMMIT;

-- ============================================================================
-- VARIANTE: conservar el mapeo recordado (borrar SOLO las cargas)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DELETE FROM balance_prueba_detalle;
--   DELETE FROM balance_prueba_encabezado;
--   -- (no se toca mapeo_balance_cliente)
-- COMMIT;
