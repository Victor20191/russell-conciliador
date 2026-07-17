-- Elimina sellos temporales de texto que podían quedar congelados como "ahora"
-- o "hace 2 h". La fuente de verdad pasa a ser el instante `creado_en`.

ALTER TABLE "notificaciones" DROP COLUMN "hora";
ALTER TABLE "comentarios_conciliacion" DROP COLUMN "hora";
ALTER TABLE "comentarios_dian" DROP COLUMN "hora";
ALTER TABLE "registros_auditoria" DROP COLUMN "marca_tiempo";

-- La fecha redundante de la conciliación se reemplaza por `creado_en`.
ALTER TABLE "conciliaciones" DROP COLUMN "fecha";

-- `corte` es una fecha contable sin hora. Admite tanto el ISO usado por la UI
-- como los DD/Mon/AAAA del seed histórico (meses abreviados en español).
ALTER TABLE "conciliaciones"
  ALTER COLUMN "corte" TYPE DATE USING (
    CASE
      WHEN "corte" IS NULL OR btrim("corte") = '' THEN NULL
      WHEN "corte" ~ '^\d{4}-\d{2}-\d{2}$' THEN "corte"::date
      WHEN "corte" ~ '^\d{2}/[A-Za-z]{3}/\d{4}$' THEN make_date(
        substring("corte" FROM 8 FOR 4)::integer,
        CASE lower(substring("corte" FROM 4 FOR 3))
          WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3
          WHEN 'abr' THEN 4 WHEN 'may' THEN 5 WHEN 'jun' THEN 6
          WHEN 'jul' THEN 7 WHEN 'ago' THEN 8 WHEN 'sep' THEN 9
          WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12
        END,
        substring("corte" FROM 1 FOR 2)::integer
      )
      ELSE NULL
    END
  );

-- Los registros creados por la plataforma usaban DD/Mon/AAAA HH24:MI. Si una
-- fila antigua trae otro texto, `creado_en` es el respaldo temporal confiable.
ALTER TABLE "conciliaciones"
  ALTER COLUMN "ejecutado_en" TYPE TIMESTAMPTZ(3) USING (
    CASE
      WHEN "ejecutado_en" IS NULL OR btrim("ejecutado_en") = '' THEN NULL
      WHEN "ejecutado_en" ~ '^\d{2}/[A-Za-z]{3}/\d{4} \d{2}:\d{2}$' THEN make_timestamptz(
        substring("ejecutado_en" FROM 8 FOR 4)::integer,
        CASE lower(substring("ejecutado_en" FROM 4 FOR 3))
          WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3
          WHEN 'abr' THEN 4 WHEN 'may' THEN 5 WHEN 'jun' THEN 6
          WHEN 'jul' THEN 7 WHEN 'ago' THEN 8 WHEN 'sep' THEN 9
          WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12
        END,
        substring("ejecutado_en" FROM 1 FOR 2)::integer,
        substring("ejecutado_en" FROM 13 FOR 2)::integer,
        substring("ejecutado_en" FROM 16 FOR 2)::integer,
        0,
        'America/Bogota'
      )
      ELSE "creado_en"
    END
  ),
  ALTER COLUMN "ultima_actividad" TYPE TIMESTAMPTZ(3) USING (
    CASE
      WHEN "ultima_actividad" IS NULL OR btrim("ultima_actividad") = '' THEN NULL
      ELSE "creado_en"
    END
  );

-- Ambos campos de última carga duplicaban el instante de creación como texto.
ALTER TABLE "balances"
  ALTER COLUMN "ultima_carga" TYPE TIMESTAMPTZ(3) USING (
    CASE WHEN "ultima_carga" IS NULL THEN NULL ELSE "creado_en" END
  );

ALTER TABLE "balance_prueba_encabezado"
  ALTER COLUMN "ultima_carga" TYPE TIMESTAMPTZ(3) USING (
    CASE WHEN "ultima_carga" IS NULL THEN NULL ELSE "creado_en" END
  );
