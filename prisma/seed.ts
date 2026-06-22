import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pucMaster from "./data/puc-maestro-russell.json";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding…");

  // ---- Limpieza idempotente ----
  await prisma.clientDianForm.deleteMany();
  await prisma.clientAccount.deleteMany();
  await prisma.russellOption.deleteMany();
  await prisma.dianComment.deleteMany();
  await prisma.dianMapping.deleteMany();
  await prisma.dianLine.deleteMany();
  await prisma.dianSection.deleteMany();
  await prisma.dianPeriod.deleteMany();
  await prisma.dianForm.deleteMany();
  await prisma.balance.deleteMany();
  await prisma.standardAccount.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reconciliationComment.deleteMany();
  await prisma.reconciliationRow.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.moduleField.deleteMany();
  await prisma.clientModule.deleteMany();
  await prisma.module.deleteMany();
  await prisma.client.deleteMany();
  await prisma.erp.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.user.deleteMany();

  // ---- Usuarios ----
  const passwordHash = await bcrypt.hash("Russell2026*", 10);
  await prisma.user.createMany({
    data: [
      { email: "admin@russellbedford.co", password: passwordHash, name: "Manuela Gutiérrez", role: "Superadministrador", initials: "MG" },
      { email: "juliana@russellbedford.co", password: passwordHash, name: "Juliana Rincón", role: "Auditor", initials: "JR" },
    ],
  });

  // ---- Módulos ----
  const modules = [
    { code: "INV", name: "Inventarios", icon: "box" },
    { code: "CAR", name: "Cartera", icon: "wallet" },
    { code: "NOM", name: "Nómina", icon: "users" },
    { code: "AFI", name: "Activos fijos", icon: "chip" },
    { code: "CXP", name: "Cuentas por pagar", icon: "doc" },
    { code: "ING", name: "Ingresos", icon: "chart" },
  ];
  await prisma.module.createMany({ data: modules });
  const moduleIdByCode = new Map(
    (await prisma.module.findMany({ select: { id: true, code: true } }))
      .map((module) => [module.code, module.id]),
  );

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
      moduleId: moduleIdByCode.get("INV")!,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      hint: f.hint,
      order: i,
    })),
  });

  const nameToModuleId: Record<string, number> = {
    Inventarios: moduleIdByCode.get("INV")!,
    Cartera: moduleIdByCode.get("CAR")!,
    "Nómina": moduleIdByCode.get("NOM")!,
    "Activos fijos": moduleIdByCode.get("AFI")!,
    "Cuentas por pagar": moduleIdByCode.get("CXP")!,
    Ingresos: moduleIdByCode.get("ING")!,
  };

  // ---- Catálogos maestros: ERP y Sector ----
  await prisma.erp.createMany({
    data: [
      { code: "SIESA", name: "SIESA" },
      { code: "SIIGO", name: "SIIGO" },
      { code: "SAP", name: "SAP" },
      { code: "OFIMATICA", name: "Ofimática" },
    ],
  });
  const erpIdByCode = new Map(
    (await prisma.erp.findMany({ select: { id: true, code: true } })).map((e) => [e.code, e.id]),
  );
  await prisma.sector.createMany({
    data: [
      { code: "COMERCIO", name: "Comercio" },
      { code: "AGROINDUSTRIA", name: "Agroindustria" },
      { code: "TRANSPORTE", name: "Transporte" },
      { code: "CONSTRUCCION", name: "Construcción" },
      { code: "DISTRIBUCION", name: "Distribución" },
      { code: "SALUD", name: "Salud" },
      { code: "MANUFACTURA", name: "Manufactura" },
    ],
  });
  const sectorIdByName = new Map(
    (await prisma.sector.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]),
  );

  // ---- Clientes ----
  const clients = [
    { code: "C-1042", name: "Inversiones del Pacífico S.A.S", nit: "900.451.227-3", erp: "SIESA", sector: "Comercio", configured: ["Cartera", "Cuentas por pagar", "Ingresos"], pending: ["Inventarios"] },
    { code: "C-0871", name: "Agroindustrias del Cauca Ltda.", nit: "830.118.044-1", erp: "SIIGO", sector: "Agroindustria", configured: ["Nómina", "Cartera", "Ingresos", "Inventarios"], pending: [] },
    { code: "C-1233", name: "Logística Andina Express S.A.", nit: "901.220.553-9", erp: "SAP", sector: "Transporte", configured: ["Activos fijos", "Cuentas por pagar", "Cartera", "Ingresos", "Nómina"], pending: ["Inventarios"] },
    { code: "C-0950", name: "Constructora Río Verde S.A.S", nit: "900.667.319-4", erp: "OFIMATICA", sector: "Construcción", configured: ["Cartera", "Activos fijos"], pending: ["Inventarios", "Nómina", "Ingresos"] },
    { code: "C-1101", name: "Distribuciones El Roble S.A.", nit: "830.554.221-7", erp: "SIIGO", sector: "Distribución", configured: ["Inventarios", "Cartera", "Ingresos", "Cuentas por pagar"], pending: [] },
    { code: "C-1308", name: "Servicios Médicos Vital IPS", nit: "901.044.102-2", erp: "SIESA", sector: "Salud", configured: ["Nómina", "Cartera"], pending: ["Ingresos", "Cuentas por pagar"] },
    // Clientes referenciados por los balances y el mapeo (cuentas_cliente) de
    // este mismo seed. Deben existir en `clientes` para que el alcance por
    // cartera (clientIdPorNombre, fail-closed) pueda resolverlos.
    { code: "C-0644", name: "El Zarzal S.A", nit: "890.345.872-1", erp: "SIIGO", sector: "Agroindustria", configured: ["Cartera", "Ingresos"], pending: ["Inventarios"] },
    { code: "C-0763", name: "Comercializadora Andina Ltda", nit: "800.234.115-7", erp: "SIESA", sector: "Comercio", configured: ["Cartera"], pending: ["Ingresos"] },
    { code: "C-0918", name: "Manufacturas del Sur S.A", nit: "830.502.118-9", erp: "SAP", sector: "Manufactura", configured: ["Inventarios"], pending: ["Nómina"] },
  ];
  for (const c of clients) {
    await prisma.client.create({
      data: {
        code: c.code, name: c.name, nit: c.nit,
        erpId: erpIdByCode.get(c.erp)!,
        sectorId: sectorIdByName.get(c.sector) ?? null,
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
      { code: "REC-2026-0418", clientName: "Distribuciones El Roble S.A.", module: "Inventarios", period: "Feb 2026", erp: "SIIGO", status: "OK", diff: "$ 0", items: 0, date: "22/Abr/2026", owner: "M. Bermúdez" },
      { code: "REC-2026-0412", clientName: "Agroindustrias del Cauca Ltda.", module: "Cartera", period: "Mar 2026", erp: "SIIGO", status: "DIFF", diff: "$ 4.218.500", items: 7, date: "21/Abr/2026", owner: "J. Rincón", lastActivity: "hace 2 h" },
      { code: "REC-2026-0407", clientName: "Logística Andina Express S.A.", module: "Cuentas por pagar", period: "Mar 2026", erp: "SAP", status: "DIFF", diff: "$ 12.044.180", items: 18, date: "20/Abr/2026", owner: "C. Aristizábal", lastActivity: "hoy 09:40" },
      { code: "REC-2026-0403", clientName: "Inversiones del Pacífico S.A.S", module: "Cartera", period: "Mar 2026", erp: "SIESA", status: "REVIEW", diff: "$ 805.220", items: 3, date: "18/Abr/2026", owner: "J. Rincón", lastActivity: "ayer 17:12" },
      { code: "REC-2026-0398", clientName: "Servicios Médicos Vital IPS", module: "Nómina", period: "Mar 2026", erp: "SIESA", status: "OK", diff: "$ 0", items: 0, date: "16/Abr/2026", owner: "M. Bermúdez" },
      { code: "REC-2026-0394", clientName: "Constructora Río Verde S.A.S", module: "Activos fijos", period: "Feb 2026", erp: "OFIMATICA", status: "DIFF", diff: "$ 1.450.000", items: 2, date: "15/Abr/2026", owner: "C. Aristizábal" },
    ],
  });

  // Las notificaciones no se siembran: se crean solo desde acciones de proceso reales.

  // ---- Auditoría ----
  await prisma.auditEntry.createMany({
    data: [
      { ts: "03/May/2026 09:14:22", user: "Juliana Rincón", action: "EJECUTÓ", entity: "Cruce REC-2026-0431", detail: "Inventarios · Inversiones del Pacífico · Marzo 2026", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:13:48", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Cuentas (Inventarios)", detail: "7 cuentas auto, 1 reasignada por similitud, 1 sin mapeo", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:11:02", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Campos (Inventarios)", detail: "10 de 10 campos requeridos cubiertos", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:08:17", user: "Juliana Rincón", action: "CARGÓ ARCHIVO", entity: "INV_PACIFICO_MAR2026.xlsx", detail: "4.821 filas · 12 columnas · 1,4 MB", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:07:55", user: "Juliana Rincón", action: "INICIÓ", entity: "Parametrización", detail: "Cliente C-1042 · Módulo Inventarios", ip: "190.85.241.18" },
      { ts: "02/May/2026 17:41:09", user: "María Bermúdez", action: "ASIGNÓ", entity: "REC-2026-0431", detail: "Asignado a Juliana Rincón con prioridad media", ip: "interno" },
    ],
  });

  // ---- Plan de cuentas estándar ----
  await prisma.standardAccount.createMany({
    data: pucMaster.accounts,
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
      { code: "11", name: "Disponible", balance: 1240180300, prevBalance: 980440200, variation: 26.49, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "110505", name: "Caja general", balance: 12400000, prevBalance: 8200000, variation: 51.2, std: "1105", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111005", name: "Bancomercial – Bancolombia", balance: 824220500, prevBalance: 612400000, variation: 34.6, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111010", name: "BBVA cta corriente", balance: 312180200, prevBalance: 248500000, variation: 25.6, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111505", name: "Davivienda – ahorros", balance: 91379600, prevBalance: 111340200, variation: -18.1, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
      ] },
      { code: "13", name: "Deudores", balance: 4822140200, prevBalance: 4120550800, variation: 17.0, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "130505", name: "Clientes nacionales", balance: 4120180400, prevBalance: 3580200000, variation: 15.1, std: "1305", mapped: true, critical: true, nature: "D", saldoOk: true },
        { code: "130510", name: "Clientes exterior", balance: 552880300, prevBalance: 380440000, variation: 45.3, std: "1305", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "133005", name: "Anticipos a proveedores", balance: 188200500, prevBalance: 195300000, variation: -3.6, std: "1330", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "139905", name: "Provisión cartera", balance: -39121000, prevBalance: -35440000, variation: 10.4, std: "1399", mapped: true, critical: false, nature: "C", saldoOk: true },
      ] },
      { code: "14", name: "Inventarios", balance: 3280550200, prevBalance: 2980120400, variation: 10.1, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "143505", name: "Mercancías no fabricadas", balance: 2120180300, prevBalance: 1981400000, variation: 7.0, std: "14", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "143510", name: "Mercancías en tránsito", balance: 480550900, prevBalance: 320100000, variation: 50.1, std: "14", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "149905", name: "Provisión obsolescencia", balance: -118200000, prevBalance: -112400000, variation: 5.1, std: null, mapped: false, critical: false, nature: "C", saldoOk: true },
      ] },
      { code: "24", name: "Impuestos, gravámenes y tasas", balance: -440180500, prevBalance: -412550300, variation: 6.7, mapped: true, critical: true, nature: "C", saldoOk: false, items: [
        { code: "240805", name: "IVA generado", balance: 28500000, prevBalance: -120180400, variation: null, std: "24", mapped: true, critical: true, nature: "C", saldoOk: false },
        { code: "240810", name: "IVA descontable", balance: -185220500, prevBalance: -148500000, variation: 24.7, std: "24", mapped: true, critical: false, nature: "C", saldoOk: true },
        { code: "236501", name: "Retefuente", balance: -283460000, prevBalance: -143820000, variation: 97.1, std: "24", mapped: true, critical: true, nature: "C", saldoOk: true },
      ] },
      { code: "99", name: "Sin clasificar (cuentas no mapeadas)", balance: -92800000, prevBalance: -112400000, variation: null, mapped: false, critical: false, nature: "-", saldoOk: false, items: [
        { code: "189965", name: "Diversos – nuevo cliente", balance: 25400000, prevBalance: 0, variation: null, std: null, mapped: false, critical: false, nature: "D", saldoOk: true },
        { code: "149905", name: "Provisión obsolescencia", balance: -118200000, prevBalance: -112400000, variation: 5.1, std: null, mapped: false, critical: false, nature: "C", saldoOk: true },
      ] },
    ],
    meta: { rows: 412, mapped: 398, unmapped: 14, critical: 23, file: "Balance ZARZAL Dic-2025_v3.xlsx", fileSize: "284 KB", frozenBy: "Manuela Gutiérrez", frozenAt: "08/Ene/2026 11:32", uploadedBy: "Sandra Paniagua (cliente)", uploadedAt: "06/Ene/2026 09:14" },
    versionHistory: [
      { v: "v3", date: "06/Ene/2026 09:14", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v3.xlsx", size: "284 KB", rows: 412, sumA: 12450320500, balanced: true, note: "Versión final con ajustes solicitados", changes: 18 },
      { v: "v2", date: "28/Dic/2025 16:42", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v2.xlsx", size: "281 KB", rows: 407, sumA: 12308140200, balanced: true, note: "Corrige clasificación de cartera exterior", changes: 24 },
      { v: "v1", date: "20/Dic/2025 10:05", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v1.xlsx", size: "276 KB", rows: 402, sumA: 12180440700, balanced: false, note: "Primera versión – descuadra $ 1.4M", changes: 402 },
    ],
    diff: {
      summary: { added: 5, removed: 0, changed: 8, totalAffected: 142180300 },
      rows: [
        { type: "changed", code: "110505", name: "Caja general", before: 8400000, after: 12400000, delta: 4000000 },
        { type: "changed", code: "111005", name: "Bancomercial – Bancolombia", before: 780200000, after: 824220500, delta: 44020500 },
        { type: "added", code: "130510", name: "Clientes exterior", before: 0, after: 552880300, delta: 552880300 },
        { type: "added", code: "143510", name: "Mercancías en tránsito", before: 0, after: 480550900, delta: 480550900 },
        { type: "changed", code: "240805", name: "IVA generado", before: -12500000, after: 28500000, delta: 41000000, flag: "Cambio de naturaleza" },
        { type: "changed", code: "240810", name: "IVA descontable", before: -148500000, after: -185220500, delta: -36720500 },
        { type: "changed", code: "236501", name: "Retefuente", before: -143820000, after: -283460000, delta: -139640000 },
        { type: "added", code: "189965", name: "Diversos – nuevo cliente", before: 0, after: 25400000, delta: 25400000 },
        { type: "added", code: "133005", name: "Anticipos a proveedores", before: 0, after: 188200500, delta: 188200500 },
        { type: "changed", code: "139905", name: "Provisión cartera", before: -35440000, after: -39121000, delta: -3681000 },
        { type: "added", code: "143505", name: "Mercancías no fabricadas (reclas.)", before: 0, after: 2120180300, delta: 2120180300 },
        { type: "changed", code: "130505", name: "Clientes nacionales", before: 3580200000, after: 4120180400, delta: 539980400 },
        { type: "changed", code: "111010", name: "BBVA cta corriente", before: 248500000, after: 312180200, delta: 63680200 },
      ],
    },
    auditLog: [
      { date: "20/Dic/2025 10:05", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v1", ip: "190.85.241.18", details: "276 KB · 402 cuentas · descuadra $ 1.4M" },
      { date: "28/Dic/2025 16:42", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v2", ip: "190.85.241.18", details: "281 KB · 407 cuentas · cuadrado" },
      { date: "03/Ene/2026 14:20", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Solicitó nueva versión", ip: "interno", details: "Reclasificar cartera exterior y mercancías en tránsito" },
      { date: "06/Ene/2026 09:14", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v3", ip: "190.85.241.18", details: "284 KB · 412 cuentas · cuadrado" },
      { date: "06/Ene/2026 09:40", actor: "Juliana Rincón", role: "Auditor", action: "Ejecutó validaciones automáticas", ip: "interno", details: "4 ok · 4 alertas" },
      { date: "07/Ene/2026 11:10", actor: "Juliana Rincón", role: "Auditor", action: "Mapeó 14 cuentas al estándar", ip: "interno", details: "398 de 412 cuentas mapeadas" },
      { date: "07/Ene/2026 15:35", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Revisó mapeo y validaciones", ip: "interno", details: "Aprobado para congelar" },
      { date: "08/Ene/2026 11:32", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Congeló v3 como oficial", ip: "interno", details: "Versión auditada para cierre 2025" },
      { date: "12/Ene/2026 09:02", actor: "Sistema", role: "Auditor", action: "Publicó balance a DIAN y Razonabilidad", ip: "interno", details: "Disponible para módulos downstream" },
    ],
  };

  await prisma.balance.create({
    data: { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Diciembre 2025", version: "v3", isOfficial: true, isFrozen: true, status: "Congelado", complete: 100, lastUpload: "06/Ene/2026 09:14", ...elZarzalDetail },
  });
  await prisma.balance.createMany({
    data: [
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Noviembre 2025", version: "v2", status: "Última", complete: 100, lastUpload: "04/Dic/2025 14:20" },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Octubre 2025", version: "v1", status: "Única", complete: 100, lastUpload: "05/Nov/2025 09:10" },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Abril 2026", version: "v2", status: "Con alertas", complete: 97, lastUpload: "05/May/2026 10:42" },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Diciembre 2025", version: "v2", isOfficial: true, isFrozen: true, status: "Congelado", complete: 100, lastUpload: "09/Ene/2026 08:30" },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Septiembre 2025", version: "v1", status: "Única", complete: 100, lastUpload: "06/Oct/2025 16:00" },
      { clientName: "Comercializadora Andina Ltda", clientNit: "800.234.115-7", period: "Marzo 2026", version: "v4", status: "Última", complete: 88, lastUpload: "10/Abr/2026 12:15" },
      { clientName: "Manufacturas del Sur S.A", clientNit: "830.502.118-9", period: "Octubre 2026", version: "v1", status: "Única", complete: 100, lastUpload: "04/Nov/2026 11:48" },
    ],
  });

  // ---- DIAN ----
  const forms = [
    { key: "IVA", name: "IVA", code: "F-300", periodicity: "Bimestral", icon: "doc", periods: [
      { periodKey: "2026-B5", label: "Bimestre 5 · Sep-Oct 2026", status: "DIFF", filed: "15/Nov/2026" },
      { periodKey: "2026-B4", label: "Bimestre 4 · Jul-Ago 2026", status: "OK", filed: "15/Sep/2026" },
      { periodKey: "2026-B3", label: "Bimestre 3 · May-Jun 2026", status: "OK", filed: "15/Jul/2026" },
      { periodKey: "2026-B2", label: "Bimestre 2 · Mar-Abr 2026", status: "DIFF", filed: "15/May/2026" },
      { periodKey: "2026-B1", label: "Bimestre 1 · Ene-Feb 2026", status: "OK", filed: "15/Mar/2026" },
    ] },
    { key: "RETEFUENTE", name: "Retención en la fuente", code: "F-350", periodicity: "Mensual", icon: "wallet", periods: [
      { periodKey: "2026-10", label: "Octubre 2026", status: "OK", filed: "08/Nov/2026" },
      { periodKey: "2026-09", label: "Septiembre 2026", status: "OK", filed: "08/Oct/2026" },
      { periodKey: "2026-08", label: "Agosto 2026", status: "OK", filed: "08/Sep/2026" },
      { periodKey: "2026-07", label: "Julio 2026", status: "DIFF", filed: "08/Ago/2026" },
      { periodKey: "2026-06", label: "Junio 2026", status: "OK", filed: "08/Jul/2026" },
    ] },
    { key: "ICA", name: "ICA", code: "F-CHIP", periodicity: "Bimestral", icon: "chart", periods: [
      { periodKey: "2026-B5", label: "Bimestre 5 · Sep-Oct 2026", status: "PEND", filed: null },
    ] },
  ];
  for (const f of forms) {
    await prisma.dianForm.create({
      data: { key: f.key, name: f.name, code: f.code, periodicity: f.periodicity, icon: f.icon,
        periods: { create: f.periods.map((p) => ({ periodKey: p.periodKey, label: p.label, status: p.status, filed: p.filed })) } },
    });
  }
  const formIdByKey = new Map<string, number>(
    (await prisma.dianForm.findMany({ select: { id: true, key: true } }))
      .map((form) => [form.key, form.id]),
  );

  const dianObjective = "Validar que las declaraciones del año fueron presentadas y pagadas oportunamente, y que las cifras declaradas crucen con las cifras contables al cierre.";
  await prisma.dianForm.update({ where: { key: "IVA" }, data: { objective: dianObjective, conclusion: "Se evidencian diferencias en el IVA descontable de $795.709 y diferencias menores no materiales en otros renglones. Las diferencias en ingresos están explicadas por devoluciones y refacturación de septiembre." } });
  await prisma.dianForm.update({ where: { key: "RETEFUENTE" }, data: { objective: dianObjective, conclusion: "No se evidencian diferencias materiales entre los valores declarados en retención en la fuente vs. contabilidad. Diferencias menores explicadas por redondeo." } });

  // ---- Formatos DIAN activados por cliente (sección "Módulos del cliente") ----
  const clientIdByCode = new Map<string, number>(
    (await prisma.client.findMany({ select: { id: true, code: true } }))
      .map((c) => [c.code, c.id]),
  );
  const dianPorCliente: { code: string; forms: string[] }[] = [
    { code: "C-1042", forms: ["IVA", "RETEFUENTE"] },
    { code: "C-0871", forms: ["IVA", "RETEFUENTE", "ICA"] },
    { code: "C-1233", forms: ["RETEFUENTE"] },
  ];
  await prisma.clientDianForm.createMany({
    data: dianPorCliente.flatMap((d) => {
      const clientId = clientIdByCode.get(d.code);
      if (!clientId) return [];
      return d.forms
        .map((key) => formIdByKey.get(key))
        .filter((formId): formId is number => formId != null)
        .map((formId) => ({ clientId, formId }));
    }),
  });

  // ---- Catálogo de cuentas Russell (selector del mapeo) ----
  await prisma.russellOption.createMany({
    data: [
      { code: "1105", name: "Caja", module: "Caja" },
      { code: "1110", name: "Bancos", module: "Bancos" },
      { code: "1115", name: "Cuentas de ahorro", module: "Bancos" },
      { code: "1305", name: "Clientes", module: "Cartera" },
      { code: "1330", name: "Anticipos y avances", module: "Cartera" },
      { code: "1355", name: "Anticipos de impuestos", module: "DIAN" },
      { code: "1399", name: "Provisiones", module: "Cartera" },
      { code: "14", name: "Inventarios", module: "Inventarios" },
      { code: "15", name: "Propiedades, planta y equipo", module: "Activos fijos" },
      { code: "1592", name: "Depreciación acumulada", module: "Activos fijos" },
      { code: "21", name: "Obligaciones financieras", module: "Cuentas por pagar" },
      { code: "22", name: "Proveedores", module: "Cuentas por pagar" },
      { code: "23", name: "Cuentas por pagar", module: "Cuentas por pagar" },
      { code: "24", name: "Impuestos, gravámenes y tasas", module: "DIAN" },
      { code: "25", name: "Obligaciones laborales", module: "Nómina" },
      { code: "41", name: "Ingresos operacionales", module: "Ingresos" },
      { code: "51", name: "Operacionales de admón", module: null },
      { code: "52", name: "Operacionales de ventas", module: null },
    ],
  });
  const russellOptionIdByCode = new Map<string, number>(
    (await prisma.russellOption.findMany({ select: { id: true, code: true } }))
      .map((option) => [option.code, option.id]),
  );

  // ---- PUC del cliente El Zarzal (árbol N4/N6/N8) ----
  const elZarzalTree: [string, number, string, string | null][] = [
    ["1105", 4, "Caja", "1105"], ["110505", 6, "Caja general", "1105"], ["11050501", 8, "Caja Bogotá", "1105"], ["11050502", 8, "Caja Medellín", "1105"], ["11050503", 8, "Caja Cali", "1105"], ["110510", 6, "Caja menor administración", "1105"], ["11051001", 8, "Caja menor — Recepción", "1105"], ["11051002", 8, "Caja menor — Logística", "1105"],
    ["1110", 4, "Bancos", "1110"], ["111005", 6, "Bancolombia", "1110"], ["11100501", 8, "Bancol. cta cte 4178-99201-32", "1110"], ["11100502", 8, "Bancol. cta cte 4178-99201-99", "1110"], ["111010", 6, "BBVA", "1110"], ["11101001", 8, "BBVA cta corriente 0013-0042-19", "1110"], ["111505", 6, "Davivienda — ahorros", "1115"], ["11150501", 8, "Davivienda 04200145887", "1115"],
    ["1305", 4, "Clientes", "1305"], ["130505", 6, "Clientes nacionales", "1305"], ["13050501", 8, "Grandes superficies", "1305"], ["13050502", 8, "Mayoristas", "1305"], ["13050503", 8, "Minoristas", "1305"], ["130510", 6, "Clientes exterior", "1305"], ["133005", 6, "Anticipos a proveedores", "1330"], ["139905", 6, "Provisión cartera deudora", "1399"],
    ["14", 4, "Inventarios", "14"], ["143505", 6, "Mercancías no fabricadas", "14"], ["14350501", 8, "Bodega principal", "14"], ["14350502", 8, "Bodega satélite norte", "14"], ["143510", 6, "Mercancías en tránsito", "14"], ["149905", 6, "Provisión obsolescencia", "14"],
    ["15", 4, "Propiedades, planta y equipo", "15"], ["152405", 6, "Equipo de oficina", "15"], ["152805", 6, "Equipo de cómputo", "15"], ["159205", 6, "Depreciación acum. equipo oficina", "1592"],
    ["21", 4, "Obligaciones financieras", "21"], ["210505", 6, "Bancos nacionales — CP", "21"], ["212010", 6, "Bancos nacionales — LP", "21"],
    ["22", 4, "Proveedores", "22"], ["220505", 6, "Proveedores nacionales", "22"], ["22050501", 8, "Materias primas", "22"], ["22050502", 8, "Servicios contratados", "22"], ["220510", 6, "Proveedores del exterior", "22"],
    ["24", 4, "Impuestos, gravámenes y tasas", "24"], ["240805", 6, "IVA generado", "24"], ["240810", 6, "IVA descontable", "24"], ["236501", 6, "Retención en la fuente", "24"],
    ["25", 4, "Obligaciones laborales", "25"], ["251005", 6, "Cesantías consolidadas", "25"], ["252005", 6, "Intereses sobre cesantías", "25"],
    ["4135", 4, "Ventas — comercio al por mayor", "41"], ["413505", 6, "Mercancía nacional", "41"], ["413510", 6, "Mercancía exportación", "41"],
    ["189965", 6, "Diversos — nuevo cliente", null],
  ];
  await prisma.clientAccount.createMany({
    data: elZarzalTree.map(([code, level, name, russell], i) => ({
      clientName: "El Zarzal S.A",
      code,
      level,
      name,
      russellOptionId: russell ? russellOptionIdByCode.get(russell) ?? null : null,
      order: i,
    })),
  });

  // ---- Cruce detallado REC-2026-0431 (Inventarios · Inversiones del Pacífico) ----
  const crossRows: [string, string, number, number, number, number][] = [
    ["143505", "Mercancías no fabricadas por la empresa", 412580450, 412580450, 0, 124],
    ["143510", "Materias primas", 188204000, 188204000, 0, 86],
    ["143515", "Productos en proceso", 74215300, 72850450, -1364850, 41],
    ["143520", "Materiales, repuestos y accesorios", 56118200, 56340800, 222600, 33],
    ["143524", "Producto terminado", 245118400, 240218400, -4900000, 58],
    ["143530", "Envases y empaques", 18445000, 18445000, 0, 22],
    ["143599", "Otros inventarios", 9120000, 10845200, 1725200, 14],
    ["148015", "Provisión obsolescencia", -12450000, -12450000, 0, 1],
    ["143580", "Inventarios en tránsito", 31200000, 29420000, -1780000, 6],
  ];
  await prisma.reconciliation.create({
    data: {
      code: "REC-2026-0431", clientName: "Inversiones del Pacífico S.A.S", module: "Inventarios",
      period: "Marzo 2026", erp: "SIESA", status: "REVIEW", diff: "-$ 6.097.050", items: 4,
      date: "03/May/2026", owner: "J. Rincón", cutoff: "31/Mar/2026", runAt: "03/May/2026 09:14",
      runBy: "Juliana Rincón", materiality: 2000000, lastActivity: "hace 12 min",
      rows: { create: crossRows.map(([cuenta, desc, cont, mod, diff, items], i) => ({ cuenta, desc, cont, mod, diff, items, order: i })) },
      comments: {
        create: [
          { cuenta: "143515", who: "Carlos Aristizábal", initials: "CA", time: "hace 38 min", text: "La diferencia de $ 1.364.850 corresponde a una orden de producción que el ERP cerró el 01/Abr pero en contabilidad quedó del período. Verificar con planta." },
          { cuenta: "143515", who: "Juliana Rincón", initials: "JR", time: "hace 21 min", text: "Confirmado con Andrea (planta). Se reclasifica para abril. Marco como observación cerrada al recibir el ajuste contable." },
          { cuenta: "143524", who: "Juliana Rincón", initials: "JR", time: "hace 8 min", text: "Diferencia material — $ 4.900.000. Pendiente conciliar con kárdex de bodega 02 (sur). Solicito a María revisión." },
        ],
      },
    },
  });

  // ---- Secciones y renglones IVA (Bimestre 5) ----
  type LineT = [string, string, number, number, number]; // k, label, decl, cont, diff
  const ivaSections: { id: string; title: string; side: string; note?: string; lines: LineT[] }[] = [
    { id: "GEN", title: "Impuesto generado", side: "L", lines: [
      ["GEN-5", "A la tarifa del 5%", 1050000, 1050000, 0],
      ["GEN-19", "A la tarifa general", 20469000, 20468700, 300],
      ["GEN-AIU", "Sobre A.I.U. en operaciones gravadas", 0, 0, 0],
      ["GEN-JUE", "En juegos de suerte y azar", 0, 0, 0],
      ["GEN-CER", "En venta de cerveza nacional o importada", 0, 0, 0],
      ["GEN-LIC", "En venta de licores, aperitivos, vinos y similares", 0, 0, 0],
      ["GEN-RIN", "En retiro de inventario para activos fijos, consumo o donaciones", 0, 0, 0],
      ["GEN-DEV", "IVA recuperado en devoluciones en compras anuladas o resueltas", 16138000, 16138543.9, -543.9],
    ] },
    { id: "DESC", title: "Impuesto descontable", side: "R", note: "Prorrateo de la DIAN que no registra en el mismo NIT", lines: [
      ["DES-IM5", "Por importaciones gravadas a la tarifa del 5%", 1520000, 1606737, -86737],
      ["DES-IMG", "Por importaciones gravadas a la tarifa general", 12783000, 13135915, -352915],
      ["DES-ZF", "De bienes y servicios gravados provenientes de Zomac", 0, 0, 0],
      ["DES-CB5", "Por compra de bienes gravados a la tarifa del 5%", 1244900000, 1245056428, -156428],
      ["DES-CBG", "Por compra de bienes gravados a la tarifa general", 1314520000, 1314669595, -149595],
      ["DES-CS5", "Por servicios gravados a la tarifa del 5%", 0, 0, 0],
      ["DES-CSG", "Por servicios gravados a la tarifa general", 185532000, 185582283, -50283],
      ["DES-EXP", "Descuento IVA explotación hidrocarburos Art 485-2 ET", 0, 0, 0],
      ["DES-NRE", "IVA retenido por servicios de no domiciliados ni residentes", 0, 0, 0],
      ["DES-DEV", "IVA resultante por devoluciones en ventas anuladas", 1183000, 1182750, 250],
      ["DES-AJU", "Menor: Ajuste impuestos descontables (pérdidas, hurto, castigo)", 0, 0, 0],
    ] },
    { id: "RET", title: "Retención de IVA", side: "R", lines: [
      ["RET-PRA", "Retenciones por IVA que le practicaron", 2892000, 2892893, -893],
    ] },
    { id: "ING", title: "Ingresos", side: "L", lines: [
      ["ING-G5", "Por operaciones gravadas al 5%", 21000000, 34500000, -13500000],
      ["ING-GG", "Por operaciones gravadas a la tarifa general", 107730000, 107730000, 0],
      ["ING-AIU", "A.I.U. por operaciones gravadas", 0, 0, 0],
      ["ING-EXB", "Por exportación de bienes", 0, 0, 0],
      ["ING-EXS", "Por exportación de servicios", 0, 0, 0],
      ["ING-COM", "Por venta a sociedades de comercialización internacional", 0, 0, 0],
      ["ING-ZF", "Por venta a zona franca", 0, 0, 0],
      ["ING-JUE", "Por juegos de suerte y azar", 0, 0, 0],
      ["ING-EXC", "Por venta exenta (Arts. 477, 478 y 481 del E.T.)", 89520619000, 89520618327, 673],
      ["ING-CER", "Por venta de cerveza nacional o importada", 0, 0, 0],
      ["ING-LIC", "Por venta de licores, aperitivos, vinos y similares", 1755162000, 1741662027, 13499973],
      ["ING-EXC2", "Por operaciones excluidas", 2753163000, 2753155544, 7456],
      ["ING-BRU", "Total ingresos brutos", 94257194000, 94257665898, -3949],
      ["ING-NET", "Total ingresos netos recibidos durante el período", 74085031000, 74085502236, -3711],
    ] },
  ];

  const reteSections: { id: string; title: string; side: string; lines: LineT[] }[] = [
    { id: "RTA", title: "A título de renta y complementarios", side: "L", lines: [
      ["R-TRAB", "Rentas de trabajo", 28003000, 28002944, 56],
      ["R-HON", "Honorarios", 32850000, 32843821, 6179],
      ["R-SER", "Servicios", 42147000, 42145796, 1204],
      ["R-RFI", "Rendimientos financieros", 5443000, 5445160, -3160],
      ["R-ARR", "Arrendamientos (muebles e inmuebles)", 1235000, 1236726, -1726],
      ["R-COMP", "Compras", 177533000, 177533438.83, -438.83],
      ["R-EXO", "Contribuyentes exonerados de aportes (art 114-1 E.T.)", 678684000, 678681954.83, 2045.17],
    ] },
    { id: "IVAV", title: "Ventas I.V.A.", side: "R", lines: [
      ["V-RES", "A responsables del impuesto sobre las ventas", 2380000, 2380251, -251],
      ["V-NRE", "Practicadas por servicios a no residentes o no domiciliados", 0, 0, 0],
      ["V-EXC", "Menos: Retenciones practicadas en exceso o indebidas", 0, 0, 0],
    ] },
  ];

  async function seedDianForm(formKey: string, secs: { id: string; title: string; side: string; note?: string; lines: LineT[] }[]) {
    const formId = formIdByKey.get(formKey);
    if (!formId) throw new Error(`Formulario DIAN inexistente: ${formKey}`);
    for (let si = 0; si < secs.length; si++) {
      const s = secs[si];
      await prisma.dianSection.create({
        data: {
          key: `${formKey}-${s.id}`, formId, title: s.title, side: s.side, note: s.note ?? null, order: si,
          lines: { create: s.lines.map(([k, label, decl, cont, diff], i) => ({ k, label, decl, cont, diff, order: i })) },
        },
      });
    }
  }
  await seedDianForm("IVA", ivaSections);
  await seedDianForm("RETEFUENTE", reteSections);

  // ---- Mapeos de renglón → cuentas (IVA) ----
  await prisma.dianMapping.createMany({
    data: [
      { formId: formIdByKey.get("IVA")!, lineKey: "GEN-19", account: "240801", desc: "IVA generado tarifa general", sign: "+", order: 0 },
      { formId: formIdByKey.get("IVA")!, lineKey: "GEN-19", account: "240802", desc: "IVA generado en devoluciones", sign: "-", order: 1 },
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-CBG", account: "240810", desc: "IVA descontable bienes tarifa general", sign: "+", order: 0 },
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-CBG", account: "240811", desc: "IVA descontable importaciones", sign: "+", order: 1 },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-GG", account: "413505", desc: "Comercio al por mayor — gravados general", sign: "+", order: 0 },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-GG", account: "417500", desc: "Devoluciones en ventas", sign: "-", order: 1 },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-EXC", account: "413515", desc: "Ventas exentas Arts. 477-481 E.T.", sign: "+", order: 0 },
    ],
  });

  // ---- Comentarios por renglón (IVA) ----
  await prisma.dianComment.createMany({
    data: [
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-IMG", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "La diferencia de $352.915 representa el 0,03% del valor declarado. Posibles causas: IVA descontable de importaciones del cierre de octubre con DIAN del primer día hábil de noviembre, o reclasificación de tarifa entre 5% y general. Verificar la planilla de importaciones del último decadario." },
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-CB5", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "Diferencia material ($156.428). Patrón típico: facturas de proveedores recibidas después del corte pero registradas dentro del bimestre. Validar con el reporte de causación posterior." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-G5", who: "Carlos Aristizábal", initials: "CA", time: "hace 1 día", text: "Esta diferencia corresponde a facturación de septiembre que ya causó IVA; se realizó devolución y se refacturó." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-G5", who: "Juliana Rincón", initials: "JR", time: "hace 6 h", text: "Confirmado con comercial. La devolución NC-2026-1842 explica los $13.500.000. Se reclasifica como diferencia de oportunidad — no implica ajuste a la declaración." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-LIC", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "Diferencia de $13.499.973. Mismo patrón que el renglón al 5% — probablemente comparten origen (devolución y refacturación de septiembre). Validar trazabilidad." },
    ],
  });

  console.log("✅ Seed completo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
