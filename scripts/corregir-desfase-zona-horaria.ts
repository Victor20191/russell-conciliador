// ============================================================
// Corrige el desfase de +5 h de las fechas guardadas desde el 17-jul-2026.
//
// Causa: `@prisma/adapter-pg` escribe cada `Date` como texto SIN zona (reloj UTC:
// «2026-09-29 18:44:07.746») y, al leer un TIMESTAMPTZ, descarta la zona que
// devuelve PostgreSQL. Con la sesión en America/Bogota (default de la base desde
// la migración 20260716234000_zona_horaria_colombia, y `-c timezone` en
// `src/lib/prisma.ts`) cada instante se guardó como si fuera hora de Colombia:
// 5 h DESPUÉS del real. La app no lo notaba —lee con el mismo error al revés—,
// pero el SQL directo, `now()` y el pool de `pg` veían las fechas corridas, y lo
// guardado ANTES del cambio (convertido bien con `AT TIME ZONE 'UTC'`) la app lo
// mostraba 5 h ANTES.
//
// Qué corrige (resta 5 h), columna por columna:
//   · valores ≥ inicio de 20260716235500_normalizar_campos_temporales + 5 h. Lo
//     anterior quedó bien en esa migración y lo que escribió Prisma después es,
//     como mínimo, 5 h posterior al cambio; lo que cae en medio se escribió bien.
//   · salvo los que caen en la ventana de una migración posterior: los puso el
//     `DEFAULT CURRENT_TIMESTAMP` de la base, que nunca tuvo desfase.
//   · `balance_tercero_detalle.creado_en`: desde el 22-sep-2026 lo inserta SQL
//     directo sin esa columna (default de la base, bien). Solo se corrige la fila
//     que coincide con su encabezado, que sí escribió Prisma.
//   · períodos de reportes y envíos: son fechas de calendario (pueden ser
//     anteriores al cambio) y se deciden por la fecha de creación de la fila.
// Además deja la zona por defecto de la base en UTC, para que ningún cliente de
// Prisma (app, seeds, scripts) vuelva a escribir con desfase.
//
// Orden: 1) desplegar el `src/lib/prisma.ts` que HEREDA la zona de la base (sin
// efecto mientras la base siga en America/Bogota); 2) detener la app y los
// servidores locales que apunten a producción; 3) `--aplicar`; 4) arrancar la app.
// Una conexión abierta antes del paso 3 conserva la sesión en Bogotá: con ella
// lo corregido se leería 5 h antes y lo nuevo volvería a quedar corrido.
//
// Ejecutar:
//   npm run db:corregir:zona-horaria                    # dry-run (no escribe)
//   npm run db:corregir:zona-horaria -- --aplicar       # corrige + snapshot + bitácora
//   npm run db:corregir:zona-horaria -- --revertir scripts/.snapshots/zona-horaria-<ts>.json.gz
// `--ignorar-sesiones` permite aplicar aunque haya otras conexiones a la base.
// ============================================================

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const IGNORAR_SESIONES = process.argv.includes("--ignorar-sesiones");
const iRevertir = process.argv.indexOf("--revertir");
const REVERTIR = iRevertir >= 0 ? process.argv[iRevertir + 1] : null;

const DESFASE = "interval '5 hours'";
const MIGRACION_CAMBIO = "20260716235500_normalizar_campos_temporales";
const ACTOR = "Sistema (script corregir-desfase-zona-horaria)";

/** Guardas de inmutabilidad que impiden el UPDATE; se apagan SOLO dentro de la transacción. */
const DISPARADORES: Array<[tabla: string, disparador: string]> = [
  ["balance_prueba_detalle", "balance_prueba_detalle_proteger_prevalidador_trigger"],
  ["prevalidador_revisiones_balance", "prevalidador_revisiones_balance_append_only_trigger"],
  ["prevalidador_catalogos_revision", "prevalidador_catalogos_revision_append_only_trigger"],
];

/** Fechas de calendario de un período: se corrigen si la FILA se escribió después del cambio. */
const FECHADA_POR: Record<string, string> = {
  "reportes_ejecutivos_uso_ia.periodo_desde": "creado_en",
  "reportes_ejecutivos_uso_ia.periodo_hasta": "creado_en",
  "envios_reporte_ejecutivo.periodo_desde": "enviado_en",
  "envios_reporte_ejecutivo.periodo_hasta": "enviado_en",
};

/** Columnas cuyo valor legítimo puede estar en el futuro (no entran al control final). */
const FUTURO_LEGITIMO = new Set([
  "balance_archivo_temporal.expira_en",
  "usuarios.bloqueado_hasta",
  "asignaciones_cliente.vigente_hasta",
  // Fin de un período que llega hasta hoy: 23:59:59.999 UTC del día.
  "reportes_ejecutivos_uso_ia.periodo_hasta",
  "envios_reporte_ejecutivo.periodo_hasta",
]);

type Tabla = { tabla: string; columnas: string[]; pk: Array<{ columna: string; tipo: string }> };
type TablaSnapshot = Tabla & { filas: Array<Array<string | number | boolean>> };
type Snapshot = { creadoEn: string; umbral: string; tablas: TablaSnapshot[] };

const id = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;
const bandera = (columna: string) => id(`corr_${columna}`);

async function main() {
  const destino = new URL(process.env.DATABASE_URL!).hostname;
  console.log(`Base de datos: ${destino}`);
  const db = new Client({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });
  await db.connect();
  try {
    if (REVERTIR) return await revertir(db, REVERTIR);
    return await corregir(db);
  } finally {
    await db.end();
  }
}

async function umbrales(db: Client): Promise<{ cambio: string; umbral: string }> {
  const r = await db.query<{ cambio: string; umbral: string }>(
    `SELECT started_at::text AS cambio, (started_at + ${DESFASE})::text AS umbral
       FROM _prisma_migrations WHERE migration_name = $1`,
    [MIGRACION_CAMBIO],
  );
  if (!r.rows[0]) throw new Error(`No está aplicada ${MIGRACION_CAMBIO}: no hay nada que corregir.`);
  return r.rows[0];
}

async function inventario(db: Client): Promise<Tabla[]> {
  const cols = await db.query<{ tabla: string; columna: string }>(`
    SELECT table_name AS tabla, column_name AS columna
      FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'
       AND table_name <> '_prisma_migrations'
     ORDER BY 1, 2`);
  const porTabla = new Map<string, string[]>();
  for (const { tabla, columna } of cols.rows) porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), columna]);
  const tablas: Tabla[] = [];
  for (const [tabla, columnas] of porTabla) {
    const pk = await db.query<{ columna: string; tipo: string }>(`
      SELECT a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary
       ORDER BY array_position(i.indkey, a.attnum)`, [id(tabla)]);
    if (pk.rows.length === 0) throw new Error(`La tabla ${tabla} no tiene llave primaria.`);
    tablas.push({ tabla, columnas, pk: pk.rows });
  }
  return tablas;
}

/** Ventanas de las migraciones posteriores al cambio: ahí escribió `DEFAULT CURRENT_TIMESTAMP`. */
function cteVentanas(cambio: string): string {
  return `WITH ventanas AS (
    SELECT started_at - interval '2 seconds' AS desde,
           coalesce(finished_at, started_at) + interval '2 seconds' AS hasta
      FROM _prisma_migrations WHERE started_at >= '${cambio}'::timestamptz)`;
}

function predicado(tabla: string, columna: string, umbral: string): string {
  const referencia = FECHADA_POR[`${tabla}.${columna}`] ?? columna;
  let p = `t.${id(columna)} IS NOT NULL AND t.${id(referencia)} >= '${umbral}'::timestamptz
    AND NOT EXISTS (SELECT 1 FROM ventanas v WHERE t.${id(referencia)} BETWEEN v.desde AND v.hasta)`;
  if (tabla === "balance_tercero_detalle" && columna === "creado_en") {
    p += ` AND t."creado_en" >= (SELECT e."creado_en" FROM "balance_tercero_encabezado" e
                                  WHERE e."id" = t."encabezado_id") - interval '1 hour'`;
  }
  return `(${p})`;
}

function seleccion(t: Tabla, cambio: string, umbral: string): string {
  const flags = t.columnas.map((c) => `${predicado(t.tabla, c, umbral)} AS ${bandera(c)}`);
  const alguna = t.columnas.map((c) => predicado(t.tabla, c, umbral)).join(" OR ");
  return `${cteVentanas(cambio)}
    SELECT ${t.pk.map((k) => `t.${id(k.columna)}`).join(", ")}, ${flags.join(", ")}
      FROM ${id(t.tabla)} t WHERE ${alguna}`;
}

async function sesionesAjenas(db: Client): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
  return Number(r.rows[0].n);
}

async function corregir(db: Client) {
  const { cambio, umbral } = await umbrales(db);
  const tablas = await inventario(db);
  console.log(`Cambio a TIMESTAMPTZ: ${cambio} · se corrige lo escrito desde ${umbral}\n`);

  if (!APLICAR) {
    await db.query("BEGIN READ ONLY");
    const resumen: Array<Record<string, string | number>> = [];
    let total = 0;
    for (const t of tablas) {
      for (const c of t.columnas) {
        const p = predicado(t.tabla, c, umbral);
        const r = await db.query<{ corregir: string; sin_tocar: string; futuro_despues: string }>(`${cteVentanas(cambio)}
          SELECT count(*) FILTER (WHERE ${p}) corregir,
                 count(*) FILTER (WHERE t.${id(c)} IS NOT NULL AND NOT ${p}) sin_tocar,
                 count(*) FILTER (WHERE CASE WHEN ${p} THEN t.${id(c)} - ${DESFASE} ELSE t.${id(c)} END > now()) futuro_despues
            FROM ${id(t.tabla)} t`);
        const fila = r.rows[0];
        total += Number(fila.corregir);
        if (Number(fila.corregir) > 0 || Number(fila.futuro_despues) > 0) {
          resumen.push({ columna: `${t.tabla}.${c}`, corregir: Number(fila.corregir), sin_tocar: Number(fila.sin_tocar), futuro_despues: Number(fila.futuro_despues) });
        }
      }
    }
    await db.query("ROLLBACK");
    console.table(resumen);
    console.log(`\nValores a corregir: ${total.toLocaleString("es-CO")} · zona por defecto de la base: ${await zonaPorDefecto(db)} → UTC`);
    console.log(`Otras sesiones abiertas en la base: ${await sesionesAjenas(db)}`);
    console.log("«futuro_despues» debe quedar en 0 (salvo columnas de vencimiento). Nada se escribió: usa --aplicar.");
    return;
  }

  const ajenas = await sesionesAjenas(db);
  if (ajenas > 0 && !IGNORAR_SESIONES) {
    throw new Error(`Hay ${ajenas} sesión(es) más en la base. Detén la app (y los servidores locales) o usa --ignorar-sesiones.`);
  }

  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = 0");
    await db.query("SET LOCAL lock_timeout = '15s'");

    // 1) Primero se decide TODO (el detalle por tercero compara con su encabezado,
    //    que también se corrige); después se escribe.
    const snapshot: Snapshot = { creadoEn: new Date().toISOString(), umbral, tablas: [] };
    const conCambios: Array<{ t: Tabla; temporal: string; filas: number }> = [];
    for (const [i, t] of tablas.entries()) {
      const temporal = `corr_zona_${i}`;
      await db.query(`CREATE TEMP TABLE ${temporal} ON COMMIT DROP AS ${seleccion(t, cambio, umbral)}`);
      const filas = await db.query({ text: `SELECT * FROM ${temporal}`, rowMode: "array" });
      if (filas.rows.length === 0) continue;
      conCambios.push({ t, temporal, filas: filas.rows.length });
      snapshot.tablas.push({ ...t, filas: filas.rows });
    }

    // 2) Escritura, con las guardas de inmutabilidad apagadas solo en esta transacción.
    for (const [tabla, disparador] of DISPARADORES) {
      await db.query(`ALTER TABLE ${id(tabla)} DISABLE TRIGGER ${id(disparador)}`);
    }
    let valores = 0;
    for (const { t, temporal, filas } of conCambios) {
      const set = t.columnas
        .map((c) => `${id(c)} = CASE WHEN x.${bandera(c)} THEN t.${id(c)} - ${DESFASE} ELSE t.${id(c)} END`)
        .join(", ");
      const on = t.pk.map((k) => `t.${id(k.columna)} = x.${id(k.columna)}`).join(" AND ");
      const r = await db.query(`UPDATE ${id(t.tabla)} t SET ${set} FROM ${temporal} x WHERE ${on}`);
      if (r.rowCount !== filas) throw new Error(`${t.tabla}: se esperaban ${filas} filas y se actualizaron ${r.rowCount}.`);
      const cuenta = await db.query<{ n: string }>(
        `SELECT (${t.columnas.map((c) => `count(*) FILTER (WHERE ${bandera(c)})`).join(" + ")})::text n FROM ${temporal}`,
      );
      valores += Number(cuenta.rows[0].n);
      console.log(`  ✓ ${t.tabla}: ${filas.toLocaleString("es-CO")} fila(s)`);
    }
    for (const [tabla, disparador] of DISPARADORES) {
      await db.query(`ALTER TABLE ${id(tabla)} ENABLE TRIGGER ${id(disparador)}`);
    }

    // 3) Control: tras corregir, ningún registro puede quedar en el futuro.
    for (const t of tablas) {
      for (const c of t.columnas) {
        if (FUTURO_LEGITIMO.has(`${t.tabla}.${c}`)) continue;
        const r = await db.query<{ n: string }>(`SELECT count(*) n FROM ${id(t.tabla)} WHERE ${id(c)} > now() + interval '1 minute'`);
        if (Number(r.rows[0].n) > 0) throw new Error(`${t.tabla}.${c}: ${r.rows[0].n} valor(es) siguen en el futuro. Se revierte todo.`);
      }
    }

    await fijarZonaPorDefecto(db, "UTC");
    await db.query(
      `INSERT INTO registros_auditoria (usuario, accion, entidad, detalle, creado_en) VALUES ($1, $2, $3, $4, now())`,
      [ACTOR, "CORRIGIÓ DESFASE DE ZONA HORARIA", "base de datos",
        `Restó 5 h a ${valores} fecha(s) escritas desde ${umbral} en ${conCambios.length} tabla(s); zona por defecto de la base → UTC.`],
    );

    mkdirSync("scripts/.snapshots", { recursive: true });
    const ruta = `scripts/.snapshots/zona-horaria-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json.gz`;
    writeFileSync(ruta, gzipSync(JSON.stringify(snapshot)));
    await db.query("COMMIT");
    console.log(`\n✔ Corregidas ${valores.toLocaleString("es-CO")} fecha(s) en ${conCambios.length} tabla(s). Snapshot: ${ruta}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

/** La zona de la BASE (la sesión de este script va en UTC y no sirve para saberlo). */
async function zonaPorDefecto(db: Client): Promise<string> {
  const r = await db.query<{ config: string[] | null }>(`
    SELECT s.setconfig AS config FROM pg_db_role_setting s
      JOIN pg_database d ON d.oid = s.setdatabase
     WHERE d.datname = current_database() AND s.setrole = 0`);
  const valor = r.rows[0]?.config?.find((c) => /^timezone=/i.test(c));
  return valor ? valor.split("=")[1] : "(la del servidor)";
}

async function fijarZonaPorDefecto(db: Client, zona: string) {
  await db.query(`DO $zona$ BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), '${zona}');
  END $zona$`);
}

/** Vuelve a sumar las 5 h exactamente a lo que corrigió el snapshot (reversión inmediata). */
async function revertir(db: Client, ruta: string) {
  const snap = JSON.parse(gunzipSync(readFileSync(ruta)).toString("utf8")) as Snapshot;
  console.log(`↩️  Revirtiendo ${ruta} (${snap.tablas.length} tabla(s))`);
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = 0");
    for (const [tabla, disparador] of DISPARADORES) {
      await db.query(`ALTER TABLE ${id(tabla)} DISABLE TRIGGER ${id(disparador)}`);
    }
    for (const t of snap.tablas) {
      const definicion = [
        ...t.pk.map((k) => `${id(k.columna)} ${k.tipo}`),
        ...t.columnas.map((c) => `${bandera(c)} boolean`),
      ].join(", ");
      const nombres = [...t.pk.map((k) => k.columna), ...t.columnas.map((c) => `corr_${c}`)];
      const set = t.columnas
        .map((c) => `${id(c)} = CASE WHEN x.${bandera(c)} THEN t.${id(c)} + ${DESFASE} ELSE t.${id(c)} END`)
        .join(", ");
      const on = t.pk.map((k) => `t.${id(k.columna)} = x.${id(k.columna)}`).join(" AND ");
      for (let i = 0; i < t.filas.length; i += 20_000) {
        const tanda = t.filas.slice(i, i + 20_000).map((f) => Object.fromEntries(nombres.map((n, j) => [n, f[j]])));
        await db.query(
          `UPDATE ${id(t.tabla)} t SET ${set} FROM jsonb_to_recordset($1::jsonb) AS x(${definicion}) WHERE ${on}`,
          [JSON.stringify(tanda)],
        );
      }
      console.log(`  ✓ ${t.tabla}: ${t.filas.length.toLocaleString("es-CO")} fila(s)`);
    }
    for (const [tabla, disparador] of DISPARADORES) {
      await db.query(`ALTER TABLE ${id(tabla)} ENABLE TRIGGER ${id(disparador)}`);
    }
    await fijarZonaPorDefecto(db, "America/Bogota");
    await db.query(
      `INSERT INTO registros_auditoria (usuario, accion, entidad, detalle, creado_en) VALUES ($1, $2, $3, $4, now())`,
      [ACTOR, "REVIRTIÓ CORRECCIÓN DE ZONA HORARIA", "base de datos", `Snapshot ${ruta}`],
    );
    await db.query("COMMIT");
    console.log("✔ Revertido. Vuelve a desplegar el código anterior (sesión America/Bogota).");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
