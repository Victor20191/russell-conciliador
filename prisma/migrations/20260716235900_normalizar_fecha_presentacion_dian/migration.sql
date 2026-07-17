-- La fecha de presentación es una fecha calendario colombiana, no un texto ni
-- un instante. Se preservan los valores históricos escritos como DD/Mes/AAAA.
ALTER TABLE "periodos_dian"
ALTER COLUMN "presentado" TYPE DATE
USING CASE
  WHEN "presentado" IS NULL OR btrim("presentado") = '' THEN NULL
  ELSE make_date(
    split_part("presentado", '/', 3)::integer,
    CASE lower(split_part("presentado", '/', 2))
      WHEN 'ene' THEN 1
      WHEN 'feb' THEN 2
      WHEN 'mar' THEN 3
      WHEN 'abr' THEN 4
      WHEN 'may' THEN 5
      WHEN 'jun' THEN 6
      WHEN 'jul' THEN 7
      WHEN 'ago' THEN 8
      WHEN 'sep' THEN 9
      WHEN 'oct' THEN 10
      WHEN 'nov' THEN 11
      WHEN 'dic' THEN 12
    END,
    split_part("presentado", '/', 1)::integer
  )
END;
