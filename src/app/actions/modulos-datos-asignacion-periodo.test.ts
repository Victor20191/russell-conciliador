import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogoPrevalidadorDeFabrica } from "@/lib/balance/prevalidador/catalogo";

// Consolidado: una cuenta del plan Russell fuera de la cédula se guarda solo para el período del
// cargue; las de la cédula siguen yendo a la memoria del cliente.
const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  encabezadoFindUnique: vi.fn(),
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
vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findUnique: vi.fn(async () => ({ name: "Redplas" })) },
    moduloDatoEncabezado: { findUnique: mocks.encabezadoFindUnique },
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
    $transaction: mocks.transaction,
  },
}));

import { consultarCuentasRussell, guardarConsolidacionModulo, guardarConsolidacionModuloLote } from "./modulos-datos";

const PLAN = [
  { code: "210505", name: "Bancos nacionales" },
  { code: "210510", name: "Bancos del exterior" },
  { code: "220505", name: "Proveedores nacionales" },
  { code: "220510", name: "Proveedores del exterior" },
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
      where: { clienteId: 17, moduloCodigo: "CXP", periodo: "2025-12", clasificador: "GIROS", agrupador: "" },
    });
    const filas = mocks.periodoCreateMany.mock.calls[0][0].data;
    expect(filas.map((f: { cuenta4: string; cuenta6: string }) => `${f.cuenta4}/${f.cuenta6}`).sort()).toEqual(["2105/210510", "2205/220505"]);
    expect(filas[0]).toMatchObject({ clienteId: 17, moduloCodigo: "CXP", periodo: "2025-12", clasificador: "GIROS", creadoPor: "Analista", creadoPorId: 9 });
    expect(mocks.logAudit.mock.calls[0][0].detail).toContain("solo 2025-12: 210510");
  });

  it("solo con cuentas de la cédula vuelve a la memoria y retira la asignación del período", async () => {
    mocks.periodoFindMany.mockResolvedValue([{ clasificador: "GIROS", agrupador: "" }]);

    const r = await guardar(["220505"]);

    expect(r).toMatchObject({ ok: true, message: "Consolidación guardada." });
    expect(mocks.memoriaDeleteMany).toHaveBeenCalledWith({ where: { clienteId: 17, moduloCodigo: "CXP", clasificador: "GIROS", agrupador: "" } });
    expect(mocks.memoriaCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ cuenta4: "2205", cuenta6: "220505" })]);
    expect(mocks.periodoDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.periodoCreateMany).not.toHaveBeenCalled();
  });

  it("un renglón sin asignación del período no consulta el cierre ni borra nada del período", async () => {
    const r = await guardar(["220505"]);

    expect(r.ok).toBe(true);
    expect(mocks.cierreFindFirst).not.toHaveBeenCalled();
    expect(mocks.periodoDeleteMany).not.toHaveBeenCalled();
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

  it("con la conciliación del período en firme no crea ni quita asignaciones del período", async () => {
    mocks.cierreFindFirst.mockResolvedValue({ id: 3 });

    const conExtra = await guardar(["210510"]);
    expect(conExtra).toEqual({ ok: false, message: "La conciliación de 2025-12 está en firme: desbloquéala para cambiar las cuentas que valen solo para ese período." });

    mocks.periodoFindMany.mockResolvedValue([{ clasificador: "GIROS", agrupador: "" }]);
    const quitando = await guardar(["220505"]);
    expect(quitando.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
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
    expect(mocks.memoriaDeleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ clasificador: "NACIONALES" }) });
    expect(mocks.periodoCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ clasificador: "GIROS", cuenta6: "210510" })]);
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
