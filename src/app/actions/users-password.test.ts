import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

type UsuarioPrueba = {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  avatarKey: string | null;
  password: string;
  mustChangePassword: boolean;
  sessionVersion: number;
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
  blockedUntil: Date | null;
  lastLoginAt: Date | null;
};
type CambioUsuario = Partial<Omit<UsuarioPrueba, "id" | "sessionVersion">> & {
  sessionVersion?: { increment: number };
};

const mocks = vi.hoisted(() => {
  const usuarios: UsuarioPrueba[] = [];
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) =>
      usuarios.find((u) => u.id === where.id) ?? null),
    findFirst: vi.fn(),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: CambioUsuario }) => {
      const usuario = usuarios.find((u) => u.id === where.id);
      if (!usuario) throw new Error("Usuario inexistente");
      const { sessionVersion, ...campos } = data;
      Object.assign(usuario, campos);
      if (sessionVersion) usuario.sessionVersion += sessionVersion.increment;
      return usuario;
    }),
  };
  const tx = {
    user,
    userHierarchy: { deleteMany: vi.fn() },
  };
  return {
    usuarios,
    user,
    role: { findFirst: vi.fn() },
    transaction: vi.fn(async (trabajo: (cliente: typeof tx) => Promise<void>) => trabajo(tx)),
    authorize: vi.fn(),
    currentUser: vi.fn(),
    audit: vi.fn(),
    revalidate: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  default: { user: mocks.user, role: mocks.role, $transaction: mocks.transaction },
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorize }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "Error simulado" }));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => false,
  subirObjeto: vi.fn(),
  eliminarObjeto: vi.fn(),
}));

import { updateUser } from "./users";
import { DEFAULT_TEMPORARY_PASSWORD } from "@/lib/auth/default-password";

function usuario(id: number): UsuarioPrueba {
  return {
    id,
    email: `usuario${id}@example.com`,
    name: `Usuario ${id}`,
    role: "Staff",
    active: true,
    avatarKey: null,
    password: "hash-previo",
    mustChangePassword: false,
    sessionVersion: 4,
    failedLoginAttempts: 5,
    lastFailedLoginAt: new Date("2026-10-19T12:00:00Z"),
    blockedUntil: new Date("2026-10-19T12:15:00Z"),
    lastLoginAt: new Date("2026-10-18T12:00:00Z"),
  };
}

function formulario() {
  const form = new FormData();
  const u = mocks.usuarios[0];
  form.set("id", String(u.id));
  form.set("email", u.email);
  form.set("name", u.name);
  form.set("role", u.role);
  form.set("active", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usuarios.splice(0, mocks.usuarios.length, usuario(41), usuario(42));
  mocks.authorize.mockResolvedValue({ ok: true, userId: 1, role: "Administrador" });
  mocks.currentUser.mockResolvedValue({ name: "Administrador de prueba" });
  mocks.role.findFirst.mockResolvedValue({ code: "Staff" });
  mocks.user.findFirst.mockResolvedValue(null);
});

describe("restablecimiento de contraseña desde Editar usuario", () => {
  it("asigna exactamente la predeterminada, fuerza el cambio y revoca sesiones solo del usuario elegido", async () => {
    const antes = structuredClone(mocks.usuarios);
    const form = formulario();
    form.set("resetToDefaultPassword", "on");

    expect(await updateUser(undefined, form)).toEqual({ ok: true });

    const actualizado = mocks.usuarios[0];
    expect(DEFAULT_TEMPORARY_PASSWORD).toBe("Admin123**");
    expect(await bcrypt.compare("Admin123**", actualizado.password)).toBe(true);
    expect(await bcrypt.compare("Admin123**.", actualizado.password)).toBe(false);
    expect(actualizado).toEqual({
      ...antes[0],
      password: expect.stringMatching(/^\$2[aby]\$/),
      mustChangePassword: true,
      sessionVersion: 5,
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      blockedUntil: null,
    });
    expect(mocks.usuarios[1]).toEqual(antes[1]);
    expect(mocks.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith("usuarios:editar");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "EDITÓ USUARIO",
      entity: "41",
      detail: expect.stringContaining("contraseña restablecida a predeterminada"),
    }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(DEFAULT_TEMPORARY_PASSWORD);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(actualizado.password);
    expect(mocks.revalidate).toHaveBeenCalledWith("/config/usuarios");
  });

  it("el modo predeterminado ignora la contraseña que envíe el cliente", async () => {
    const form = formulario();
    form.set("resetToDefaultPassword", "on");
    form.set("password", "ClaveAjena123!");

    expect(await updateUser(undefined, form)).toEqual({ ok: true });
    expect(await bcrypt.compare("Admin123**", mocks.usuarios[0].password)).toBe(true);
    expect(await bcrypt.compare("ClaveAjena123!", mocks.usuarios[0].password)).toBe(false);
  });

  it("conserva el restablecimiento manual y sus efectos de seguridad", async () => {
    const form = formulario();
    form.set("password", "ClaveManual456!");

    expect(await updateUser(undefined, form)).toEqual({ ok: true });
    expect(await bcrypt.compare("ClaveManual456!", mocks.usuarios[0].password)).toBe(true);
    expect(mocks.usuarios[0]).toMatchObject({
      mustChangePassword: true,
      sessionVersion: 5,
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      blockedUntil: null,
    });
    const audit = mocks.audit.mock.calls[0][0];
    expect(audit.detail).toContain("contraseña restablecida");
    expect(audit.detail).not.toContain("predeterminada");
    expect(audit.detail).not.toContain("ClaveManual456!");
  });

  it.each([null, ""])("sin selección y contraseña %j conserva clave, sesiones y bloqueo", async (password) => {
    const antes = structuredClone(mocks.usuarios);
    const form = formulario();
    form.set("name", "Nombre editado");
    if (password !== null) form.set("password", password);

    expect(await updateUser(undefined, form)).toEqual({ ok: true });
    expect(mocks.usuarios[0]).toEqual({ ...antes[0], name: "Nombre editado" });
    expect(mocks.usuarios[1]).toEqual(antes[1]);
    expect(mocks.audit.mock.calls[0][0].detail).not.toContain("contraseña restablecida");
  });

  it("rechaza antes de consultar o escribir cuando falta usuarios:editar", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "Sin permiso" });
    const form = formulario();
    form.set("resetToDefaultPassword", "on");

    expect(await updateUser(undefined, form)).toEqual({ ok: false, message: "Sin permiso" });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.role.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("impide restablecer una cuenta Superadministrador aunque se falsee su rol en el formulario", async () => {
    mocks.usuarios[0].role = "Superadministrador";
    const antes = structuredClone(mocks.usuarios);
    const form = formulario();
    form.set("role", "Staff");
    form.set("resetToDefaultPassword", "on");

    expect(await updateUser(undefined, form)).toEqual({
      ok: false,
      message: "Solo un Superadministrador puede editar esa cuenta.",
    });
    expect(mocks.usuarios).toEqual(antes);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["true", "false", "", "off", "ON"])("rechaza el valor inválido %j del checkbox", async (value) => {
    const form = formulario();
    form.set("resetToDefaultPassword", value);

    expect(await updateUser(undefined, form)).toEqual({
      ok: false,
      message: "Selecciona una opción válida para restablecer la contraseña.",
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechaza valores duplicados para evitar una selección ambigua", async () => {
    const form = formulario();
    form.append("resetToDefaultPassword", "on");
    form.append("resetToDefaultPassword", "off");

    expect(await updateUser(undefined, form)).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("sigue rechazando una contraseña manual que incumpla la política", async () => {
    const form = formulario();
    form.set("password", "corta");

    expect(await updateUser(undefined, form)).toMatchObject({
      ok: false,
      errors: { password: expect.any(Array) },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
