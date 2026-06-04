import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding…");

  // ---- Limpieza idempotente ----
  await prisma.dianPeriod.deleteMany();
  await prisma.dianForm.deleteMany();
  await prisma.balance.deleteMany();
  await prisma.standardAccount.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.moduleField.deleteMany();
  await prisma.clientModule.deleteMany();
  await prisma.module.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  // ---- Usuarios ----
  const passwordHash = await bcrypt.hash("Russell2026*", 10);
  await prisma.user.createMany({
    data: [
      { email: "admin@russellbedford.co", password: passwordHash, name: "Manuela Gutiérrez", role: "Auditor Senior", initials: "MG" },
      { email: "juliana@russellbedford.co", password: passwordHash, name: "Juliana Rincón", role: "Auditor Junior", initials: "JR" },
    ],
  });

  // ---- Módulos ----
  const modules = [
    { id: "INV", name: "Inventarios", icon: "box" },
    { id: "CAR", name: "Cartera", icon: "wallet" },
    { id: "NOM", name: "Nómina", icon: "users" },
    { id: "AFI", name: "Activos fijos", icon: "chip" },
    { id: "CXP", name: "Cuentas por pagar", icon: "doc" },
    { id: "ING", name: "Ingresos", icon: "chart" },
  ];
  await prisma.module.createMany({ data: modules });

  // ---- Campos estándar (solo Inventarios en el prototipo) ----
  const invFields: { key: string; label: string; type: string; required: boolean; hint: string | null }[] = [
    { key: "cuenta", label: "Cuenta contable", type: "string", required: true, hint: "Código PUC del cliente" },
    { key: "descripcion_cuenta", label: "Descripción cuenta", type: "string", required: true, hint: null },
    { key: "codigo_item", label: "Código del ítem", type: "string", required: true, hint: null },
    { key: "descripcion_item", label: "Descripción del ítem", type: "string", required: true, hint: null },
    { key: "unidad", label: "Unidad de medida", type: "string", required: false, hint: null },
    { key: "cantidad", label: "Cantidad en existencia", type: "number", required: true, hint: null },
    { key: "costo_unitario", label: "Costo unitario", type: "number", required: true, hint: null },
    { key: "valor_total", label: "Valor total", type: "number", required: true, hint: null },
    { key: "bodega", label: "Bodega", type: "string", required: false, hint: null },
    { key: "fecha_corte", label: "Fecha de corte", type: "date", required: true, hint: null },
  ];
  await prisma.moduleField.createMany({
    data: invFields.map((f, i) => ({
      moduleId: "INV",
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      hint: f.hint,
      order: i,
    })),
  });

  const nameToModuleId: Record<string, string> = {
    Inventarios: "INV", Cartera: "CAR", "Nómina": "NOM",
    "Activos fijos": "AFI", "Cuentas por pagar": "CXP", Ingresos: "ING",
  };

  // ---- Clientes ----
  const clients = [
    { id: "C-1042", name: "Inversiones del Pacífico S.A.S", nit: "900.451.227-3", erp: "SIESA", sector: "Comercio", configured: ["Cartera", "Cuentas por pagar", "Ingresos"], pending: ["Inventarios"] },
    { id: "C-0871", name: "Agroindustrias del Cauca Ltda.", nit: "830.118.044-1", erp: "SIIGO", sector: "Agroindustria", configured: ["Nómina", "Cartera", "Ingresos", "Inventarios"], pending: [] },
    { id: "C-1233", name: "Logística Andina Express S.A.", nit: "901.220.553-9", erp: "SAP", sector: "Transporte", configured: ["Activos fijos", "Cuentas por pagar", "Cartera", "Ingresos", "Nómina"], pending: ["Inventarios"] },
    { id: "C-0950", name: "Constructora Río Verde S.A.S", nit: "900.667.319-4", erp: "OFIMATICA", sector: "Construcción", configured: ["Cartera", "Activos fijos"], pending: ["Inventarios", "Nómina", "Ingresos"] },
    { id: "C-1101", name: "Distribuciones El Roble S.A.", nit: "830.554.221-7", erp: "SIIGO", sector: "Distribución", configured: ["Inventarios", "Cartera", "Ingresos", "Cuentas por pagar"], pending: [] },
    { id: "C-1308", name: "Servicios Médicos Vital IPS", nit: "901.044.102-2", erp: "SIESA", sector: "Salud", configured: ["Nómina", "Cartera"], pending: ["Ingresos", "Cuentas por pagar"] },
  ];
  for (const c of clients) {
    await prisma.client.create({
      data: {
        id: c.id, name: c.name, nit: c.nit, erp: c.erp, sector: c.sector,
        modules: {
          create: [
            ...c.configured.map((m) => ({ moduleId: nameToModuleId[m], status: "configured" })),
            ...c.pending.map((m) => ({ moduleId: nameToModuleId[m], status: "pending" })),
          ],
        },
      },
    });
  }

  // ---- Conciliaciones recientes ----
  await prisma.reconciliation.createMany({
    data: [
      { id: "REC-2026-0418", clientName: "Distribuciones El Roble S.A.", module: "Inventarios", period: "Feb 2026", erp: "SIIGO", status: "OK", diff: "$ 0", items: 0, date: "22/Abr/2026", owner: "M. Bermúdez" },
      { id: "REC-2026-0412", clientName: "Agroindustrias del Cauca Ltda.", module: "Cartera", period: "Mar 2026", erp: "SIIGO", status: "DIFF", diff: "$ 4.218.500", items: 7, date: "21/Abr/2026", owner: "J. Rincón" },
      { id: "REC-2026-0407", clientName: "Logística Andina Express S.A.", module: "Cuentas por pagar", period: "Mar 2026", erp: "SAP", status: "DIFF", diff: "$ 12.044.180", items: 18, date: "20/Abr/2026", owner: "C. Aristizábal" },
      { id: "REC-2026-0403", clientName: "Inversiones del Pacífico S.A.S", module: "Cartera", period: "Mar 2026", erp: "SIESA", status: "REVIEW", diff: "$ 805.220", items: 3, date: "18/Abr/2026", owner: "J. Rincón" },
      { id: "REC-2026-0398", clientName: "Servicios Médicos Vital IPS", module: "Nómina", period: "Mar 2026", erp: "SIESA", status: "OK", diff: "$ 0", items: 0, date: "16/Abr/2026", owner: "M. Bermúdez" },
      { id: "REC-2026-0394", clientName: "Constructora Río Verde S.A.S", module: "Activos fijos", period: "Feb 2026", erp: "OFIMATICA", status: "DIFF", diff: "$ 1.450.000", items: 2, date: "15/Abr/2026", owner: "C. Aristizábal" },
    ],
  });

  // ---- Notificaciones ----
  await prisma.notification.createMany({
    data: [
      { kind: "assign", who: "María Bermúdez", text: "te asignó la conciliación de", target: "Inversiones del Pacífico — Inventarios Marzo 2026", time: "hace 12 min", unread: true },
      { kind: "comment", who: "Carlos Aristizábal", text: "comentó en la cuenta", target: "143515 — Productos en proceso", time: "hace 38 min", unread: true },
      { kind: "system", who: "Sistema", text: "Parametrización pendiente para", target: "Constructora Río Verde — Inventarios", time: "hoy, 08:30", unread: false },
      { kind: "comment", who: "María Bermúdez", text: "resolvió la observación en", target: "REC-2026-0398", time: "ayer, 16:22", unread: false },
      { kind: "assign", who: "Daniela Páez", text: "te asignó la revisión de", target: "Logística Andina Express — Cartera", time: "ayer, 11:05", unread: false },
    ],
  });

  // ---- Auditoría ----
  await prisma.auditEntry.createMany({
    data: [
      { ts: "03/May/2026 09:14:22", user: "Juliana Rincón", action: "EJECUTÓ", entity: "Cruce REC-2026-0431", detail: "Inventarios · Inversiones del Pacífico · Marzo 2026" },
      { ts: "03/May/2026 09:13:48", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Cuentas (Inventarios)", detail: "7 cuentas auto, 1 reasignada por similitud, 1 sin mapeo" },
      { ts: "03/May/2026 09:11:02", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Campos (Inventarios)", detail: "10 de 10 campos requeridos cubiertos" },
      { ts: "03/May/2026 09:08:17", user: "Juliana Rincón", action: "CARGÓ ARCHIVO", entity: "INV_PACIFICO_MAR2026.xlsx", detail: "4.821 filas · 12 columnas · 1,4 MB" },
      { ts: "03/May/2026 09:07:55", user: "Juliana Rincón", action: "INICIÓ", entity: "Parametrización", detail: "Cliente C-1042 · Módulo Inventarios" },
      { ts: "02/May/2026 17:41:09", user: "María Bermúdez", action: "ASIGNÓ", entity: "REC-2026-0431", detail: "Asignado a Juliana Rincón con prioridad media" },
    ],
  });

  // ---- Plan de cuentas estándar ----
  const chart = [
    ["1", "ACTIVO", 1, "D", null, false], ["11", "Disponible", 2, "D", "1", true],
    ["1105", "Caja", 3, "D", "11", true], ["1110", "Bancos", 3, "D", "11", true],
    ["12", "Inversiones", 2, "D", "1", false], ["13", "Deudores", 2, "D", "1", true],
    ["1305", "Clientes", 3, "D", "13", true], ["1330", "Anticipos y avances", 3, "D", "13", false],
    ["1355", "Anticipos de impuestos", 3, "D", "13", false], ["1399", "Provisiones", 3, "C", "13", false],
    ["14", "Inventarios", 2, "D", "1", true], ["15", "Propiedades, planta y equipo", 2, "D", "1", true],
    ["1592", "Depreciación acumulada", 3, "C", "15", false], ["16", "Intangibles", 2, "D", "1", false],
    ["17", "Diferidos", 2, "D", "1", false], ["2", "PASIVO", 1, "C", null, false],
    ["21", "Obligaciones financieras", 2, "C", "2", true], ["22", "Proveedores", 2, "C", "2", true],
    ["23", "Cuentas por pagar", 2, "C", "2", false], ["24", "Impuestos, gravámenes y tasas", 2, "C", "2", true],
    ["25", "Obligaciones laborales", 2, "C", "2", false], ["3", "PATRIMONIO", 1, "C", null, false],
    ["31", "Capital social", 2, "C", "3", false], ["36", "Resultados del ejercicio", 2, "C", "3", true],
    ["4", "INGRESOS", 1, "C", null, true], ["41", "Operacionales", 2, "C", "4", true],
    ["5", "GASTOS", 1, "D", null, true], ["51", "Operacionales de admón", 2, "D", "5", false],
    ["52", "Operacionales de ventas", 2, "D", "5", false], ["6", "COSTOS DE VENTAS", 1, "D", null, true],
    ["7", "COSTOS DE PRODUCCIÓN", 1, "D", null, false],
  ] as const;
  await prisma.standardAccount.createMany({
    data: chart.map(([code, name, level, nature, parent, critical]) => ({
      code: code as string, name: name as string, level: level as number,
      nature: nature as string, parent: parent as string | null, critical: critical as boolean,
    })),
  });

  // ---- Balances ----
  const elZarzalDetail = {
    sums: { activo: 12450320500, pasivo: 7230180400, patrimonio: 5220140100, ingresos: 18540220000, gastos: 14320180500, costos: 2870540200, utilidad: 1349499300 },
    validations: [
      { id: "V1", rule: "Balance cuadrado (A = P + Pat)", status: "ok", detail: "Diferencia: $ 0" },
      { id: "V2", rule: "Naturaleza de cuenta vs saldo", status: "warn", detail: "3 cuentas con saldo contrario", count: 3 },
      { id: "V3", rule: "Sumas de mayores vs auxiliares", status: "ok", detail: "412 cuentas validadas" },
      { id: "V4", rule: "Terceros con NIT inválido", status: "warn", detail: "7 terceros sin identificar", count: 7 },
      { id: "V5", rule: "Cuentas nuevas no mapeadas", status: "warn", detail: "14 cuentas sin mapeo al estándar", count: 14 },
      { id: "V6", rule: "Variaciones > 25% vs período anterior", status: "warn", detail: "18 cuentas con variación significativa", count: 18 },
      { id: "V7", rule: "Cuentas dormidas reactivadas", status: "ok", detail: "Sin cuentas dormidas reactivadas" },
      { id: "V8", rule: "Saldos en moneda extranjera sin tasa", status: "ok", detail: "No aplica" },
    ],
    breakdown: [
      { code: "11", name: "Disponible", balance: 1240180300, prevBalance: 980440200, variation: 26.49, mapped: true, critical: true, nature: "D", items: [
        { code: "110505", name: "Caja general", balance: 12400000, variation: 51.2, std: "1105", mapped: true },
        { code: "111005", name: "Bancomercial – Bancolombia", balance: 824220500, variation: 34.6, std: "1110", mapped: true },
        { code: "111010", name: "BBVA cta corriente", balance: 312180200, variation: 25.6, std: "1110", mapped: true },
        { code: "111505", name: "Davivienda – ahorros", balance: 91379600, variation: -18.1, std: "1110", mapped: true },
      ] },
      { code: "13", name: "Deudores", balance: 4822140200, prevBalance: 4120550800, variation: 17.0, mapped: true, critical: true, nature: "D", items: [
        { code: "130505", name: "Clientes nacionales", balance: 4120180400, variation: 15.1, std: "1305", mapped: true },
        { code: "130510", name: "Clientes exterior", balance: 552880300, variation: 45.3, std: "1305", mapped: true },
        { code: "133005", name: "Anticipos a proveedores", balance: 188200500, variation: -3.6, std: "1330", mapped: true },
        { code: "139905", name: "Provisión cartera", balance: -39121000, variation: 10.4, std: "1399", mapped: true },
      ] },
      { code: "14", name: "Inventarios", balance: 3280550200, prevBalance: 2980120400, variation: 10.1, mapped: true, critical: true, nature: "D", items: [
        { code: "143505", name: "Mercancías no fabricadas", balance: 2120180300, variation: 7.0, std: "14", mapped: true },
        { code: "143510", name: "Mercancías en tránsito", balance: 480550900, variation: 50.1, std: "14", mapped: true },
        { code: "149905", name: "Provisión obsolescencia", balance: -118200000, variation: 5.1, std: null, mapped: false },
      ] },
      { code: "24", name: "Impuestos, gravámenes y tasas", balance: -440180500, prevBalance: -412550300, variation: 6.7, mapped: true, critical: true, nature: "C", items: [
        { code: "240805", name: "IVA generado", balance: 28500000, variation: null, std: "24", mapped: true },
        { code: "240810", name: "IVA descontable", balance: -185220500, variation: 24.7, std: "24", mapped: true },
        { code: "236501", name: "Retefuente", balance: -283460000, variation: 97.1, std: "24", mapped: true },
      ] },
    ],
    meta: { rows: 412, mapped: 398, unmapped: 14, critical: 23, file: "Balance ZARZAL Dic-2025_v3.xlsx", fileSize: "284 KB", frozenBy: "Manuela Gutiérrez", frozenAt: "08/Ene/2026 11:32", uploadedBy: "Sandra Paniagua (cliente)", uploadedAt: "06/Ene/2026 09:14" },
  };

  await prisma.balance.create({
    data: { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Diciembre 2025", version: "v3", isOfficial: true, isFrozen: true, status: "Congelado", complete: 100, ...elZarzalDetail },
  });
  await prisma.balance.createMany({
    data: [
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Noviembre 2025", version: "v2", status: "Última", complete: 100 },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Octubre 2025", version: "v1", status: "Única", complete: 100 },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Abril 2026", version: "v2", status: "Con alertas", complete: 97 },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Diciembre 2025", version: "v2", isOfficial: true, isFrozen: true, status: "Congelado", complete: 100 },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Septiembre 2025", version: "v1", status: "Única", complete: 100 },
      { clientName: "Comercializadora Andina Ltda", clientNit: "800.234.115-7", period: "Marzo 2026", version: "v4", status: "Última", complete: 88 },
      { clientName: "Manufacturas del Sur S.A", clientNit: "830.502.118-9", period: "Octubre 2026", version: "v1", status: "Única", complete: 100 },
    ],
  });

  // ---- DIAN ----
  const forms = [
    { id: "IVA", name: "IVA", code: "F-300", periodicity: "Bimestral", icon: "doc", periods: [
      { periodKey: "2026-B5", label: "Bimestre 5 · Sep-Oct 2026", status: "DIFF", filed: "15/Nov/2026" },
      { periodKey: "2026-B4", label: "Bimestre 4 · Jul-Ago 2026", status: "OK", filed: "15/Sep/2026" },
      { periodKey: "2026-B3", label: "Bimestre 3 · May-Jun 2026", status: "OK", filed: "15/Jul/2026" },
      { periodKey: "2026-B2", label: "Bimestre 2 · Mar-Abr 2026", status: "DIFF", filed: "15/May/2026" },
      { periodKey: "2026-B1", label: "Bimestre 1 · Ene-Feb 2026", status: "OK", filed: "15/Mar/2026" },
    ] },
    { id: "RETEFUENTE", name: "Retención en la fuente", code: "F-350", periodicity: "Mensual", icon: "wallet", periods: [
      { periodKey: "2026-10", label: "Octubre 2026", status: "OK", filed: "08/Nov/2026" },
      { periodKey: "2026-09", label: "Septiembre 2026", status: "OK", filed: "08/Oct/2026" },
      { periodKey: "2026-08", label: "Agosto 2026", status: "OK", filed: "08/Sep/2026" },
      { periodKey: "2026-07", label: "Julio 2026", status: "DIFF", filed: "08/Ago/2026" },
      { periodKey: "2026-06", label: "Junio 2026", status: "OK", filed: "08/Jul/2026" },
    ] },
    { id: "SALUDABLE", name: "Impuesto Saludable", code: "F-310", periodicity: "Mensual", icon: "chip", periods: [
      { periodKey: "2026-10", label: "Octubre 2026", status: "PEND", filed: null },
      { periodKey: "2026-09", label: "Septiembre 2026", status: "OK", filed: "18/Oct/2026" },
    ] },
    { id: "ICA", name: "ICA Bogotá", code: "F-CHIP", periodicity: "Bimestral", icon: "chart", periods: [
      { periodKey: "2026-B5", label: "Bimestre 5 · Sep-Oct 2026", status: "PEND", filed: null },
    ] },
  ];
  for (const f of forms) {
    await prisma.dianForm.create({
      data: { id: f.id, name: f.name, code: f.code, periodicity: f.periodicity, icon: f.icon,
        periods: { create: f.periods.map((p) => ({ periodKey: p.periodKey, label: p.label, status: p.status, filed: p.filed })) } },
    });
  }

  console.log("✅ Seed completo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
