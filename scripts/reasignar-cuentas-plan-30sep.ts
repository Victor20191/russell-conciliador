// ============================================================
// Reasignación del 30/Sep/2026: elimina del plan estándar Russell seis cuentas reemplazadas por la
// estructura espejo de gastos de personal (5105 = 5205 = 7205 = 7305 con los mismos sufijos) y pasa
// antes TODO lo que las usa a la cuenta nueva equivalente:
//
//   720530 Aportes EPS                   → 720569   (720530 queda «Cesantías», con la ficha de 720510)
//   720510 Cesantías                     → 720530
//   720520 Vacaciones                    → 720539
//   720525 Aportes ARL                   → 720568
//   720535 Aportes pensión y cesantías   → 720570
//   720540 Otros gastos de personal      → 720595
//   240895 IVA saldo a pagar             → 240899
//
// Las equivalencias se aplican A LA VEZ (cada fila se lee por su valor original), así 720530→720569
// y 720510→720530 no se pisan. Toca: detalle del balance y del balance por tercero, memoria de
// homologación del cliente, Consolidado / asignaciones del período / repartos / marcas de los
// módulos, la lista de cuentas que concilia cada módulo y las anclas de comentarios y alertas
// validadas del balance. Los balances CONGELADOS se descongelan, se reasignan y se vuelven a
// congelar en la misma transacción (el trigger del detalle lo exige); nada más de su encabezado
// cambia. Lo inmutable (instantáneas del prevalidador, copias en cierres) no se toca.
//
// Las aprobaciones del prevalidador de los balances afectados quedan DESACTUALIZADAS (la huella
// incluye la homologación): el script no aprueba nada, lista los balances para que un senior las
// vuelva a aprobar.
//
//   npx tsx scripts/reasignar-cuentas-plan-30sep.ts                 # simulación (solo lectura)
//   npx tsx scripts/reasignar-cuentas-plan-30sep.ts --aplicar       # ejecuta, con snapshot
//   npx tsx scripts/reasignar-cuentas-plan-30sep.ts --revertir scripts/.snapshots/<archivo>.json
// ============================================================
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { tomarCandadoTransaccion } from "../src/lib/candados";
import { claveGrupoCruce, cuentasDeClaveCruce } from "../src/lib/modulos/cruce-contable";

const APLICAR = process.argv.includes("--aplicar");
const HAY_REVERTIR = process.argv.includes("--revertir");
const RUTA_REVERTIR = process.argv[process.argv.indexOf("--revertir") + 1];
const ACTOR = "Sistema · reasignación de cuentas del plan (30/Sep/2026)";

/** Equivalencias, aplicadas a la vez sobre el valor original de cada fila. */
const MAPA: Readonly<Record<string, string>> = {
  "720530": "720569",
  "720510": "720530",
  "720520": "720539",
  "720525": "720568",
  "720535": "720570",
  "720540": "720595",
  "240895": "240899",
};
const VIEJOS = Object.keys(MAPA);
/**
 * Orden de escritura: primero lo que DEJA LIBRE un código que otra equivalencia ocupa (720530 →
 * 720569), después el resto (720510 → 720530). Las tablas con llave única sobre la cuenta chocarían
 * a mitad de una sola sentencia si 720510 llegara a 720530 antes de que EPS lo desocupe.
 */
const PASOS: readonly (readonly string[])[] = [
  VIEJOS.filter((v) => Object.values(MAPA).includes(v)),
  VIEJOS.filter((v) => !Object.values(MAPA).includes(v)),
];
const NUEVOS = Object.values(MAPA);
/** Las que salen del plan (720530 se queda, renombrada). */
const ELIMINAR = ["240895", "720510", "720520", "720525", "720535", "720540"];
/** La 720530 toma la ficha de la 720510. */
const RENOMBRAR = { codigo: "720530", fichaDe: "720510" };

/** Columnas simples con un código Russell de 6 dígitos (o un ancla que lo es). */
const TABLAS: { tabla: string; columna: string; filtro?: string }[] = [
  { tabla: "balance_prueba_detalle", columna: "cuenta_6_russell" },
  { tabla: "balance_tercero_detalle", columna: "cuenta_6_russell" },
  { tabla: "cuentas_cliente", columna: "cuenta_6_russell" },
  { tabla: "consolidacion_modulo_cliente", columna: "cuenta_6" },
  { tabla: "asignacion_periodo_modulo", columna: "cuenta_6" },
  { tabla: "reparto_cruce_modulo", columna: "cuenta_russell" },
  { tabla: "validacion_alerta", columna: "ancla" },
  { tabla: "comentarios", columna: "ancla", filtro: `"entidad_tipo" = 'balance'` },
];

const CAMPOS_FICHA = ["name", "nature", "critical", "russellAccount", "categoryType", "includes", "excludes", "possibleAccounts", "supportingDocuments", "controlSupports", "mappingNotes"] as const;

type Db = Prisma.TransactionClient | typeof prisma;
type FilaCambio = [id: number, anterior: string];
type Snapshot = {
  creadoEn: string;
  mapa: Record<string, string>;
  tablas: Record<string, { columna: string; filas: FilaCambio[] }>;
  marcas: FilaCambio[];
  conciliacion: { actualizadas: FilaCambio[]; borradas: Record<string, unknown>[] };
  congelados: number[];
  plan: Record<string, unknown>[];
};

const nuevaClaveMarca = (clave: string): string => {
  const partes = cuentasDeClaveCruce(clave);
  const nuevas = partes.map((p) => MAPA[p] ?? p);
  return partes.length > 1 ? claveGrupoCruce(nuevas) : nuevas[0];
};
const tocaClave = (clave: string | null): clave is string => !!clave && cuentasDeClaveCruce(clave).some((p) => p in MAPA);

async function filasAfectadas(db: Db, t: (typeof TABLAS)[number], bloquear: boolean): Promise<FilaCambio[]> {
  const filas = await db.$queryRawUnsafe<{ id: number; v: string }[]>(
    `SELECT "id", "${t.columna}" AS v FROM "${t.tabla}" WHERE "${t.columna}" = ANY($1::text[])${t.filtro ? ` AND ${t.filtro}` : ""} ORDER BY "id"${bloquear ? " FOR UPDATE" : ""}`,
    VIEJOS,
  );
  return filas.map((f) => [f.id, f.v]);
}

async function leerEstado(db: Db, bloquear: boolean) {
  const tablas: Snapshot["tablas"] = {};
  for (const t of TABLAS) tablas[t.tabla] = { columna: t.columna, filas: await filasAfectadas(db, t, bloquear) };
  const marcasTodas = await db.$queryRawUnsafe<{ id: number; cliente_id: number; modulo_codigo: string; periodo: string; cuenta_4: string | null; numero: number }[]>(
    `SELECT "id", "cliente_id", "modulo_codigo", "periodo", "cuenta_4", "numero" FROM "marca_cruce_modulo" WHERE "dimension" = 'cuenta4'${bloquear ? " FOR UPDATE" : ""}`,
  );
  const marcas = marcasTodas.filter((m) => tocaClave(m.cuenta_4));
  const conciliacion = await db.$queryRawUnsafe<{ id: number; modulo_codigo: string; cuenta: string; origen: string | null; actualizado_por: string | null; creado_en: Date; actualizado_en: Date }[]>(
    `SELECT * FROM "cuentas_conciliacion_modulo"${bloquear ? " FOR UPDATE" : ""}`,
  );
  const detalle = tablas.balance_prueba_detalle.filas.map(([id]) => id);
  const balances = detalle.length === 0 ? [] : await db.$queryRawUnsafe<{ id: number; cliente_id: number; nombre_cliente: string; periodo: string; version: string; esta_congelado: boolean; es_oficial: boolean; estado_prev: string | null; filas: number }[]>(
    `WITH b AS (SELECT "encabezado_id" AS id, COUNT(*)::int AS filas FROM "balance_prueba_detalle" WHERE "id" = ANY($1::int[]) GROUP BY 1),
          u AS (SELECT DISTINCT ON (r."balance_id") r."balance_id", r."estado" FROM "prevalidador_revisiones_balance" r JOIN b ON b.id = r."balance_id" ORDER BY r."balance_id", r."creado_en" DESC, r."id" DESC)
     SELECT e."id", e."cliente_id", e."nombre_cliente", e."periodo", e."version", e."esta_congelado", e."es_oficial", u."estado" AS estado_prev, b.filas
     FROM b JOIN "balance_prueba_encabezado" e ON e."id" = b.id LEFT JOIN u ON u."balance_id" = e."id" ORDER BY e."nombre_cliente", e."periodo", e."id"`,
    detalle,
  );
  const plan = await db.standardAccount.findMany({ where: { code: { in: [...new Set([...ELIMINAR, RENOMBRAR.codigo, ...NUEVOS])] } } });
  return { tablas, marcas, marcasTodas, conciliacion, balances, plan };
}

/** Choques de unicidad que la reasignación produciría. Vacío = se puede aplicar. */
function choques(estado: Awaited<ReturnType<typeof leerEstado>>, consolidacionClaves: string[][], repartoClaves: string[][], alertaClaves: string[][]): string[] {
  const errores: string[] = [];
  // Marcas: (cliente, módulo, período, clave) única.
  const ocupadas = new Set(estado.marcasTodas.filter((m) => !tocaClave(m.cuenta_4)).map((m) => `${m.cliente_id}|${m.modulo_codigo}|${m.periodo}|${m.cuenta_4}`));
  for (const m of estado.marcas) {
    const k = `${m.cliente_id}|${m.modulo_codigo}|${m.periodo}|${nuevaClaveMarca(m.cuenta_4!)}`;
    if (ocupadas.has(k)) errores.push(`marca ${m.numero} (${m.cuenta_4}) chocaría con otra marca en ${nuevaClaveMarca(m.cuenta_4!)}`);
    ocupadas.add(k);
  }
  const duplicados = (nombre: string, claves: string[][]) => {
    const vistos = new Set<string>();
    for (const k of claves) {
      const s = k.join("|");
      if (vistos.has(s)) errores.push(`${nombre}: dos filas quedarían con la misma llave (${s})`);
      vistos.add(s);
    }
  };
  duplicados("consolidacion_modulo_cliente", consolidacionClaves);
  duplicados("reparto_cruce_modulo", repartoClaves);
  duplicados("validacion_alerta", alertaClaves);
  return errores;
}

/** Llaves únicas finales de las tablas con unicidad sobre la cuenta (para detectar choques). */
async function llavesFinales(db: Db) {
  const mapa = JSON.stringify(MAPA);
  const consolidacion = await db.$queryRawUnsafe<{ k: string[] }[]>(
    `SELECT ARRAY["cliente_id"::text, "modulo_codigo", "clasificador", "agrupador", "cuenta_4", COALESCE($1::jsonb ->> "cuenta_6", "cuenta_6"), "cuenta_cliente"] AS k FROM "consolidacion_modulo_cliente"`, mapa);
  const reparto = await db.$queryRawUnsafe<{ k: string[] }[]>(
    `SELECT ARRAY["cliente_id"::text, "modulo_codigo", "periodo", "clasificador", COALESCE($1::jsonb ->> "cuenta_russell", "cuenta_russell")] AS k FROM "reparto_cruce_modulo"`, mapa);
  const alertas = await db.$queryRawUnsafe<{ k: string[] }[]>(
    `SELECT ARRAY["balance_id"::text, COALESCE($1::jsonb ->> "ancla", "ancla")] AS k FROM "validacion_alerta"`, mapa);
  return { consolidacion: consolidacion.map((r) => r.k), reparto: reparto.map((r) => r.k), alertas: alertas.map((r) => r.k) };
}

function imprimirResumen(estado: Awaited<ReturnType<typeof leerEstado>>) {
  for (const t of TABLAS) {
    const filas = estado.tablas[t.tabla].filas;
    const porCodigo = new Map<string, number>();
    for (const [, v] of filas) porCodigo.set(v, (porCodigo.get(v) ?? 0) + 1);
    console.log(`  ${t.tabla}.${t.columna}: ${filas.length}${filas.length ? ` (${[...porCodigo].map(([c, n]) => `${c}→${MAPA[c]}: ${n}`).join(" · ")})` : ""}`);
  }
  console.log(`  marca_cruce_modulo.cuenta_4: ${estado.marcas.length}${estado.marcas.length ? ` (${estado.marcas.map((m) => `#${m.numero} ${m.cuenta_4}→${nuevaClaveMarca(m.cuenta_4!)}`).join(" · ")})` : ""}`);
  const conc = estado.conciliacion.filter((c) => c.cuenta in MAPA);
  console.log(`  cuentas_conciliacion_modulo.cuenta: ${conc.length}${conc.length ? ` (${conc.map((c) => `${c.modulo_codigo} ${c.cuenta}→${MAPA[c.cuenta]}`).join(" · ")})` : ""}`);
  const clientes = new Set(estado.balances.map((b) => b.cliente_id));
  const congelados = estado.balances.filter((b) => b.esta_congelado);
  const aprobados = estado.balances.filter((b) => b.estado_prev === "aprobada");
  console.log(`\nBalances afectados: ${estado.balances.length} de ${clientes.size} clientes · congelados: ${congelados.length} · con el prevalidador aprobado: ${aprobados.length}`);
  console.log("Congelados (se descongelan, se reasignan y se vuelven a congelar):");
  for (const b of congelados) console.log(`  #${b.id} ${b.nombre_cliente} · ${b.periodo} · v${b.version}${b.es_oficial ? " · oficial" : ""} · ${b.filas} fila(s)`);
  console.log("Aprobaciones del prevalidador que quedarán DESACTUALIZADAS (reaprobar):");
  for (const b of aprobados) console.log(`  #${b.id} ${b.nombre_cliente} · ${b.periodo} · v${b.version}${b.esta_congelado ? " · congelado" : ""}`);
}

async function aplicar() {
  const resultado = await prisma.$transaction(async (tx) => {
    const previo = await leerEstado(tx, false);
    // Candados de cada (cliente, período) de balance afectado, como las acciones del balance.
    const periodos = [...new Set(previo.balances.map((b) => `balance-oficial:${b.cliente_id}:${b.periodo}`))].sort();
    for (const recurso of periodos) await tomarCandadoTransaccion(tx, recurso);
    const estado = await leerEstado(tx, true);

    // Pre-chequeos.
    const codigosPlan = new Set(estado.plan.map((c) => c.code));
    const faltan = [...new Set([...NUEVOS, ...ELIMINAR, RENOMBRAR.fichaDe])].filter((c) => !codigosPlan.has(c));
    if (faltan.length) throw new Error(`Cuentas que deberían existir en el plan y no están: ${faltan.join(", ")}`);
    const bloqueadas = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "cuenta_bloqueada_conciliacion" WHERE "cuenta_6_russell" = ANY($1::text[])`, VIEJOS);
    if (bloqueadas[0].n > 0) throw new Error(`${bloqueadas[0].n} cuenta(s) en firme usan estos códigos: desbloquea esas conciliaciones primero.`);
    const llaves = await llavesFinales(tx);
    const errores = choques(estado, llaves.consolidacion, llaves.reparto, llaves.alertas);
    if (errores.length) throw new Error(`Choques de unicidad:\n${errores.join("\n")}`);

    // Snapshot ANTES de escribir.
    const congelados = estado.balances.filter((b) => b.esta_congelado).map((b) => b.id);
    const conciliacionAfectada = estado.conciliacion.filter((c) => c.cuenta in MAPA);
    const destinoConciliacion = new Map<string, number>();
    for (const c of estado.conciliacion) if (!(c.cuenta in MAPA)) destinoConciliacion.set(`${c.modulo_codigo}|${c.cuenta}`, c.id);
    const conciliacionActualizar: FilaCambio[] = [];
    const conciliacionBorrar: typeof conciliacionAfectada = [];
    for (const c of conciliacionAfectada) {
      const k = `${c.modulo_codigo}|${MAPA[c.cuenta]}`;
      if (destinoConciliacion.has(k)) conciliacionBorrar.push(c);
      else { conciliacionActualizar.push([c.id, c.cuenta]); destinoConciliacion.set(k, c.id); }
    }
    const snapshot: Snapshot = {
      creadoEn: new Date().toISOString(),
      mapa: { ...MAPA },
      tablas: estado.tablas,
      marcas: estado.marcas.map((m) => [m.id, m.cuenta_4!]),
      conciliacion: { actualizadas: conciliacionActualizar, borradas: conciliacionBorrar },
      congelados,
      plan: estado.plan.filter((c) => ELIMINAR.includes(c.code) || c.code === RENOMBRAR.codigo),
    };
    mkdirSync("scripts/.snapshots", { recursive: true });
    const ruta = `scripts/.snapshots/reasignar-cuentas-plan-${snapshot.creadoEn.replace(/[:.]/g, "-")}.json`;
    writeFileSync(ruta, JSON.stringify(snapshot, null, 1));

    // 1) Descongelar (solo la bandera).
    if (congelados.length) await tx.$executeRawUnsafe(`UPDATE "balance_prueba_encabezado" SET "esta_congelado" = false WHERE "id" = ANY($1::int[])`, congelados);

    // 2) Reasignar por PASOS (ver `PASOS`): cada fila se toca una sola vez, por su valor original.
    const actualizadas: Record<string, number> = {};
    for (const t of TABLAS) {
      actualizadas[t.tabla] = 0;
      for (const paso of PASOS) {
        if (!paso.length) continue;
        actualizadas[t.tabla] += await tx.$executeRawUnsafe(
          `UPDATE "${t.tabla}" AS t SET "${t.columna}" = m.nuevo FROM (SELECT unnest($1::text[]) AS viejo, unnest($2::text[]) AS nuevo) m WHERE t."${t.columna}" = m.viejo${t.filtro ? ` AND t.${t.filtro}` : ""}`,
          [...paso], paso.map((v) => MAPA[v]),
        );
      }
    }
    // Marcas: primero las que desocupan un código que otra ocupará.
    const primero = new Set(PASOS[0]);
    const marcasOrdenadas = [...estado.marcas].sort((a, b) =>
      Number(!cuentasDeClaveCruce(a.cuenta_4!).some((p) => primero.has(p))) - Number(!cuentasDeClaveCruce(b.cuenta_4!).some((p) => primero.has(p))));
    for (const m of marcasOrdenadas) await tx.$executeRawUnsafe(`UPDATE "marca_cruce_modulo" SET "cuenta_4" = $1 WHERE "id" = $2`, nuevaClaveMarca(m.cuenta_4!), m.id);
    if (conciliacionBorrar.length) await tx.$executeRawUnsafe(`DELETE FROM "cuentas_conciliacion_modulo" WHERE "id" = ANY($1::int[])`, conciliacionBorrar.map((c) => c.id));
    const conciliacionOrdenada = [...conciliacionActualizar].sort((a, b) => Number(!primero.has(a[1])) - Number(!primero.has(b[1])));
    for (const [id, anterior] of conciliacionOrdenada) {
      await tx.$executeRawUnsafe(`UPDATE "cuentas_conciliacion_modulo" SET "cuenta" = $1, "actualizado_por" = $2, "actualizado_en" = now() WHERE "id" = $3`, MAPA[anterior], ACTOR, id);
    }

    // 3) Volver a congelar (solo la bandera: congelado_por/en, estado y es_oficial no se tocaron).
    if (congelados.length) await tx.$executeRawUnsafe(`UPDATE "balance_prueba_encabezado" SET "esta_congelado" = true WHERE "id" = ANY($1::int[])`, congelados);

    // 4) Plan estándar: 720530 toma la ficha de 720510; salen las seis.
    const fichaDe = estado.plan.find((c) => c.code === RENOMBRAR.fichaDe)!;
    const renombrar = estado.plan.find((c) => c.code === RENOMBRAR.codigo)!;
    const cambios = Object.fromEntries(CAMPOS_FICHA.map((k) => [k, fichaDe[k]]));
    const renombrada = await tx.standardAccount.update({ where: { id: renombrar.id }, data: cambios });
    const eliminadas = estado.plan.filter((c) => ELIMINAR.includes(c.code));
    await tx.standardAccount.deleteMany({ where: { id: { in: eliminadas.map((c) => c.id) } } });
    const sinId = <T extends { id: number }>(c: T) => { const { id: _id, ...resto } = c; void _id; return resto as Prisma.InputJsonValue; };
    await tx.standardAccountLog.createMany({
      data: [
        { accountId: renombrada.id, code: renombrada.code, action: "EDITÓ", user: ACTOR, userId: null, detail: `Editó ${renombrada.code}: pasa de «${renombrar.name}» a «${renombrada.name}» (toma la ficha de ${RENOMBRAR.fichaDe}; «${renombrar.name}» pasa a ${MAPA[RENOMBRAR.codigo]})`, before: sinId(renombrar), after: sinId(renombrada) },
        ...eliminadas.map((c) => ({ accountId: c.id, code: c.code, action: "ELIMINÓ", user: ACTOR, userId: null, detail: `Eliminó la cuenta estándar ${c.code} · ${c.name} (sus homologaciones pasaron a ${MAPA[c.code]})`, before: sinId(c) })),
      ],
    });

    // 5) Verificación: ningún código eliminado queda en uso.
    for (const t of TABLAS) {
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "${t.tabla}" WHERE "${t.columna}" = ANY($1::text[])${t.filtro ? ` AND ${t.filtro}` : ""}`, ELIMINAR);
      if (n > 0) throw new Error(`Quedaron ${n} fila(s) de ${t.tabla} con códigos eliminados.`);
    }
    const marcasResto = (await tx.$queryRawUnsafe<{ cuenta_4: string | null }[]>(`SELECT "cuenta_4" FROM "marca_cruce_modulo" WHERE "dimension" = 'cuenta4'`)).filter((m) => m.cuenta_4 && cuentasDeClaveCruce(m.cuenta_4).some((p) => ELIMINAR.includes(p)));
    if (marcasResto.length) throw new Error("Quedaron marcas con códigos eliminados.");
    const [{ n: concResto }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "cuentas_conciliacion_modulo" WHERE "cuenta" = ANY($1::text[])`, ELIMINAR);
    if (concResto > 0) throw new Error("Quedaron cuentas de conciliación con códigos eliminados.");
    const [{ n: sigueCongelado }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "balance_prueba_encabezado" WHERE "id" = ANY($1::int[]) AND "esta_congelado"`, congelados);
    if (sigueCongelado !== congelados.length) throw new Error("Algún balance no quedó congelado otra vez.");

    // 6) Auditoría: por balance, por congelado y el resumen.
    const porBalance = new Map<number, Map<string, number>>();
    const encabezadoDe = new Map<number, number>();
    const idsDetalle = estado.tablas.balance_prueba_detalle.filas.map(([id]) => id);
    for (const r of await tx.$queryRawUnsafe<{ id: number; encabezado_id: number }[]>(`SELECT "id", "encabezado_id" FROM "balance_prueba_detalle" WHERE "id" = ANY($1::int[])`, idsDetalle)) encabezadoDe.set(r.id, r.encabezado_id);
    for (const [id, anterior] of estado.tablas.balance_prueba_detalle.filas) {
      const enc = encabezadoDe.get(id)!;
      const m = porBalance.get(enc) ?? new Map<string, number>();
      m.set(anterior, (m.get(anterior) ?? 0) + 1);
      porBalance.set(enc, m);
    }
    await tx.auditEntry.createMany({
      data: [
        ...estado.balances.map((b) => ({
          user: ACTOR,
          action: "REASIGNÓ CUENTAS DEL PLAN ESTÁNDAR",
          entity: `${b.nombre_cliente} · ${b.periodo} · v${b.version}`,
          detail: `${[...(porBalance.get(b.id) ?? new Map())].map(([v, n]) => `${v}→${MAPA[v]}: ${n}`).join(" · ")}${b.estado_prev === "aprobada" ? " · la aprobación del prevalidador queda desactualizada" : ""}`,
          clientId: b.cliente_id,
        })),
        ...estado.balances.filter((b) => b.esta_congelado).map((b) => ({
          user: ACTOR,
          action: "DESCONGELÓ Y VOLVIÓ A CONGELAR BALANCE",
          entity: `${b.nombre_cliente} · ${b.periodo} · v${b.version}`,
          detail: "Para reasignar las cuentas del plan estándar eliminadas el 30/Sep/2026; el encabezado no cambió.",
          clientId: b.cliente_id,
        })),
        {
          user: ACTOR,
          action: "REASIGNÓ Y ELIMINÓ CUENTAS DEL PLAN ESTÁNDAR",
          entity: "Plan estándar",
          detail: `${Object.entries(MAPA).map(([v, n]) => `${v}→${n}`).join(" · ")} · ${RENOMBRAR.codigo} queda «${renombrada.name}» · eliminadas ${ELIMINAR.join(", ")} · ${TABLAS.map((t) => `${t.tabla}: ${actualizadas[t.tabla]}`).join(" · ")} · marcas: ${estado.marcas.length} · conciliación: ${conciliacionAfectada.length} · congelados: ${congelados.length} · snapshot ${ruta}`,
        },
      ],
    });
    return { ruta, actualizadas, estado, congelados };
  }, { timeout: 600_000, maxWait: 60_000 });

  console.log(`\nAPLICADO. Snapshot: ${resultado.ruta}`);
  for (const [t, n] of Object.entries(resultado.actualizadas)) console.log(`  ${t}: ${n} fila(s)`);
  console.log(`  marcas: ${resultado.estado.marcas.length} · congelados reasignados: ${resultado.congelados.length}`);
}

async function revertir(ruta: string) {
  const snap = JSON.parse(readFileSync(ruta, "utf8")) as Snapshot;
  console.log(`Revirtiendo ${ruta}`);
  await prisma.$transaction(async (tx) => {
    if (snap.congelados.length) await tx.$executeRawUnsafe(`UPDATE "balance_prueba_encabezado" SET "esta_congelado" = false WHERE "id" = ANY($1::int[])`, snap.congelados);
    // Orden inverso al de `aplicar`: primero vuelve lo que ocupó un código (720530 → 720510) y
    // después lo que lo había desocupado (720569 → 720530).
    const alFinal = new Set(PASOS[0]);
    const enOrden = (filas: FilaCambio[]) => [filas.filter(([, a]) => !alFinal.has(a)), filas.filter(([, a]) => alFinal.has(a))];
    for (const t of TABLAS) {
      for (const filas of enOrden(snap.tablas[t.tabla]?.filas ?? [])) {
        if (!filas.length) continue;
        await tx.$executeRawUnsafe(
          `UPDATE "${t.tabla}" AS t SET "${t.columna}" = v.anterior FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS anterior) v WHERE t."id" = v.id`,
          filas.map(([id]) => id), filas.map(([, a]) => a),
        );
      }
    }
    for (const filas of enOrden(snap.marcas)) for (const [id, anterior] of filas) await tx.$executeRawUnsafe(`UPDATE "marca_cruce_modulo" SET "cuenta_4" = $1 WHERE "id" = $2`, anterior, id);
    for (const filas of enOrden(snap.conciliacion.actualizadas)) for (const [id, anterior] of filas) await tx.$executeRawUnsafe(`UPDATE "cuentas_conciliacion_modulo" SET "cuenta" = $1 WHERE "id" = $2`, anterior, id);
    for (const c of snap.conciliacion.borradas) {
      await tx.$executeRawUnsafe(`INSERT INTO "cuentas_conciliacion_modulo" ("id", "modulo_codigo", "cuenta", "origen", "actualizado_por", "creado_en", "actualizado_en") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        c.id, c.modulo_codigo, c.cuenta, c.origen, c.actualizado_por, new Date(String(c.creado_en)), new Date(String(c.actualizado_en)));
    }
    if (snap.congelados.length) await tx.$executeRawUnsafe(`UPDATE "balance_prueba_encabezado" SET "esta_congelado" = true WHERE "id" = ANY($1::int[])`, snap.congelados);
    for (const c of snap.plan as Prisma.StandardAccountCreateManyInput[]) {
      const existe = await tx.standardAccount.findUnique({ where: { code: c.code } });
      if (existe) await tx.standardAccount.update({ where: { id: existe.id }, data: c });
      else await tx.standardAccount.create({ data: c });
    }
    await tx.auditEntry.create({ data: { user: ACTOR, action: "REVIRTIÓ REASIGNACIÓN DE CUENTAS DEL PLAN ESTÁNDAR", entity: "Plan estándar", detail: `snapshot ${ruta}` } });
  }, { timeout: 600_000, maxWait: 60_000 });
  console.log("Revertido.");
}

(async () => {
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "").hostname} · modo: ${HAY_REVERTIR ? "REVERTIR" : APLICAR ? "APLICAR" : "simulación"}`);
  if (HAY_REVERTIR) { await revertir(RUTA_REVERTIR); return; }
  const estado = await leerEstado(prisma, false);
  console.log("Equivalencias:", Object.entries(MAPA).map(([v, n]) => `${v}→${n}`).join(" · "));
  console.log("Plan:", estado.plan.filter((c) => [...ELIMINAR, RENOMBRAR.codigo, ...NUEVOS].includes(c.code)).map((c) => `${c.code} ${c.name} (${c.nature})`).join(" | "));
  imprimirResumen(estado);
  const llaves = await llavesFinales(prisma);
  const errores = choques(estado, llaves.consolidacion, llaves.reparto, llaves.alertas);
  console.log(errores.length ? `\nCHOQUES:\n${errores.join("\n")}` : "\nSin choques de unicidad.");
  if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Corre con --aplicar para ejecutar."); return; }
  await aplicar();
})()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
