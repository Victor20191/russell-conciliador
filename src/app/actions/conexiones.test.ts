import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearConexion, actualizarConexion, cambiarEstadoConexion, enviarPruebaSmtpAction } from "./conexiones";
import { cifrarCredenciales, descifrarCredenciales } from "@/lib/conexiones/credenciales";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), auth: vi.fn(), actor: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
  findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/correo/notificaciones", () => ({ enviarCorreoRegistrado: mocks.send }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.auth }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({
  default: { $transaction: mocks.transaction, conexionIntegracion: {
    findUnique: mocks.findUnique, findFirst: mocks.findFirst, create: mocks.create, update: mocks.update,
  } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MASTER_ENCRYPTION_KEY", "12345678901234567890123456789012");
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.actor.mockResolvedValue({ name: "Administrador" });
  mocks.findUnique.mockResolvedValue(null);
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 1 });
  mocks.update.mockResolvedValue({ id: 1 });
  mocks.transaction.mockImplementation(async (fn) => fn({
    conexionIntegracion: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update },
  }));
});
afterEach(() => vi.unstubAllEnvs());

function formulario(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    codigo: "claude_russell", nombre: "IA Russell", categoria: "API", proveedor: "anthropic",
    entorno: "PRODUCCION", activa: "on", cred_api_key: "secreto-prueba",
    ...extra,
  })) data.set(key, value);
  return data;
}

describe("acciones de parametrización", () => {
  it("autoriza antes de consultar datos o guardar secretos", async () => {
    mocks.auth.mockResolvedValue({ ok: false, message: "Sin permiso" });
    expect((await crearConexion(undefined, formulario())).ok).toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("bloquea secretos sin cifrado configurado", async () => {
    vi.stubEnv("MASTER_ENCRYPTION_KEY", "");
    const resultado = await crearConexion(undefined, formulario());
    expect(resultado.message).toContain("MASTER_ENCRYPTION_KEY");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("guarda cifrado sin filtrar secretos en resultado ni auditoría", async () => {
    const resultado = await crearConexion(undefined, formulario());
    expect(resultado.ok).toBe(true);
    const guardado = mocks.create.mock.calls[0][0].data;
    expect(guardado.credenciales.api_key).toMatch(/^v1:/);
    expect(descifrarCredenciales(guardado.credenciales).api_key).toBe("secreto-prueba");
    expect(JSON.stringify([resultado, mocks.audit.mock.calls])).not.toContain("secreto-prueba");
    expect(mocks.revalidate).toHaveBeenCalledWith("/config/conexiones");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("rechaza seleccionar otra clave IA activa del mismo proveedor", async () => {
    mocks.findFirst.mockResolvedValue({ id: 2 });
    const resultado = await crearConexion(undefined, formulario({ config_usar_en_plataforma: "on" }));
    expect(resultado.message).toContain("Ya hay una clave");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("impide usar conexiones de pruebas en los flujos de producción", async () => {
    const resultado = await crearConexion(undefined, formulario({ entorno: "PRUEBAS", config_usar_en_plataforma: "on" }));
    expect(resultado.ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("obliga a reingresar secretos al cambiar de proveedor", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 1, proveedor: "gemini", configuracion: {}, credenciales: cifrarCredenciales({ api_key: "anterior" }),
    });
    const resultado = await actualizarConexion(undefined, formulario({ id: "1", cred_api_key: "" }));
    expect(resultado.errors?.cred_api_key).toBeDefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("conserva la clave en una edición e invalida la prueba anterior", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 1, proveedor: "anthropic",
      configuracion: { url_base: "https://api.anthropic.com", ruta_prueba: "/v1/models", encabezado_auth: "x-api-key" },
      credenciales: cifrarCredenciales({ api_key: "anterior" }),
    });
    expect((await actualizarConexion(undefined, formulario({ id: "1", cred_api_key: "" }))).ok).toBe(true);
    const cambios = mocks.update.mock.calls[0][0].data;
    expect(descifrarCredenciales(cambios.credenciales).api_key).toBe("anterior");
    expect(cambios.ultimaPruebaOk).toBeNull();
    expect(cambios.ultimaPruebaMensaje).toBeNull();
  });
  it("rechaza activar una segunda selección del mismo proveedor", async () => {
    mocks.findUnique.mockResolvedValue({
      proveedor: "anthropic", entorno: "PRODUCCION", configuracion: { usar_en_plataforma: true },
    });
    mocks.findFirst.mockResolvedValue({ id: 2 });
    expect((await cambiarEstadoConexion(1, true)).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("informa conflicto concurrente sin anunciar guardado ni auditar éxito", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "P2034" });
    const resultado = await crearConexion(undefined, formulario());
    expect(resultado.ok).toBe(false);
    expect(resultado.message).toContain("al mismo tiempo");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

function formularioSmtp(extra: Record<string, string> = {}) {
  return formulario({ proveedor: "smtp", categoria: "CORREO", config_host: "smtp.example.com", config_puerto: "587", config_seguridad: "STARTTLS", config_remitente: "russell@example.com", config_url_plataforma: "https://russell.example", config_usar_para_notificaciones: "on", cred_usuario: "usuario", cred_contrasena: "clave-ficticia", ...extra });
}
describe("SMTP de notificaciones", () => {
  it("impide dos selecciones activas entre SMTP y Gmail en una transacción serializable", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 2 });
    expect((await crearConexion(undefined, formularioSmtp())).message).toContain("Ya hay un SMTP");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ proveedor: { in: ["smtp", "gmail"] }, configuracion: { path: ["usar_para_notificaciones"], equals: true } }) }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("no acepta seleccionar SMTP de pruebas ni sin remitente/dirección de Russell", async () => {
    expect((await crearConexion(undefined, formularioSmtp({ entorno: "PRUEBAS" }))).ok).toBe(false);
    expect((await crearConexion(undefined, formularioSmtp({ config_remitente: "", config_url_plataforma: "" }))).errors).toMatchObject({ config_remitente: expect.any(Array), config_url_plataforma: expect.any(Array) });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("activar otra cuenta Gmail no elude el control", async () => {
    mocks.findUnique.mockResolvedValue({ proveedor: "gmail", entorno: "PRODUCCION", configuracion: { usar_para_notificaciones: true } });
    mocks.findFirst.mockResolvedValue({ id: 2 });
    expect((await cambiarEstadoConexion(1, true)).ok).toBe(false); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("la prueba real exige permiso y usa el correo de sesión", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, message: "Sin permiso" });
    expect((await enviarPruebaSmtpAction(1)).ok).toBe(false); expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue({ id: 1, name: "Ana", email: "ana@example.com" });
    mocks.findUnique.mockResolvedValue({ id: 1, codigo: "smtp", proveedor: "smtp", activa: true });
    mocks.send.mockResolvedValue({ ok: true, message: "Aceptado" });
    expect((await enviarPruebaSmtpAction(1)).ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), ["ana@example.com"], expect.objectContaining({ titulo: "Prueba de correo" }), "Ana");
  });
  it("no permite probar cuentas inactivas ni otro tipo de conexión", async () => {
    for (const conexion of [{ proveedor: "smtp", activa: false }, { proveedor: "anthropic", activa: true }]) {
      mocks.findUnique.mockResolvedValue(conexion); expect((await enviarPruebaSmtpAction(1)).ok).toBe(false);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
