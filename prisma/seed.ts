import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pucMaster from "./data/puc-maestro-russell.json";
import { exigirBaseDesechable } from "./guardia-destructiva";
import { fechaCalendarioPrisma } from "../src/lib/fecha-hora";
import { PREVALIDADOR_CATALOGO_FABRICA } from "../src/lib/balance/prevalidador/catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Este seed vacía las tablas de negocio: nunca debe tocar una base real.
  await exigirBaseDesechable(prisma, "db:seed");

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
  await prisma.balancePruebaDetalle.deleteMany();
  await prisma.balancePruebaEncabezado.deleteMany();
  await prisma.standardAccount.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reconciliationComment.deleteMany();
  await prisma.reconciliationRow.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.moduleField.deleteMany();
  await prisma.clientModule.deleteMany();
  await prisma.clientErpProcess.deleteMany();
  // El catálogo del prevalidador referencia `modulos` con FK RESTRICT: va antes.
  await prisma.prevalidadorCuentaCliente.deleteMany();
  await prisma.prevalidadorCuenta.deleteMany();
  await prisma.module.deleteMany();
  await prisma.client.deleteMany();
  await prisma.erpProcess.deleteMany();
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

  // ---- Procesos ERP por cliente ----
  await prisma.erpProcess.createMany({
    data: [
      { code: "CONT", name: "Contabilidad", order: 10 },
      { code: "NOM", name: "Nómina", order: 20 },
      { code: "INV", name: "Inventarios", order: 30 },
      { code: "ING", name: "Ingresos", order: 40 },
      { code: "CAR", name: "Cartera", order: 50 },
      { code: "CXP", name: "Cuentas por pagar", order: 60 },
      { code: "AFI", name: "Activos fijos", order: 70 },
    ],
  });
  const procesoContable = await prisma.erpProcess.findUniqueOrThrow({
    where: { code: "CONT" },
    select: { id: true },
  });

  // ---- Prevalidador de homologación ----
  // Las 11 filas que definió Russell. La migración las siembra en las BD que ya
  // existen; esto deja igual una BD creada desde cero.
  await prisma.prevalidadorCuenta.createMany({
    data: PREVALIDADOR_CATALOGO_FABRICA.flatMap((f) => {
      const moduloId = moduleIdByCode.get(f.moduloCodigo);
      return moduloId
        ? [{ moduloId, cuentaRussell: f.cuentaRussell, etiqueta: f.etiqueta, baseCalculo: f.baseCalculo, orden: f.orden }]
        : [];
    }),
    skipDuplicates: true,
  });

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
        erpsPorProceso: {
          create: {
            processId: procesoContable.id,
            erpId: erpIdByCode.get(c.erp)!,
            status: "heredado",
            source: "seed",
          },
        },
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
      { code: "REC-2026-0418", clientName: "Distribuciones El Roble S.A.", module: "Inventarios", period: "Feb 2026", erp: "SIIGO", status: "OK", diff: "$ 0", items: 0, owner: "M. Bermúdez", createdAt: new Date("2026-04-22T12:00:00-05:00") },
      { code: "REC-2026-0412", clientName: "Agroindustrias del Cauca Ltda.", module: "Cartera", period: "Mar 2026", erp: "SIIGO", status: "DIFF", diff: "$ 4.218.500", items: 7, owner: "J. Rincón", lastActivity: new Date("2026-04-21T16:00:00-05:00"), createdAt: new Date("2026-04-21T12:00:00-05:00") },
      { code: "REC-2026-0407", clientName: "Logística Andina Express S.A.", module: "Cuentas por pagar", period: "Mar 2026", erp: "SAP", status: "DIFF", diff: "$ 12.044.180", items: 18, owner: "C. Aristizábal", lastActivity: new Date("2026-04-20T09:40:00-05:00"), createdAt: new Date("2026-04-20T09:00:00-05:00") },
      { code: "REC-2026-0403", clientName: "Inversiones del Pacífico S.A.S", module: "Cartera", period: "Mar 2026", erp: "SIESA", status: "REVIEW", diff: "$ 805.220", items: 3, owner: "J. Rincón", lastActivity: new Date("2026-04-18T17:12:00-05:00"), createdAt: new Date("2026-04-18T12:00:00-05:00") },
      { code: "REC-2026-0398", clientName: "Servicios Médicos Vital IPS", module: "Nómina", period: "Mar 2026", erp: "SIESA", status: "OK", diff: "$ 0", items: 0, owner: "M. Bermúdez", createdAt: new Date("2026-04-16T12:00:00-05:00") },
      { code: "REC-2026-0394", clientName: "Constructora Río Verde S.A.S", module: "Activos fijos", period: "Feb 2026", erp: "OFIMATICA", status: "DIFF", diff: "$ 1.450.000", items: 2, owner: "C. Aristizábal", createdAt: new Date("2026-04-15T12:00:00-05:00") },
    ],
  });

  // Las notificaciones no se siembran: se crean solo desde acciones de proceso reales.

  // ---- Auditoría ----
  await prisma.auditEntry.createMany({
    data: [
      { createdAt: new Date("2026-05-03T09:14:22-05:00"), user: "Juliana Rincón", action: "EJECUTÓ", entity: "Cruce REC-2026-0431", detail: "Inventarios · Inversiones del Pacífico · Marzo 2026", ip: "190.85.241.18" },
      { createdAt: new Date("2026-05-03T09:13:48-05:00"), user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Cuentas (Inventarios)", detail: "7 cuentas auto, 1 reasignada por similitud, 1 sin mapeo", ip: "190.85.241.18" },
      { createdAt: new Date("2026-05-03T09:11:02-05:00"), user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Campos (Inventarios)", detail: "10 de 10 campos requeridos cubiertos", ip: "190.85.241.18" },
      { createdAt: new Date("2026-05-03T09:08:17-05:00"), user: "Juliana Rincón", action: "CARGÓ ARCHIVO", entity: "INV_PACIFICO_MAR2026.xlsx", detail: "4.821 filas · 12 columnas · 1,4 MB", ip: "190.85.241.18" },
      { createdAt: new Date("2026-05-03T09:07:55-05:00"), user: "Juliana Rincón", action: "INICIÓ", entity: "Parametrización", detail: "Cliente C-1042 · Módulo Inventarios", ip: "190.85.241.18" },
      { createdAt: new Date("2026-05-02T17:41:09-05:00"), user: "María Bermúdez", action: "ASIGNÓ", entity: "REC-2026-0431", detail: "Asignado a Juliana Rincón con prioridad media", ip: "interno" },
    ],
  });

  // ---- Plan de cuentas estándar ----
  await prisma.standardAccount.createMany({
    data: pucMaster.accounts,
  });

  // ---- Balances ----
  // El balance de prueba se carga desde la UI (modelo normalizado encabezado +
  // detalle); ya no se siembran balances demo.

  // ---- DIAN ----
  const forms = [
    { key: "IVA", name: "IVA", code: "F-300", periodicity: "Bimestral", icon: "doc", periods: [
      { periodKey: "2026-B5", label: "Bimestre 5 · Sep-Oct 2026", status: "DIFF", filed: fechaCalendarioPrisma("2026-11-15") },
      { periodKey: "2026-B4", label: "Bimestre 4 · Jul-Ago 2026", status: "OK", filed: fechaCalendarioPrisma("2026-09-15") },
      { periodKey: "2026-B3", label: "Bimestre 3 · May-Jun 2026", status: "OK", filed: fechaCalendarioPrisma("2026-07-15") },
      { periodKey: "2026-B2", label: "Bimestre 2 · Mar-Abr 2026", status: "DIFF", filed: fechaCalendarioPrisma("2026-05-15") },
      { periodKey: "2026-B1", label: "Bimestre 1 · Ene-Feb 2026", status: "OK", filed: fechaCalendarioPrisma("2026-03-15") },
    ] },
    { key: "RETEFUENTE", name: "Retención en la fuente", code: "F-350", periodicity: "Mensual", icon: "wallet", periods: [
      { periodKey: "2026-10", label: "Octubre 2026", status: "OK", filed: fechaCalendarioPrisma("2026-11-08") },
      { periodKey: "2026-09", label: "Septiembre 2026", status: "OK", filed: fechaCalendarioPrisma("2026-10-08") },
      { periodKey: "2026-08", label: "Agosto 2026", status: "OK", filed: fechaCalendarioPrisma("2026-09-08") },
      { periodKey: "2026-07", label: "Julio 2026", status: "DIFF", filed: fechaCalendarioPrisma("2026-08-08") },
      { periodKey: "2026-06", label: "Junio 2026", status: "OK", filed: fechaCalendarioPrisma("2026-07-08") },
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
      owner: "J. Rincón", cutoff: fechaCalendarioPrisma("2026-03-31"), runAt: new Date("2026-05-03T09:14:00-05:00"),
      runBy: "Juliana Rincón", materiality: 2000000, lastActivity: new Date("2026-05-03T09:23:00-05:00"),
      createdAt: new Date("2026-05-03T09:14:00-05:00"),
      rows: { create: crossRows.map(([cuenta, desc, cont, mod, diff, items], i) => ({ cuenta, desc, cont, mod, diff, items, order: i })) },
      comments: {
        create: [
          { cuenta: "143515", who: "Carlos Aristizábal", initials: "CA", createdAt: new Date("2026-05-03T08:45:00-05:00"), text: "La diferencia de $ 1.364.850 corresponde a una orden de producción que el ERP cerró el 01/Abr pero en contabilidad quedó del período. Verificar con planta." },
          { cuenta: "143515", who: "Juliana Rincón", initials: "JR", createdAt: new Date("2026-05-03T09:02:00-05:00"), text: "Confirmado con Andrea (planta). Se reclasifica para abril. Marco como observación cerrada al recibir el ajuste contable." },
          { cuenta: "143524", who: "Juliana Rincón", initials: "JR", createdAt: new Date("2026-05-03T09:15:00-05:00"), text: "Diferencia material — $ 4.900.000. Pendiente conciliar con kárdex de bodega 02 (sur). Solicito a María revisión." },
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
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-IMG", who: "IA", initials: "IA", isAI: true, createdAt: new Date("2026-05-03T08:00:00-05:00"), text: "La diferencia de $352.915 representa el 0,03% del valor declarado. Posibles causas: IVA descontable de importaciones del cierre de octubre con DIAN del primer día hábil de noviembre, o reclasificación de tarifa entre 5% y general. Verificar la planilla de importaciones del último decadario." },
      { formId: formIdByKey.get("IVA")!, lineKey: "DES-CB5", who: "IA", initials: "IA", isAI: true, createdAt: new Date("2026-05-03T08:05:00-05:00"), text: "Diferencia material ($156.428). Patrón típico: facturas de proveedores recibidas después del corte pero registradas dentro del bimestre. Validar con el reporte de causación posterior." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-G5", who: "Carlos Aristizábal", initials: "CA", createdAt: new Date("2026-05-02T11:00:00-05:00"), text: "Esta diferencia corresponde a facturación de septiembre que ya causó IVA; se realizó devolución y se refacturó." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-G5", who: "Juliana Rincón", initials: "JR", createdAt: new Date("2026-05-03T03:00:00-05:00"), text: "Confirmado con comercial. La devolución NC-2026-1842 explica los $13.500.000. Se reclasifica como diferencia de oportunidad — no implica ajuste a la declaración." },
      { formId: formIdByKey.get("IVA")!, lineKey: "ING-LIC", who: "IA", initials: "IA", isAI: true, createdAt: new Date("2026-05-03T08:10:00-05:00"), text: "Diferencia de $13.499.973. Mismo patrón que el renglón al 5% — probablemente comparten origen (devolución y refacturación de septiembre). Validar trazabilidad." },
    ],
  });

  console.log("✅ Seed completo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
