import { beforeEach, describe, expect, it, vi } from "vitest";

// Borrador: «Incluir» una fila apartada recupera su importe; el lector la había dejado en 0.
const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  loteFindUnique: vi.fn(),
  stagingFindMany: vi.fn(),
  stagingUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
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
vi.mock("@/lib/prisma", () => ({
  default: {
    moduloImportacionLote: { findUnique: mocks.loteFindUnique, update: vi.fn() },
    moduloImportacionStaging: { findMany: mocks.stagingFindMany, updateMany: mocks.stagingUpdateMany },
    archivoOriginalModulo: { updateMany: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { aplicarCambiosBorradorModulo } from "./modulos-datos";

/** Lo que se escribió en cada fila, llaveado por su número. */
const escrito = () => new Map(mocks.stagingUpdateMany.mock.calls.map(([arg]) => [arg.where.filaNum as number, arg.data as Record<string, unknown>]));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermiso.mockResolvedValue({ ok: true });
  mocks.loteFindUnique.mockResolvedValue({ clienteId: 79, moduloCodigo: "CAR" });
  mocks.stagingFindMany.mockResolvedValue([]);
  mocks.stagingUpdateMany.mockReturnValue({ count: 1 });
  mocks.transaction.mockResolvedValue([]);
});

describe("aplicarCambiosBorradorModulo · «Incluir» una fila apartada", () => {
  it("la fila en cero entra con el importe que conserva en `datos`", async () => {
    mocks.stagingFindMany.mockResolvedValue([
      { filaNum: 449, datos: { total: 90_381_842 } },
      { filaNum: 450, datos: { _valorApartado: 4_891_561, total: 1 } },
    ]);

    const r = await aplicarCambiosBorradorModulo("lote-1", [
      { filaNum: 449, tipoFila: "movimiento" },
      { filaNum: 450, tipoFila: "movimiento" },
    ]);

    expect(r.ok).toBe(true);
    expect(mocks.stagingFindMany).toHaveBeenCalledWith({
      where: { loteId: "lote-1", filaNum: { in: [449, 450] }, valor: 0 },
      select: { filaNum: true, datos: true },
    });
    expect(escrito().get(449)).toEqual({ tipoFila: "movimiento", tipoFilaForzado: "movimiento", omitida: null, valor: 90_381_842 });
    expect(escrito().get(450)).toMatchObject({ valor: 4_891_561 });
  });

  it("no toca el valor de la fila que ya lo tiene ni el de la que no trae cifra", async () => {
    // La fila 7 ya tiene valor (un subtotal rescatado): la consulta de filas en cero no la trae.
    mocks.stagingFindMany.mockResolvedValue([{ filaNum: 8, datos: { total: null } }]);

    await aplicarCambiosBorradorModulo("lote-1", [{ filaNum: 7, tipoFila: "movimiento" }, { filaNum: 8, tipoFila: "movimiento" }]);

    expect(escrito().get(7)).not.toHaveProperty("valor");
    expect(escrito().get(8)).not.toHaveProperty("valor");
  });

  it("marcar un total u omitir no busca importes ni cambia el valor", async () => {
    await aplicarCambiosBorradorModulo("lote-1", [{ filaNum: 3, tipoFila: "total" }, { filaNum: 4, omitida: true }]);

    expect(mocks.stagingFindMany).not.toHaveBeenCalled();
    expect(escrito().get(3)).not.toHaveProperty("valor");
    expect(escrito().get(4)).toEqual({ omitida: true });
  });
});
