import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), cliente: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { clientAccount: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorize }));
vi.mock("@/lib/conciliacion/verificar-bloqueo", () => ({
  bloqueoHomologacionBalance: vi.fn(async () => null),
  bloqueoMemoriaHomologacion: vi.fn(async () => null),
  cierresFirmes: vi.fn(async () => []),
  cierresFirmesDeBalance: vi.fn(async () => []),
  cuentasBloqueadas: vi.fn(async () => []),
  exigirCargueCompatibleConCierres: vi.fn(async () => undefined),
  registrarIntentoBloqueado: vi.fn(async () => undefined),
  autorizarCierreConciliacion: vi.fn(async () => ({ ok: true, userId: 1, role: "Senior" })),
  ErrorConciliacionEnFirme: class ErrorConciliacionEnFirme extends Error {},
}));
vi.mock("@/lib/rbac/contexto", () => ({ clienteDeCuentaCliente: mocks.cliente }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ name: "Prueba" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "Error al guardar." }));

import {
  alinearMapeoConGrupo,
  confirmarMapeoCliente,
  crearMapeoCliente,
  declararExcepcionMapeo,
  editarMapeoCliente,
  eliminarMapeoCliente,
} from "./mapeo-cliente";

describe("retirar reglas desde el PUC completo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ ok: true });
    mocks.cliente.mockResolvedValue(23);
    mocks.findUnique.mockResolvedValue({ code: "1105050101", clienteId: 23, cuenta6Russell: "110510" });
    mocks.update.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });
  const formulario = () => { const f = new FormData(); f.set("id", "7"); return f; };

  it("quitar la cuenta N10 conserva las reglas N12/N14 que empiezan igual", async () => {
    expect(await eliminarMapeoCliente(undefined, formulario())).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ cuenta6Russell: null }) }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("quitar un grupo conserva el alcance por cliente y prefijo N6", async () => {
    mocks.findUnique.mockResolvedValue({ code: "110505", clienteId: 23, cuenta6Russell: "110510" });
    await eliminarMapeoCliente(undefined, formulario());
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 23, code: { startsWith: "110505" }, NOT: { id: 7 } } }));
  });
  it("rechaza una cuenta fuera de la cartera antes de escribir", async () => {
    mocks.authorize.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "Fuera de cartera" });
    expect(await eliminarMapeoCliente(undefined, formulario())).toEqual({ ok: false, message: "Fuera de cartera" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("la memoria del cliente la edita el senior asignado", () => {
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const acciones: [string, () => Promise<{ ok?: boolean; message?: string }>][] = [
    ["crear", () => crearMapeoCliente(undefined, form({ clienteId: "23", cuenta6: "110505", codigo: "110505" }))],
    ["editar", () => editarMapeoCliente(undefined, form({ id: "7", codigo: "110505" }))],
    ["confirmar", () => confirmarMapeoCliente(form({ id: "7" }))],
    ["eliminar", () => eliminarMapeoCliente(undefined, form({ id: "7" }))],
    ["alinear con el grupo", () => alinearMapeoConGrupo(form({ id: "7" }))],
    ["declarar excepción", () => declararExcepcionMapeo(form({ id: "7" }))],
  ];

  it.each(acciones)("%s exige balance:revisar: el Staff (balance:crear) no puede", async (_nombre, ejecutar) => {
    vi.clearAllMocks();
    mocks.authorize.mockImplementation(async (permiso: string) =>
      permiso === "balance:revisar" ? { ok: false, message: "No tienes permisos para esta acción." } : { ok: true });

    expect(await ejecutar()).toEqual({ ok: false, message: "No tienes permisos para esta acción." });
    expect(mocks.authorize).toHaveBeenCalledWith("balance:revisar");
    expect(mocks.authorize).not.toHaveBeenCalledWith("balance:crear");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("las mutaciones del mapeo exigen el propietario inequívoco", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ ok: true, role: "Administrador" });
    mocks.cliente.mockResolvedValue(23);
    mocks.findUnique.mockResolvedValue({ code: "1105050101", clienteId: 23, cuenta6Russell: "110510", origenMapeo: "manual" });
  });
  const formulario = () => {
    const f = new FormData();
    f.set("id", "7");
    f.set("codigo", "110505");
    return f;
  };
  const acciones = [
    { nombre: "editar", ejecutar: () => editarMapeoCliente(undefined, formulario()) },
    { nombre: "confirmar", ejecutar: () => confirmarMapeoCliente(formulario()) },
    { nombre: "eliminar", ejecutar: () => eliminarMapeoCliente(undefined, formulario()) },
    { nombre: "alinear", ejecutar: () => alinearMapeoConGrupo(formulario()) },
    { nombre: "declarar excepción", ejecutar: () => declararExcepcionMapeo(formulario()) },
  ];

  it.each(acciones)("$nombre verifica la cartera del propietario resuelto antes de escribir", async ({ ejecutar }) => {
    mocks.authorize.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "Fuera de cartera" });
    expect(await ejecutar()).toEqual({ ok: false, message: "Fuera de cartera" });
    expect(mocks.cliente).toHaveBeenCalledWith(7);
    expect(mocks.authorize).toHaveBeenNthCalledWith(2, "balance:revisar", { clientId: 23 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(acciones)("$nombre deniega identidad ambigua incluso con un administrador global", async ({ ejecutar }) => {
    mocks.cliente.mockResolvedValue(null);
    expect(await ejecutar()).toEqual({ ok: false, message: "No se pudo identificar de forma inequívoca el cliente de la cuenta." });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
