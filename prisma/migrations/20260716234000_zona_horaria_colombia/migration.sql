-- Política temporal de Russell LFM:
--   * los instantes se almacenan como TIMESTAMPTZ(3);
--   * las fechas contables puras permanecen como DATE;
--   * la zona de sesión predeterminada de esta base es America/Bogota.
--
-- Los TIMESTAMP históricos fueron escritos por Prisma/Node como reloj UTC.
-- `AT TIME ZONE 'UTC'` conserva el instante real al añadir la zona.

ALTER TABLE "ajustes_carga_balance"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "asignaciones_cliente"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "vigente_desde" TYPE TIMESTAMPTZ(3) USING "vigente_desde" AT TIME ZONE 'UTC',
  ALTER COLUMN "vigente_hasta" TYPE TIMESTAMPTZ(3) USING "vigente_hasta" AT TIME ZONE 'UTC';

ALTER TABLE "balance_importacion_lote"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "balance_importacion_staging"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "balance_lectura_diagnostico"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "balance_prueba_detalle"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "editado_en" TYPE TIMESTAMPTZ(3) USING "editado_en" AT TIME ZONE 'UTC';

ALTER TABLE "balance_prueba_encabezado"
  ALTER COLUMN "congelado_en" TYPE TIMESTAMPTZ(3) USING "congelado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "balances"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "bitacora_cuentas_estandar"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "cambios_version"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "clientes"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "comentarios"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "editado_en" TYPE TIMESTAMPTZ(3) USING "editado_en" AT TIME ZONE 'UTC';

ALTER TABLE "comentarios_conciliacion"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "comentarios_dian"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "conciliaciones"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "consumo_ia"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "cuentas_cliente"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';

ALTER TABLE "erps"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "formularios_dian_cliente"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "intentos_inicio_sesion"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "jerarquia_usuarios"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "menciones_comentario"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "leido_en" TYPE TIMESTAMPTZ(3) USING "leido_en" AT TIME ZONE 'UTC';

ALTER TABLE "modulos_plataforma"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "notificaciones"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "perfiles_carga_balance"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "ultimo_uso_en" TYPE TIMESTAMPTZ(3) USING "ultimo_uso_en" AT TIME ZONE 'UTC';

ALTER TABLE "permisos"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "prompts_ia"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "registros_acceso"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "registros_auditoria"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "reportes_novedades_ia"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "roles"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "roles_permisos"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "sectores"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "tasas_cambio"
  ALTER COLUMN "obtenida_en" TYPE TIMESTAMPTZ(3) USING "obtenida_en" AT TIME ZONE 'UTC';

ALTER TABLE "usuarios"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "bloqueado_hasta" TYPE TIMESTAMPTZ(3) USING "bloqueado_hasta" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "ultimo_inicio_sesion" TYPE TIMESTAMPTZ(3) USING "ultimo_inicio_sesion" AT TIME ZONE 'UTC',
  ALTER COLUMN "ultimo_intento_fallido" TYPE TIMESTAMPTZ(3) USING "ultimo_intento_fallido" AT TIME ZONE 'UTC';

ALTER TABLE "validacion_alerta"
  ALTER COLUMN "validado_en" TYPE TIMESTAMPTZ(3) USING "validado_en" AT TIME ZONE 'UTC';

ALTER TABLE "versiones_plataforma"
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  -- Las publicaciones históricas exactas a medianoche provienen del seed y
  -- representan una fecha civil colombiana, no medianoche UTC.
  ALTER COLUMN "publicado_en" TYPE TIMESTAMPTZ(3) USING (
    CASE
      WHEN "publicado_en"::time = TIME '00:00:00' THEN "publicado_en" AT TIME ZONE 'America/Bogota'
      ELSE "publicado_en" AT TIME ZONE 'UTC'
    END
  );

-- Deja la zona predeterminada correcta también para conexiones externas y SQL
-- administrativo que no pase por el adaptador de la aplicación.
DO $zona$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET timezone TO %L',
    current_database(),
    'America/Bogota'
  );
END
$zona$;
