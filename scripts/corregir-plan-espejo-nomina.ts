// ============================================================
// CORRECCIÓN DE DATOS · plan espejo de Nómina (19/Oct/2026)
//
// Acompaña a la rama `nomina-plan-espejo`: desde el 1/Oct/2026 el plan Russell tiene 5105, 5205,
// 7205 y 7305 con la misma numeración (720505 y 730505 pasaron a «Apoyo de sostenimiento –
// aprendices» y 720515 a «Horas extras y recargos»). La memoria de homologación, los balances
// abiertos y la memoria de Nómina siguen con el plan viejo. Este script los pone al día.
//
// Russell NO pidió esta corrección: es una ayuda que Russell revisará. Por eso:
//   · cada cambio queda firmado («Sistema · ajuste del plan espejo») y con su auditoría por cliente;
//   · lo que sale de una regla clara se distingue de lo «sugerido, por revisar»;
//   · solo se re-homologan balances VIGENTES y ABIERTOS (los cerrados y las versiones anteriores
//     quedan listados para los seniors);
//   · todo se puede deshacer con --revertir.
// Decisiones del usuario del 19/Oct/2026: cambio en 51/52 tal cual; la clase 73 que estaba en 730505,
// 720505 o 720515 va a 731005; lo de 51/52/72/73 a su subcuenta exacta (también lo homologado fuera
// del gasto y lo puesto a mano antes del 1/Oct); las subcuentas sin plan dentro de su grupo no se
// tocan; el resto se aplica como «sugerida, por revisar»; FAM y MOTO ZONE según `NOMINA_DECIDIDA`.
//
// Ejecutar SIEMPRE después de desplegar la rama (con el código anterior, la memoria nueva y las
// reglas viejas de Nómina no coinciden):
//   npm run db:nomina:plan-espejo                                    # simulación (solo lectura) + informe
//   npm run db:nomina:plan-espejo -- --comprobar                     # valida con EXPLAIN cada escritura y su reversión, sin ejecutarlas
//   npm run db:nomina:plan-espejo -- --aplicar --confirmo-despliegue # escribe, cliente por cliente, con snapshot
//   npm run db:nomina:plan-espejo -- --revertir <snapshot.json>      # simula la reversión
//   npm run db:nomina:plan-espejo -- --revertir <snapshot.json> --aplicar
//   --informe <carpeta>   dónde dejar el snapshot y el informe para Russell (por defecto scripts/.snapshots)
// ============================================================
import "dotenv/config";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Client, type QueryResultRow } from "pg";
import ExcelJS from "exceljs";
import { escribirLibroMarca, estiloEncabezado } from "../src/lib/export/marca-excel";
import { advisoryKey, LOCK_NAMESPACE } from "../src/lib/candados";
import * as reglas from "../src/lib/modulos/nomina/homologacion";
// Las reglas anteriores (las de master antes de la rama), solo para reconocer lo que salió de ellas.
import * as previas from "./plan-espejo/reglas-anteriores/homologacion";

const APLICAR = process.argv.includes("--aplicar");
const COMPROBAR = process.argv.includes("--comprobar") && !APLICAR;
const CONFIRMO = process.argv.includes("--confirmo-despliegue");
const IDX_REV = process.argv.indexOf("--revertir");
const REVERTIR = IDX_REV >= 0 ? process.argv[IDX_REV + 1] : null;
const IDX_INF = process.argv.indexOf("--informe");
const CARPETA = IDX_INF >= 0 ? process.argv[IDX_INF + 1] : path.join(process.cwd(), "scripts/.snapshots");
const ACTOR = "Sistema · ajuste del plan espejo (2026)";
const PROCEDENCIA = JSON.stringify({ fuente: "configuracion" });
const GRUPOS = ["5105", "5205", "7205", "7305"];
const VIEJAS = new Set(["720505", "730505", "720515"]);
const ESPEJO = new Date("2026-10-01T00:00:00-05:00"); // el plan cambió el 1/Oct/2026 (hora de Colombia)

// Decisiones del usuario sobre conceptos de Nómina sin grupo (19/Oct/2026), por cliente y código.
const NOMINA_DECIDIDA: Record<string, Record<string, string>> = {
  "FAM S.A.S": { DV01: "720506", DV12: "720506", DV20: "720506", DV21: "720506", DV42: "720506", DV64: "720506", DV180: "720524", DX180: "720524" },
  "MOTO ZONE S.A.S.": { "1050": "720506", "1205": "720506", "1092": "720515" },
};

/** Una fila tal como la devuelve `pg`. */
type F = QueryResultRow;
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const r2 = (v: number) => Math.round(v * 100) / 100;

type CambioMemoria = { id: number; clienteId: number; cliente: string; codigo: string; nombre: string; antes: string; despues: string; tipo: "regla" | "sugerida"; motivo: string };
type CambioFila = { id: number; balanceId: number; cuenta8: string; nombre: string; antes: string; despues: string; saldo: number };
type CambioTercero = { id: number; balanceId: number; cuenta8: string; antes: string; despues: string };
type BalancePlan = { id: number; clienteId: number; cliente: string; periodo: string; corte: string; version: string; apertura: string; cerrado: boolean; vigente: boolean; prevalidador: string; filas: CambioFila[]; tercero: CambioTercero[]; motivoOmitido?: string };
type CambioNomina = { id: number; clienteId: number; cliente: string; concepto: string; nombre: string; centro: string; agruparPor: string; cuentaCliente: string; antes: string; despues: string; motivo: string; accion: "actualizar" | "fusionar"; fila: F };
type Plan = { memoria: CambioMemoria[]; balances: BalancePlan[]; nomina: CambioNomina[]; sinDecision: F[]; clientes: Map<number, string> };

async function candado(db: Client, recurso: string) {
  await db.query("SELECT pg_advisory_xact_lock($1, $2)", [LOCK_NAMESPACE, advisoryKey(recurso)]);
}

// ===== Análisis (igual en simulación y al aplicar)
async function planificar(db: Client): Promise<Plan> {
  const q = async (s: string, p: unknown[] = []): Promise<F[]> => (await db.query(s, p)).rows;
  const plan = new Map((await q(`SELECT codigo, nombre FROM cuentas_estandar`)).map((r) => [String(r.codigo), String(r.nombre)]));
  const nombreRussell = (c: string) => plan.get(c) ?? "";
  const clientes = new Map((await q(`SELECT id, nombre FROM clientes`)).map((r) => [Number(r.id), String(r.nombre)]));
  const cedulaNom = (await q(`SELECT cuenta FROM cuentas_conciliacion_modulo WHERE modulo_codigo = 'NOM'`)).map((r) => String(r.cuenta));

  // ---- 1. Memoria de homologación del balance
  const memoria = await q(
    `SELECT id, cliente_id, codigo, nombre, cuenta_6_russell, coalesce(origen_mapeo, '') origen, actualizado_en
       FROM cuentas_cliente
      WHERE cuenta_6_russell IS NOT NULL AND (codigo ~ '^(5105|5205|7205|7305)' OR cuenta_6_russell IN ('720505', '730505', '720515'))`,
  );
  const sugerirPorClase = (codigo: string, nombre: string, prima: boolean): [string, string] => {
    if (codigo.startsWith("72")) {
      if (prima) return ["720536", "clase 72 (mano de obra directa) y es prima"];
      return /SUELD|SALARI|TEMPORAL|JORNAL|BASICO/i.test(nombre) ? ["720506", "clase 72 (mano de obra directa) y el nombre dice sueldos"] : ["720595", "clase 72 (mano de obra directa) fuera de 7205: «Otros»"];
    }
    if (codigo.startsWith("71")) return ["710505", "clase 71: la cuenta del plan para materia prima"];
    if (codigo.startsWith("74")) return ["740505", "clase 74: la cuenta del plan para contratos o proyectos"];
    const g = codigo.slice(0, 4);
    const mismo = [...plan.keys()].filter((c) => c.length === 6 && c.startsWith(g)).sort();
    if (mismo.length) return [mismo[0], `primera cuenta del plan en su grupo ${g}`];
    if (codigo.startsWith("2")) return ["", "cuenta de pasivo rotulada como costo: parece mal clasificada en el PUC del cliente"];
    if (codigo.startsWith("616")) return ["616005", `el plan no tiene el grupo ${g}: costo de enseñanza`];
    if (/^61[7-9]/.test(codigo)) return ["617005", `el plan no tiene el grupo ${g}: costo de otros servicios`];
    if (codigo.startsWith("5101")) return ["510506", `el plan no tiene el grupo ${g}: sueldos`];
    return ["731005", `el plan no tiene el grupo ${g}: costos indirectos o consumos`];
  };
  const cambiosMemoria: CambioMemoria[] = [];
  for (const m of memoria) {
    const codigo = dig(m.codigo);
    const antes = dig(m.cuenta_6_russell);
    if (codigo.length < 6 || !antes) continue;
    const grp = codigo.slice(0, 4), sub = codigo.slice(4, 6), exacta = codigo.slice(0, 6);
    const nombre = String(m.nombre ?? "");
    const manual = String(m.origen).startsWith("manual");
    const base = { id: Number(m.id), clienteId: Number(m.cliente_id), cliente: clientes.get(Number(m.cliente_id)) ?? "", codigo, nombre, antes };
    let despues = "", tipo: "regla" | "sugerida" = "regla", motivo = "";
    if (GRUPOS.includes(grp)) {
      if (plan.has(exacta)) {
        if (antes === exacta) continue;
        despues = exacta;
        if ((grp === "7205" || grp === "7305") && sub === "06" && (antes === "720505" || antes === "730505")) motivo = `Sueldos en ${antes}, que desde el 1/Oct es «Apoyo de sostenimiento – aprendices»`;
        else if ((grp === "7205" || grp === "7305") && sub === "36" && antes === "720515") motivo = "Prima en 720515, que desde el 1/Oct es «Horas extras y recargos»";
        else if ((grp === "7205" || grp === "7305") && sub === "30" && antes === "720569") motivo = "Cesantías en 720569 «Aportes EPS»";
        else if (!GRUPOS.includes(antes.slice(0, 4))) motivo = `Gasto de personal homologado fuera del gasto (${antes} «${nombreRussell(antes)}»)`;
        else motivo = "Desde el 1/Oct el plan tiene su subcuenta exacta (antes caía en «Sueldos» u «Otros»)";
        if (manual) {
          if (new Date(m.actualizado_en) < ESPEJO) motivo += "; la había puesto alguien a mano antes de que existiera esa subcuenta";
          else { tipo = "sugerida"; motivo = "Puesta a mano con el plan nuevo; se sugiere su subcuenta exacta"; }
        }
      } else {
        if (antes.slice(0, 4) === grp) continue; // decidido: dentro de su grupo se queda como está
        despues = plan.has(`${grp}95`) ? `${grp}95` : "";
        tipo = "sugerida";
        motivo = `La subcuenta ${sub} no existe en el plan y estaba en otro grupo; se sugiere «Otros» de su grupo`;
      }
    } else if (VIEJAS.has(antes)) {
      if (codigo.startsWith("73")) {
        despues = "731005";
        motivo = `Costo indirecto en ${antes}, que desde el 1/Oct es «${nombreRussell(antes)}»; va a la cuenta del plan para costos indirectos`;
      } else {
        const [s, porque] = sugerirPorClase(codigo, nombre, antes === "720515" || /PRIMA/i.test(nombre));
        despues = s;
        tipo = "sugerida";
        motivo = `Estaba en ${antes}, que cambió de nombre el 1/Oct; ${porque}`;
      }
    } else continue;
    if (!despues || despues === antes || !plan.has(despues)) continue; // sin cuenta del plan que sugerir: queda para revisión manual
    cambiosMemoria.push({ ...base, despues, tipo, motivo });
  }
  const cambioPorCodigo = new Map<string, CambioMemoria>(cambiosMemoria.map((c) => [`${c.clienteId}|${c.codigo}`, c]));
  // Toda la memoria (no solo la del gasto de personal): decide si una cuenta tiene memoria propia.
  const memoriaPorCodigo = new Map<string, string>((await q(`SELECT cliente_id, codigo, cuenta_6_russell FROM cuentas_cliente WHERE cuenta_6_russell IS NOT NULL`)).map((m) => [`${m.cliente_id}|${dig(m.codigo)}`, dig(m.cuenta_6_russell)]));

  // ---- 2. Balances: vigentes (más reciente de cliente + corte + período + apertura)
  const enc = await q(`SELECT id, cliente_id, periodo, periodo_fin, apertura_balance, version, esta_congelado, creado_en, lote_id FROM balance_prueba_encabezado`);
  const lineas = new Map<string, F>();
  for (const e of enc) {
    const k = `${e.cliente_id}|${new Date(e.periodo_fin).toISOString().slice(0, 10)}|${e.periodo}|${e.apertura_balance ?? ""}`;
    const v = lineas.get(k);
    if (!v || e.creado_en > v.creado_en || (+e.creado_en === +v.creado_en && e.id > v.id)) lineas.set(k, e);
  }
  const vigentes = new Set([...lineas.values()].map((e) => Number(e.id)));
  const encPor = new Map(enc.map((e) => [Number(e.id), e]));
  const ultimaRevision = new Map((await q(`SELECT DISTINCT ON (balance_id) balance_id, estado FROM prevalidador_revisiones_balance ORDER BY balance_id, creado_en DESC, id DESC`)).map((r) => [Number(r.balance_id), String(r.estado)]));
  // En firme: cierres de cualquier módulo cuyo alcance toque la cuenta vieja o la nueva, en el mes de corte del balance.
  const cierres = await q(`SELECT cliente_id, modulo_codigo, periodo, cuentas_russell_6 FROM conciliacion_modulo_cierre WHERE estado = 'firme'`);
  const bloqueadas = new Set((await q(`SELECT c.cliente_id, c.cuenta FROM cuenta_bloqueada_conciliacion c JOIN conciliacion_modulo_cierre m ON m.id = c.cierre_id AND m.estado = 'firme'`)).map((r) => `${r.cliente_id}|${dig(r.cuenta)}`));
  const enFirme = (clienteId: number, corte: string, cuentas: string[]) =>
    cierres.some((c) => Number(c.cliente_id) === clienteId && c.periodo === corte.slice(0, 7) && (Array.isArray(c.cuentas_russell_6) ? c.cuentas_russell_6 : []).some((p: string) => cuentas.some((x) => x.startsWith(p))));

  const detalle = await q(
    `SELECT id, encabezado_id, cuenta_8, nombre_cuenta, cuenta_6_russell, saldo_final FROM balance_prueba_detalle
      WHERE cuenta_8 ~ '^(5105|5205|7205|7305)' OR cuenta_6_russell IN ('720505', '730505', '720515')`,
  );
  const balances = new Map<number, BalancePlan>();
  for (const d of detalle) {
    const e = encPor.get(Number(d.encabezado_id));
    if (!e) continue;
    const clienteId = Number(e.cliente_id);
    const codigo = dig(d.cuenta_8);
    const antes = dig(d.cuenta_6_russell);
    // La fila sigue a la memoria de SU código o, si no tiene, a la de su grupo de 6.
    const propio = cambioPorCodigo.get(`${clienteId}|${codigo}`);
    const tienePropia = memoriaPorCodigo.has(`${clienteId}|${codigo}`);
    const cambio = propio ?? (!tienePropia ? cambioPorCodigo.get(`${clienteId}|${codigo.slice(0, 6)}`) : undefined);
    if (!cambio || antes !== cambio.antes) continue; // solo se propaga lo que cambió en la memoria
    const corte = new Date(e.periodo_fin).toISOString().slice(0, 10);
    const b = balances.get(Number(e.id)) ?? balances.set(Number(e.id), {
      id: Number(e.id), clienteId, cliente: clientes.get(clienteId) ?? "", periodo: e.periodo, corte, version: e.version, apertura: e.apertura_balance ?? "",
      cerrado: !!e.esta_congelado, vigente: vigentes.has(Number(e.id)), prevalidador: ultimaRevision.get(Number(e.id)) ?? "sin revisión", filas: [], tercero: [],
    }).get(Number(e.id))!;
    b.filas.push({ id: Number(d.id), balanceId: b.id, cuenta8: codigo, nombre: d.nombre_cuenta, antes, despues: cambio.despues, saldo: r2(Number(d.saldo_final ?? 0)) });
  }
  for (const b of balances.values()) {
    if (!b.vigente) b.motivoOmitido = "Versión anterior: no alimenta ningún cruce";
    else if (b.cerrado) b.motivoOmitido = "Balance cerrado: lo decide un senior (abrir, re-homologar, aprobar y cerrar)";
    else if (b.filas.some((f) => bloqueadas.has(`${b.clienteId}|${f.cuenta8}`)) || enFirme(b.clienteId, b.corte, b.filas.flatMap((f) => [f.antes, f.despues]))) b.motivoOmitido = "Tiene cuentas en firme en una conciliación del corte";
  }
  // Detalle por tercero ligado (por lote) de los balances que sí se ajustan.
  const aAjustar = [...balances.values()].filter((b) => !b.motivoOmitido);
  const lotes = aAjustar.map((b) => encPor.get(b.id)?.lote_id).filter(Boolean);
  if (lotes.length) {
    const ter = await q(
      `SELECT td.id, te.lote_id, td.cuenta_8, td.cuenta_6_russell FROM balance_tercero_detalle td JOIN balance_tercero_encabezado te ON te.id = td.encabezado_id
        WHERE te.lote_id = ANY($1) AND (td.cuenta_8 ~ '^(5105|5205|7205|7305)' OR td.cuenta_6_russell IN ('720505', '730505', '720515'))`,
      [lotes],
    );
    const porLote = new Map<string, F[]>();
    for (const t of ter) (porLote.get(String(t.lote_id)) ?? porLote.set(String(t.lote_id), []).get(String(t.lote_id))!).push(t);
    for (const b of aAjustar) {
      const destino = new Map(b.filas.map((f) => [f.cuenta8, f]));
      for (const t of porLote.get(String(encPor.get(b.id)?.lote_id)) ?? []) {
        const f = destino.get(dig(t.cuenta_8));
        if (f && dig(t.cuenta_6_russell) === f.antes) b.tercero.push({ id: Number(t.id), balanceId: b.id, cuenta8: f.cuenta8, antes: f.antes, despues: f.despues });
      }
    }
  }

  // ---- 3. Memoria de Nómina
  const idsDecididos = new Map<number, Record<string, string>>();
  for (const [nombre, mapa] of Object.entries(NOMINA_DECIDIDA)) {
    const id = [...clientes].find(([, n]) => n === nombre)?.[0];
    if (id == null) throw new Error(`No existe el cliente «${nombre}» de las decisiones de Nómina.`);
    idsDecididos.set(id, mapa);
  }
  const cons = await q(`SELECT * FROM consolidacion_modulo_cliente WHERE modulo_codigo = 'NOM'`);
  const nomClientes = [...new Set(cons.map((c) => Number(c.cliente_id)))];
  const memNom = await q(`SELECT cliente_id, codigo, cuenta_6_russell FROM cuentas_cliente WHERE cliente_id = ANY($1) AND cuenta_6_russell IS NOT NULL`, [nomClientes]);
  const mapeoCorregido = new Map<number, Map<string, string>>();
  const mapeoActual = new Map<number, Map<string, string>>();
  for (const m of memNom) {
    const id = Number(m.cliente_id);
    const k = `${id}|${dig(m.codigo)}`;
    (mapeoCorregido.get(id) ?? mapeoCorregido.set(id, new Map()).get(id)!).set(dig(m.codigo), cambioPorCodigo.get(k)?.despues ?? dig(m.cuenta_6_russell));
    (mapeoActual.get(id) ?? mapeoActual.set(id, new Map()).get(id)!).set(dig(m.codigo), dig(m.cuenta_6_russell));
  }
  const llave = (c: F, cuenta6: string) => [c.cliente_id, c.agrupar_por, c.clasificador, c.agrupador, String(cuenta6).slice(0, 4), cuenta6, c.cuenta_cliente].join("|");
  const existentes = new Set(cons.map((c) => llave(c, c.cuenta_6)));
  const cierresNom = new Set(cierres.filter((c) => c.modulo_codigo === "NOM").map((c) => Number(c.cliente_id)));
  const nomina: CambioNomina[] = [];
  const sinDecision: F[] = [];
  for (const c of cons) {
    const clienteId = Number(c.cliente_id);
    if (cierresNom.has(clienteId)) continue;
    const antes = dig(c.cuenta_6);
    const clase = antes.slice(0, 2);
    let despues: string | null = null;
    let motivo = "";
    const decidido = idsDecididos.get(clienteId)?.[String(c.clasificador).trim()];
    if (decidido && VIEJAS.has(antes)) { despues = decidido; motivo = "Decisión del 19/Oct según el nombre del concepto en su archivo de nómina"; }
    const cc = dig(c.cuenta_cliente);
    if (!despues && cc.length >= 6 && !reglas.esCuentaComodin(c.cuenta_cliente)) {
      const conPrevias = previas.resolverCuentaClienteARussell(c.cuenta_cliente, mapeoActual.get(clienteId))?.cuenta6 ?? null;
      const conNuevas = reglas.resolverCuentaClienteARussell(c.cuenta_cliente, mapeoCorregido.get(clienteId), cedulaNom)?.cuenta6 ?? null;
      // Solo si la cuenta guardada salió de la regla anterior (o quedó en una cuenta que cambió de nombre).
      if (antes && conNuevas && conNuevas !== antes && (antes === conPrevias || VIEJAS.has(antes))) { despues = conNuevas; motivo = `La cuenta del cliente ${cc} va a ${conNuevas} con el plan nuevo`; }
    }
    if (!despues && c.grupo && reglas.esClaseNomina(clase)) {
      const anterior = previas.cuentaPorGrupo(c.grupo, clase);
      const nueva = reglas.cuentaPorGrupo(c.grupo, clase);
      if (antes === anterior && nueva && nueva !== anterior && plan.has(nueva)) { despues = nueva; motivo = `Grupo «${c.grupo}»: va a su subcuenta del plan`; }
    }
    if (!despues && VIEJAS.has(antes)) {
      const esPrima = c.grupo === "prima" || /^\s*PS\s*$/i.test(String(c.clasificador)) || /\bPRIMA\b/i.test(`${c.clasificador} ${c.descripcion ?? ""}`);
      if (antes === "720515" && esPrima) { despues = "720536"; motivo = "Prima en 720515, que desde el 1/Oct es «Horas extras y recargos»"; }
      else if ((antes === "720505" || antes === "730505") && c.grupo === "sueldos") { despues = antes === "720505" ? "720506" : "730506"; motivo = `Sueldos en ${antes}, que desde el 1/Oct es «Apoyo de sostenimiento – aprendices»`; }
      else if (!(antes === "720515" && (c.grupo === "horas_extras" || !c.grupo))) sinDecision.push({ cliente: clientes.get(clienteId), concepto: c.clasificador, nombre: c.descripcion, antes });
    }
    if (!despues || despues === antes) continue;
    const accion = existentes.has(llave(c, despues)) ? "fusionar" : "actualizar";
    nomina.push({ id: Number(c.id), clienteId, cliente: clientes.get(clienteId) ?? "", concepto: c.clasificador, nombre: c.descripcion ?? "", centro: c.agrupador || "(todos)", agruparPor: c.agrupar_por, cuentaCliente: cc, antes, despues, motivo, accion, fila: c });
    if (accion === "actualizar") existentes.add(llave(c, despues));
  }
  return { memoria: cambiosMemoria, balances: [...balances.values()], nomina, sinDecision, clientes };
}

// ===== Informe para Russell
async function informe(p: Plan, modo: "simulacion" | "aplicado", archivo: string) {
  const wb = new ExcelJS.Workbook();
  const hoja =(titulo: string, cols: [string, string, number][], filas: F[]) => {
    const ws = wb.addWorksheet(titulo, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([key, header, width]) => ({ key, header, width }));
    ws.getRow(1).eachCell((c) => estiloEncabezado(c));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    for (const f of filas) ws.addRow(f);
    for (const [key] of cols) if (/saldo/i.test(key)) ws.getColumn(key).numFmt = "#,##0.00;-#,##0.00";
    return ws;
  };
  const verbo = modo === "aplicado" ? "se ajustó" : "se ajustaría";
  const leame = wb.addWorksheet("Léame");
  leame.getColumn(1).width = 120;
  [
    "Ajuste de la homologación al plan espejo de Nómina",
    "",
    "Desde el 1 de octubre de 2026 el plan Russell tiene 5105, 5205, 7205 y 7305 con la misma numeración. Ese día 720505 y 730505 pasaron a «Apoyo de sostenimiento – aprendices» y 720515 a «Horas extras y recargos».",
    `Este archivo lista, cliente por cliente, lo que ${verbo} para que la homologación siga ese plan. Es una ayuda: cada cambio se puede revisar y corregir en la aplicación.`,
    "",
    "Cómo revisarlo",
    "· «Memoria del cliente»: la columna «Tipo» separa lo que sale de una regla clara del plan («Regla del plan») de lo que se sugirió («Sugerida, por revisar»). Se corrige en Mapeo cuentas cliente; cada cuenta ajustada aparece con el autor «Sistema · ajuste del plan espejo».",
    "· «Balances ajustados»: solo balances vigentes que estaban abiertos. Su prevalidador queda por volver a aprobar.",
    "· «Balances cerrados por revisar»: no se tocaron. Para ajustarlos, un senior abre el balance, usa «Re-homologar», vuelve a aprobar el prevalidador y lo cierra.",
    "· «Conceptos de Nómina»: la cuenta Russell de cada concepto en el Consolidado.",
    "",
    "El total de cada balance no cambia: cambia en qué cuenta Russell queda cada saldo.",
  ].forEach((t, i) => { const c = leame.getCell(`A${i + 1}`); c.value = t; c.alignment = { wrapText: true }; if (i === 0 || t === "Cómo revisarlo") c.font = { bold: true, size: i === 0 ? 14 : 12 }; });

  const ajustados = p.balances.filter((b) => !b.motivoOmitido);
  const ids = [...new Set([...p.memoria.map((m) => m.clienteId), ...p.balances.map((b) => b.clienteId), ...p.nomina.map((n) => n.clienteId)])];
  hoja("Resumen por cliente", [
    ["cliente", "Cliente", 44], ["regla", "Memoria: regla del plan", 14], ["sugerida", "Memoria: sugerida, por revisar", 16], ["balances", "Balances ajustados", 12],
    ["filas", "Filas de balance ajustadas", 14], ["saldo", "Saldo final que cambia de cuenta", 22], ["cerrados", "Balances cerrados por revisar", 16], ["nomina", "Conceptos de Nómina ajustados", 14],
  ], ids.map((id) => {
    const bs = ajustados.filter((b) => b.clienteId === id);
    return {
      cliente: p.clientes.get(id), regla: p.memoria.filter((m) => m.clienteId === id && m.tipo === "regla").length, sugerida: p.memoria.filter((m) => m.clienteId === id && m.tipo === "sugerida").length,
      balances: bs.length, filas: bs.reduce((s, b) => s + b.filas.length, 0), saldo: r2(bs.reduce((s, b) => s + b.filas.reduce((x, f) => x + f.saldo, 0), 0)),
      cerrados: p.balances.filter((b) => b.clienteId === id && b.vigente && b.cerrado).length, nomina: p.nomina.filter((n) => n.clienteId === id).length,
    };
  }).sort((a, b) => String(a.cliente).localeCompare(String(b.cliente))));
  hoja("Memoria del cliente", [
    ["cliente", "Cliente", 38], ["codigo", "Cuenta del cliente", 16], ["nombre", "Nombre", 38], ["antes", "Russell antes", 11], ["despues", "Russell después", 12],
    ["tipo", "Tipo", 22], ["motivo", "Motivo", 80],
  ], p.memoria.map((m) => ({ ...m, tipo: m.tipo === "regla" ? "Regla del plan" : "Sugerida, por revisar" })).sort((a, b) => a.cliente.localeCompare(b.cliente) || a.codigo.localeCompare(b.codigo)));
  hoja("Balances ajustados", [
    ["id", "Balance", 9], ["cliente", "Cliente", 38], ["periodo", "Período", 26], ["corte", "Corte", 11], ["version", "Versión", 8], ["filas", "Filas ajustadas", 10], ["tercero", "Filas por tercero ajustadas", 12],
    ["saldo", "Saldo final que cambia de cuenta", 22], ["prevalidador", "Prevalidador antes", 14],
  ], ajustados.map((b) => ({ ...b, filas: b.filas.length, tercero: b.tercero.length, saldo: r2(b.filas.reduce((s, f) => s + f.saldo, 0)) })));
  hoja("Filas de balance", [
    ["balanceId", "Balance", 9], ["cliente", "Cliente", 34], ["cuenta8", "Cuenta del cliente", 16], ["nombre", "Nombre", 36], ["antes", "Russell antes", 11], ["despues", "Russell después", 12], ["saldo", "Saldo final", 18],
  ], ajustados.flatMap((b) => b.filas.map((f) => ({ ...f, cliente: b.cliente }))));
  hoja("Balances cerrados por revisar", [
    ["id", "Balance", 9], ["cliente", "Cliente", 38], ["periodo", "Período", 26], ["corte", "Corte", 11], ["version", "Versión", 8], ["filas", "Filas que cambiarían", 12],
    ["saldo", "Saldo final que cambiaría de cuenta", 22], ["motivo", "Por qué no se tocó", 60],
  ], p.balances.filter((b) => b.motivoOmitido && b.vigente).map((b) => ({ ...b, filas: b.filas.length, saldo: r2(b.filas.reduce((s, f) => s + f.saldo, 0)), motivo: b.motivoOmitido })));
  hoja("Conceptos de Nómina", [
    ["cliente", "Cliente", 34], ["concepto", "Concepto", 12], ["nombre", "Nombre", 32], ["centro", "Centro de costo", 14], ["antes", "Russell antes", 11], ["despues", "Russell después", 12], ["motivo", "Motivo", 70],
  ], p.nomina.map((n) => ({ ...n, motivo: n.accion === "fusionar" ? `${n.motivo} (ya había una fila igual con esa cuenta: se unen)` : n.motivo })));
  mkdirSync(path.dirname(archivo), { recursive: true });
  // Informe para Russell: Arial y paleta del Manual de Marca, como las exportaciones de la plataforma.
  writeFileSync(archivo, await escribirLibroMarca(wb));
}

// ===== Aplicar
async function aplicar(db: Client, p: Plan, sello: string, ensayo = false): Promise<string> {
  const snapshot: F = { creado: new Date().toISOString(), actor: ACTOR, ...(ensayo ? { comprobacion: true } : {}), clientes: [] as F[] };
  const ruta = path.join(CARPETA, `plan-espejo-nomina-${sello}${ensayo ? "-comprobacion" : ""}.json`);
  mkdirSync(CARPETA, { recursive: true });
  const ids = [...new Set([...p.memoria.map((m) => m.clienteId), ...p.balances.filter((b) => !b.motivoOmitido).map((b) => b.clienteId), ...p.nomina.map((n) => n.clienteId)])].sort((a, b) => a - b);
  let ok = 0;
  const fallidos: string[] = [];
  // En la comprobación cada escritura se valida con EXPLAIN (sin ejecutarla) dentro de la transacción
  // de solo lectura del principal: ni candados, ni COMMIT, ni conteos.
  const w = (sql: string, params: unknown[]) => (ensayo ? db.query(`EXPLAIN ${sql}`, params).then(() => ({ rowCount: -1 })) : db.query(sql, params));
  for (const clienteId of ids) {
    const mem = p.memoria.filter((m) => m.clienteId === clienteId);
    const bals = p.balances.filter((b) => b.clienteId === clienteId && !b.motivoOmitido);
    const nom = p.nomina.filter((n) => n.clienteId === clienteId);
    const cliente = p.clientes.get(clienteId) ?? String(clienteId);
    try {
      if (!ensayo) {
        await db.query("BEGIN");
        await candado(db, `balance-puc:${clienteId}`);
      }
      const exigir = (r: { rowCount: number | null }, n: number, que: string) => { if (r.rowCount !== -1 && r.rowCount !== n) throw new Error(`${que}: ${r.rowCount} de ${n} filas seguían como se leyeron`); };
      if (mem.length) {
        exigir(await w(
          `UPDATE cuentas_cliente c SET cuenta_6_russell = v.despues, procedencia_mapeo = $4::jsonb, actualizado_por = $5, actualizado_en = now()
             FROM unnest($1::int[], $2::text[], $3::text[]) v(id, antes, despues) WHERE c.id = v.id AND c.cuenta_6_russell = v.antes`,
          [mem.map((m) => m.id), mem.map((m) => m.antes), mem.map((m) => m.despues), PROCEDENCIA, ACTOR],
        ), mem.length, "Memoria del cliente");
      }
      for (const b of bals.sort((x, y) => String(x.periodo).localeCompare(String(y.periodo)))) {
        if (ensayo) await db.query(`EXPLAIN SELECT esta_congelado FROM balance_prueba_encabezado WHERE id = $1 FOR UPDATE`, [b.id]);
        else {
          await candado(db, `balance-oficial:${clienteId}:${b.periodo}`);
          const e = (await db.query(`SELECT esta_congelado FROM balance_prueba_encabezado WHERE id = $1 FOR UPDATE`, [b.id])).rows[0];
          if (!e || e.esta_congelado) throw new Error(`El balance #${b.id} se cerró o se eliminó mientras corría el script`);
        }
        exigir(await w(
          `UPDATE balance_prueba_detalle d SET cuenta_6_russell = v.despues FROM unnest($1::int[], $2::text[], $3::text[]) v(id, antes, despues) WHERE d.id = v.id AND d.cuenta_6_russell = v.antes`,
          [b.filas.map((f) => f.id), b.filas.map((f) => f.antes), b.filas.map((f) => f.despues)],
        ), b.filas.length, `Balance #${b.id}`);
        if (b.tercero.length) {
          exigir(await w(
            `UPDATE balance_tercero_detalle d SET cuenta_6_russell = v.despues FROM unnest($1::int[], $2::text[], $3::text[]) v(id, antes, despues) WHERE d.id = v.id AND d.cuenta_6_russell = v.antes`,
            [b.tercero.map((t) => t.id), b.tercero.map((t) => t.antes), b.tercero.map((t) => t.despues)],
          ), b.tercero.length, `Detalle por tercero del balance #${b.id}`);
        }
      }
      const act = nom.filter((n) => n.accion === "actualizar");
      const fus = nom.filter((n) => n.accion === "fusionar");
      if (act.length) {
        exigir(await w(
          `UPDATE consolidacion_modulo_cliente c SET cuenta_6 = v.despues, cuenta_4 = left(v.despues, 4), actualizado_por = $4, actualizado_en = now()
             FROM unnest($1::int[], $2::text[], $3::text[]) v(id, antes, despues) WHERE c.id = v.id AND c.cuenta_6 = v.antes`,
          [act.map((n) => n.id), act.map((n) => n.antes), act.map((n) => n.despues), ACTOR],
        ), act.length, "Memoria de Nómina");
      }
      if (fus.length) {
        exigir(await w(`DELETE FROM consolidacion_modulo_cliente WHERE id = ANY($1::int[]) AND cuenta_6 = ANY($2::text[])`, [fus.map((n) => n.id), fus.map((n) => n.antes)]), fus.length, "Memoria de Nómina (duplicadas)");
      }
      const detalle = `Ajuste al plan espejo de Nómina (5105/5205/7205/7305, 1/Oct/2026): ${mem.length} cuenta(s) de la memoria (${mem.filter((m) => m.tipo === "sugerida").length} sugeridas, por revisar), `
        + `${bals.length} balance(s) abierto(s) con ${bals.reduce((s, b) => s + b.filas.length, 0)} fila(s), ${nom.length} concepto(s) de Nómina. Ayuda de Xentria, no solicitada por Russell; reversible.`;
      await w(`INSERT INTO registros_auditoria (usuario, accion, entidad, detalle, cliente_id, creado_en) VALUES ($1, $2, $3, $4, $5, now())`, [ACTOR, "AJUSTÓ HOMOLOGACIÓN AL PLAN ESPEJO", cliente, detalle, clienteId]);
      if (!ensayo) await db.query("COMMIT");
      snapshot.clientes.push({
        clienteId, cliente,
        memoria: mem.map((m) => ({ id: m.id, antes: m.antes, despues: m.despues })),
        detalle: bals.flatMap((b) => b.filas.map((f) => ({ id: f.id, antes: f.antes, despues: f.despues }))),
        tercero: bals.flatMap((b) => b.tercero.map((t) => ({ id: t.id, antes: t.antes, despues: t.despues }))),
        nomina: act.map((n) => ({ id: n.id, antes: n.antes, despues: n.despues })),
        nominaBorradas: fus.map((n) => n.fila),
      });
      writeFileSync(ruta, JSON.stringify(snapshot, null, 1));
      ok++;
    } catch (e) {
      if (!ensayo) await db.query("ROLLBACK").catch(() => {});
      fallidos.push(`${cliente}: ${e instanceof Error ? e.message : e}`);
      if (ensayo) throw e; // en la comprobación, una sentencia inválida detiene todo
    }
  }
  console.log(ensayo ? `\nCOMPROBADAS las escrituras de ${ok} de ${ids.length} clientes (EXPLAIN, sin ejecutar). Snapshot de prueba: ${ruta}` : `\nAPLICADO en ${ok} de ${ids.length} clientes. Snapshot: ${ruta}`);
  if (fallidos.length) console.log("No se aplicó (sin cambios en esos clientes):\n  " + fallidos.join("\n  "));
  return ruta;
}

// ===== Revertir
async function revertir(db: Client, ruta: string, ensayo = false) {
  const s = JSON.parse(readFileSync(ruta, "utf8"));
  console.log(`Snapshot: ${ruta} · ${s.clientes.length} clientes · ${ensayo ? "comprobación de la reversión (EXPLAIN)" : APLICAR ? "REVERTIR" : "simulación de la reversión"}`);
  const w = (sql: string, params: unknown[]) => (ensayo ? db.query(`EXPLAIN ${sql}`, params) : db.query(sql, params));
  let conflictos = 0;
  for (const c of s.clientes) {
    const chequeo = async (tabla: string, col: string, xs: F[]) => {
      if (!xs.length) return 0;
      const r = await db.query(`SELECT count(*)::int n FROM ${tabla} t JOIN unnest($1::int[], $2::text[]) v(id, despues) ON t.id = v.id AND t.${col} = v.despues`, [xs.map((x) => x.id), xs.map((x) => x.despues)]);
      return xs.length - r.rows[0].n;
    };
    const cambiados = (await chequeo("cuentas_cliente", "cuenta_6_russell", c.memoria)) + (await chequeo("balance_prueba_detalle", "cuenta_6_russell", c.detalle))
      + (await chequeo("balance_tercero_detalle", "cuenta_6_russell", c.tercero)) + (await chequeo("consolidacion_modulo_cliente", "cuenta_6", c.nomina));
    conflictos += cambiados;
    if (!ensayo) console.log(`  ${c.cliente}: ${c.memoria.length} memoria · ${c.detalle.length} balance · ${c.tercero.length} tercero · ${c.nomina.length} Nómina · ${c.nominaBorradas.length} a recrear${cambiados ? ` · ${cambiados} cambiaron después y NO se revierten` : ""}`);
    if (!APLICAR && !ensayo) continue;
    if (!ensayo) await db.query("BEGIN");
    try {
      if (!ensayo) await candado(db, `balance-puc:${c.clienteId}`);
      const volver = async (tabla: string, col: string, xs: F[], extra = "") => {
        if (!xs.length) return;
        await w(`UPDATE ${tabla} t SET ${col} = v.antes${extra} FROM unnest($1::int[], $2::text[], $3::text[]) v(id, antes, despues) WHERE t.id = v.id AND t.${col} = v.despues`, [xs.map((x) => x.id), xs.map((x) => x.antes), xs.map((x) => x.despues)]);
      };
      await volver("cuentas_cliente", "cuenta_6_russell", c.memoria);
      await volver("balance_prueba_detalle", "cuenta_6_russell", c.detalle);
      await volver("balance_tercero_detalle", "cuenta_6_russell", c.tercero);
      await volver("consolidacion_modulo_cliente", "cuenta_6", c.nomina, ", cuenta_4 = left(v.antes, 4)");
      for (const f of c.nominaBorradas) {
        const cols = Object.keys(f);
        await w(`INSERT INTO consolidacion_modulo_cliente (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT DO NOTHING`, cols.map((k) => f[k]));
      }
      await w(`INSERT INTO registros_auditoria (usuario, accion, entidad, detalle, cliente_id, creado_en) VALUES ($1, $2, $3, $4, $5, now())`, [ACTOR, "REVIRTIÓ AJUSTE AL PLAN ESPEJO", c.cliente, `snapshot ${path.basename(ruta)}`, c.clienteId]);
      if (!ensayo) await db.query("COMMIT");
    } catch (e) {
      if (ensayo) throw e;
      await db.query("ROLLBACK");
      console.log(`    ✖ ${c.cliente}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (ensayo) console.log(`COMPROBADA la reversión de ${s.clientes.length} clientes (EXPLAIN, sin ejecutar). Filas que hoy no tienen el valor del ajuste: ${conflictos} (esperado: todas, porque no se aplicó).`);
  else console.log(APLICAR ? "\nREVERTIDO (lo que no cambió después)." : `\nSimulación: no se escribió nada. ${conflictos} fila(s) cambiaron después del ajuste y se dejarían como están.`);
}

// ===== Principal
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const host = new URL(process.env.DATABASE_URL!).hostname;
  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  try {
    console.log(`BD: ${host} · ${REVERTIR ? "revertir" : APLICAR ? "APLICAR" : "simulación (solo lectura)"}`);
    if (REVERTIR) {
      if (!APLICAR) await db.query("BEGIN READ ONLY");
      await revertir(db, REVERTIR);
      if (!APLICAR) await db.query("ROLLBACK");
      return;
    }
    if (APLICAR && !CONFIRMO) throw new Error("Falta --confirmo-despliegue: este ajuste se corre solo con la rama nomina-plan-espejo ya desplegada.");
    if (COMPROBAR) {
      // Todas las sentencias de --aplicar y de --revertir con los datos reales, validadas con EXPLAIN
      // dentro de una transacción de solo lectura: nada se ejecuta ni se escribe.
      await db.query("BEGIN READ ONLY");
      try {
        const p = await planificar(db);
        const ruta = await aplicar(db, p, sello, true);
        await revertir(db, ruta, true);
      } finally {
        await db.query("ROLLBACK");
      }
      return;
    }
    if (!APLICAR) await db.query("BEGIN READ ONLY");
    const p = await planificar(db);
    if (!APLICAR) await db.query("ROLLBACK");
    const ajustados = p.balances.filter((b) => !b.motivoOmitido);
    const cuenta = (xs: F[], f: (x: F) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
    console.log("Memoria del cliente:", p.memoria.length, cuenta(p.memoria, (m) => m.tipo), "· clientes", new Set(p.memoria.map((m) => m.clienteId)).size);
    console.log("Balances que se ajustan:", ajustados.length, "· filas", ajustados.reduce((s, b) => s + b.filas.length, 0), "· por tercero", ajustados.reduce((s, b) => s + b.tercero.length, 0),
      "· saldo $" + Math.round(ajustados.reduce((s, b) => s + b.filas.reduce((x, f) => x + f.saldo, 0), 0)).toLocaleString("es-CO"),
      "· con prevalidador aprobado", ajustados.filter((b) => b.prevalidador === "aprobada").length);
    console.log("Balances que no se tocan:", cuenta(p.balances.filter((b) => b.motivoOmitido), (b) => b.motivoOmitido));
    console.log("Conceptos de Nómina:", p.nomina.length, cuenta(p.nomina, (n) => `${n.cliente} · ${n.accion}`));
    if (p.sinDecision.length) console.log("Nómina sin decisión (no se tocan):", p.sinDecision.map((s) => `${s.cliente} ${s.concepto} (${s.antes})`).join(" · "));
    const archivo = path.join(CARPETA, `Ajuste plan espejo Nomina - ${APLICAR ? "aplicado" : "simulacion"} (${sello.slice(0, 10)}).xlsx`);
    await informe(p, APLICAR ? "aplicado" : "simulacion", archivo);
    console.log("Informe para Russell:", archivo);
    if (!APLICAR) { console.log("\nSimulación: no se escribió nada. Con la rama desplegada: --aplicar --confirmo-despliegue"); return; }
    await aplicar(db, p, sello);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error("✖", e instanceof Error ? e.message : e); process.exitCode = 1; });
