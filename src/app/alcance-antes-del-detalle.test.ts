import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permiso: vi.fn(), requerido: vi.fn(), balance: vi.fn(), loteBalance: vi.fn(), stagingBalance: vi.fn(),
  modulo: vi.fn(), detalleModulo: vi.fn(), loteModulo: vi.fn(), stagingModulo: vi.fn(),
  conciliacion: vi.fn(), filasLote: vi.fn(), descriptor: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  balancePruebaEncabezado: { findUnique: mocks.balance },
  balanceImportacionLote: { findUnique: mocks.loteBalance },
  balanceImportacionStaging: { findMany: mocks.stagingBalance },
  moduloDatoEncabezado: { findUnique: mocks.modulo },
  moduloDatoDetalle: { findMany: mocks.detalleModulo },
  moduloImportacionLote: { findUnique: mocks.loteModulo },
  moduloImportacionStaging: { findMany: mocks.stagingModulo },
  reconciliation: { findUnique: mocks.conciliacion },
} }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.permiso, requirePermiso: mocks.requerido }));
vi.mock("@/lib/rbac/contexto", () => ({ clientIdPorNombre: vi.fn() }));
vi.mock("@/lib/balance/autorizacion-borrador", () => ({
  contextoAccesoBorradorActual: async () => ({ usuarioId: 7, alcance: { todos: false, clientIds: [12] } }),
  puedeVerBorrador: () => false,
}));
vi.mock("@/lib/modulos/borrador-servidor", () => ({ filasDelLote: mocks.filasLote }));
vi.mock("@/lib/parametros/cuentas-conciliacion", () => ({ resolverDescriptorVigente: mocks.descriptor }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("DENIED"); } }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "Fallo inesperado", registrarError: vi.fn() }));

const parametros = { params: Promise.resolve({ id: "4", codigo: "inv", loteId: "lote-ajeno" }), searchParams: Promise.resolve({}) };
const peticion = new Request("http://localhost/descarga");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permiso.mockImplementation(async (_permiso: string, scope?: unknown) => scope ? { ok: false, message: "Sin cartera" } : { ok: true });
  mocks.requerido.mockImplementation(async (_permiso: string, scope?: unknown) => { if (scope) throw new Error("DENIED"); });
  for (const fn of [mocks.balance, mocks.loteBalance, mocks.modulo, mocks.loteModulo]) fn.mockResolvedValue({ clienteId: 99, moduloCodigo: "INV" });
  mocks.conciliacion.mockResolvedValue({ clientId: 99, clientName: "Cliente ajeno" });
});

const exportaciones = [
  ["balance", () => import("./(app)/balance/[id]/export/route"), mocks.balance, undefined, 403],
  ["borrador de balance", () => import("./(app)/balance/borradores/[loteId]/export/route"), mocks.loteBalance, mocks.stagingBalance, 404],
  ["módulo", () => import("./(app)/modulos/[codigo]/[id]/export/route"), mocks.modulo, mocks.detalleModulo, 403],
  ["borrador de módulo", () => import("./(app)/modulos/[codigo]/borradores/[loteId]/export/route"), mocks.loteModulo, mocks.stagingModulo, 403],
] as const;

describe("exports autorizan antes de cargar filas", () => {
  it.each(exportaciones)("%s: cartera ajena solo consulta referencia mínima", async (_nombre, cargar, referencia, pesado, status) => {
    const { GET } = await cargar();
    const response = await GET(peticion, parametros);
    expect(response.status).toBe(status);
    expect(referencia).toHaveBeenCalledOnce();
    expect(referencia.mock.calls[0][0]).toHaveProperty("select.clienteId", true);
    expect(referencia.mock.calls[0][0]).not.toHaveProperty("include");
    if (pesado) expect(pesado).not.toHaveBeenCalled();
    expect(mocks.descriptor).not.toHaveBeenCalled();
  });

  it.each(exportaciones)("%s: sin permiso global no consulta siquiera referencia", async (_nombre, cargar, referencia) => {
    mocks.permiso.mockResolvedValue({ ok: false, message: "Sin permiso" });
    const { GET } = await cargar();
    expect((await GET(peticion, parametros)).status).toBe(403);
    expect(referencia).not.toHaveBeenCalled();
  });
});

const paginas = [
  ["balance", () => import("./(app)/balance/[id]/page"), mocks.balance, "DENIED"],
  ["comparativo de balance", () => import("./(app)/balance/[id]/diff/page"), mocks.balance, "DENIED"],
  ["conciliación", () => import("./(app)/conciliacion/resultados/[id]/page"), mocks.conciliacion, "DENIED"],
  ["módulo", () => import("./(app)/modulos/[codigo]/[id]/page"), mocks.modulo, "NOT_FOUND"],
  ["borrador de módulo", () => import("./(app)/modulos/[codigo]/borradores/[loteId]/page"), mocks.loteModulo, "NOT_FOUND"],
] as const;

describe("páginas autorizan antes de cargar detalle o calcular descriptores", () => {
  it.each(paginas)("%s: deniega tras referencia mínima", async (_nombre, cargar, referencia, error) => {
    const { default: Page } = await cargar();
    await expect(Page(parametros)).rejects.toThrow(error);
    expect(referencia).toHaveBeenCalledOnce();
    expect(referencia.mock.calls[0][0]).toHaveProperty("select");
    expect(referencia.mock.calls[0][0]).not.toHaveProperty("include");
    expect(mocks.detalleModulo).not.toHaveBeenCalled();
    expect(mocks.filasLote).not.toHaveBeenCalled();
    expect(mocks.descriptor).not.toHaveBeenCalled();
  });
});
