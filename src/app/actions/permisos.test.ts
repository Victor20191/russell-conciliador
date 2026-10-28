import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), roles: vi.fn(), permisos: vi.fn(), grants: vi.fn(),
  crear: vi.fn(), eliminar: vi.fn(), transaction: vi.fn(), audit: vi.fn(), tag: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: mocks.tag }));
vi.mock("@/lib/prisma", () => ({ default: {
  role: { findMany: mocks.roles },
  permission: { findMany: mocks.permisos },
  rolePermission: { findMany: mocks.grants, createMany: mocks.crear, deleteMany: mocks.eliminar },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorize }));
vi.mock("@/lib/rbac/contexto", () => ({ RBAC_CACHE_TAG: "prueba-matriz" }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ name: "Prueba" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "No se pudo guardar." }));

import { guardarNiveles } from "./permisos";
import { PERMISOS } from "@/lib/rbac/catalogo";

const permisos = [
  { id: 1, code: "auditoria:ver", module: "auditoria", action: "ver" },
  { id: 2, code: "auditoria:accesos", module: "auditoria", action: "accesos" },
  { id: 3, code: "auditoria:ia", module: "auditoria", action: "ia" },
  { id: 4, code: "auditoria:reporte_ejecutivo", module: "auditoria", action: "reporte_ejecutivo" },
  { id: 5, code: "publicacion_modulos:ver", module: "publicacion_modulos", action: "ver" },
  { id: 6, code: "publicacion_modulos:configurar", module: "publicacion_modulos", action: "configurar" },
  { id: 7, code: "prompts:administrar", module: "prompts", action: "administrar" },
  { id: 8, code: "soporte:ver", module: "soporte", action: "ver" },
  { id: 9, code: "soporte:eliminar", module: "soporte", action: "eliminar" },
  { id: 10, code: "roles:configurar", module: "roles", action: "configurar" },
];
const concesion = (permissionId: number, roleId = 10) => ({
  roleId, permissionId,
  permission: permisos.find((p) => p.id === permissionId)!,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, userId: 100, role: "Administrador" });
  mocks.roles.mockResolvedValue([
    { id: 10, code: "Administrador", name: "Administrador" },
    { id: 20, code: "Superadministrador", name: "Superadministrador" },
    { id: 30, code: "Consulta", name: "Consulta legado" },
  ]);
  mocks.permisos.mockResolvedValue(permisos);
  mocks.grants.mockResolvedValue([]);
  mocks.crear.mockResolvedValue({ count: 1 });
  mocks.eliminar.mockResolvedValue({ count: 1 });
  mocks.transaction.mockResolvedValue([]);
});

function sinEscrituras() {
  expect(mocks.crear).not.toHaveBeenCalled();
  expect(mocks.eliminar).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.tag).not.toHaveBeenCalled();
}

describe("la matriz no eleva la autoridad del administrador", () => {
  it("exige roles:configurar antes de consultar o escribir", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "Sin permiso" });
    expect(await guardarNiveles([{ roleId: 10, module: "auditoria", nivel: "ver" }]))
      .toEqual({ ok: false, message: "Sin permiso" });
    expect(mocks.authorize).toHaveBeenCalledWith("roles:configurar");
    expect(mocks.roles).not.toHaveBeenCalled();
    sinEscrituras();
  });

  it.each(["ninguno", "ver", "administrar"] as const)("no permite nivel %s sobre Superadministrador, ni dentro de un lote", async (nivel) => {
    const result = await guardarNiveles([
      { roleId: 10, module: "auditoria", nivel: "ver" },
      { roleId: 20, module: "auditoria", nivel },
    ]);
    expect(result).toEqual({ ok: false, message: "Solo un Superadministrador puede modificar los permisos de ese rol." });
    sinEscrituras();
  });

  it("administrar Auditoría concede accesos ordinarios, pero no IA ni reporte ejecutivo", async () => {
    expect(await guardarNiveles([{ roleId: 10, module: "auditoria", nivel: "administrar" }]))
      .toEqual({ ok: true, guardados: 1 });
    expect(mocks.crear).toHaveBeenCalledWith({ data: [
      { roleId: 10, permissionId: 1 }, { roleId: 10, permissionId: 2 },
    ], skipDuplicates: true });
    expect(mocks.eliminar).not.toHaveBeenCalled();
    expect(mocks.tag).toHaveBeenCalledWith("prueba-matriz");
  });

  it("bajar Auditoría a Ninguno conserva concesiones reservadas previas, incluso inactivas", async () => {
    mocks.permisos.mockResolvedValue(permisos.filter((p) => p.id !== 4));
    mocks.grants.mockResolvedValue([1, 2, 3, 4].map((id) => concesion(id)));
    expect(await guardarNiveles([{ roleId: 10, module: "auditoria", nivel: "ninguno" }]))
      .toEqual({ ok: true, guardados: 1 });
    expect(mocks.eliminar).toHaveBeenCalledWith({ where: { OR: [
      { roleId: 10, permissionId: 1 }, { roleId: 10, permissionId: 2 },
    ] } });
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it.each(["publicacion_modulos", "prompts"])("rechaza módulos exclusivamente reservados: %s", async (module) => {
    mocks.grants.mockResolvedValue([5, 6, 7].map((id) => concesion(id)));
    for (const nivel of ["ninguno", "administrar"] as const) {
      expect(await guardarNiveles([{ roleId: 10, module, nivel }])).toMatchObject({ ok: false });
    }
    sinEscrituras();
  });

  it("no concede ni revoca soporte:eliminar al cambiar el nivel de Soporte", async () => {
    mocks.grants.mockResolvedValue([concesion(9)]);
    expect(await guardarNiveles([{ roleId: 10, module: "soporte", nivel: "administrar" }])).toMatchObject({ ok: true });
    expect(mocks.crear).toHaveBeenCalledWith({ data: [{ roleId: 10, permissionId: 8 }], skipDuplicates: true });
    expect(mocks.eliminar).not.toHaveBeenCalled();
  });

  it("el fixture cubre todos los permisos del catálogo reservados al Superadministrador", () => {
    const reservados = PERMISOS.filter((p) => p.roles.length === 1 && p.roles[0] === "Superadministrador");
    expect(reservados.map((p) => p.code).sort()).toEqual([
      "auditoria:ia", "auditoria:reporte_ejecutivo", "prompts:administrar",
      "publicacion_modulos:configurar", "publicacion_modulos:ver", "soporte:eliminar",
    ]);
  });

  it("mantiene fuera de la matriz los roles legado aun para Superadministrador", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, role: "Superadministrador" });
    expect(await guardarNiveles([{ roleId: 30, module: "auditoria", nivel: "ver" }])).toMatchObject({ ok: false });
    sinEscrituras();
  });
});

describe("gestión legítima por Superadministrador", () => {
  beforeEach(() => mocks.authorize.mockResolvedValue({ ok: true, userId: 200, role: "Superadministrador" }));

  it("puede gestionar su propio rol e incluir permisos reservados", async () => {
    expect(await guardarNiveles([{ roleId: 20, module: "auditoria", nivel: "administrar" }]))
      .toEqual({ ok: true, guardados: 1 });
    expect(mocks.crear).toHaveBeenCalledWith({ data: [1, 2, 3, 4].map((permissionId) => ({ roleId: 20, permissionId })), skipDuplicates: true });
  });

  it("puede retirar explícitamente privilegios reservados concedidos previamente a otro rol", async () => {
    mocks.grants.mockResolvedValue([concesion(7)]);
    expect(await guardarNiveles([{ roleId: 10, module: "prompts", nivel: "ninguno" }]))
      .toEqual({ ok: true, guardados: 1 });
    expect(mocks.eliminar).toHaveBeenCalledWith({ where: { OR: [{ roleId: 10, permissionId: 7 }] } });
  });

  it("puede retirar una concesión reservada aunque el módulo ya no tenga permisos activos", async () => {
    mocks.permisos.mockResolvedValue(permisos.filter((p) => p.module !== "prompts"));
    mocks.grants.mockResolvedValue([concesion(7)]);
    expect(await guardarNiveles([{ roleId: 10, module: "prompts", nivel: "ninguno" }]))
      .toEqual({ ok: true, guardados: 1 });
    expect(mocks.eliminar).toHaveBeenCalledWith({ where: { OR: [{ roleId: 10, permissionId: 7 }] } });
  });

  it("conserva la salvaguarda que impide perder el último portador de roles:configurar", async () => {
    mocks.grants.mockResolvedValue([concesion(10, 20)]);
    const result = await guardarNiveles([{ roleId: 20, module: "roles", nivel: "ninguno" }]);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('sin ningún rol con "roles:configurar"') });
    sinEscrituras();
  });
});
