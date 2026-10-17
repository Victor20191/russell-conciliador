import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogoPrevalidadorDeFabrica } from "@/lib/balance/prevalidador/catalogo";

// Consolidado: una cuenta del plan Russell fuera de la cédula se guarda solo para el período del
// cargue; las de la cédula siguen yendo a la memoria del cliente.
const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  encabezadoFindUnique: vi.fn(),
  encabezadoUpdateMany: vi.fn(),
  agruparPorDisponibles: vi.fn(),
  nombresCuentasCliente: vi.fn(),
  nombresConceptoDelCargue: vi.fn(),
  loteFindUnique: vi.fn(),
  loteUpdate: vi.fn(),
  disponiblesLote: vi.fn(),
  standardFindMany: vi.fn(),
  subgrupoFindMany: vi.fn(),
  periodoFindMany: vi.fn(),
  periodoDeleteMany: vi.fn(),
  periodoCreateMany: vi.fn(),
  cierreFindFirst: vi.fn(),
  memoriaFindMany: vi.fn(),
  memoriaDeleteMany: vi.fn(),
  memoriaCreateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, error: unknown) => (error instanceof Error ? error.message : String(error)),
  registrarError: vi.fn(),
}));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => false,
  subirObjeto: vi.fn(),
  obtenerObjeto: vi.fn(),
  eliminarObjeto: vi.fn(),
}));
vi.mock("@/lib/modulos/patrones/servidor", () => ({
  aplicativoConfirmadoDeCarga: vi.fn(),
  versionesPatronCandidatas: vi.fn(async () => ({ versiones: [], total: 0 })),
}));
vi.mock("@/lib/parametros/prevalidador", () => ({ getCatalogoPrevalidador: async () => catalogoPrevalidadorDeFabrica() }));
// Las consultas agregadas del detalle (driver `pg`): «Agrupar por» y los nombres del renglón.
vi.mock("@/lib/modulos/cargue-servidor", async (original) => ({
  ...(await original<typeof import("@/lib/modulos/cargue-servidor")>()),
  agruparPorDisponibles: mocks.agruparPorDisponibles,
  nombresCuentasCliente: mocks.nombresCuentasCliente,
  nombresConceptoDelCargue: mocks.nombresConceptoDelCargue,
}));
vi.mock("@/lib/modulos/borrador-servidor", async (original) => ({
  ...(await original<typeof import("@/lib/modulos/borrador-servidor")>()),
  agruparPorDisponiblesLote: mocks.disponiblesLote,
}));
// Las cuentas que concilia cada módulo (/config/prevalidador): aquí, las de fábrica del descriptor.
vi.mock("@/lib/parametros/cuentas-conciliacion", () => ({ resolverDescriptorVigente: async (descriptor: unknown) => descriptor }));
vi.mock("@/lib/prisma", () => {
  const cliente = {
    client: { findUnique: vi.fn(async () => ({ name: "Redplas" })) },
    moduloDatoEncabezado: { findUnique: mocks.encabezadoFindUnique, updateMany: mocks.encabezadoUpdateMany },
    moduloImportacionLote: { findUnique: mocks.loteFindUnique, update: mocks.loteUpdate },
    standardAccount: { findMany: mocks.standardFindMany },
    subgrupoEstandar: { findMany: mocks.subgrupoFindMany },
    asignacionPeriodoModulo: {
      findMany: mocks.periodoFindMany,
      deleteMany: mocks.periodoDeleteMany,
      createMany: mocks.periodoCreateMany,
    },
    conciliacionModuloCierre: { findFirst: mocks.cierreFindFirst },
    consolidacionModuloCliente: {
      findMany: mocks.memoriaFindMany,
      deleteMany: mocks.memoriaDeleteMany,
      createMany: mocks.memoriaCreateMany,
    },
    // El candado de la conciliación del período (`exigirPeriodoAbierto` dentro de la transacción).
    $executeRaw: vi.fn(async () => 0),
    $transaction: (arg: unknown, opciones?: unknown) => {
      mocks.transaction(arg, opciones);
      // El guardado del Consolidado va en UNA transacción interactiva (pocas sentencias).
      return typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(cliente) : Promise.resolve([]);
    },
  };
  return { default: cliente };
});

import { cambiarAgruparPorBorrador, cambiarAgruparPorConsolidado, consultarCuentasRussell, guardarConsolidacionModulo, guardarConsolidacionModuloLote } from "./modulos-datos";

const PLAN = [
  { code: "210505", name: "Bancos nacionales" },
  { code: "210510", name: "Bancos del exterior" },
  { code: "220505", name: "Proveedores nacionales" },
  { code: "220510", name: "Proveedores del exterior" },
  { code: "510506", name: "Sueldos" },
];
const ENCABEZADO = { clienteId: 17, moduloCodigo: "CXP", periodo: "2025-12" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermiso.mockResolvedValue({ ok: true });
  mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Analista" });
  mocks.encabezadoFindUnique.mockResolvedValue(ENCABEZADO);
  mocks.standardFindMany.mockImplementation(async (args: { where: { code: { in?: string[]; startsWith?: string } } }) => {
    const { in: codigos, startsWith } = args.where.code;
    return PLAN.filter((c) => (codigos ? codigos.includes(c.code) : c.code.startsWith(startsWith ?? "")))
      .map((c) => ({ code: c.code, name: c.name }));
  });
  mocks.subgrupoFindMany.mockResolvedValue([]);
  mocks.periodoFindMany.mockResolvedValue([]);
  mocks.cierreFindFirst.mockResolvedValue(null);
  mocks.memoriaFindMany.mockResolvedValue([]);
  mocks.transaction.mockResolvedValue([]);
  mocks.encabezadoUpdateMany.mockResolvedValue({ count: 1 });
  mocks.agruparPorDisponibles.mockResolvedValue({ codigo: true, concepto: true, cuenta: false });
  mocks.nombresCuentasCliente.mockResolvedValue(new Map());
  mocks.nombresConceptoDelCargue.mockResolvedValue(new Map());
});

const guardar = (cuentas4: string[], encabezadoId: number | null = 55) =>
  guardarConsolidacionModulo({ clienteId: 17, moduloCodigo: "CXP", clasificador: "GIROS", cuentas4, encabezadoId });

describe("guardarConsolidacionModulo · cuentas solo del período", () => {
  it("con una cuenta fuera de la cédula guarda el renglón entero solo para el período, sin tocar la memoria", async () => {
    const r = await guardar(["220505", "210510"]);

    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("La cuenta 210510 vale solo para 2025-12.");
    expect(mocks.memoriaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.memoriaCreateMany).not.toHaveBeenCalled();
    expect(mocks.periodoDeleteMany).toHaveBeenCalledWith({
      where: { clienteId: 17, moduloCodigo: "CXP", periodo: "2025-12", agruparPor: "codigo", OR: [{ clasificador: "GIROS", agrupador: "" }] },
    });
    const filas = mocks.periodoCreateMany.mock.calls[0][0].data;
    expect(filas.map((f: { cuenta4: string; cuenta6: string }) => `${f.cuenta4}/${f.cuenta6}`).sort()).toEqual(["2105/210510", "2205/220505"]);
    expect(filas[0]).toMatchObject({ clienteId: 17, moduloCodigo: "CXP", periodo: "2025-12", agruparPor: "codigo", clasificador: "GIROS", creadoPor: "Analista", creadoPorId: 9 });
    expect(mocks.logAudit.mock.calls[0][0].detail).toContain("solo 2025-12: 210510");
  });

  it("solo con cuentas de la cédula vuelve a la memoria y retira la asignación del período", async () => {
    mocks.periodoFindMany.mockResolvedValue([{ clasificador: "GIROS", agrupador: "" }]);

    const r = await guardar(["220505"]);

    expect(r).toMatchObject({ ok: true, message: "Consolidación guardada." });
    expect(mocks.memoriaDeleteMany).toHaveBeenCalledWith({ where: { clienteId: 17, moduloCodigo: "CXP", agruparPor: "codigo", OR: [{ clasificador: "GIROS", agrupador: "" }] } });
    expect(mocks.memoriaCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ cuenta4: "2205", cuenta6: "220505" })]);
    expect(mocks.periodoDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.periodoCreateMany).not.toHaveBeenCalled();
  });

  it("un renglón sin asignación del período no borra nada del período, pero desde el cargue siempre mira el cierre", async () => {
    const r = await guardar(["220505"]);

    expect(r.ok).toBe(true);
    // Desde el cargue de un período el cierre se consulta SIEMPRE (14/Oct/2026): fuera y dentro de la transacción.
    expect(mocks.cierreFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.periodoDeleteMany).not.toHaveBeenCalled();
  });

  it("sin cargue (configuración) la memoria se guarda sin mirar ningún cierre", async () => {
    const r = await guardar(["220505"], null);

    expect(r.ok).toBe(true);
    expect(mocks.cierreFindFirst).not.toHaveBeenCalled();
  });

  it("sin cargue no admite cuentas fuera de la cédula", async () => {
    const r = await guardar(["210510"], null);

    expect(r.ok).toBe(false);
    expect(r.message).toContain("asígnala desde el cargue del período");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta que no existe en el plan estándar Russell", async () => {
    const r = await guardar(["210599"]);

    expect(r).toEqual({ ok: false, message: "La cuenta 210599 no existe en el plan estándar Russell." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta de otra longitud", async () => {
    const r = await guardar(["2105"]);

    expect(r.ok).toBe(false);
    expect(r.message).toContain("usa una cuenta Russell de 6 dígitos");
  });

  it("con la conciliación del período en firme no cambia nada desde ese cargue, ni la memoria del cliente", async () => {
    mocks.cierreFindFirst.mockResolvedValue({
      id: 3, moduloCodigo: "CXP", periodo: "2025-12", balancePeriodo: "Diciembre 2025", balanceEncabezadoId: 210,
      moduloDatoEncabezadoId: 55, cerradoPor: "Camila", cerradoEn: new Date("2026-10-01T15:00:00Z"), cuentasRussell: [], cuentasRussell6: null,
    });
    const mensaje = "La conciliación de CXP · 2025-12 está en firme (cargue #55, cerró Camila): no se puede cambiar las cuentas del Consolidado. Pide al senior o gerente del cliente que la desbloquee para continuar.";

    const conExtra = await guardar(["210510"]);
    expect(conExtra).toEqual({ ok: false, message: mensaje });

    // Solo cuentas de la cédula (memoria del cliente): también se rechaza desde el cargue cerrado.
    const memoria = await guardar(["220505"]);
    expect(memoria).toEqual({ ok: false, message: mensaje });
    expect(mocks.transaction).not.toHaveBeenCalled();
    // El intento queda en la bitácora.
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CONCILIACIÓN EN FIRME · INTENTO BLOQUEADO" }));
  });

  it("el período sale del cargue, que debe ser del mismo cliente y módulo", async () => {
    mocks.encabezadoFindUnique.mockResolvedValue({ ...ENCABEZADO, clienteId: 99 });

    const r = await guardar(["210510"]);

    expect(r).toEqual({ ok: false, message: "El cargue no corresponde a este cliente y módulo. Recarga la página." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("el lote separa por renglón: memoria para uno, período para otro", async () => {
    const r = await guardarConsolidacionModuloLote({
      clienteId: 17,
      moduloCodigo: "CXP",
      encabezadoId: 55,
      filas: [
        { clasificador: "NACIONALES", cuentas4: ["220505"] },
        { clasificador: "GIROS", cuentas4: ["210510"] },
      ],
    });

    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("2 consolidaciones guardadas.");
    expect(mocks.memoriaDeleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ OR: [{ clasificador: "NACIONALES", agrupador: "" }] }) });
    expect(mocks.periodoCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ clasificador: "GIROS", cuenta6: "210510" })]);
  });
});

describe("Nómina · «Agrupar por» del Consolidado", () => {
  const NOMINA = { clienteId: 17, moduloCodigo: "NOM", periodo: "2025-12", version: 3, nombreCliente: "KP", agruparPor: null };

  it("agrupando por cuenta, la memoria se guarda en esa dimensión, por la cuenta del cliente y con su nombre", async () => {
    mocks.encabezadoFindUnique.mockResolvedValue({ ...NOMINA, agruparPor: "cuenta" });
    mocks.nombresCuentasCliente.mockResolvedValue(new Map([["51050601", "Sueldos administración"]]));

    const r = await guardarConsolidacionModulo({ clienteId: 17, moduloCodigo: "NOM", clasificador: "51050601 ∥ GYA", cuentas4: ["510506"], encabezadoId: 98 });

    expect(r).toEqual({ ok: true, message: "Consolidación guardada." });
    expect(mocks.memoriaFindMany.mock.calls[0][0].where).toMatchObject({ agruparPor: "cuenta" });
    expect(mocks.memoriaDeleteMany).toHaveBeenCalledWith({
      where: { clienteId: 17, moduloCodigo: "NOM", agruparPor: "cuenta", OR: [{ clasificador: "51050601", agrupador: "GYA", cuentaCliente: "51050601" }] },
    });
    expect(mocks.memoriaCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({
      agruparPor: "cuenta", clasificador: "51050601", agrupador: "GYA", cuenta6: "510506", cuentaCliente: "51050601", origen: "archivo", descripcion: "Sueldos administración",
    })]);
    expect(mocks.nombresConceptoDelCargue).toHaveBeenCalledWith(98, [], "cuenta");
  });

  it("cambia la agrupación del cargue, condicionada a la que se vio, y lo deja en la bitácora", async () => {
    mocks.encabezadoFindUnique.mockResolvedValue(NOMINA);

    const r = await cambiarAgruparPorConsolidado({ encabezadoId: 98, agruparPor: "concepto" });

    expect(r).toEqual({ ok: true, message: "El Consolidado ahora se agrupa por nombre del concepto." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:editar", { clientId: 17 });
    expect(mocks.encabezadoUpdateMany).toHaveBeenCalledWith({ where: { id: 98, agruparPor: null }, data: { agruparPor: "concepto" } });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      action: "CAMBIÓ LA AGRUPACIÓN DEL CONSOLIDADO",
      detail: "NOM 2025-12 v3 · de Código del concepto a Nombre del concepto",
    });
  });

  it("no agrupa por una dimensión que el cargue no trae, ni con la conciliación en firme, ni en otro módulo", async () => {
    mocks.encabezadoFindUnique.mockResolvedValue(NOMINA);
    expect(await cambiarAgruparPorConsolidado({ encabezadoId: 98, agruparPor: "cuenta" })).toMatchObject({ ok: false, message: expect.stringContaining("no trae cuenta contable del cliente") });

    mocks.cierreFindFirst.mockResolvedValue({ id: 3 });
    expect(await cambiarAgruparPorConsolidado({ encabezadoId: 98, agruparPor: "concepto" })).toMatchObject({ ok: false, message: expect.stringContaining("está en firme") });

    mocks.encabezadoFindUnique.mockResolvedValue({ ...NOMINA, moduloCodigo: "CXP" });
    expect(await cambiarAgruparPorConsolidado({ encabezadoId: 98, agruparPor: "concepto" })).toMatchObject({ ok: false });
    expect(mocks.encabezadoUpdateMany).not.toHaveBeenCalled();
  });

  it("si otra pestaña la cambió mientras tanto, no la pisa", async () => {
    mocks.encabezadoFindUnique.mockResolvedValue(NOMINA);
    mocks.encabezadoUpdateMany.mockResolvedValue({ count: 0 });

    expect(await cambiarAgruparPorConsolidado({ encabezadoId: 98, agruparPor: "concepto" })).toMatchObject({ ok: false, message: expect.stringContaining("cambió mientras tanto") });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe("Nómina · «Agrupar por» desde el borrador", () => {
  const LOTE = {
    id: 5, clienteId: 17, moduloCodigo: "NOM", anexoEncabezadoId: null, archivoNombre: "Preuba Melonn.xlsx",
    specJson: { hoja: "Acumulados", columnas: { codigo: 13, concepto: 14, cuenta: 15, valor: 20 }, agruparPor: "codigo", reconciliacion: { x: 1 } },
  };

  beforeEach(() => {
    mocks.loteFindUnique.mockResolvedValue(LOTE);
    mocks.loteUpdate.mockResolvedValue({});
    mocks.disponiblesLote.mockResolvedValue({ codigo: true, concepto: true, cuenta: true });
  });

  it("guarda la nueva agrupación en el spec del lote sin perder lo demás, y lo deja en la bitácora", async () => {
    const r = await cambiarAgruparPorBorrador({ loteId: "abc", agruparPor: "cuenta" });

    expect(r).toEqual({ ok: true, message: "El borrador ahora se agrupa por cuenta contable del cliente." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:crear", { clientId: 17 });
    expect(mocks.loteUpdate).toHaveBeenCalledWith({ where: { id: 5 }, data: { specJson: { ...LOTE.specJson, agruparPor: "cuenta" } } });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      action: "CAMBIÓ LA AGRUPACIÓN DEL BORRADOR",
      detail: "NOM · Preuba Melonn.xlsx · de Código del concepto a Cuenta contable del cliente",
    });
  });

  it("no agrupa por una columna que el mapeo no trae, ni por una sin datos, ni en un anexo", async () => {
    mocks.loteFindUnique.mockResolvedValue({ ...LOTE, specJson: { ...LOTE.specJson, columnas: { codigo: 13, concepto: 14, cuenta: 0 } } });
    expect(await cambiarAgruparPorBorrador({ loteId: "abc", agruparPor: "cuenta" })).toMatchObject({ ok: false, message: expect.stringContaining("columna mapeada") });

    mocks.loteFindUnique.mockResolvedValue(LOTE);
    mocks.disponiblesLote.mockResolvedValue({ codigo: true, concepto: true, cuenta: false });
    expect(await cambiarAgruparPorBorrador({ loteId: "abc", agruparPor: "cuenta" })).toMatchObject({ ok: false, message: expect.stringContaining("no trae") });

    mocks.loteFindUnique.mockResolvedValue({ ...LOTE, anexoEncabezadoId: 91 });
    expect(await cambiarAgruparPorBorrador({ loteId: "abc", agruparPor: "concepto" })).toMatchObject({ ok: false, message: expect.stringContaining("cargue existente") });
    expect(mocks.loteUpdate).not.toHaveBeenCalled();
  });
});

describe("consultarCuentasRussell", () => {
  it("busca por código en el plan y marca las de la cédula", async () => {
    const r = await consultarCuentasRussell({ encabezadoId: 55, texto: "2" });
    expect(r).toEqual({ ok: true, cuentas: [] });

    const porCodigo = await consultarCuentasRussell({ encabezadoId: 55, texto: "2205" });
    expect(porCodigo).toEqual({
      ok: true,
      cuentas: [
        { codigo: "220505", nombre: "Proveedores nacionales", deCedula: true },
        // Bajo el prefijo pero fuera de la lista de CxP: se asignaría solo para el período.
        { codigo: "220510", nombre: "Proveedores del exterior", deCedula: false },
      ],
    });
    const fuera = await consultarCuentasRussell({ encabezadoId: 55, texto: "2105" });
    expect(fuera.ok && fuera.cuentas.map((c) => `${c.codigo}:${c.deCedula}`)).toEqual(["210505:false", "210510:false"]);
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:ver", { clientId: 17 });
  });

  it("sin permiso sobre el cliente del cargue no busca", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin acceso." });

    expect(await consultarCuentasRussell({ encabezadoId: 55, texto: "2105" })).toEqual({ ok: false, message: "Sin acceso." });
    expect(mocks.standardFindMany).not.toHaveBeenCalled();
  });
});
