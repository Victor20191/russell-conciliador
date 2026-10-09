--
-- PostgreSQL database dump
--

\restrict VZnUh9aAAHmP4gARV0E0mcOIhwFVxuXAL7YQrcSps8QPKAi1i6DiQcny01y6Sah

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: bloquear_cambio_catalogo_prevalidador_con_overrides(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bloquear_cambio_catalogo_prevalidador_con_overrides() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (
    NEW."modulo_id" IS DISTINCT FROM OLD."modulo_id"
    OR NEW."cuenta_russell" IS DISTINCT FROM OLD."cuenta_russell"
  ) AND EXISTS (
    SELECT 1
    FROM "prevalidador_cuentas_balance" o
    WHERE o."catalogo_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar módulo o prefijo mientras existan overrides de balance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: crear_perfil_base_balance_cliente(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_perfil_base_balance_cliente() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "ajustes_carga_balance" (
    "cliente_id",
    "estandar",
    "creado_en",
    "actualizado_en"
  )
  VALUES (
    NEW."id",
    'NIF',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("cliente_id") DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: proteger_catalogo_revision_prevalidador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_catalogo_revision_prevalidador() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "prevalidador_revisiones_balance" r
      WHERE r."id" = NEW."revision_id" AND r."estado" = 'aprobada'
    ) THEN
      RAISE EXCEPTION 'Solo una revisión aprobada conserva el catálogo del prevalidador'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "prevalidador_revisiones_balance" WHERE "id" = OLD."revision_id"
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'El catálogo congelado del prevalidador es append-only'
    USING ERRCODE = '55000';
END
$$;


--
-- Name: proteger_detalle_balance_prevalidador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_detalle_balance_prevalidador() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  congelado BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "esta_congelado" INTO congelado
    FROM "balance_prueba_encabezado"
    WHERE "id" = OLD."encabezado_id";

    IF NOT FOUND THEN RETURN OLD; END IF;
    IF congelado THEN
      RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "prevalidador_cuentas_balance" o
      WHERE o."balance_id" = OLD."encabezado_id"
        AND OLD."cuenta_8" LIKE o."cuenta_cliente" || '%'
        AND NOT EXISTS (
          SELECT 1
          FROM "balance_prueba_detalle" d
          WHERE d."encabezado_id" = OLD."encabezado_id"
            AND d."id" <> OLD."id"
            AND d."cuenta_8" LIKE o."cuenta_cliente" || '%'
        )
    ) THEN
      RAISE EXCEPTION 'La cuenta es el último respaldo de un override del prevalidador'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT "esta_congelado" INTO congelado
    FROM "balance_prueba_encabezado"
    WHERE "id" = OLD."encabezado_id";
    IF congelado THEN
      RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT "esta_congelado" INTO congelado
  FROM "balance_prueba_encabezado"
  WHERE "id" = NEW."encabezado_id";
  IF congelado THEN
    RAISE EXCEPTION 'El balance está congelado y su detalle es inmutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD."encabezado_id" IS DISTINCT FROM NEW."encabezado_id" OR OLD."cuenta_8" IS DISTINCT FROM NEW."cuenta_8")
     AND EXISTS (
       SELECT 1
       FROM "prevalidador_cuentas_balance" o
       WHERE o."balance_id" = OLD."encabezado_id"
         AND OLD."cuenta_8" LIKE o."cuenta_cliente" || '%'
         AND NOT (
           NEW."encabezado_id" = OLD."encabezado_id"
           AND NEW."cuenta_8" LIKE o."cuenta_cliente" || '%'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM "balance_prueba_detalle" d
           WHERE d."encabezado_id" = OLD."encabezado_id"
             AND d."id" <> OLD."id"
             AND d."cuenta_8" LIKE o."cuenta_cliente" || '%'
         )
     ) THEN
    RAISE EXCEPTION 'El cambio deja sin respaldo un override del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: proteger_historial_revisiones_prevalidador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_historial_revisiones_prevalidador() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "balance_prueba_encabezado" WHERE "id" = OLD."balance_id"
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Las revisiones del prevalidador son append-only'
    USING ERRCODE = '55000';
END
$$;


--
-- Name: validar_catalogo_prevalidador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_catalogo_prevalidador() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  codigo_modulo TEXT;
BEGIN
  SELECT "codigo" INTO codigo_modulo
  FROM "modulos"
  WHERE "id" = NEW."modulo_id";

  IF codigo_modulo IS NULL OR codigo_modulo NOT IN ('ING', 'CAR', 'INV', 'AFI', 'CXP', 'NOM') THEN
    RAISE EXCEPTION 'El módulo no pertenece a los seis módulos aprobados del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "prevalidador_cuentas" p
    WHERE p."modulo_id" = NEW."modulo_id"
      AND p."id" <> COALESCE(NEW."id", -1)
      AND (
        p."cuenta_russell" LIKE NEW."cuenta_russell" || '%'
        OR NEW."cuenta_russell" LIKE p."cuenta_russell" || '%'
      )
  ) THEN
    RAISE EXCEPTION 'La cuenta se solapa con otro prefijo del mismo módulo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: validar_override_prevalidador_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_override_prevalidador_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_cuenta_russell TEXT;
  v_balance_congelado BOOLEAN;
BEGIN
  SELECT "cuenta_russell" INTO v_cuenta_russell
  FROM "prevalidador_cuentas"
  WHERE "id" = NEW."catalogo_id";

  SELECT "esta_congelado" INTO v_balance_congelado
  FROM "balance_prueba_encabezado"
  WHERE "id" = NEW."balance_id";

  IF v_cuenta_russell IS NULL OR v_balance_congelado IS NULL THEN
    RAISE EXCEPTION 'Balance o fila de catálogo inexistente'
      USING ERRCODE = '23503';
  END IF;

  IF v_balance_congelado THEN
    RAISE EXCEPTION 'El balance está congelado y no admite cambios del prevalidador'
      USING ERRCODE = '23514';
  END IF;

  IF char_length(NEW."cuenta_cliente") <> char_length(v_cuenta_russell) THEN
    RAISE EXCEPTION 'La cuenta del cliente debe tener el mismo nivel que la cuenta Russell'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "balance_prueba_detalle" d
    WHERE d."encabezado_id" = NEW."balance_id"
      AND left(d."cuenta_8", char_length(NEW."cuenta_cliente")) = NEW."cuenta_cliente"
  ) THEN
    RAISE EXCEPTION 'La cuenta del cliente no existe en el balance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: validar_solape_override_prevalidador_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_solape_override_prevalidador_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  balance_objetivo INTEGER;
  catalogo_objetivo INTEGER;
  cuenta_objetivo TEXT;
  modulo_objetivo INTEGER;
  fila_activa BOOLEAN;
  cuenta_conflicto TEXT;
BEGIN
  -- Misma llave usada por las Server Actions. Serializa catálogo y overrides
  -- incluso si una escritura administrativa entra por SQL directo.
  PERFORM pg_advisory_xact_lock(1382240781, 2011087006);

  IF TG_OP = 'DELETE' THEN
    balance_objetivo := OLD."balance_id";
    catalogo_objetivo := OLD."catalogo_id";
  ELSE
    balance_objetivo := NEW."balance_id";
    catalogo_objetivo := NEW."catalogo_id";
  END IF;

  SELECT "modulo_id", "activa", "cuenta_russell"
    INTO modulo_objetivo, fila_activa, cuenta_objetivo
  FROM "prevalidador_cuentas"
  WHERE "id" = catalogo_objetivo;

  IF modulo_objetivo IS NULL THEN
    RAISE EXCEPTION 'La fila del catálogo del prevalidador no existe'
      USING ERRCODE = '23503';
  END IF;

  -- INSERT/UPDATE resuelve con el nuevo override; DELETE vuelve a la cuenta
  -- Russell cargada arriba. Una fila inactiva no participa en ningún total.
  IF TG_OP <> 'DELETE' THEN
    cuenta_objetivo := NEW."cuenta_cliente";
  END IF;
  IF NOT fila_activa THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(o."cuenta_cliente", c."cuenta_russell")
    INTO cuenta_conflicto
  FROM "prevalidador_cuentas" c
  LEFT JOIN "prevalidador_cuentas_balance" o
    ON o."balance_id" = balance_objetivo
   AND o."catalogo_id" = c."id"
  WHERE c."modulo_id" = modulo_objetivo
    AND c."activa" = true
    AND c."id" <> catalogo_objetivo
    AND (
      COALESCE(o."cuenta_cliente", c."cuenta_russell") LIKE cuenta_objetivo || '%'
      OR cuenta_objetivo LIKE COALESCE(o."cuenta_cliente", c."cuenta_russell") || '%'
    )
  LIMIT 1;

  IF cuenta_conflicto IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta cliente % se solapa con % dentro del mismo módulo',
      cuenta_objetivo, cuenta_conflicto
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;


--
-- Name: validar_solapes_cliente_tras_catalogo_prevalidador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_solapes_cliente_tras_catalogo_prevalidador() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1382240781, 2011087006);

  IF NEW."activa" AND EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT o."balance_id"
      FROM "prevalidador_cuentas_balance" o
      JOIN "prevalidador_cuentas" pc ON pc."id" = o."catalogo_id"
      WHERE pc."modulo_id" = NEW."modulo_id"
    ) balances
    JOIN "prevalidador_cuentas" a
      ON a."modulo_id" = NEW."modulo_id"
     AND a."activa" = true
    JOIN "prevalidador_cuentas" b
      ON b."modulo_id" = a."modulo_id"
     AND b."activa" = true
     AND b."id" > a."id"
    LEFT JOIN "prevalidador_cuentas_balance" oa
      ON oa."balance_id" = balances."balance_id"
     AND oa."catalogo_id" = a."id"
    LEFT JOIN "prevalidador_cuentas_balance" ob
      ON ob."balance_id" = balances."balance_id"
     AND ob."catalogo_id" = b."id"
    WHERE
      COALESCE(oa."cuenta_cliente", a."cuenta_russell") LIKE COALESCE(ob."cuenta_cliente", b."cuenta_russell") || '%'
      OR COALESCE(ob."cuenta_cliente", b."cuenta_russell") LIKE COALESCE(oa."cuenta_cliente", a."cuenta_russell") || '%'
  ) THEN
    RAISE EXCEPTION 'El cambio de catálogo solapa cuentas cliente dentro de un módulo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: adjuntos_marca_cruce; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjuntos_marca_cruce (
    id integer NOT NULL,
    marca_id integer NOT NULL,
    clave_objeto text NOT NULL,
    nombre_archivo text NOT NULL,
    tipo_contenido text NOT NULL,
    tamano_bytes integer NOT NULL,
    subido_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: adjuntos_marca_cruce_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adjuntos_marca_cruce ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.adjuntos_marca_cruce_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: adjuntos_ticket_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjuntos_ticket_soporte (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    clave_objeto text NOT NULL,
    nombre_archivo text NOT NULL,
    tipo_contenido text NOT NULL,
    tamano_bytes integer NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: adjuntos_ticket_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adjuntos_ticket_soporte ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.adjuntos_ticket_soporte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ajustes_carga_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes_carga_balance (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    hoja_preferida text,
    convencion_credito text,
    estandar text DEFAULT 'NIF'::text NOT NULL,
    agregar_por_tercero boolean,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    imputar_solo_hojas boolean,
    observaciones text,
    indicaciones_ia_tercero text,
    CONSTRAINT ajustes_carga_balance_estandar_nif_check CHECK ((estandar = 'NIF'::text))
);


--
-- Name: ajustes_carga_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ajustes_carga_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ajustes_carga_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ajustes_carga_balance_id_seq OWNED BY public.ajustes_carga_balance.id;


--
-- Name: ajustes_carga_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes_carga_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    hoja_preferida text,
    observaciones text,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: ajustes_carga_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ajustes_carga_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ajustes_carga_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ajustes_carga_modulo_id_seq OWNED BY public.ajustes_carga_modulo.id;


--
-- Name: archivos_originales_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archivos_originales_modulo (
    id integer NOT NULL,
    lote_id text,
    encabezado_id integer,
    cliente_id integer NOT NULL,
    nombre_cliente text NOT NULL,
    nit_cliente text,
    modulo_codigo text NOT NULL,
    periodo text,
    nombre_archivo text NOT NULL,
    tipo_contenido text,
    tamano_bytes integer,
    huella_sha256 text,
    clave_objeto text,
    ubicacion_carpeta text NOT NULL,
    software_origen text,
    ubicacion_origen text,
    reflejo_contable_esperado text,
    estado text DEFAULT 'recibido'::text NOT NULL,
    disponible boolean DEFAULT false NOT NULL,
    es_anexo boolean DEFAULT false NOT NULL,
    cargado_por text,
    cargado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    asistencia_json jsonb,
    revision_asistencia integer DEFAULT 0 NOT NULL,
    CONSTRAINT archivos_originales_modulo_disponible_check CHECK (((NOT disponible) OR ((clave_objeto IS NOT NULL) AND (huella_sha256 IS NOT NULL) AND (tamano_bytes IS NOT NULL) AND (tamano_bytes > 0)))),
    CONSTRAINT archivos_originales_modulo_estado_check CHECK ((estado = ANY (ARRAY['recibido'::text, 'no_procesable'::text, 'borrador'::text, 'cargado'::text, 'descartado'::text, 'cargue_eliminado'::text]))),
    CONSTRAINT archivos_originales_modulo_huella_check CHECK (((huella_sha256 IS NULL) OR (huella_sha256 ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: archivos_originales_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.archivos_originales_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: archivos_originales_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.archivos_originales_modulo_id_seq OWNED BY public.archivos_originales_modulo.id;


--
-- Name: asignacion_periodo_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignacion_periodo_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    periodo text NOT NULL,
    clasificador text NOT NULL,
    agrupador text DEFAULT ''::text NOT NULL,
    cuenta_4 text NOT NULL,
    cuenta_6 text DEFAULT ''::text NOT NULL,
    creado_por text,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asignacion_periodo_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignacion_periodo_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignacion_periodo_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignacion_periodo_modulo_id_seq OWNED BY public.asignacion_periodo_modulo.id;


--
-- Name: asignaciones_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones_cliente (
    alcance_lectura boolean DEFAULT true NOT NULL,
    alcance_escritura boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    usuario_id integer NOT NULL,
    asignado_por_id integer,
    vigente_desde timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    vigente_hasta timestamp(3) with time zone,
    motivo text,
    funcion text NOT NULL
);


--
-- Name: asignaciones_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.asignaciones_cliente ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asignaciones_cliente_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: balance_archivo_temporal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_archivo_temporal (
    lote_id text NOT NULL,
    usuario_id integer NOT NULL,
    nombre_archivo text NOT NULL,
    tipo_contenido text NOT NULL,
    tamano_bytes integer NOT NULL,
    tamano_parte integer NOT NULL,
    total_partes integer NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    expira_en timestamp(3) with time zone NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: balance_archivo_temporal_parte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_archivo_temporal_parte (
    id bigint NOT NULL,
    lote_id text NOT NULL,
    numero integer NOT NULL,
    tamano_bytes integer NOT NULL,
    contenido bytea NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: balance_archivo_temporal_parte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_archivo_temporal_parte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_archivo_temporal_parte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_archivo_temporal_parte_id_seq OWNED BY public.balance_archivo_temporal_parte.id;


--
-- Name: balance_cruce_aperturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_cruce_aperturas (
    id integer NOT NULL,
    balance_cuenta_id integer NOT NULL,
    balance_tercero_id integer NOT NULL,
    inconsistente boolean DEFAULT false NOT NULL,
    resultado jsonb NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT balance_cruce_aperturas_archivos_distintos CHECK ((balance_cuenta_id <> balance_tercero_id))
);


--
-- Name: balance_cruce_aperturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_cruce_aperturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_cruce_aperturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_cruce_aperturas_id_seq OWNED BY public.balance_cruce_aperturas.id;


--
-- Name: balance_importacion_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_importacion_lote (
    id integer NOT NULL,
    lote_id text NOT NULL,
    cliente_id integer,
    archivo_nombre text NOT NULL,
    archivo_tam text,
    nit_detectado text,
    periodo_inicial date,
    periodo_final date,
    estandar text,
    convencion_credito text,
    cuentas_movimiento integer DEFAULT 0 NOT NULL,
    filas_leidas integer DEFAULT 0 NOT NULL,
    filas_excluidas integer DEFAULT 0 NOT NULL,
    partida_doble_diff numeric(18,2) DEFAULT 0 NOT NULL,
    ecuacion_diff numeric(18,2) DEFAULT 0 NOT NULL,
    cuadrado boolean DEFAULT false NOT NULL,
    cargado_por text,
    cargado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    huella text,
    origen_extraccion text,
    spec_json jsonb,
    correcciones_aplicadas integer DEFAULT 0 NOT NULL,
    revision_contenido integer DEFAULT 0 NOT NULL,
    apertura_balance text,
    partes_archivo jsonb
);


--
-- Name: balance_importacion_lote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_importacion_lote_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_importacion_lote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_importacion_lote_id_seq OWNED BY public.balance_importacion_lote.id;


--
-- Name: balance_importacion_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_importacion_staging (
    id integer NOT NULL,
    lote_id text NOT NULL,
    cliente_id integer,
    hoja text,
    fila_num integer NOT NULL,
    codigo_crudo text NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    nivel integer,
    tipo_fila text NOT NULL,
    saldo_inicial numeric(18,2) DEFAULT 0 NOT NULL,
    debitos numeric(18,2) DEFAULT 0 NOT NULL,
    creditos numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_final numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    desacoplada boolean DEFAULT false NOT NULL,
    omitida boolean,
    padre_manual integer,
    tipo_fila_forzado text,
    justificacion_reubicacion text,
    reubicacion_revisada_por text,
    reubicacion_revisada_por_id integer,
    reubicacion_revisada_en timestamp(3) with time zone,
    CONSTRAINT balance_importacion_staging_tipo_fila_forzado_check CHECK (((tipo_fila_forzado IS NULL) OR (tipo_fila_forzado = ANY (ARRAY['agrupadora'::text, 'movimiento'::text]))))
);


--
-- Name: balance_importacion_staging_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_importacion_staging_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_importacion_staging_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_importacion_staging_id_seq OWNED BY public.balance_importacion_staging.id;


--
-- Name: balance_importacion_staging_tercero; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_importacion_staging_tercero (
    id integer NOT NULL,
    lote_id text NOT NULL,
    fila_num integer NOT NULL,
    codigo text NOT NULL,
    codigo_crudo text,
    nombre_cuenta text,
    nit_tercero text,
    nombre_tercero text,
    saldo_inicial numeric(18,2) DEFAULT 0 NOT NULL,
    debitos numeric(18,2) DEFAULT 0 NOT NULL,
    creditos numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_final numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    identidad_tercero jsonb
);


--
-- Name: balance_importacion_staging_tercero_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_importacion_staging_tercero_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_importacion_staging_tercero_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_importacion_staging_tercero_id_seq OWNED BY public.balance_importacion_staging_tercero.id;


--
-- Name: balance_lectura_diagnostico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_lectura_diagnostico (
    id integer NOT NULL,
    lote_id text NOT NULL,
    cliente_id integer,
    archivo_nombre text NOT NULL,
    modo text,
    formato text,
    filas integer DEFAULT 0 NOT NULL,
    movimientos integer DEFAULT 0 NOT NULL,
    cuadrado_inicial boolean DEFAULT false NOT NULL,
    resultado text DEFAULT 'borrador'::text NOT NULL,
    cuadrado_final boolean,
    manual_omitidas integer DEFAULT 0 NOT NULL,
    manual_reparentadas integer DEFAULT 0 NOT NULL,
    manual_desacopladas integer DEFAULT 0 NOT NULL,
    heuristicas jsonb NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    diagnostico_ia jsonb,
    manual_invertidas integer DEFAULT 0 NOT NULL,
    manual_reclasificadas integer DEFAULT 0 NOT NULL
);


--
-- Name: balance_lectura_diagnostico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_lectura_diagnostico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_lectura_diagnostico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_lectura_diagnostico_id_seq OWNED BY public.balance_lectura_diagnostico.id;


--
-- Name: balance_prueba_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_prueba_detalle (
    id integer NOT NULL,
    encabezado_id integer NOT NULL,
    cuenta_2 text NOT NULL,
    cuenta_4 text NOT NULL,
    cuenta_6 text NOT NULL,
    cuenta_8 text NOT NULL,
    nombre_cuenta text NOT NULL,
    cuenta_6_russell text,
    porcentaje_coincidencia numeric(5,2),
    saldo_inicial numeric(18,2) DEFAULT 0 NOT NULL,
    debitos numeric(18,2) DEFAULT 0 NOT NULL,
    creditos numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_final numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    editado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: balance_prueba_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_prueba_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_prueba_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_prueba_detalle_id_seq OWNED BY public.balance_prueba_detalle.id;


--
-- Name: balance_prueba_encabezado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_prueba_encabezado (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    nombre_cliente text NOT NULL,
    nit text,
    periodo text NOT NULL,
    periodo_inicio date NOT NULL,
    periodo_fin date NOT NULL,
    version text NOT NULL,
    es_oficial boolean DEFAULT false NOT NULL,
    esta_congelado boolean DEFAULT false NOT NULL,
    estado text DEFAULT 'Única'::text NOT NULL,
    completitud integer DEFAULT 100 NOT NULL,
    archivo text,
    tamano_archivo text,
    cargado_por text,
    rol_carga text,
    cuadrado boolean DEFAULT true NOT NULL,
    nota text,
    suma_activo numeric(18,2) DEFAULT 0 NOT NULL,
    filas_totales integer DEFAULT 0 NOT NULL,
    mapeadas integer DEFAULT 0 NOT NULL,
    sin_mapear integer DEFAULT 0 NOT NULL,
    criticas integer DEFAULT 0 NOT NULL,
    cambios integer DEFAULT 0 NOT NULL,
    estandar text,
    convencion_credito text,
    filas_leidas integer,
    filas_excluidas integer,
    filas_descuadre integer,
    congelado_por text,
    congelado_en timestamp(3) with time zone,
    ultima_carga timestamp(3) with time zone,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    comentario_aprobacion text,
    reubicaciones_aprobadas jsonb,
    lote_id text,
    advertencia_archivo_fuente boolean DEFAULT false NOT NULL,
    diferencia_archivo_fuente numeric(18,2),
    apertura_balance text,
    puc_cliente jsonb,
    archivos_cargue jsonb,
    descongelado_por text,
    descongelado_por_id integer,
    descongelado_en timestamp(3) with time zone,
    justificacion_descongelado text,
    CONSTRAINT balance_prueba_encabezado_advertencia_archivo_fuente_check CHECK ((advertencia_archivo_fuente = (diferencia_archivo_fuente IS NOT NULL)))
);


--
-- Name: balance_prueba_encabezado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_prueba_encabezado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_prueba_encabezado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_prueba_encabezado_id_seq OWNED BY public.balance_prueba_encabezado.id;


--
-- Name: balance_tercero_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_tercero_detalle (
    id integer NOT NULL,
    encabezado_id integer NOT NULL,
    cuenta_2 text NOT NULL,
    cuenta_4 text NOT NULL,
    cuenta_6 text NOT NULL,
    cuenta_8 text NOT NULL,
    nombre_cuenta text NOT NULL,
    cuenta_6_russell text,
    porcentaje_coincidencia numeric(5,2),
    nit_tercero text,
    nombre_tercero text,
    saldo_inicial numeric(18,2) DEFAULT 0 NOT NULL,
    debitos numeric(18,2) DEFAULT 0 NOT NULL,
    creditos numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_final numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    identidad_tercero jsonb,
    clave_tercero text
);


--
-- Name: balance_tercero_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_tercero_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_tercero_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_tercero_detalle_id_seq OWNED BY public.balance_tercero_detalle.id;


--
-- Name: balance_tercero_encabezado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_tercero_encabezado (
    id integer NOT NULL,
    lote_id text,
    cliente_id integer NOT NULL,
    nombre_cliente text NOT NULL,
    nit text,
    periodo text NOT NULL,
    periodo_inicio date NOT NULL,
    periodo_fin date NOT NULL,
    version text NOT NULL,
    es_oficial boolean DEFAULT false NOT NULL,
    esta_congelado boolean DEFAULT false NOT NULL,
    archivo text,
    tamano_archivo text,
    huella text,
    origen_extraccion text,
    cargado_por text,
    filas_totales integer DEFAULT 0 NOT NULL,
    ultima_carga timestamp(3) with time zone,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: balance_tercero_encabezado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balance_tercero_encabezado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balance_tercero_encabezado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balance_tercero_encabezado_id_seq OWNED BY public.balance_tercero_encabezado.id;


--
-- Name: balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balances (
    nombre_cliente text NOT NULL,
    nit_cliente text,
    periodo text NOT NULL,
    version text NOT NULL,
    es_oficial boolean DEFAULT false NOT NULL,
    esta_congelado boolean DEFAULT false NOT NULL,
    estado text DEFAULT 'Única'::text NOT NULL,
    completitud integer DEFAULT 100 NOT NULL,
    sumas jsonb,
    validaciones jsonb,
    desglose jsonb,
    metadatos jsonb,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bitacora jsonb,
    comparativo jsonb,
    ultima_carga timestamp(3) with time zone,
    historial_versiones jsonb,
    estado_resultado jsonb,
    id integer NOT NULL
);


--
-- Name: balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.balances ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.balances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bitacora_cuentas_estandar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bitacora_cuentas_estandar (
    id integer NOT NULL,
    cuenta_id integer,
    codigo text NOT NULL,
    accion text NOT NULL,
    usuario text NOT NULL,
    usuario_id integer,
    detalle text NOT NULL,
    antes jsonb,
    despues jsonb,
    ip text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bitacora_cuentas_estandar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bitacora_cuentas_estandar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bitacora_cuentas_estandar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bitacora_cuentas_estandar_id_seq OWNED BY public.bitacora_cuentas_estandar.id;


--
-- Name: cambios_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cambios_version (
    id integer NOT NULL,
    version_id integer NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descripcion text NOT NULL,
    modulo text,
    ruta text,
    como_operar text,
    ejemplo text,
    estado_funcionalidad text DEFAULT 'disponible'::text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: cambios_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cambios_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cambios_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cambios_version_id_seq OWNED BY public.cambios_version.id;


--
-- Name: campos_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campos_modulo (
    clave text NOT NULL,
    etiqueta text NOT NULL,
    tipo text NOT NULL,
    requerido boolean DEFAULT false NOT NULL,
    ayuda text,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    modulo_id integer NOT NULL
);


--
-- Name: campos_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campos_modulo ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.campos_modulo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cartera_saldo_tercero; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cartera_saldo_tercero (
    id integer NOT NULL,
    encabezado_id integer NOT NULL,
    lote_id text NOT NULL,
    nivel text NOT NULL,
    origen text NOT NULL,
    cuenta_cliente text DEFAULT ''::text NOT NULL,
    origen_cartera text DEFAULT ''::text NOT NULL,
    clave_tercero text NOT NULL,
    nit_original text,
    dv text,
    sucursal text,
    nombre text,
    saldo numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_reportado numeric(18,2),
    suma_edades numeric(18,2),
    edades jsonb,
    documentos integer DEFAULT 0 NOT NULL,
    dias_max integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cartera_saldo_tercero_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cartera_saldo_tercero ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cartera_saldo_tercero_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clase_agrupador_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clase_agrupador_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    agrupador text NOT NULL,
    clase text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clase_agrupador_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clase_agrupador_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clase_agrupador_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clase_agrupador_modulo_id_seq OWNED BY public.clase_agrupador_modulo.id;


--
-- Name: clasificador_no_modular_cruce; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clasificador_no_modular_cruce (
    id integer NOT NULL,
    marca_id integer NOT NULL,
    clasificador text NOT NULL,
    total_al_marcar numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clasificador_no_modular_cruce_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clasificador_no_modular_cruce_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clasificador_no_modular_cruce_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clasificador_no_modular_cruce_id_seq OWNED BY public.clasificador_no_modular_cruce.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    codigo text NOT NULL,
    nombre text NOT NULL,
    nit text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    tipo_cliente text DEFAULT 'C'::text NOT NULL,
    socio_id integer,
    erp_id integer,
    sector_id integer
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.clientes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.clientes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comentarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios (
    id integer NOT NULL,
    entidad_tipo text NOT NULL,
    entidad_id integer NOT NULL,
    ancla text,
    autor_id integer NOT NULL,
    texto text NOT NULL,
    comentario_padre_id integer,
    es_ia boolean DEFAULT false NOT NULL,
    editado_en timestamp(3) with time zone,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: comentarios_conciliacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios_conciliacion (
    cuenta text NOT NULL,
    autor text NOT NULL,
    iniciales text NOT NULL,
    texto text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    conciliacion_id integer NOT NULL
);


--
-- Name: comentarios_conciliacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comentarios_conciliacion ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.comentarios_conciliacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comentarios_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios_dian (
    clave_renglon text NOT NULL,
    autor text NOT NULL,
    iniciales text NOT NULL,
    texto text NOT NULL,
    es_ia boolean DEFAULT false NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    formulario_id integer NOT NULL
);


--
-- Name: comentarios_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comentarios_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.comentarios_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comentarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comentarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comentarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comentarios_id_seq OWNED BY public.comentarios.id;


--
-- Name: conciliacion_modulo_cierre; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliacion_modulo_cierre (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    periodo text NOT NULL,
    balance_periodo text NOT NULL,
    modulo_dato_encabezado_id integer NOT NULL,
    balance_encabezado_id integer NOT NULL,
    cuentas_russell jsonb NOT NULL,
    estado text DEFAULT 'firme'::text NOT NULL,
    cerrado_por_id integer,
    cerrado_por text NOT NULL,
    cerrado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    desbloqueado_por_id integer,
    desbloqueado_por text,
    desbloqueado_en timestamp(3) with time zone,
    justificacion_desbloqueo text,
    cuentas_russell_6 jsonb,
    resumen_cruce_tercero jsonb,
    cuentas_conciliacion jsonb,
    subgrupos_conciliacion jsonb,
    pares_depreciacion jsonb
);


--
-- Name: conciliacion_modulo_cierre_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conciliacion_modulo_cierre_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conciliacion_modulo_cierre_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conciliacion_modulo_cierre_id_seq OWNED BY public.conciliacion_modulo_cierre.id;


--
-- Name: conciliaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliaciones (
    codigo text NOT NULL,
    nombre_cliente text NOT NULL,
    modulo text NOT NULL,
    periodo text NOT NULL,
    erp text NOT NULL,
    estado text NOT NULL,
    diferencia text NOT NULL,
    items integer DEFAULT 0 NOT NULL,
    responsable text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    corte date,
    ultima_actividad timestamp(3) with time zone,
    materialidad integer DEFAULT 2000000 NOT NULL,
    ejecutado_en timestamp(3) with time zone,
    ejecutado_por text,
    id integer NOT NULL,
    cliente_id integer,
    balance_prevalidado_id integer
);


--
-- Name: conciliaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.conciliaciones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.conciliaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: conexiones_integracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conexiones_integracion (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    categoria text NOT NULL,
    proveedor text NOT NULL,
    entorno text DEFAULT 'PRODUCCION'::text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    configuracion jsonb,
    credenciales jsonb,
    ultima_prueba_en timestamp(3) with time zone,
    ultima_prueba_ok boolean,
    ultima_prueba_mensaje text,
    ultima_prueba_ms integer,
    ultimo_uso_en timestamp(3) with time zone,
    ultima_ejecucion_estado text,
    ultima_ejecucion_mensaje text,
    creado_por text,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: conexiones_integracion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conexiones_integracion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conexiones_integracion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conexiones_integracion_id_seq OWNED BY public.conexiones_integracion.id;


--
-- Name: consolidacion_modulo_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consolidacion_modulo_cliente (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    clasificador text NOT NULL,
    cuenta_4 text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    descripcion text,
    cuenta_6 text DEFAULT ''::text NOT NULL,
    grupo text,
    subcuenta_puc text,
    agrupador text DEFAULT ''::text NOT NULL,
    cuenta_cliente text DEFAULT ''::text NOT NULL,
    origen text DEFAULT 'manual'::text NOT NULL
);


--
-- Name: consolidacion_modulo_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consolidacion_modulo_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consolidacion_modulo_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consolidacion_modulo_cliente_id_seq OWNED BY public.consolidacion_modulo_cliente.id;


--
-- Name: consumo_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumo_ia (
    id integer NOT NULL,
    cliente_id integer,
    usuario_id integer,
    usuario_nombre text,
    modulo text DEFAULT 'balance'::text NOT NULL,
    tipo_operacion text NOT NULL,
    modelo text NOT NULL,
    archivo_nombre text,
    nit_detectado text,
    lote_indice integer,
    cuentas_lote integer,
    tokens_entrada integer DEFAULT 0 NOT NULL,
    tokens_salida integer DEFAULT 0 NOT NULL,
    tokens_cache_creacion integer DEFAULT 0 NOT NULL,
    tokens_cache_lectura integer DEFAULT 0 NOT NULL,
    costo_usd numeric(12,6) DEFAULT 0 NOT NULL,
    trm numeric(12,4) DEFAULT 0 NOT NULL,
    costo_cop numeric(14,2) DEFAULT 0 NOT NULL,
    exitoso boolean DEFAULT true NOT NULL,
    mensaje_error text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: consumo_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consumo_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumo_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consumo_ia_id_seq OWNED BY public.consumo_ia.id;


--
-- Name: correcciones_carga_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.correcciones_carga_balance (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    cuenta text NOT NULL,
    nombre text,
    tipo_fila_forzado text,
    invertir_lados boolean DEFAULT false NOT NULL,
    desacoplada boolean,
    omitida boolean,
    padre_codigo text,
    veces_aplicada integer DEFAULT 0 NOT NULL,
    ultimo_uso_en timestamp(3) with time zone,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: correcciones_carga_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.correcciones_carga_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: correcciones_carga_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.correcciones_carga_balance_id_seq OWNED BY public.correcciones_carga_balance.id;


--
-- Name: correcciones_carga_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.correcciones_carga_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    clave text NOT NULL,
    nombre text,
    tipo_fila_forzado text,
    omitida boolean,
    veces_aplicada integer DEFAULT 0 NOT NULL,
    ultimo_uso_en timestamp(3) with time zone,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: correcciones_carga_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.correcciones_carga_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: correcciones_carga_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.correcciones_carga_modulo_id_seq OWNED BY public.correcciones_carga_modulo.id;


--
-- Name: cuenta_bloqueada_conciliacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuenta_bloqueada_conciliacion (
    id integer NOT NULL,
    cierre_id integer NOT NULL,
    cliente_id integer NOT NULL,
    periodo text NOT NULL,
    cuenta text NOT NULL,
    cuenta_6_russell text,
    saldo_inicial numeric(18,2) DEFAULT 0 NOT NULL,
    debitos numeric(18,2) DEFAULT 0 NOT NULL,
    creditos numeric(18,2) DEFAULT 0 NOT NULL,
    saldo_final numeric(18,2) DEFAULT 0 NOT NULL,
    modulo_codigo text NOT NULL,
    modulo_dato_encabezado_id integer NOT NULL
);


--
-- Name: cuenta_bloqueada_conciliacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuenta_bloqueada_conciliacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuenta_bloqueada_conciliacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuenta_bloqueada_conciliacion_id_seq OWNED BY public.cuenta_bloqueada_conciliacion.id;


--
-- Name: cuenta_no_modular_cruce; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuenta_no_modular_cruce (
    id integer NOT NULL,
    marca_id integer NOT NULL,
    cuenta_8 text NOT NULL,
    nombre_cuenta text NOT NULL,
    valor_al_marcar numeric(18,2) DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cuenta_no_modular_cruce_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cuenta_no_modular_cruce ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cuenta_no_modular_cruce_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cuentas_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_cliente (
    nombre_cliente text NOT NULL,
    codigo text NOT NULL,
    nivel integer NOT NULL,
    nombre text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    opcion_russell_id integer,
    actualizado_en timestamp(3) with time zone,
    actualizado_por text,
    cliente_id integer,
    cuenta_6_russell text,
    origen_mapeo text,
    porcentaje_coincidencia numeric(5,2),
    nit text,
    procedencia_mapeo jsonb
);


--
-- Name: cuentas_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cuentas_cliente ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cuentas_cliente_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cuentas_conciliacion_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_conciliacion_modulo (
    id integer NOT NULL,
    modulo_codigo text NOT NULL,
    cuenta text NOT NULL,
    origen text,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    categoria text DEFAULT 'concilia'::text NOT NULL,
    CONSTRAINT cuentas_conciliacion_modulo_categoria_check CHECK ((categoria = ANY (ARRAY['concilia'::text, 'visible'::text]))),
    CONSTRAINT cuentas_conciliacion_modulo_cuenta_chk CHECK ((cuenta ~ '^[0-9]{6}$'::text)),
    CONSTRAINT cuentas_conciliacion_modulo_origen_chk CHECK (((origen IS NULL) OR (origen = ANY (ARRAY['nacional'::text, 'exterior'::text]))))
);


--
-- Name: cuentas_conciliacion_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_conciliacion_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_conciliacion_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_conciliacion_modulo_id_seq OWNED BY public.cuentas_conciliacion_modulo.id;


--
-- Name: cuentas_estandar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_estandar (
    codigo text NOT NULL,
    nombre text NOT NULL,
    nivel integer NOT NULL,
    naturaleza text NOT NULL,
    padre text,
    critica boolean DEFAULT false NOT NULL,
    id integer NOT NULL,
    cuenta_russell text,
    tipo_rubro text,
    incluye text,
    no_incluye text,
    cuentas_posibles text,
    soportes_terceros text,
    soportes_control text,
    observaciones_homologacion text
);


--
-- Name: cuentas_estandar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cuentas_estandar ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cuentas_estandar_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ejecuciones_conexion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ejecuciones_conexion (
    id integer NOT NULL,
    conexion_id integer NOT NULL,
    tipo text NOT NULL,
    estado text NOT NULL,
    mensaje text,
    duracion_ms integer,
    ejecutado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ejecuciones_conexion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ejecuciones_conexion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ejecuciones_conexion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ejecuciones_conexion_id_seq OWNED BY public.ejecuciones_conexion.id;


--
-- Name: emparejamiento_tercero_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emparejamiento_tercero_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    periodo text DEFAULT ''::text NOT NULL,
    clave_modulo text NOT NULL,
    clave_balance text NOT NULL,
    nombre_modulo text,
    nombre_balance text,
    origen text DEFAULT 'manual'::text NOT NULL,
    nota text,
    creado_por text,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tipo text DEFAULT 'union'::text NOT NULL,
    CONSTRAINT emparejamiento_tercero_modulo_tipo_check CHECK ((tipo = ANY (ARRAY['union'::text, 'separacion'::text, 'union_contable'::text])))
);


--
-- Name: emparejamiento_tercero_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.emparejamiento_tercero_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: emparejamiento_tercero_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.emparejamiento_tercero_modulo_id_seq OWNED BY public.emparejamiento_tercero_modulo.id;


--
-- Name: envios_reporte_ejecutivo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envios_reporte_ejecutivo (
    id integer NOT NULL,
    titulo text NOT NULL,
    periodo_desde timestamp(3) with time zone NOT NULL,
    periodo_hasta timestamp(3) with time zone NOT NULL,
    ids_version integer[],
    total_novedades integer DEFAULT 0 NOT NULL,
    total_acciones integer DEFAULT 0 NOT NULL,
    canal text DEFAULT 'correo'::text NOT NULL,
    nota text,
    enviado_por text NOT NULL,
    enviado_por_id integer,
    enviado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: envios_reporte_ejecutivo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.envios_reporte_ejecutivo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: envios_reporte_ejecutivo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.envios_reporte_ejecutivo_id_seq OWNED BY public.envios_reporte_ejecutivo.id;


--
-- Name: erps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erps (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: erps_cliente_proceso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erps_cliente_proceso (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    proceso_id integer NOT NULL,
    erp_id integer NOT NULL,
    estado text DEFAULT 'confirmado'::text NOT NULL,
    origen text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT erps_cliente_proceso_estado_check CHECK ((estado = ANY (ARRAY['confirmado'::text, 'heredado'::text])))
);


--
-- Name: erps_cliente_proceso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.erps_cliente_proceso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: erps_cliente_proceso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.erps_cliente_proceso_id_seq OWNED BY public.erps_cliente_proceso.id;


--
-- Name: erps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.erps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: erps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.erps_id_seq OWNED BY public.erps.id;


--
-- Name: eventos_ticket_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_ticket_soporte (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    autor_id integer,
    autor_nombre text NOT NULL,
    estado_anterior text,
    estado_nuevo text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: eventos_ticket_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eventos_ticket_soporte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eventos_ticket_soporte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eventos_ticket_soporte_id_seq OWNED BY public.eventos_ticket_soporte.id;


--
-- Name: filas_conciliacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filas_conciliacion (
    cuenta text NOT NULL,
    descripcion text NOT NULL,
    saldo_contabilidad integer NOT NULL,
    saldo_modulo integer NOT NULL,
    diferencia integer NOT NULL,
    items integer DEFAULT 0 NOT NULL,
    estado_manual text,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    conciliacion_id integer NOT NULL
);


--
-- Name: filas_conciliacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.filas_conciliacion ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.filas_conciliacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: formularios_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formularios_dian (
    clave text NOT NULL,
    nombre text NOT NULL,
    codigo text NOT NULL,
    periodicidad text NOT NULL,
    icono text NOT NULL,
    conclusion text,
    objetivo text,
    id integer NOT NULL
);


--
-- Name: formularios_dian_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formularios_dian_cliente (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    formulario_id integer NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: formularios_dian_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.formularios_dian_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: formularios_dian_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.formularios_dian_cliente_id_seq OWNED BY public.formularios_dian_cliente.id;


--
-- Name: formularios_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.formularios_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.formularios_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: intentos_inicio_sesion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intentos_inicio_sesion (
    correo text NOT NULL,
    ip text NOT NULL,
    exitoso boolean NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL
);


--
-- Name: intentos_inicio_sesion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.intentos_inicio_sesion ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.intentos_inicio_sesion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: jerarquia_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jerarquia_usuarios (
    id integer NOT NULL,
    superior_id integer NOT NULL,
    subordinado_id integer NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: jerarquia_usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jerarquia_usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jerarquia_usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jerarquia_usuarios_id_seq OWNED BY public.jerarquia_usuarios.id;


--
-- Name: marca_cruce_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marca_cruce_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    periodo text NOT NULL,
    cuenta_4 text,
    nota text NOT NULL,
    diferencia numeric(18,2) DEFAULT 0 NOT NULL,
    comentario_id integer,
    marcado_por text,
    marcado_por_id integer,
    marcado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    referencia_anexo text,
    numero integer NOT NULL,
    dimension text DEFAULT 'cuenta4'::text NOT NULL,
    clave text,
    CONSTRAINT marca_cruce_modulo_dimension_check CHECK ((((dimension = 'cuenta4'::text) AND (cuenta_4 IS NOT NULL) AND (clave IS NULL)) OR ((dimension = 'tercero'::text) AND (clave IS NOT NULL) AND (cuenta_4 IS NULL))))
);


--
-- Name: justificacion_cruce_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.justificacion_cruce_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: justificacion_cruce_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.justificacion_cruce_modulo_id_seq OWNED BY public.marca_cruce_modulo.id;


--
-- Name: mapeos_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapeos_dian (
    clave_renglon text NOT NULL,
    cuenta text NOT NULL,
    descripcion text NOT NULL,
    signo text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    formulario_id integer NOT NULL
);


--
-- Name: mapeos_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mapeos_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.mapeos_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menciones_comentario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menciones_comentario (
    id integer NOT NULL,
    comentario_id integer NOT NULL,
    usuario_mencionado_id integer NOT NULL,
    leido_en timestamp(3) with time zone,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: menciones_comentario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menciones_comentario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menciones_comentario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menciones_comentario_id_seq OWNED BY public.menciones_comentario.id;


--
-- Name: mensajes_ticket_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes_ticket_soporte (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    autor_id integer,
    autor_nombre text NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    autor_lado text NOT NULL
);


--
-- Name: mensajes_ticket_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mensajes_ticket_soporte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mensajes_ticket_soporte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mensajes_ticket_soporte_id_seq OWNED BY public.mensajes_ticket_soporte.id;


--
-- Name: modulo_dato_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulo_dato_detalle (
    id integer NOT NULL,
    encabezado_id integer NOT NULL,
    fila_num integer NOT NULL,
    clasificador text,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    nivel text,
    imputable boolean DEFAULT true NOT NULL,
    nit_canonico text,
    cuenta_cliente text,
    origen_cartera text
);


--
-- Name: modulo_dato_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulo_dato_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulo_dato_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulo_dato_detalle_id_seq OWNED BY public.modulo_dato_detalle.id;


--
-- Name: modulo_dato_encabezado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulo_dato_encabezado (
    id integer NOT NULL,
    modulo_codigo text NOT NULL,
    lote_id text,
    cliente_id integer NOT NULL,
    nombre_cliente text NOT NULL,
    periodo text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    es_oficial boolean DEFAULT true NOT NULL,
    esta_congelado boolean DEFAULT false NOT NULL,
    congelado_por text,
    congelado_en timestamp(3) with time zone,
    filas integer DEFAULT 0 NOT NULL,
    total numeric(18,2) DEFAULT 0 NOT NULL,
    cargado_por text,
    cargado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    observaciones text,
    verificaciones jsonb,
    archivo_nombre text,
    archivo_tam text,
    origen_extraccion text,
    ultima_carga timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    hoja text,
    total_declarado numeric(18,2),
    fila_total_declarado integer,
    archivos_del_cargue integer,
    archivos_con_total integer,
    nivel_saldo text,
    fecha_corte date,
    rangos_edades jsonb,
    trm_cierre numeric(12,4),
    periodo_desde text,
    patron_version_id integer,
    patron_coincidencia integer,
    formatos_cartera jsonb,
    contenido_archivos jsonb
);


--
-- Name: modulo_dato_encabezado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulo_dato_encabezado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulo_dato_encabezado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulo_dato_encabezado_id_seq OWNED BY public.modulo_dato_encabezado.id;


--
-- Name: modulo_importacion_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulo_importacion_lote (
    id integer NOT NULL,
    modulo_codigo text NOT NULL,
    lote_id text NOT NULL,
    cliente_id integer,
    archivo_nombre text NOT NULL,
    archivo_tam text,
    periodo_inicial date,
    periodo_final date,
    filas_leidas integer DEFAULT 0 NOT NULL,
    filas_excluidas integer DEFAULT 0 NOT NULL,
    huella text,
    origen_extraccion text,
    especificacion_json jsonb,
    correcciones_aplicadas integer DEFAULT 0 NOT NULL,
    cargado_por text,
    cargado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    anexo_encabezado_id integer,
    patron_version_id integer,
    patron_coincidencia integer
);


--
-- Name: modulo_importacion_lote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulo_importacion_lote_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulo_importacion_lote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulo_importacion_lote_id_seq OWNED BY public.modulo_importacion_lote.id;


--
-- Name: modulo_importacion_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulo_importacion_staging (
    id integer NOT NULL,
    lote_id text NOT NULL,
    modulo_codigo text NOT NULL,
    cliente_id integer,
    hoja text,
    fila_num integer NOT NULL,
    clasificador text,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    tipo_fila text DEFAULT 'movimiento'::text NOT NULL,
    tipo_fila_forzado text,
    omitida boolean,
    padre_manual integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    motivo_tipo_fila text
);


--
-- Name: modulo_importacion_staging_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulo_importacion_staging_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulo_importacion_staging_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulo_importacion_staging_id_seq OWNED BY public.modulo_importacion_staging.id;


--
-- Name: modulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos (
    codigo text NOT NULL,
    nombre text NOT NULL,
    icono text NOT NULL,
    id integer NOT NULL
);


--
-- Name: modulos_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos_cliente (
    estado text NOT NULL,
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_id integer NOT NULL
);


--
-- Name: modulos_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.modulos_cliente ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.modulos_cliente_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: modulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.modulos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.modulos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: modulos_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos_plataforma (
    id integer NOT NULL,
    clave text NOT NULL,
    etiqueta text NOT NULL,
    descripcion text,
    grupo text NOT NULL,
    icono text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    habilitado_no_administradores boolean DEFAULT true NOT NULL,
    bloqueable_no_administradores boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: modulos_plataforma_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.modulos_plataforma ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.modulos_plataforma_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    tipo text NOT NULL,
    autor text NOT NULL,
    texto text NOT NULL,
    destino text NOT NULL,
    no_leida boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL
);


--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.notificaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: opciones_russell; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opciones_russell (
    codigo text NOT NULL,
    nombre text NOT NULL,
    modulo text,
    id integer NOT NULL
);


--
-- Name: opciones_russell_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.opciones_russell ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.opciones_russell_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pares_depreciacion_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pares_depreciacion_modulo (
    id integer NOT NULL,
    modulo_codigo text NOT NULL,
    subgrupo text NOT NULL,
    cuenta text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT pares_depreciacion_modulo_cuenta_chk CHECK ((cuenta ~ '^[0-9]{6}$'::text)),
    CONSTRAINT pares_depreciacion_modulo_subgrupo_chk CHECK ((subgrupo ~ '^[0-9]{4}$'::text))
);


--
-- Name: pares_depreciacion_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pares_depreciacion_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pares_depreciacion_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pares_depreciacion_modulo_id_seq OWNED BY public.pares_depreciacion_modulo.id;


--
-- Name: perfiles_carga_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfiles_carga_balance (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    huella text NOT NULL,
    hoja text NOT NULL,
    fila_encabezado integer NOT NULL,
    primera_fila_datos integer NOT NULL,
    col_codigo integer NOT NULL,
    col_codigo_fragmentos jsonb DEFAULT '[]'::jsonb NOT NULL,
    col_nombre integer NOT NULL,
    col_saldo_inicial integer NOT NULL,
    col_debitos integer NOT NULL,
    col_creditos integer NOT NULL,
    col_saldo_final integer NOT NULL,
    col_saldo_final_debito integer NOT NULL,
    col_saldo_final_credito integer NOT NULL,
    col_tercero integer NOT NULL,
    signo_credito text NOT NULL,
    regla_detalle_tipo text NOT NULL,
    regla_detalle_columna integer,
    regla_detalle_valor text,
    agregar_por_tercero boolean DEFAULT false NOT NULL,
    origen text NOT NULL,
    veces_usado integer DEFAULT 0 NOT NULL,
    ultimo_uso_en timestamp(3) with time zone,
    archivo_ejemplo text,
    creado_por text,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    col_nombre_tercero integer DEFAULT 0 NOT NULL,
    col_tipo_documento_tercero integer DEFAULT 0 NOT NULL,
    col_dv_tercero integer DEFAULT 0 NOT NULL,
    prefijo_documento_tercero text,
    subtotales_tercero text DEFAULT 'auto'::text NOT NULL
);


--
-- Name: perfiles_carga_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfiles_carga_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfiles_carga_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfiles_carga_balance_id_seq OWNED BY public.perfiles_carga_balance.id;


--
-- Name: perfiles_carga_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfiles_carga_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    huella text NOT NULL,
    especificacion_json jsonb NOT NULL,
    origen text NOT NULL,
    veces_usado integer DEFAULT 0 NOT NULL,
    ultimo_uso_en timestamp(3) with time zone,
    archivo_ejemplo text,
    creado_por text,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: perfiles_carga_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfiles_carga_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfiles_carga_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfiles_carga_modulo_id_seq OWNED BY public.perfiles_carga_modulo.id;


--
-- Name: periodos_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periodos_dian (
    clave_periodo text NOT NULL,
    etiqueta text NOT NULL,
    estado text NOT NULL,
    presentado date,
    id integer NOT NULL,
    formulario_id integer NOT NULL
);


--
-- Name: periodos_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.periodos_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.periodos_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos (
    codigo text NOT NULL,
    modulo text NOT NULL,
    accion text NOT NULL,
    etiqueta text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL
);


--
-- Name: permisos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.permisos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.permisos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: preferencias_soporte_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_soporte_usuario (
    usuario_id integer NOT NULL,
    estados_ocultos text[] DEFAULT ARRAY['resuelto'::text, 'cerrado'::text] NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT preferencias_soporte_usuario_estados_validos_check CHECK (((estados_ocultos <@ ARRAY['abierto'::text, 'en_evaluacion'::text, 'en_proceso'::text, 'resuelto'::text, 'cerrado'::text]) AND (array_position(estados_ocultos, NULL::text) IS NULL)))
);


--
-- Name: prevalidador_catalogos_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevalidador_catalogos_revision (
    id integer NOT NULL,
    revision_id integer NOT NULL,
    catalogo jsonb NOT NULL,
    origen text DEFAULT 'aprobacion'::text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT prevalidador_catalogos_revision_catalogo_chk CHECK (((jsonb_typeof(catalogo) = 'array'::text) AND (jsonb_array_length(catalogo) > 0))),
    CONSTRAINT prevalidador_catalogos_revision_origen_chk CHECK ((origen = ANY (ARRAY['aprobacion'::text, 'respaldo'::text])))
);


--
-- Name: prevalidador_catalogos_revision_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prevalidador_catalogos_revision_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prevalidador_catalogos_revision_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prevalidador_catalogos_revision_id_seq OWNED BY public.prevalidador_catalogos_revision.id;


--
-- Name: prevalidador_cuentas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevalidador_cuentas (
    id integer NOT NULL,
    modulo_id integer NOT NULL,
    cuenta_russell text NOT NULL,
    etiqueta text,
    base_calculo text DEFAULT 'saldo'::text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT prevalidador_cuentas_base_calculo_check CHECK ((base_calculo = ANY (ARRAY['saldo'::text, 'movimiento'::text]))),
    CONSTRAINT prevalidador_cuentas_cuenta_russell_check CHECK ((cuenta_russell ~ '^[0-9]{2}([0-9]{2})?$'::text)),
    CONSTRAINT prevalidador_cuentas_orden_check CHECK (((orden >= 0) AND (orden <= 9999)))
);


--
-- Name: prevalidador_cuentas_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevalidador_cuentas_balance (
    id integer NOT NULL,
    balance_id integer NOT NULL,
    catalogo_id integer NOT NULL,
    cuenta_cliente text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT prevalidador_cuentas_balance_cuenta_cliente_check CHECK ((cuenta_cliente ~ '^[0-9]{2}([0-9]{2})?$'::text))
);


--
-- Name: prevalidador_cuentas_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prevalidador_cuentas_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prevalidador_cuentas_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prevalidador_cuentas_balance_id_seq OWNED BY public.prevalidador_cuentas_balance.id;


--
-- Name: prevalidador_cuentas_cliente_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevalidador_cuentas_cliente_legacy (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    catalogo_id integer NOT NULL,
    cuenta_cliente text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    archivado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: prevalidador_cuentas_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prevalidador_cuentas_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prevalidador_cuentas_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prevalidador_cuentas_cliente_id_seq OWNED BY public.prevalidador_cuentas_cliente_legacy.id;


--
-- Name: prevalidador_cuentas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prevalidador_cuentas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prevalidador_cuentas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prevalidador_cuentas_id_seq OWNED BY public.prevalidador_cuentas.id;


--
-- Name: prevalidador_revisiones_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevalidador_revisiones_balance (
    id integer NOT NULL,
    balance_id integer NOT NULL,
    estado text NOT NULL,
    justificacion text NOT NULL,
    huella text NOT NULL,
    instantanea jsonb,
    actor text NOT NULL,
    actor_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT prevalidador_revisiones_balance_estado_check CHECK ((estado = ANY (ARRAY['aprobada'::text, 'revocada'::text]))),
    CONSTRAINT prevalidador_revisiones_balance_huella_check CHECK ((huella ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT prevalidador_revisiones_balance_justificacion_check CHECK (((char_length(btrim(justificacion)) >= 3) AND (char_length(btrim(justificacion)) <= 2000)))
);


--
-- Name: prevalidador_revisiones_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prevalidador_revisiones_balance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prevalidador_revisiones_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prevalidador_revisiones_balance_id_seq OWNED BY public.prevalidador_revisiones_balance.id;


--
-- Name: procesos_erp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procesos_erp (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: procesos_erp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procesos_erp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procesos_erp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procesos_erp_id_seq OWNED BY public.procesos_erp.id;


--
-- Name: prompts_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompts_ia (
    id integer NOT NULL,
    clave text NOT NULL,
    contenido text NOT NULL,
    predeterminado text NOT NULL,
    actualizado_por text,
    actualizado_en timestamp(3) with time zone NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: prompts_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prompts_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prompts_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prompts_ia_id_seq OWNED BY public.prompts_ia.id;


--
-- Name: registros_acceso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_acceso (
    id integer NOT NULL,
    usuario_id integer,
    usuario text NOT NULL,
    rol text,
    ruta text NOT NULL,
    tipo text NOT NULL,
    ip text,
    agente text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: registros_acceso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registros_acceso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registros_acceso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registros_acceso_id_seq OWNED BY public.registros_acceso.id;


--
-- Name: registros_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_auditoria (
    usuario text NOT NULL,
    accion text NOT NULL,
    entidad text NOT NULL,
    detalle text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip text,
    id integer NOT NULL,
    cliente_id integer
);


--
-- Name: registros_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.registros_auditoria ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.registros_auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: renglones_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.renglones_dian (
    casilla text NOT NULL,
    etiqueta text NOT NULL,
    declarado double precision DEFAULT 0 NOT NULL,
    contabilidad double precision DEFAULT 0 NOT NULL,
    diferencia double precision DEFAULT 0 NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    seccion_id integer NOT NULL
);


--
-- Name: renglones_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.renglones_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.renglones_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reparto_cruce_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reparto_cruce_modulo (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    periodo text NOT NULL,
    clasificador text NOT NULL,
    cuenta_russell text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    definido_por text,
    definido_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: reparto_cruce_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reparto_cruce_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reparto_cruce_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reparto_cruce_modulo_id_seq OWNED BY public.reparto_cruce_modulo.id;


--
-- Name: reportes_ejecutivos_uso_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes_ejecutivos_uso_ia (
    id integer NOT NULL,
    huella_contexto text NOT NULL,
    modelo text NOT NULL,
    titulo text NOT NULL,
    html text NOT NULL,
    periodo_desde timestamp(3) with time zone NOT NULL,
    periodo_hasta timestamp(3) with time zone NOT NULL,
    total_acciones integer NOT NULL,
    total_usuarios integer NOT NULL,
    total_novedades integer NOT NULL,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    clave_alcance text,
    metadatos jsonb
);


--
-- Name: reportes_ejecutivos_uso_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_ejecutivos_uso_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_ejecutivos_uso_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_ejecutivos_uso_ia_id_seq OWNED BY public.reportes_ejecutivos_uso_ia.id;


--
-- Name: reportes_novedades_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes_novedades_ia (
    id integer NOT NULL,
    huella_contexto text NOT NULL,
    modelo text NOT NULL,
    titulo text NOT NULL,
    html text NOT NULL,
    total_versiones integer NOT NULL,
    total_cambios integer NOT NULL,
    cambios_incluidos integer NOT NULL,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: reportes_novedades_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_novedades_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_novedades_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_novedades_ia_id_seq OWNED BY public.reportes_novedades_ia.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    rango integer DEFAULT 0 NOT NULL,
    es_operativo boolean DEFAULT false NOT NULL,
    es_sistema boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    id integer NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roles_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_permisos (
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id integer NOT NULL,
    rol_id integer NOT NULL,
    permiso_id integer NOT NULL
);


--
-- Name: roles_permisos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles_permisos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.roles_permisos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: secciones_dian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secciones_dian (
    clave text NOT NULL,
    titulo text NOT NULL,
    lado text DEFAULT 'L'::text NOT NULL,
    nota text,
    orden integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    formulario_id integer NOT NULL
);


--
-- Name: secciones_dian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.secciones_dian ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.secciones_dian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sectores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sectores (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sectores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sectores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sectores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sectores_id_seq OWNED BY public.sectores.id;


--
-- Name: secuencia_codigo_ticket_soporte; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.secuencia_codigo_ticket_soporte
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subgrupos_conciliacion_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subgrupos_conciliacion_modulo (
    id integer NOT NULL,
    modulo_codigo text NOT NULL,
    subgrupo text NOT NULL,
    actualizado_por text,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    CONSTRAINT subgrupos_conciliacion_modulo_subgrupo_chk CHECK ((subgrupo ~ '^[0-9]{4}$'::text))
);


--
-- Name: subgrupos_conciliacion_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subgrupos_conciliacion_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subgrupos_conciliacion_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subgrupos_conciliacion_modulo_id_seq OWNED BY public.subgrupos_conciliacion_modulo.id;


--
-- Name: subgrupos_estandar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subgrupos_estandar (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    grupo text NOT NULL,
    nombre_grupo text NOT NULL,
    naturaleza text NOT NULL
);


--
-- Name: subgrupos_estandar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subgrupos_estandar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subgrupos_estandar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subgrupos_estandar_id_seq OWNED BY public.subgrupos_estandar.id;


--
-- Name: tasas_cambio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasas_cambio (
    id integer NOT NULL,
    moneda text DEFAULT 'USD'::text NOT NULL,
    valor numeric(12,4) NOT NULL,
    vigencia_desde date NOT NULL,
    vigencia_hasta date,
    fuente text DEFAULT 'superfinanciera'::text NOT NULL,
    obtenida_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tasas_cambio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasas_cambio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasas_cambio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasas_cambio_id_seq OWNED BY public.tasas_cambio.id;


--
-- Name: tickets_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets_soporte (
    id integer NOT NULL,
    codigo text NOT NULL,
    nombre_reportante text NOT NULL,
    apellido_reportante text NOT NULL,
    asunto text NOT NULL,
    descripcion text NOT NULL,
    estado text DEFAULT 'abierto'::text NOT NULL,
    solucion text,
    resuelto_por_id integer,
    resuelto_por_nombre text,
    resuelto_en timestamp(3) with time zone,
    token_acceso_hash text NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    creado_por_id integer,
    ruta_clave text,
    ruta_etiqueta text,
    menu_clave text,
    menu_etiqueta text,
    url_pagina text,
    CONSTRAINT tickets_soporte_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'en_evaluacion'::text, 'en_proceso'::text, 'resuelto'::text, 'cerrado'::text]))),
    CONSTRAINT tickets_soporte_resolucion_check CHECK (((estado = ANY (ARRAY['abierto'::text, 'en_evaluacion'::text, 'en_proceso'::text, 'cerrado'::text])) OR ((estado = 'resuelto'::text) AND (solucion IS NOT NULL) AND (resuelto_en IS NOT NULL))))
);


--
-- Name: tickets_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tickets_soporte ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.tickets_soporte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: umbrales_alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umbrales_alertas (
    id integer NOT NULL,
    clave text NOT NULL,
    valor numeric(18,2) NOT NULL,
    predeterminado numeric(18,2) NOT NULL,
    actualizado_por text,
    actualizado_en timestamp(3) with time zone NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: umbrales_alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umbrales_alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umbrales_alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umbrales_alertas_id_seq OWNED BY public.umbrales_alertas.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    correo text NOT NULL,
    contrasena text NOT NULL,
    nombre text NOT NULL,
    rol text DEFAULT 'Consulta'::text NOT NULL,
    iniciales text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    ultimo_inicio_sesion timestamp(3) with time zone,
    debe_cambiar_contrasena boolean DEFAULT false NOT NULL,
    version_sesion integer DEFAULT 0 NOT NULL,
    id integer NOT NULL,
    intentos_fallidos integer DEFAULT 0 NOT NULL,
    ultimo_intento_fallido timestamp(3) with time zone,
    bloqueado_hasta timestamp(3) with time zone,
    cedula text,
    cargo text,
    clave_foto text
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: validacion_alerta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validacion_alerta (
    id integer NOT NULL,
    balance_id integer NOT NULL,
    ancla text NOT NULL,
    tipo_alerta text NOT NULL,
    comentario_id integer NOT NULL,
    validado_por text,
    validado_por_id integer,
    validado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: validacion_alerta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.validacion_alerta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: validacion_alerta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.validacion_alerta_id_seq OWNED BY public.validacion_alerta.id;


--
-- Name: variables_entorno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variables_entorno (
    id integer NOT NULL,
    clave text NOT NULL,
    valor text,
    es_secreto boolean DEFAULT false NOT NULL,
    descripcion text,
    categoria text NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    actualizado_por text
);


--
-- Name: variables_entorno_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.variables_entorno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: variables_entorno_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.variables_entorno_id_seq OWNED BY public.variables_entorno.id;


--
-- Name: versiones_patron_archivo_modulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.versiones_patron_archivo_modulo (
    id integer NOT NULL,
    erp_id integer NOT NULL,
    modulo_codigo text NOT NULL,
    version integer NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    hoja text NOT NULL,
    fila_encabezado integer NOT NULL,
    primera_fila_datos integer NOT NULL,
    encabezado_json jsonb NOT NULL,
    especificacion_json jsonb NOT NULL,
    muestra_clave_objeto text,
    muestra_nombre_archivo text,
    muestra_tamano_bytes integer,
    muestra_sha256 text,
    cliente_origen_id integer,
    cliente_origen_nombre text,
    nota text,
    veces_usado integer DEFAULT 0 NOT NULL,
    ultimo_uso_en timestamp(3) with time zone,
    creado_por text,
    creado_por_id integer,
    aprobado_por text,
    aprobado_por_id integer,
    aprobado_en timestamp(3) with time zone,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL,
    archivo_origen_id integer,
    version_base_id integer,
    muestra_origen text,
    CONSTRAINT versiones_patron_aprobada_muestra_check CHECK (((estado <> 'aprobada'::text) OR (muestra_clave_objeto IS NOT NULL))),
    CONSTRAINT versiones_patron_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'inactiva'::text, 'validada_cliente'::text]))),
    CONSTRAINT versiones_patron_muestra_origen_check CHECK (((muestra_origen IS NULL) OR (muestra_origen = ANY (ARRAY['subida'::text, 'recorte_original'::text])))),
    CONSTRAINT versiones_patron_version_check CHECK ((version >= 1))
);


--
-- Name: versiones_patron_archivo_modulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.versiones_patron_archivo_modulo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: versiones_patron_archivo_modulo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.versiones_patron_archivo_modulo_id_seq OWNED BY public.versiones_patron_archivo_modulo.id;


--
-- Name: versiones_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.versiones_plataforma (
    id integer NOT NULL,
    numero text NOT NULL,
    titulo text NOT NULL,
    resumen text,
    estado text DEFAULT 'borrador'::text NOT NULL,
    publicado_en timestamp(3) with time zone,
    orden integer DEFAULT 0 NOT NULL,
    creado_por_id integer,
    creado_en timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp(3) with time zone NOT NULL
);


--
-- Name: versiones_plataforma_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.versiones_plataforma_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: versiones_plataforma_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.versiones_plataforma_id_seq OWNED BY public.versiones_plataforma.id;


--
-- Name: ajustes_carga_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_carga_balance ALTER COLUMN id SET DEFAULT nextval('public.ajustes_carga_balance_id_seq'::regclass);


--
-- Name: ajustes_carga_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_carga_modulo ALTER COLUMN id SET DEFAULT nextval('public.ajustes_carga_modulo_id_seq'::regclass);


--
-- Name: archivos_originales_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos_originales_modulo ALTER COLUMN id SET DEFAULT nextval('public.archivos_originales_modulo_id_seq'::regclass);


--
-- Name: asignacion_periodo_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignacion_periodo_modulo ALTER COLUMN id SET DEFAULT nextval('public.asignacion_periodo_modulo_id_seq'::regclass);


--
-- Name: balance_archivo_temporal_parte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_archivo_temporal_parte ALTER COLUMN id SET DEFAULT nextval('public.balance_archivo_temporal_parte_id_seq'::regclass);


--
-- Name: balance_cruce_aperturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_cruce_aperturas ALTER COLUMN id SET DEFAULT nextval('public.balance_cruce_aperturas_id_seq'::regclass);


--
-- Name: balance_importacion_lote id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_lote ALTER COLUMN id SET DEFAULT nextval('public.balance_importacion_lote_id_seq'::regclass);


--
-- Name: balance_importacion_staging id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_staging ALTER COLUMN id SET DEFAULT nextval('public.balance_importacion_staging_id_seq'::regclass);


--
-- Name: balance_importacion_staging_tercero id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_staging_tercero ALTER COLUMN id SET DEFAULT nextval('public.balance_importacion_staging_tercero_id_seq'::regclass);


--
-- Name: balance_lectura_diagnostico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_lectura_diagnostico ALTER COLUMN id SET DEFAULT nextval('public.balance_lectura_diagnostico_id_seq'::regclass);


--
-- Name: balance_prueba_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_prueba_detalle ALTER COLUMN id SET DEFAULT nextval('public.balance_prueba_detalle_id_seq'::regclass);


--
-- Name: balance_prueba_encabezado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_prueba_encabezado ALTER COLUMN id SET DEFAULT nextval('public.balance_prueba_encabezado_id_seq'::regclass);


--
-- Name: balance_tercero_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_tercero_detalle ALTER COLUMN id SET DEFAULT nextval('public.balance_tercero_detalle_id_seq'::regclass);


--
-- Name: balance_tercero_encabezado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_tercero_encabezado ALTER COLUMN id SET DEFAULT nextval('public.balance_tercero_encabezado_id_seq'::regclass);


--
-- Name: bitacora_cuentas_estandar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_cuentas_estandar ALTER COLUMN id SET DEFAULT nextval('public.bitacora_cuentas_estandar_id_seq'::regclass);


--
-- Name: cambios_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_version ALTER COLUMN id SET DEFAULT nextval('public.cambios_version_id_seq'::regclass);


--
-- Name: clase_agrupador_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clase_agrupador_modulo ALTER COLUMN id SET DEFAULT nextval('public.clase_agrupador_modulo_id_seq'::regclass);


--
-- Name: clasificador_no_modular_cruce id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clasificador_no_modular_cruce ALTER COLUMN id SET DEFAULT nextval('public.clasificador_no_modular_cruce_id_seq'::regclass);


--
-- Name: comentarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios ALTER COLUMN id SET DEFAULT nextval('public.comentarios_id_seq'::regclass);


--
-- Name: conciliacion_modulo_cierre id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacion_modulo_cierre ALTER COLUMN id SET DEFAULT nextval('public.conciliacion_modulo_cierre_id_seq'::regclass);


--
-- Name: conexiones_integracion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conexiones_integracion ALTER COLUMN id SET DEFAULT nextval('public.conexiones_integracion_id_seq'::regclass);


--
-- Name: consolidacion_modulo_cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consolidacion_modulo_cliente ALTER COLUMN id SET DEFAULT nextval('public.consolidacion_modulo_cliente_id_seq'::regclass);


--
-- Name: consumo_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_ia ALTER COLUMN id SET DEFAULT nextval('public.consumo_ia_id_seq'::regclass);


--
-- Name: correcciones_carga_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correcciones_carga_balance ALTER COLUMN id SET DEFAULT nextval('public.correcciones_carga_balance_id_seq'::regclass);


--
-- Name: correcciones_carga_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correcciones_carga_modulo ALTER COLUMN id SET DEFAULT nextval('public.correcciones_carga_modulo_id_seq'::regclass);


--
-- Name: cuenta_bloqueada_conciliacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_bloqueada_conciliacion ALTER COLUMN id SET DEFAULT nextval('public.cuenta_bloqueada_conciliacion_id_seq'::regclass);


--
-- Name: cuentas_conciliacion_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_conciliacion_modulo ALTER COLUMN id SET DEFAULT nextval('public.cuentas_conciliacion_modulo_id_seq'::regclass);


--
-- Name: ejecuciones_conexion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_conexion ALTER COLUMN id SET DEFAULT nextval('public.ejecuciones_conexion_id_seq'::regclass);


--
-- Name: emparejamiento_tercero_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emparejamiento_tercero_modulo ALTER COLUMN id SET DEFAULT nextval('public.emparejamiento_tercero_modulo_id_seq'::regclass);


--
-- Name: envios_reporte_ejecutivo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_reporte_ejecutivo ALTER COLUMN id SET DEFAULT nextval('public.envios_reporte_ejecutivo_id_seq'::regclass);


--
-- Name: erps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps ALTER COLUMN id SET DEFAULT nextval('public.erps_id_seq'::regclass);


--
-- Name: erps_cliente_proceso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps_cliente_proceso ALTER COLUMN id SET DEFAULT nextval('public.erps_cliente_proceso_id_seq'::regclass);


--
-- Name: eventos_ticket_soporte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_ticket_soporte ALTER COLUMN id SET DEFAULT nextval('public.eventos_ticket_soporte_id_seq'::regclass);


--
-- Name: formularios_dian_cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian_cliente ALTER COLUMN id SET DEFAULT nextval('public.formularios_dian_cliente_id_seq'::regclass);


--
-- Name: jerarquia_usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jerarquia_usuarios ALTER COLUMN id SET DEFAULT nextval('public.jerarquia_usuarios_id_seq'::regclass);


--
-- Name: marca_cruce_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marca_cruce_modulo ALTER COLUMN id SET DEFAULT nextval('public.justificacion_cruce_modulo_id_seq'::regclass);


--
-- Name: menciones_comentario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menciones_comentario ALTER COLUMN id SET DEFAULT nextval('public.menciones_comentario_id_seq'::regclass);


--
-- Name: mensajes_ticket_soporte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_ticket_soporte ALTER COLUMN id SET DEFAULT nextval('public.mensajes_ticket_soporte_id_seq'::regclass);


--
-- Name: modulo_dato_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_dato_detalle ALTER COLUMN id SET DEFAULT nextval('public.modulo_dato_detalle_id_seq'::regclass);


--
-- Name: modulo_dato_encabezado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_dato_encabezado ALTER COLUMN id SET DEFAULT nextval('public.modulo_dato_encabezado_id_seq'::regclass);


--
-- Name: modulo_importacion_lote id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_importacion_lote ALTER COLUMN id SET DEFAULT nextval('public.modulo_importacion_lote_id_seq'::regclass);


--
-- Name: modulo_importacion_staging id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_importacion_staging ALTER COLUMN id SET DEFAULT nextval('public.modulo_importacion_staging_id_seq'::regclass);


--
-- Name: pares_depreciacion_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pares_depreciacion_modulo ALTER COLUMN id SET DEFAULT nextval('public.pares_depreciacion_modulo_id_seq'::regclass);


--
-- Name: perfiles_carga_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_carga_balance ALTER COLUMN id SET DEFAULT nextval('public.perfiles_carga_balance_id_seq'::regclass);


--
-- Name: perfiles_carga_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_carga_modulo ALTER COLUMN id SET DEFAULT nextval('public.perfiles_carga_modulo_id_seq'::regclass);


--
-- Name: prevalidador_catalogos_revision id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_catalogos_revision ALTER COLUMN id SET DEFAULT nextval('public.prevalidador_catalogos_revision_id_seq'::regclass);


--
-- Name: prevalidador_cuentas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas ALTER COLUMN id SET DEFAULT nextval('public.prevalidador_cuentas_id_seq'::regclass);


--
-- Name: prevalidador_cuentas_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_balance ALTER COLUMN id SET DEFAULT nextval('public.prevalidador_cuentas_balance_id_seq'::regclass);


--
-- Name: prevalidador_cuentas_cliente_legacy id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_cliente_legacy ALTER COLUMN id SET DEFAULT nextval('public.prevalidador_cuentas_cliente_id_seq'::regclass);


--
-- Name: prevalidador_revisiones_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_revisiones_balance ALTER COLUMN id SET DEFAULT nextval('public.prevalidador_revisiones_balance_id_seq'::regclass);


--
-- Name: procesos_erp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesos_erp ALTER COLUMN id SET DEFAULT nextval('public.procesos_erp_id_seq'::regclass);


--
-- Name: prompts_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompts_ia ALTER COLUMN id SET DEFAULT nextval('public.prompts_ia_id_seq'::regclass);


--
-- Name: registros_acceso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_acceso ALTER COLUMN id SET DEFAULT nextval('public.registros_acceso_id_seq'::regclass);


--
-- Name: reparto_cruce_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reparto_cruce_modulo ALTER COLUMN id SET DEFAULT nextval('public.reparto_cruce_modulo_id_seq'::regclass);


--
-- Name: reportes_ejecutivos_uso_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_ejecutivos_uso_ia ALTER COLUMN id SET DEFAULT nextval('public.reportes_ejecutivos_uso_ia_id_seq'::regclass);


--
-- Name: reportes_novedades_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_novedades_ia ALTER COLUMN id SET DEFAULT nextval('public.reportes_novedades_ia_id_seq'::regclass);


--
-- Name: sectores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sectores ALTER COLUMN id SET DEFAULT nextval('public.sectores_id_seq'::regclass);


--
-- Name: subgrupos_conciliacion_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subgrupos_conciliacion_modulo ALTER COLUMN id SET DEFAULT nextval('public.subgrupos_conciliacion_modulo_id_seq'::regclass);


--
-- Name: subgrupos_estandar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subgrupos_estandar ALTER COLUMN id SET DEFAULT nextval('public.subgrupos_estandar_id_seq'::regclass);


--
-- Name: tasas_cambio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_cambio ALTER COLUMN id SET DEFAULT nextval('public.tasas_cambio_id_seq'::regclass);


--
-- Name: umbrales_alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umbrales_alertas ALTER COLUMN id SET DEFAULT nextval('public.umbrales_alertas_id_seq'::regclass);


--
-- Name: validacion_alerta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validacion_alerta ALTER COLUMN id SET DEFAULT nextval('public.validacion_alerta_id_seq'::regclass);


--
-- Name: variables_entorno id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variables_entorno ALTER COLUMN id SET DEFAULT nextval('public.variables_entorno_id_seq'::regclass);


--
-- Name: versiones_patron_archivo_modulo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versiones_patron_archivo_modulo ALTER COLUMN id SET DEFAULT nextval('public.versiones_patron_archivo_modulo_id_seq'::regclass);


--
-- Name: versiones_plataforma id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versiones_plataforma ALTER COLUMN id SET DEFAULT nextval('public.versiones_plataforma_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: adjuntos_marca_cruce adjuntos_marca_cruce_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos_marca_cruce
    ADD CONSTRAINT adjuntos_marca_cruce_pkey PRIMARY KEY (id);


--
-- Name: adjuntos_ticket_soporte adjuntos_ticket_soporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos_ticket_soporte
    ADD CONSTRAINT adjuntos_ticket_soporte_pkey PRIMARY KEY (id);


--
-- Name: ajustes_carga_balance ajustes_carga_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_carga_balance
    ADD CONSTRAINT ajustes_carga_balance_pkey PRIMARY KEY (id);


--
-- Name: ajustes_carga_modulo ajustes_carga_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_carga_modulo
    ADD CONSTRAINT ajustes_carga_modulo_pkey PRIMARY KEY (id);


--
-- Name: archivos_originales_modulo archivos_originales_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos_originales_modulo
    ADD CONSTRAINT archivos_originales_modulo_pkey PRIMARY KEY (id);


--
-- Name: asignacion_periodo_modulo asignacion_periodo_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignacion_periodo_modulo
    ADD CONSTRAINT asignacion_periodo_modulo_pkey PRIMARY KEY (id);


--
-- Name: asignaciones_cliente asignaciones_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_cliente
    ADD CONSTRAINT asignaciones_cliente_pkey PRIMARY KEY (id);


--
-- Name: balance_archivo_temporal_parte balance_archivo_temporal_parte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_archivo_temporal_parte
    ADD CONSTRAINT balance_archivo_temporal_parte_pkey PRIMARY KEY (id);


--
-- Name: balance_archivo_temporal balance_archivo_temporal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_archivo_temporal
    ADD CONSTRAINT balance_archivo_temporal_pkey PRIMARY KEY (lote_id);


--
-- Name: balance_cruce_aperturas balance_cruce_aperturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_cruce_aperturas
    ADD CONSTRAINT balance_cruce_aperturas_pkey PRIMARY KEY (id);


--
-- Name: balance_importacion_lote balance_importacion_lote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_lote
    ADD CONSTRAINT balance_importacion_lote_pkey PRIMARY KEY (id);


--
-- Name: balance_importacion_staging balance_importacion_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_staging
    ADD CONSTRAINT balance_importacion_staging_pkey PRIMARY KEY (id);


--
-- Name: balance_importacion_staging_tercero balance_importacion_staging_tercero_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_importacion_staging_tercero
    ADD CONSTRAINT balance_importacion_staging_tercero_pkey PRIMARY KEY (id);


--
-- Name: balance_lectura_diagnostico balance_lectura_diagnostico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_lectura_diagnostico
    ADD CONSTRAINT balance_lectura_diagnostico_pkey PRIMARY KEY (id);


--
-- Name: balance_prueba_detalle balance_prueba_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_prueba_detalle
    ADD CONSTRAINT balance_prueba_detalle_pkey PRIMARY KEY (id);


--
-- Name: balance_prueba_encabezado balance_prueba_encabezado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_prueba_encabezado
    ADD CONSTRAINT balance_prueba_encabezado_pkey PRIMARY KEY (id);


--
-- Name: balance_tercero_detalle balance_tercero_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_tercero_detalle
    ADD CONSTRAINT balance_tercero_detalle_pkey PRIMARY KEY (id);


--
-- Name: balance_tercero_encabezado balance_tercero_encabezado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_tercero_encabezado
    ADD CONSTRAINT balance_tercero_encabezado_pkey PRIMARY KEY (id);


--
-- Name: balances balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balances
    ADD CONSTRAINT balances_pkey PRIMARY KEY (id);


--
-- Name: bitacora_cuentas_estandar bitacora_cuentas_estandar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_cuentas_estandar
    ADD CONSTRAINT bitacora_cuentas_estandar_pkey PRIMARY KEY (id);


--
-- Name: cambios_version cambios_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_version
    ADD CONSTRAINT cambios_version_pkey PRIMARY KEY (id);


--
-- Name: campos_modulo campos_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_modulo
    ADD CONSTRAINT campos_modulo_pkey PRIMARY KEY (id);


--
-- Name: cartera_saldo_tercero cartera_saldo_tercero_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartera_saldo_tercero
    ADD CONSTRAINT cartera_saldo_tercero_pkey PRIMARY KEY (id);


--
-- Name: clase_agrupador_modulo clase_agrupador_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clase_agrupador_modulo
    ADD CONSTRAINT clase_agrupador_modulo_pkey PRIMARY KEY (id);


--
-- Name: clasificador_no_modular_cruce clasificador_no_modular_cruce_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clasificador_no_modular_cruce
    ADD CONSTRAINT clasificador_no_modular_cruce_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_codigo_key UNIQUE (codigo);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: comentarios_conciliacion comentarios_conciliacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_conciliacion
    ADD CONSTRAINT comentarios_conciliacion_pkey PRIMARY KEY (id);


--
-- Name: comentarios_dian comentarios_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_dian
    ADD CONSTRAINT comentarios_dian_pkey PRIMARY KEY (id);


--
-- Name: comentarios comentarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_pkey PRIMARY KEY (id);


--
-- Name: conciliacion_modulo_cierre conciliacion_modulo_cierre_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacion_modulo_cierre
    ADD CONSTRAINT conciliacion_modulo_cierre_pkey PRIMARY KEY (id);


--
-- Name: conciliaciones conciliaciones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones
    ADD CONSTRAINT conciliaciones_codigo_key UNIQUE (codigo);


--
-- Name: conciliaciones conciliaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones
    ADD CONSTRAINT conciliaciones_pkey PRIMARY KEY (id);


--
-- Name: conexiones_integracion conexiones_integracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conexiones_integracion
    ADD CONSTRAINT conexiones_integracion_pkey PRIMARY KEY (id);


--
-- Name: consolidacion_modulo_cliente consolidacion_modulo_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consolidacion_modulo_cliente
    ADD CONSTRAINT consolidacion_modulo_cliente_pkey PRIMARY KEY (id);


--
-- Name: consumo_ia consumo_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_ia
    ADD CONSTRAINT consumo_ia_pkey PRIMARY KEY (id);


--
-- Name: correcciones_carga_balance correcciones_carga_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correcciones_carga_balance
    ADD CONSTRAINT correcciones_carga_balance_pkey PRIMARY KEY (id);


--
-- Name: correcciones_carga_modulo correcciones_carga_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correcciones_carga_modulo
    ADD CONSTRAINT correcciones_carga_modulo_pkey PRIMARY KEY (id);


--
-- Name: cuenta_bloqueada_conciliacion cuenta_bloqueada_conciliacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_bloqueada_conciliacion
    ADD CONSTRAINT cuenta_bloqueada_conciliacion_pkey PRIMARY KEY (id);


--
-- Name: cuenta_no_modular_cruce cuenta_no_modular_cruce_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_no_modular_cruce
    ADD CONSTRAINT cuenta_no_modular_cruce_pkey PRIMARY KEY (id);


--
-- Name: cuentas_cliente cuentas_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cliente
    ADD CONSTRAINT cuentas_cliente_pkey PRIMARY KEY (id);


--
-- Name: cuentas_conciliacion_modulo cuentas_conciliacion_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_conciliacion_modulo
    ADD CONSTRAINT cuentas_conciliacion_modulo_pkey PRIMARY KEY (id);


--
-- Name: cuentas_estandar cuentas_estandar_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_estandar
    ADD CONSTRAINT cuentas_estandar_codigo_key UNIQUE (codigo);


--
-- Name: cuentas_estandar cuentas_estandar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_estandar
    ADD CONSTRAINT cuentas_estandar_pkey PRIMARY KEY (id);


--
-- Name: ejecuciones_conexion ejecuciones_conexion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_conexion
    ADD CONSTRAINT ejecuciones_conexion_pkey PRIMARY KEY (id);


--
-- Name: emparejamiento_tercero_modulo emparejamiento_tercero_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emparejamiento_tercero_modulo
    ADD CONSTRAINT emparejamiento_tercero_modulo_pkey PRIMARY KEY (id);


--
-- Name: envios_reporte_ejecutivo envios_reporte_ejecutivo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios_reporte_ejecutivo
    ADD CONSTRAINT envios_reporte_ejecutivo_pkey PRIMARY KEY (id);


--
-- Name: erps_cliente_proceso erps_cliente_proceso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps_cliente_proceso
    ADD CONSTRAINT erps_cliente_proceso_pkey PRIMARY KEY (id);


--
-- Name: erps erps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps
    ADD CONSTRAINT erps_pkey PRIMARY KEY (id);


--
-- Name: eventos_ticket_soporte eventos_ticket_soporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_ticket_soporte
    ADD CONSTRAINT eventos_ticket_soporte_pkey PRIMARY KEY (id);


--
-- Name: filas_conciliacion filas_conciliacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filas_conciliacion
    ADD CONSTRAINT filas_conciliacion_pkey PRIMARY KEY (id);


--
-- Name: formularios_dian formularios_dian_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian
    ADD CONSTRAINT formularios_dian_clave_key UNIQUE (clave);


--
-- Name: formularios_dian_cliente formularios_dian_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian_cliente
    ADD CONSTRAINT formularios_dian_cliente_pkey PRIMARY KEY (id);


--
-- Name: formularios_dian formularios_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian
    ADD CONSTRAINT formularios_dian_pkey PRIMARY KEY (id);


--
-- Name: intentos_inicio_sesion intentos_inicio_sesion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos_inicio_sesion
    ADD CONSTRAINT intentos_inicio_sesion_pkey PRIMARY KEY (id);


--
-- Name: jerarquia_usuarios jerarquia_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jerarquia_usuarios
    ADD CONSTRAINT jerarquia_usuarios_pkey PRIMARY KEY (id);


--
-- Name: mapeos_dian mapeos_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapeos_dian
    ADD CONSTRAINT mapeos_dian_pkey PRIMARY KEY (id);


--
-- Name: marca_cruce_modulo marca_cruce_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marca_cruce_modulo
    ADD CONSTRAINT marca_cruce_modulo_pkey PRIMARY KEY (id);


--
-- Name: menciones_comentario menciones_comentario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menciones_comentario
    ADD CONSTRAINT menciones_comentario_pkey PRIMARY KEY (id);


--
-- Name: mensajes_ticket_soporte mensajes_ticket_soporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_ticket_soporte
    ADD CONSTRAINT mensajes_ticket_soporte_pkey PRIMARY KEY (id);


--
-- Name: modulo_dato_detalle modulo_dato_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_dato_detalle
    ADD CONSTRAINT modulo_dato_detalle_pkey PRIMARY KEY (id);


--
-- Name: modulo_dato_encabezado modulo_dato_encabezado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_dato_encabezado
    ADD CONSTRAINT modulo_dato_encabezado_pkey PRIMARY KEY (id);


--
-- Name: modulo_importacion_lote modulo_importacion_lote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_importacion_lote
    ADD CONSTRAINT modulo_importacion_lote_pkey PRIMARY KEY (id);


--
-- Name: modulo_importacion_staging modulo_importacion_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_importacion_staging
    ADD CONSTRAINT modulo_importacion_staging_pkey PRIMARY KEY (id);


--
-- Name: modulos_cliente modulos_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_cliente
    ADD CONSTRAINT modulos_cliente_pkey PRIMARY KEY (id);


--
-- Name: modulos modulos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_codigo_key UNIQUE (codigo);


--
-- Name: modulos modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_pkey PRIMARY KEY (id);


--
-- Name: modulos_plataforma modulos_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_plataforma
    ADD CONSTRAINT modulos_plataforma_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: opciones_russell opciones_russell_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opciones_russell
    ADD CONSTRAINT opciones_russell_codigo_key UNIQUE (codigo);


--
-- Name: opciones_russell opciones_russell_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opciones_russell
    ADD CONSTRAINT opciones_russell_pkey PRIMARY KEY (id);


--
-- Name: pares_depreciacion_modulo pares_depreciacion_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pares_depreciacion_modulo
    ADD CONSTRAINT pares_depreciacion_modulo_pkey PRIMARY KEY (id);


--
-- Name: perfiles_carga_balance perfiles_carga_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_carga_balance
    ADD CONSTRAINT perfiles_carga_balance_pkey PRIMARY KEY (id);


--
-- Name: perfiles_carga_modulo perfiles_carga_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_carga_modulo
    ADD CONSTRAINT perfiles_carga_modulo_pkey PRIMARY KEY (id);


--
-- Name: periodos_dian periodos_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_dian
    ADD CONSTRAINT periodos_dian_pkey PRIMARY KEY (id);


--
-- Name: permisos permisos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_codigo_key UNIQUE (codigo);


--
-- Name: permisos permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_pkey PRIMARY KEY (id);


--
-- Name: preferencias_soporte_usuario preferencias_soporte_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_soporte_usuario
    ADD CONSTRAINT preferencias_soporte_usuario_pkey PRIMARY KEY (usuario_id);


--
-- Name: prevalidador_catalogos_revision prevalidador_catalogos_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_catalogos_revision
    ADD CONSTRAINT prevalidador_catalogos_revision_pkey PRIMARY KEY (id);


--
-- Name: prevalidador_cuentas_balance prevalidador_cuentas_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_balance
    ADD CONSTRAINT prevalidador_cuentas_balance_pkey PRIMARY KEY (id);


--
-- Name: prevalidador_cuentas_cliente_legacy prevalidador_cuentas_cliente_legacy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_cliente_legacy
    ADD CONSTRAINT prevalidador_cuentas_cliente_legacy_pkey PRIMARY KEY (id);


--
-- Name: prevalidador_cuentas prevalidador_cuentas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas
    ADD CONSTRAINT prevalidador_cuentas_pkey PRIMARY KEY (id);


--
-- Name: prevalidador_revisiones_balance prevalidador_revisiones_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_revisiones_balance
    ADD CONSTRAINT prevalidador_revisiones_balance_pkey PRIMARY KEY (id);


--
-- Name: procesos_erp procesos_erp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesos_erp
    ADD CONSTRAINT procesos_erp_pkey PRIMARY KEY (id);


--
-- Name: prompts_ia prompts_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompts_ia
    ADD CONSTRAINT prompts_ia_pkey PRIMARY KEY (id);


--
-- Name: registros_acceso registros_acceso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_acceso
    ADD CONSTRAINT registros_acceso_pkey PRIMARY KEY (id);


--
-- Name: registros_auditoria registros_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_auditoria
    ADD CONSTRAINT registros_auditoria_pkey PRIMARY KEY (id);


--
-- Name: renglones_dian renglones_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renglones_dian
    ADD CONSTRAINT renglones_dian_pkey PRIMARY KEY (id);


--
-- Name: reparto_cruce_modulo reparto_cruce_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reparto_cruce_modulo
    ADD CONSTRAINT reparto_cruce_modulo_pkey PRIMARY KEY (id);


--
-- Name: reportes_ejecutivos_uso_ia reportes_ejecutivos_uso_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_ejecutivos_uso_ia
    ADD CONSTRAINT reportes_ejecutivos_uso_ia_pkey PRIMARY KEY (id);


--
-- Name: reportes_novedades_ia reportes_novedades_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_novedades_ia
    ADD CONSTRAINT reportes_novedades_ia_pkey PRIMARY KEY (id);


--
-- Name: roles roles_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_codigo_key UNIQUE (codigo);


--
-- Name: roles_permisos roles_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: secciones_dian secciones_dian_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones_dian
    ADD CONSTRAINT secciones_dian_clave_key UNIQUE (clave);


--
-- Name: secciones_dian secciones_dian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones_dian
    ADD CONSTRAINT secciones_dian_pkey PRIMARY KEY (id);


--
-- Name: sectores sectores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sectores
    ADD CONSTRAINT sectores_pkey PRIMARY KEY (id);


--
-- Name: subgrupos_conciliacion_modulo subgrupos_conciliacion_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subgrupos_conciliacion_modulo
    ADD CONSTRAINT subgrupos_conciliacion_modulo_pkey PRIMARY KEY (id);


--
-- Name: subgrupos_estandar subgrupos_estandar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subgrupos_estandar
    ADD CONSTRAINT subgrupos_estandar_pkey PRIMARY KEY (id);


--
-- Name: tasas_cambio tasas_cambio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_cambio
    ADD CONSTRAINT tasas_cambio_pkey PRIMARY KEY (id);


--
-- Name: tickets_soporte tickets_soporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_soporte
    ADD CONSTRAINT tickets_soporte_pkey PRIMARY KEY (id);


--
-- Name: umbrales_alertas umbrales_alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umbrales_alertas
    ADD CONSTRAINT umbrales_alertas_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: validacion_alerta validacion_alerta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validacion_alerta
    ADD CONSTRAINT validacion_alerta_pkey PRIMARY KEY (id);


--
-- Name: variables_entorno variables_entorno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variables_entorno
    ADD CONSTRAINT variables_entorno_pkey PRIMARY KEY (id);


--
-- Name: versiones_patron_archivo_modulo versiones_patron_archivo_modulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versiones_patron_archivo_modulo
    ADD CONSTRAINT versiones_patron_archivo_modulo_pkey PRIMARY KEY (id);


--
-- Name: versiones_plataforma versiones_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versiones_plataforma
    ADD CONSTRAINT versiones_plataforma_pkey PRIMARY KEY (id);


--
-- Name: adjuntos_marca_cruce_clave_objeto_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adjuntos_marca_cruce_clave_objeto_key ON public.adjuntos_marca_cruce USING btree (clave_objeto);


--
-- Name: adjuntos_marca_cruce_marca_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjuntos_marca_cruce_marca_id_idx ON public.adjuntos_marca_cruce USING btree (marca_id);


--
-- Name: adjuntos_ticket_soporte_clave_objeto_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adjuntos_ticket_soporte_clave_objeto_key ON public.adjuntos_ticket_soporte USING btree (clave_objeto);


--
-- Name: adjuntos_ticket_soporte_ticket_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjuntos_ticket_soporte_ticket_id_idx ON public.adjuntos_ticket_soporte USING btree (ticket_id);


--
-- Name: ajustes_carga_balance_cliente_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ajustes_carga_balance_cliente_id_key ON public.ajustes_carga_balance USING btree (cliente_id);


--
-- Name: ajustes_carga_modulo_cliente_id_modulo_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ajustes_carga_modulo_cliente_id_modulo_codigo_key ON public.ajustes_carga_modulo USING btree (cliente_id, modulo_codigo);


--
-- Name: archivos_originales_modulo_clave_objeto_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX archivos_originales_modulo_clave_objeto_key ON public.archivos_originales_modulo USING btree (clave_objeto);


--
-- Name: archivos_originales_modulo_encabezado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archivos_originales_modulo_encabezado_idx ON public.archivos_originales_modulo USING btree (encabezado_id);


--
-- Name: archivos_originales_modulo_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archivos_originales_modulo_estado_idx ON public.archivos_originales_modulo USING btree (modulo_codigo, estado, disponible);


--
-- Name: archivos_originales_modulo_huella_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archivos_originales_modulo_huella_idx ON public.archivos_originales_modulo USING btree (huella_sha256);


--
-- Name: archivos_originales_modulo_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX archivos_originales_modulo_lote_id_key ON public.archivos_originales_modulo USING btree (lote_id);


--
-- Name: archivos_originales_modulo_modulo_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archivos_originales_modulo_modulo_cliente_idx ON public.archivos_originales_modulo USING btree (modulo_codigo, cliente_id);


--
-- Name: archivos_originales_modulo_modulo_fecha_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archivos_originales_modulo_modulo_fecha_id_idx ON public.archivos_originales_modulo USING btree (modulo_codigo, creado_en, id);


--
-- Name: asignacion_periodo_modulo_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignacion_periodo_modulo_periodo_idx ON public.asignacion_periodo_modulo USING btree (cliente_id, modulo_codigo, periodo);


--
-- Name: asignacion_periodo_modulo_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX asignacion_periodo_modulo_unica ON public.asignacion_periodo_modulo USING btree (cliente_id, modulo_codigo, periodo, clasificador, agrupador, cuenta_4, cuenta_6);


--
-- Name: asignaciones_cliente_cliente_id_funcion_usuario_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX asignaciones_cliente_cliente_id_funcion_usuario_id_key ON public.asignaciones_cliente USING btree (cliente_id, funcion, usuario_id);


--
-- Name: asignaciones_cliente_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_cliente_cliente_id_idx ON public.asignaciones_cliente USING btree (cliente_id);


--
-- Name: asignaciones_cliente_usuario_id_activo_vigente_hasta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_cliente_usuario_id_activo_vigente_hasta_idx ON public.asignaciones_cliente USING btree (usuario_id, activo, vigente_hasta);


--
-- Name: balance_archivo_temporal_expira_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_archivo_temporal_expira_en_idx ON public.balance_archivo_temporal USING btree (expira_en);


--
-- Name: balance_archivo_temporal_parte_lote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_archivo_temporal_parte_lote_id_idx ON public.balance_archivo_temporal_parte USING btree (lote_id);


--
-- Name: balance_archivo_temporal_parte_lote_id_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_archivo_temporal_parte_lote_id_numero_key ON public.balance_archivo_temporal_parte USING btree (lote_id, numero);


--
-- Name: balance_archivo_temporal_usuario_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_archivo_temporal_usuario_id_idx ON public.balance_archivo_temporal USING btree (usuario_id);


--
-- Name: balance_cruce_aperturas_balance_cuenta_id_balance_tercero_id_ke; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_cruce_aperturas_balance_cuenta_id_balance_tercero_id_ke ON public.balance_cruce_aperturas USING btree (balance_cuenta_id, balance_tercero_id);


--
-- Name: balance_cruce_aperturas_balance_tercero_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_cruce_aperturas_balance_tercero_id_idx ON public.balance_cruce_aperturas USING btree (balance_tercero_id);


--
-- Name: balance_importacion_lote_cargado_por_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_importacion_lote_cargado_por_id_idx ON public.balance_importacion_lote USING btree (cargado_por_id);


--
-- Name: balance_importacion_lote_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_importacion_lote_lote_id_key ON public.balance_importacion_lote USING btree (lote_id);


--
-- Name: balance_importacion_staging_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_importacion_staging_cliente_id_idx ON public.balance_importacion_staging USING btree (cliente_id);


--
-- Name: balance_importacion_staging_lote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_importacion_staging_lote_id_idx ON public.balance_importacion_staging USING btree (lote_id);


--
-- Name: balance_importacion_staging_tercero_lote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_importacion_staging_tercero_lote_id_idx ON public.balance_importacion_staging_tercero USING btree (lote_id);


--
-- Name: balance_lectura_diagnostico_lote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_lectura_diagnostico_lote_id_idx ON public.balance_lectura_diagnostico USING btree (lote_id);


--
-- Name: balance_prueba_detalle_cuenta_6_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_prueba_detalle_cuenta_6_idx ON public.balance_prueba_detalle USING btree (cuenta_6);


--
-- Name: balance_prueba_detalle_cuenta_6_russell_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_prueba_detalle_cuenta_6_russell_idx ON public.balance_prueba_detalle USING btree (cuenta_6_russell);


--
-- Name: balance_prueba_detalle_encabezado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_prueba_detalle_encabezado_id_idx ON public.balance_prueba_detalle USING btree (encabezado_id);


--
-- Name: balance_prueba_encabezado_cliente_id_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_prueba_encabezado_cliente_id_periodo_idx ON public.balance_prueba_encabezado USING btree (cliente_id, periodo);


--
-- Name: balance_prueba_encabezado_cliente_id_periodo_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_prueba_encabezado_cliente_id_periodo_version_key ON public.balance_prueba_encabezado USING btree (cliente_id, periodo, version);


--
-- Name: balance_prueba_encabezado_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_prueba_encabezado_lote_id_key ON public.balance_prueba_encabezado USING btree (lote_id);


--
-- Name: balance_prueba_encabezado_nombre_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_prueba_encabezado_nombre_cliente_idx ON public.balance_prueba_encabezado USING btree (nombre_cliente);


--
-- Name: balance_prueba_oficial_unico_cliente_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_prueba_oficial_unico_cliente_periodo_idx ON public.balance_prueba_encabezado USING btree (cliente_id, periodo) WHERE (es_oficial = true);


--
-- Name: balance_tercero_detalle_cuenta_4_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_tercero_detalle_cuenta_4_idx ON public.balance_tercero_detalle USING btree (cuenta_4);


--
-- Name: balance_tercero_detalle_encabezado_clave_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_tercero_detalle_encabezado_clave_idx ON public.balance_tercero_detalle USING btree (encabezado_id, clave_tercero);


--
-- Name: balance_tercero_detalle_encabezado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_tercero_detalle_encabezado_id_idx ON public.balance_tercero_detalle USING btree (encabezado_id);


--
-- Name: balance_tercero_detalle_nit_tercero_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_tercero_detalle_nit_tercero_idx ON public.balance_tercero_detalle USING btree (nit_tercero);


--
-- Name: balance_tercero_encabezado_cliente_id_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_tercero_encabezado_cliente_id_periodo_idx ON public.balance_tercero_encabezado USING btree (cliente_id, periodo);


--
-- Name: balance_tercero_encabezado_cliente_id_periodo_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_tercero_encabezado_cliente_id_periodo_version_key ON public.balance_tercero_encabezado USING btree (cliente_id, periodo, version);


--
-- Name: balance_tercero_encabezado_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balance_tercero_encabezado_lote_id_key ON public.balance_tercero_encabezado USING btree (lote_id);


--
-- Name: balances_nombre_cliente_periodo_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX balances_nombre_cliente_periodo_version_key ON public.balances USING btree (nombre_cliente, periodo, version);


--
-- Name: bitacora_cuentas_estandar_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bitacora_cuentas_estandar_creado_en_idx ON public.bitacora_cuentas_estandar USING btree (creado_en);


--
-- Name: bitacora_cuentas_estandar_cuenta_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bitacora_cuentas_estandar_cuenta_id_idx ON public.bitacora_cuentas_estandar USING btree (cuenta_id);


--
-- Name: cambios_version_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cambios_version_version_id_idx ON public.cambios_version USING btree (version_id);


--
-- Name: campos_modulo_modulo_id_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campos_modulo_modulo_id_clave_key ON public.campos_modulo USING btree (modulo_id, clave);


--
-- Name: cartera_saldo_tercero_clave_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cartera_saldo_tercero_clave_idx ON public.cartera_saldo_tercero USING btree (encabezado_id, clave_tercero);


--
-- Name: cartera_saldo_tercero_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cartera_saldo_tercero_unico ON public.cartera_saldo_tercero USING btree (encabezado_id, lote_id, nivel, origen, cuenta_cliente, origen_cartera, clave_tercero);


--
-- Name: clase_agrupador_modulo_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clase_agrupador_modulo_unico ON public.clase_agrupador_modulo USING btree (cliente_id, modulo_codigo, agrupador);


--
-- Name: clasificador_no_modular_cruce_marca_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clasificador_no_modular_cruce_marca_id_idx ON public.clasificador_no_modular_cruce USING btree (marca_id);


--
-- Name: clasificador_no_modular_cruce_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clasificador_no_modular_cruce_unica ON public.clasificador_no_modular_cruce USING btree (marca_id, clasificador);


--
-- Name: clientes_erp_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_erp_id_idx ON public.clientes USING btree (erp_id);


--
-- Name: clientes_nit_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_nit_key ON public.clientes USING btree (nit);


--
-- Name: clientes_nit_normalizado_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_nit_normalizado_key ON public.clientes USING btree (regexp_replace(nit, '[^0-9]'::text, ''::text, 'g'::text));


--
-- Name: clientes_sector_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_sector_id_idx ON public.clientes USING btree (sector_id);


--
-- Name: clientes_socio_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_socio_id_idx ON public.clientes USING btree (socio_id);


--
-- Name: comentarios_autor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comentarios_autor_id_idx ON public.comentarios USING btree (autor_id);


--
-- Name: comentarios_entidad_tipo_entidad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comentarios_entidad_tipo_entidad_id_idx ON public.comentarios USING btree (entidad_tipo, entidad_id);


--
-- Name: conciliacion_modulo_cierre_balance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliacion_modulo_cierre_balance_id_idx ON public.conciliacion_modulo_cierre USING btree (balance_encabezado_id);


--
-- Name: conciliacion_modulo_cierre_balance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliacion_modulo_cierre_balance_idx ON public.conciliacion_modulo_cierre USING btree (cliente_id, balance_periodo, estado);


--
-- Name: conciliacion_modulo_cierre_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conciliacion_modulo_cierre_unico ON public.conciliacion_modulo_cierre USING btree (cliente_id, modulo_codigo, periodo);


--
-- Name: conciliaciones_balance_prevalidado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliaciones_balance_prevalidado_id_idx ON public.conciliaciones USING btree (balance_prevalidado_id);


--
-- Name: conciliaciones_cliente_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliaciones_cliente_creado_en_idx ON public.conciliaciones USING btree (cliente_id, creado_en);


--
-- Name: conciliaciones_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conciliaciones_creado_en_idx ON public.conciliaciones USING btree (creado_en);


--
-- Name: conexiones_integracion_categoria_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conexiones_integracion_categoria_idx ON public.conexiones_integracion USING btree (categoria, activa);


--
-- Name: conexiones_integracion_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conexiones_integracion_codigo_key ON public.conexiones_integracion USING btree (codigo);


--
-- Name: consolidacion_modulo_cliente_clasif_agrupador_cuenta_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consolidacion_modulo_cliente_clasif_agrupador_cuenta_key ON public.consolidacion_modulo_cliente USING btree (cliente_id, modulo_codigo, clasificador, agrupador, cuenta_4, cuenta_6, cuenta_cliente);


--
-- Name: consolidacion_modulo_cliente_cliente_id_modulo_codigo_clasi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consolidacion_modulo_cliente_cliente_id_modulo_codigo_clasi_idx ON public.consolidacion_modulo_cliente USING btree (cliente_id, modulo_codigo, clasificador);


--
-- Name: consolidacion_modulo_cliente_modulo_codigo_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consolidacion_modulo_cliente_modulo_codigo_cliente_id_idx ON public.consolidacion_modulo_cliente USING btree (modulo_codigo, cliente_id);


--
-- Name: consumo_ia_cliente_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consumo_ia_cliente_id_creado_en_idx ON public.consumo_ia USING btree (cliente_id, creado_en);


--
-- Name: consumo_ia_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consumo_ia_creado_en_idx ON public.consumo_ia USING btree (creado_en);


--
-- Name: consumo_ia_tipo_operacion_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consumo_ia_tipo_operacion_creado_en_idx ON public.consumo_ia USING btree (tipo_operacion, creado_en);


--
-- Name: correcciones_carga_balance_cliente_id_cuenta_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX correcciones_carga_balance_cliente_id_cuenta_key ON public.correcciones_carga_balance USING btree (cliente_id, cuenta);


--
-- Name: correcciones_carga_modulo_cliente_id_modulo_codigo_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX correcciones_carga_modulo_cliente_id_modulo_codigo_clave_key ON public.correcciones_carga_modulo USING btree (cliente_id, modulo_codigo, clave);


--
-- Name: cuenta_bloqueada_conciliacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cuenta_bloqueada_conciliacion_idx ON public.cuenta_bloqueada_conciliacion USING btree (cliente_id, periodo, cuenta);


--
-- Name: cuenta_bloqueada_conciliacion_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuenta_bloqueada_conciliacion_unica ON public.cuenta_bloqueada_conciliacion USING btree (cierre_id, cuenta);


--
-- Name: cuenta_no_modular_cruce_marca_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cuenta_no_modular_cruce_marca_id_idx ON public.cuenta_no_modular_cruce USING btree (marca_id);


--
-- Name: cuenta_no_modular_cruce_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuenta_no_modular_cruce_unica ON public.cuenta_no_modular_cruce USING btree (marca_id, cuenta_8);


--
-- Name: cuentas_cliente_cliente_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuentas_cliente_cliente_id_codigo_key ON public.cuentas_cliente USING btree (cliente_id, codigo);


--
-- Name: cuentas_cliente_nombre_cliente_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuentas_cliente_nombre_cliente_codigo_key ON public.cuentas_cliente USING btree (nombre_cliente, codigo);


--
-- Name: cuentas_conciliacion_modulo_modulo_codigo_cuenta_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuentas_conciliacion_modulo_modulo_codigo_cuenta_key ON public.cuentas_conciliacion_modulo USING btree (modulo_codigo, cuenta);


--
-- Name: ejecuciones_conexion_conexion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ejecuciones_conexion_conexion_idx ON public.ejecuciones_conexion USING btree (conexion_id, creado_en);


--
-- Name: emparejamiento_tercero_modulo_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX emparejamiento_tercero_modulo_cliente_idx ON public.emparejamiento_tercero_modulo USING btree (cliente_id, modulo_codigo);


--
-- Name: emparejamiento_tercero_modulo_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX emparejamiento_tercero_modulo_unico ON public.emparejamiento_tercero_modulo USING btree (cliente_id, modulo_codigo, periodo, clave_modulo);


--
-- Name: envios_reporte_ejecutivo_enviado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX envios_reporte_ejecutivo_enviado_en_idx ON public.envios_reporte_ejecutivo USING btree (enviado_en);


--
-- Name: erps_cliente_proceso_cliente_proceso_erp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX erps_cliente_proceso_cliente_proceso_erp_key ON public.erps_cliente_proceso USING btree (cliente_id, proceso_id, erp_id);


--
-- Name: erps_cliente_proceso_cliente_proceso_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erps_cliente_proceso_cliente_proceso_idx ON public.erps_cliente_proceso USING btree (cliente_id, proceso_id);


--
-- Name: erps_cliente_proceso_erp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erps_cliente_proceso_erp_idx ON public.erps_cliente_proceso USING btree (erp_id);


--
-- Name: erps_cliente_proceso_proceso_erp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erps_cliente_proceso_proceso_erp_idx ON public.erps_cliente_proceso USING btree (proceso_id, erp_id);


--
-- Name: erps_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX erps_codigo_key ON public.erps USING btree (codigo);


--
-- Name: eventos_ticket_soporte_ticket_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_ticket_soporte_ticket_id_creado_en_idx ON public.eventos_ticket_soporte USING btree (ticket_id, creado_en);


--
-- Name: filas_conciliacion_conciliacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX filas_conciliacion_conciliacion_id_idx ON public.filas_conciliacion USING btree (conciliacion_id);


--
-- Name: formularios_dian_cliente_cliente_id_formulario_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX formularios_dian_cliente_cliente_id_formulario_id_key ON public.formularios_dian_cliente USING btree (cliente_id, formulario_id);


--
-- Name: intentos_inicio_sesion_correo_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intentos_inicio_sesion_correo_creado_en_idx ON public.intentos_inicio_sesion USING btree (correo, creado_en);


--
-- Name: intentos_inicio_sesion_ip_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intentos_inicio_sesion_ip_creado_en_idx ON public.intentos_inicio_sesion USING btree (ip, creado_en);


--
-- Name: jerarquia_usuarios_subordinado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jerarquia_usuarios_subordinado_id_idx ON public.jerarquia_usuarios USING btree (subordinado_id);


--
-- Name: jerarquia_usuarios_superior_id_subordinado_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jerarquia_usuarios_superior_id_subordinado_id_key ON public.jerarquia_usuarios USING btree (superior_id, subordinado_id);


--
-- Name: marca_cruce_modulo_numero_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marca_cruce_modulo_numero_unico ON public.marca_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo, numero);


--
-- Name: marca_cruce_modulo_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marca_cruce_modulo_periodo_idx ON public.marca_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo);


--
-- Name: marca_cruce_modulo_tercero_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marca_cruce_modulo_tercero_unica ON public.marca_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo, clave);


--
-- Name: marca_cruce_modulo_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marca_cruce_modulo_unica ON public.marca_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo, cuenta_4);


--
-- Name: menciones_comentario_comentario_id_usuario_mencionado_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menciones_comentario_comentario_id_usuario_mencionado_id_key ON public.menciones_comentario USING btree (comentario_id, usuario_mencionado_id);


--
-- Name: menciones_comentario_usuario_mencionado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menciones_comentario_usuario_mencionado_id_idx ON public.menciones_comentario USING btree (usuario_mencionado_id);


--
-- Name: mensajes_ticket_soporte_ticket_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensajes_ticket_soporte_ticket_id_creado_en_idx ON public.mensajes_ticket_soporte USING btree (ticket_id, creado_en);


--
-- Name: modulo_dato_detalle_clasificador_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_dato_detalle_clasificador_idx ON public.modulo_dato_detalle USING btree (clasificador);


--
-- Name: modulo_dato_detalle_encabezado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_dato_detalle_encabezado_id_idx ON public.modulo_dato_detalle USING btree (encabezado_id);


--
-- Name: modulo_dato_detalle_encabezado_nit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_dato_detalle_encabezado_nit_idx ON public.modulo_dato_detalle USING btree (encabezado_id, nit_canonico);


--
-- Name: modulo_dato_encabezado_cliente_id_modulo_codigo_periodo_ver_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulo_dato_encabezado_cliente_id_modulo_codigo_periodo_ver_key ON public.modulo_dato_encabezado USING btree (cliente_id, modulo_codigo, periodo, version);


--
-- Name: modulo_dato_encabezado_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulo_dato_encabezado_lote_id_key ON public.modulo_dato_encabezado USING btree (lote_id);


--
-- Name: modulo_dato_encabezado_modulo_codigo_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_dato_encabezado_modulo_codigo_cliente_id_idx ON public.modulo_dato_encabezado USING btree (modulo_codigo, cliente_id);


--
-- Name: modulo_dato_oficial_unico_cliente_modulo_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulo_dato_oficial_unico_cliente_modulo_periodo_idx ON public.modulo_dato_encabezado USING btree (cliente_id, modulo_codigo, periodo) WHERE (es_oficial = true);


--
-- Name: modulo_importacion_lote_lote_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulo_importacion_lote_lote_id_key ON public.modulo_importacion_lote USING btree (lote_id);


--
-- Name: modulo_importacion_lote_modulo_codigo_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_importacion_lote_modulo_codigo_cliente_id_idx ON public.modulo_importacion_lote USING btree (modulo_codigo, cliente_id);


--
-- Name: modulo_importacion_staging_lote_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_importacion_staging_lote_id_idx ON public.modulo_importacion_staging USING btree (lote_id);


--
-- Name: modulo_importacion_staging_modulo_codigo_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulo_importacion_staging_modulo_codigo_cliente_id_idx ON public.modulo_importacion_staging USING btree (modulo_codigo, cliente_id);


--
-- Name: modulos_cliente_cliente_id_modulo_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulos_cliente_cliente_id_modulo_id_key ON public.modulos_cliente USING btree (cliente_id, modulo_id);


--
-- Name: modulos_plataforma_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modulos_plataforma_clave_key ON public.modulos_plataforma USING btree (clave);


--
-- Name: modulos_plataforma_grupo_orden_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modulos_plataforma_grupo_orden_idx ON public.modulos_plataforma USING btree (grupo, orden);


--
-- Name: pares_depreciacion_modulo_modulo_codigo_subgrupo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pares_depreciacion_modulo_modulo_codigo_subgrupo_key ON public.pares_depreciacion_modulo USING btree (modulo_codigo, subgrupo);


--
-- Name: perfiles_carga_balance_cliente_id_huella_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perfiles_carga_balance_cliente_id_huella_key ON public.perfiles_carga_balance USING btree (cliente_id, huella);


--
-- Name: perfiles_carga_balance_huella_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_carga_balance_huella_idx ON public.perfiles_carga_balance USING btree (huella);


--
-- Name: perfiles_carga_modulo_cliente_id_modulo_codigo_huella_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perfiles_carga_modulo_cliente_id_modulo_codigo_huella_key ON public.perfiles_carga_modulo USING btree (cliente_id, modulo_codigo, huella);


--
-- Name: perfiles_carga_modulo_huella_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_carga_modulo_huella_idx ON public.perfiles_carga_modulo USING btree (huella);


--
-- Name: periodos_dian_formulario_id_clave_periodo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX periodos_dian_formulario_id_clave_periodo_key ON public.periodos_dian USING btree (formulario_id, clave_periodo);


--
-- Name: permisos_modulo_accion_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permisos_modulo_accion_key ON public.permisos USING btree (modulo, accion);


--
-- Name: permisos_modulo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permisos_modulo_idx ON public.permisos USING btree (modulo);


--
-- Name: prevalidador_catalogos_revision_revision_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prevalidador_catalogos_revision_revision_id_key ON public.prevalidador_catalogos_revision USING btree (revision_id);


--
-- Name: prevalidador_cuentas_activa_orden_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prevalidador_cuentas_activa_orden_idx ON public.prevalidador_cuentas USING btree (activa, orden);


--
-- Name: prevalidador_cuentas_balance_balance_id_catalogo_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prevalidador_cuentas_balance_balance_id_catalogo_id_key ON public.prevalidador_cuentas_balance USING btree (balance_id, catalogo_id);


--
-- Name: prevalidador_cuentas_balance_balance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prevalidador_cuentas_balance_balance_id_idx ON public.prevalidador_cuentas_balance USING btree (balance_id);


--
-- Name: prevalidador_cuentas_cliente_legacy_cliente_id_catalogo_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prevalidador_cuentas_cliente_legacy_cliente_id_catalogo_id_key ON public.prevalidador_cuentas_cliente_legacy USING btree (cliente_id, catalogo_id);


--
-- Name: prevalidador_cuentas_cliente_legacy_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prevalidador_cuentas_cliente_legacy_cliente_id_idx ON public.prevalidador_cuentas_cliente_legacy USING btree (cliente_id);


--
-- Name: prevalidador_cuentas_modulo_id_cuenta_russell_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prevalidador_cuentas_modulo_id_cuenta_russell_key ON public.prevalidador_cuentas USING btree (modulo_id, cuenta_russell);


--
-- Name: prevalidador_revisiones_balance_balance_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prevalidador_revisiones_balance_balance_id_creado_en_idx ON public.prevalidador_revisiones_balance USING btree (balance_id, creado_en);


--
-- Name: prevalidador_revisiones_balance_huella_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prevalidador_revisiones_balance_huella_idx ON public.prevalidador_revisiones_balance USING btree (huella);


--
-- Name: procesos_erp_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX procesos_erp_codigo_key ON public.procesos_erp USING btree (codigo);


--
-- Name: prompts_ia_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompts_ia_clave_key ON public.prompts_ia USING btree (clave);


--
-- Name: registros_acceso_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_acceso_creado_en_idx ON public.registros_acceso USING btree (creado_en);


--
-- Name: registros_acceso_tipo_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_acceso_tipo_creado_en_idx ON public.registros_acceso USING btree (tipo, creado_en);


--
-- Name: registros_acceso_usuario_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_acceso_usuario_creado_en_idx ON public.registros_acceso USING btree (usuario, creado_en);


--
-- Name: registros_auditoria_cliente_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_auditoria_cliente_id_creado_en_idx ON public.registros_auditoria USING btree (cliente_id, creado_en);


--
-- Name: registros_auditoria_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_auditoria_creado_en_idx ON public.registros_auditoria USING btree (creado_en);


--
-- Name: reparto_cruce_modulo_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reparto_cruce_modulo_periodo_idx ON public.reparto_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo);


--
-- Name: reparto_cruce_modulo_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reparto_cruce_modulo_unico ON public.reparto_cruce_modulo USING btree (cliente_id, modulo_codigo, periodo, clasificador, cuenta_russell);


--
-- Name: reportes_ejecutivos_uso_ia_clave_alcance_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reportes_ejecutivos_uso_ia_clave_alcance_creado_en_idx ON public.reportes_ejecutivos_uso_ia USING btree (clave_alcance, creado_en);


--
-- Name: reportes_ejecutivos_uso_ia_huella_contexto_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reportes_ejecutivos_uso_ia_huella_contexto_key ON public.reportes_ejecutivos_uso_ia USING btree (huella_contexto);


--
-- Name: reportes_ejecutivos_uso_ia_modelo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reportes_ejecutivos_uso_ia_modelo_idx ON public.reportes_ejecutivos_uso_ia USING btree (modelo);


--
-- Name: reportes_novedades_ia_huella_contexto_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reportes_novedades_ia_huella_contexto_key ON public.reportes_novedades_ia USING btree (huella_contexto);


--
-- Name: reportes_novedades_ia_modelo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reportes_novedades_ia_modelo_idx ON public.reportes_novedades_ia USING btree (modelo);


--
-- Name: roles_permisos_permiso_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_permisos_permiso_id_idx ON public.roles_permisos USING btree (permiso_id);


--
-- Name: roles_permisos_rol_id_permiso_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_permisos_rol_id_permiso_id_key ON public.roles_permisos USING btree (rol_id, permiso_id);


--
-- Name: roles_rango_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_rango_idx ON public.roles USING btree (rango);


--
-- Name: sectores_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sectores_codigo_key ON public.sectores USING btree (codigo);


--
-- Name: subgrupos_conciliacion_modulo_modulo_codigo_subgrupo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subgrupos_conciliacion_modulo_modulo_codigo_subgrupo_key ON public.subgrupos_conciliacion_modulo USING btree (modulo_codigo, subgrupo);


--
-- Name: subgrupos_estandar_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subgrupos_estandar_codigo_key ON public.subgrupos_estandar USING btree (codigo);


--
-- Name: subgrupos_estandar_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subgrupos_estandar_grupo_idx ON public.subgrupos_estandar USING btree (grupo);


--
-- Name: tasas_cambio_moneda_vigencia_desde_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasas_cambio_moneda_vigencia_desde_idx ON public.tasas_cambio USING btree (moneda, vigencia_desde);


--
-- Name: tasas_cambio_moneda_vigencia_desde_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tasas_cambio_moneda_vigencia_desde_key ON public.tasas_cambio USING btree (moneda, vigencia_desde);


--
-- Name: tickets_soporte_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tickets_soporte_codigo_key ON public.tickets_soporte USING btree (codigo);


--
-- Name: tickets_soporte_creado_por_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_soporte_creado_por_id_creado_en_idx ON public.tickets_soporte USING btree (creado_por_id, creado_en);


--
-- Name: tickets_soporte_estado_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_soporte_estado_creado_en_idx ON public.tickets_soporte USING btree (estado, creado_en);


--
-- Name: tickets_soporte_ruta_clave_menu_clave_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_soporte_ruta_clave_menu_clave_idx ON public.tickets_soporte USING btree (ruta_clave, menu_clave);


--
-- Name: tickets_soporte_token_acceso_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tickets_soporte_token_acceso_hash_key ON public.tickets_soporte USING btree (token_acceso_hash);


--
-- Name: umbrales_alertas_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX umbrales_alertas_clave_key ON public.umbrales_alertas USING btree (clave);


--
-- Name: usuarios_cedula_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_cedula_key ON public.usuarios USING btree (cedula);


--
-- Name: usuarios_correo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_correo_key ON public.usuarios USING btree (correo);


--
-- Name: validacion_alerta_balance_id_ancla_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX validacion_alerta_balance_id_ancla_key ON public.validacion_alerta USING btree (balance_id, ancla);


--
-- Name: validacion_alerta_balance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX validacion_alerta_balance_id_idx ON public.validacion_alerta USING btree (balance_id);


--
-- Name: variables_entorno_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX variables_entorno_clave_key ON public.variables_entorno USING btree (clave);


--
-- Name: versiones_patron_cliente_origen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX versiones_patron_cliente_origen_idx ON public.versiones_patron_archivo_modulo USING btree (cliente_origen_id);


--
-- Name: versiones_patron_erp_modulo_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX versiones_patron_erp_modulo_estado_idx ON public.versiones_patron_archivo_modulo USING btree (erp_id, modulo_codigo, estado);


--
-- Name: versiones_patron_erp_modulo_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX versiones_patron_erp_modulo_version_key ON public.versiones_patron_archivo_modulo USING btree (erp_id, modulo_codigo, version);


--
-- Name: versiones_patron_muestra_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX versiones_patron_muestra_clave_key ON public.versiones_patron_archivo_modulo USING btree (muestra_clave_objeto);


--
-- Name: versiones_plataforma_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX versiones_plataforma_estado_idx ON public.versiones_plataforma USING btree (estado);


--
-- Name: versiones_plataforma_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX versiones_plataforma_numero_key ON public.versiones_plataforma USING btree (numero);


--
-- Name: balance_prueba_detalle balance_prueba_detalle_proteger_prevalidador_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER balance_prueba_detalle_proteger_prevalidador_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.balance_prueba_detalle FOR EACH ROW EXECUTE FUNCTION public.proteger_detalle_balance_prevalidador();


--
-- Name: clientes crear_perfil_base_balance_al_crear_cliente; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crear_perfil_base_balance_al_crear_cliente AFTER INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_base_balance_cliente();


--
-- Name: prevalidador_catalogos_revision prevalidador_catalogos_revision_append_only_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_catalogos_revision_append_only_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.prevalidador_catalogos_revision FOR EACH ROW EXECUTE FUNCTION public.proteger_catalogo_revision_prevalidador();


--
-- Name: prevalidador_cuentas_balance prevalidador_cuentas_balance_solape_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_cuentas_balance_solape_trigger BEFORE INSERT OR DELETE OR UPDATE OF balance_id, catalogo_id, cuenta_cliente ON public.prevalidador_cuentas_balance FOR EACH ROW EXECUTE FUNCTION public.validar_solape_override_prevalidador_balance();


--
-- Name: prevalidador_cuentas_balance prevalidador_cuentas_balance_validar_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_cuentas_balance_validar_trigger BEFORE INSERT OR UPDATE OF balance_id, catalogo_id, cuenta_cliente ON public.prevalidador_cuentas_balance FOR EACH ROW EXECUTE FUNCTION public.validar_override_prevalidador_balance();


--
-- Name: prevalidador_cuentas prevalidador_cuentas_bloquear_overrides_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_cuentas_bloquear_overrides_trigger BEFORE UPDATE OF modulo_id, cuenta_russell ON public.prevalidador_cuentas FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_catalogo_prevalidador_con_overrides();


--
-- Name: prevalidador_cuentas prevalidador_cuentas_solape_cliente_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_cuentas_solape_cliente_trigger AFTER INSERT OR UPDATE OF modulo_id, cuenta_russell, activa ON public.prevalidador_cuentas FOR EACH ROW EXECUTE FUNCTION public.validar_solapes_cliente_tras_catalogo_prevalidador();


--
-- Name: prevalidador_cuentas prevalidador_cuentas_validar_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_cuentas_validar_trigger BEFORE INSERT OR UPDATE OF modulo_id, cuenta_russell ON public.prevalidador_cuentas FOR EACH ROW EXECUTE FUNCTION public.validar_catalogo_prevalidador();


--
-- Name: prevalidador_revisiones_balance prevalidador_revisiones_balance_append_only_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevalidador_revisiones_balance_append_only_trigger BEFORE DELETE OR UPDATE ON public.prevalidador_revisiones_balance FOR EACH ROW EXECUTE FUNCTION public.proteger_historial_revisiones_prevalidador();


--
-- Name: adjuntos_marca_cruce adjuntos_marca_cruce_marca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos_marca_cruce
    ADD CONSTRAINT adjuntos_marca_cruce_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES public.marca_cruce_modulo(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: adjuntos_ticket_soporte adjuntos_ticket_soporte_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos_ticket_soporte
    ADD CONSTRAINT adjuntos_ticket_soporte_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets_soporte(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: balance_archivo_temporal_parte balance_archivo_temporal_parte_lote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_archivo_temporal_parte
    ADD CONSTRAINT balance_archivo_temporal_parte_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES public.balance_archivo_temporal(lote_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: balance_cruce_aperturas balance_cruce_aperturas_balance_cuenta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_cruce_aperturas
    ADD CONSTRAINT balance_cruce_aperturas_balance_cuenta_id_fkey FOREIGN KEY (balance_cuenta_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: balance_cruce_aperturas balance_cruce_aperturas_balance_tercero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_cruce_aperturas
    ADD CONSTRAINT balance_cruce_aperturas_balance_tercero_id_fkey FOREIGN KEY (balance_tercero_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: balance_prueba_detalle balance_prueba_detalle_encabezado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_prueba_detalle
    ADD CONSTRAINT balance_prueba_detalle_encabezado_id_fkey FOREIGN KEY (encabezado_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: balance_tercero_detalle balance_tercero_detalle_encabezado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_tercero_detalle
    ADD CONSTRAINT balance_tercero_detalle_encabezado_id_fkey FOREIGN KEY (encabezado_id) REFERENCES public.balance_tercero_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cambios_version cambios_version_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_version
    ADD CONSTRAINT cambios_version_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.versiones_plataforma(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campos_modulo campos_modulo_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_modulo
    ADD CONSTRAINT campos_modulo_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.modulos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cartera_saldo_tercero cartera_saldo_tercero_encabezado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartera_saldo_tercero
    ADD CONSTRAINT cartera_saldo_tercero_encabezado_id_fkey FOREIGN KEY (encabezado_id) REFERENCES public.modulo_dato_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: clasificador_no_modular_cruce clasificador_no_modular_cruce_marca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clasificador_no_modular_cruce
    ADD CONSTRAINT clasificador_no_modular_cruce_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES public.marca_cruce_modulo(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: clientes clientes_erp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_erp_id_fkey FOREIGN KEY (erp_id) REFERENCES public.erps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: clientes clientes_sector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES public.sectores(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios comentarios_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios comentarios_comentario_padre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_comentario_padre_id_fkey FOREIGN KEY (comentario_padre_id) REFERENCES public.comentarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_conciliacion comentarios_conciliacion_conciliacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_conciliacion
    ADD CONSTRAINT comentarios_conciliacion_conciliacion_id_fkey FOREIGN KEY (conciliacion_id) REFERENCES public.conciliaciones(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_dian comentarios_dian_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_dian
    ADD CONSTRAINT comentarios_dian_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.formularios_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conciliaciones conciliaciones_balance_prevalidado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones
    ADD CONSTRAINT conciliaciones_balance_prevalidado_id_fkey FOREIGN KEY (balance_prevalidado_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: conciliaciones conciliaciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones
    ADD CONSTRAINT conciliaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cuenta_bloqueada_conciliacion cuenta_bloqueada_conciliacion_cierre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_bloqueada_conciliacion
    ADD CONSTRAINT cuenta_bloqueada_conciliacion_cierre_id_fkey FOREIGN KEY (cierre_id) REFERENCES public.conciliacion_modulo_cierre(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cuenta_no_modular_cruce cuenta_no_modular_cruce_marca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_no_modular_cruce
    ADD CONSTRAINT cuenta_no_modular_cruce_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES public.marca_cruce_modulo(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cuentas_cliente cuentas_cliente_opcion_russell_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_cliente
    ADD CONSTRAINT cuentas_cliente_opcion_russell_id_fkey FOREIGN KEY (opcion_russell_id) REFERENCES public.opciones_russell(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ejecuciones_conexion ejecuciones_conexion_conexion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_conexion
    ADD CONSTRAINT ejecuciones_conexion_conexion_id_fkey FOREIGN KEY (conexion_id) REFERENCES public.conexiones_integracion(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: erps_cliente_proceso erps_cliente_proceso_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps_cliente_proceso
    ADD CONSTRAINT erps_cliente_proceso_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: erps_cliente_proceso erps_cliente_proceso_erp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps_cliente_proceso
    ADD CONSTRAINT erps_cliente_proceso_erp_id_fkey FOREIGN KEY (erp_id) REFERENCES public.erps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: erps_cliente_proceso erps_cliente_proceso_proceso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erps_cliente_proceso
    ADD CONSTRAINT erps_cliente_proceso_proceso_id_fkey FOREIGN KEY (proceso_id) REFERENCES public.procesos_erp(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eventos_ticket_soporte eventos_ticket_soporte_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_ticket_soporte
    ADD CONSTRAINT eventos_ticket_soporte_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets_soporte(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: filas_conciliacion filas_conciliacion_conciliacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filas_conciliacion
    ADD CONSTRAINT filas_conciliacion_conciliacion_id_fkey FOREIGN KEY (conciliacion_id) REFERENCES public.conciliaciones(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: formularios_dian_cliente formularios_dian_cliente_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian_cliente
    ADD CONSTRAINT formularios_dian_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: formularios_dian_cliente formularios_dian_cliente_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formularios_dian_cliente
    ADD CONSTRAINT formularios_dian_cliente_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.formularios_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mapeos_dian mapeos_dian_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapeos_dian
    ADD CONSTRAINT mapeos_dian_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.formularios_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: menciones_comentario menciones_comentario_comentario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menciones_comentario
    ADD CONSTRAINT menciones_comentario_comentario_id_fkey FOREIGN KEY (comentario_id) REFERENCES public.comentarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: menciones_comentario menciones_comentario_usuario_mencionado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menciones_comentario
    ADD CONSTRAINT menciones_comentario_usuario_mencionado_id_fkey FOREIGN KEY (usuario_mencionado_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mensajes_ticket_soporte mensajes_ticket_soporte_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_ticket_soporte
    ADD CONSTRAINT mensajes_ticket_soporte_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets_soporte(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: modulo_dato_detalle modulo_dato_detalle_encabezado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulo_dato_detalle
    ADD CONSTRAINT modulo_dato_detalle_encabezado_id_fkey FOREIGN KEY (encabezado_id) REFERENCES public.modulo_dato_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: modulos_cliente modulos_cliente_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_cliente
    ADD CONSTRAINT modulos_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: modulos_cliente modulos_cliente_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_cliente
    ADD CONSTRAINT modulos_cliente_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.modulos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: periodos_dian periodos_dian_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_dian
    ADD CONSTRAINT periodos_dian_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.formularios_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: preferencias_soporte_usuario preferencias_soporte_usuario_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_soporte_usuario
    ADD CONSTRAINT preferencias_soporte_usuario_usuario_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prevalidador_catalogos_revision prevalidador_catalogos_revision_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_catalogos_revision
    ADD CONSTRAINT prevalidador_catalogos_revision_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.prevalidador_revisiones_balance(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prevalidador_cuentas_balance prevalidador_cuentas_balance_balance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_balance
    ADD CONSTRAINT prevalidador_cuentas_balance_balance_id_fkey FOREIGN KEY (balance_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prevalidador_cuentas_balance prevalidador_cuentas_balance_catalogo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas_balance
    ADD CONSTRAINT prevalidador_cuentas_balance_catalogo_id_fkey FOREIGN KEY (catalogo_id) REFERENCES public.prevalidador_cuentas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prevalidador_cuentas prevalidador_cuentas_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_cuentas
    ADD CONSTRAINT prevalidador_cuentas_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.modulos(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prevalidador_revisiones_balance prevalidador_revisiones_balance_balance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prevalidador_revisiones_balance
    ADD CONSTRAINT prevalidador_revisiones_balance_balance_id_fkey FOREIGN KEY (balance_id) REFERENCES public.balance_prueba_encabezado(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: renglones_dian renglones_dian_seccion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renglones_dian
    ADD CONSTRAINT renglones_dian_seccion_id_fkey FOREIGN KEY (seccion_id) REFERENCES public.secciones_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: roles_permisos roles_permisos_permiso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_permiso_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permisos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: roles_permisos roles_permisos_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: secciones_dian secciones_dian_formulario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones_dian
    ADD CONSTRAINT secciones_dian_formulario_id_fkey FOREIGN KEY (formulario_id) REFERENCES public.formularios_dian(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: validacion_alerta validacion_alerta_comentario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validacion_alerta
    ADD CONSTRAINT validacion_alerta_comentario_id_fkey FOREIGN KEY (comentario_id) REFERENCES public.comentarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: versiones_patron_archivo_modulo versiones_patron_archivo_modulo_erp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.versiones_patron_archivo_modulo
    ADD CONSTRAINT versiones_patron_archivo_modulo_erp_id_fkey FOREIGN KEY (erp_id) REFERENCES public.erps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict VZnUh9aAAHmP4gARV0E0mcOIhwFVxuXAL7YQrcSps8QPKAi1i6DiQcny01y6Sah

