import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarSmtp } from "./smtp";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.create.mockImplementation(() => ({ verify: mocks.verify, close: mocks.close })) },
}));
afterEach(() => vi.clearAllMocks());
const cred = { usuario: "usuario", contrasena: "contraseña de prueba" };

describe("SMTP seguro", () => {
  it("autentica mediante STARTTLS y cierra sin enviar correo", async () => {
    mocks.verify.mockResolvedValue(true);
    expect((await verificarSmtp({ host: "smtp.example.com", puerto: 587, seguridad: "STARTTLS" }, cred)).ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      port: 587, secure: false, requireTLS: true, auth: { user: cred.usuario, pass: cred.contrasena },
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    }));
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("soporta TLS implícito en 465 para configuraciones antiguas", async () => {
    mocks.verify.mockResolvedValue(true);
    await verificarSmtp({ host: "smtp.example.com", puerto: 465 }, cred);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: false }));
  });
  it("rechaza autenticación fallida sin divulgar el mensaje remoto", async () => {
    mocks.verify.mockRejectedValue(Object.assign(new Error(cred.contrasena), { code: "EAUTH" }));
    const resultado = await verificarSmtp({ host: "smtp.example.com" }, cred);
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("rechazó");
    expect(resultado.mensaje).not.toContain(cred.contrasena);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("rechaza puertos inválidos, modo inseguro o credenciales vacías antes de abrir red", async () => {
    for (const config of [{ host: "x", puerto: -1 }, { host: "x", seguridad: "NINGUNA" }]) {
      expect((await verificarSmtp(config, cred)).ok).toBe(false);
    }
    expect((await verificarSmtp({ host: "x" }, {})).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
