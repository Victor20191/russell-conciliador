import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), create: vi.fn(), transaction: vi.fn(), decrypt: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { conexionIntegracion: { findMany: mocks.findMany, update: mocks.update }, ejecucionConexion: { create: mocks.create }, $transaction: mocks.transaction } }));
vi.mock("@/lib/conexiones/credenciales", () => ({ descifrarCredenciales: mocks.decrypt }));
vi.mock("@/lib/conexiones/smtp", async (original) => ({ ...await original<typeof import("@/lib/conexiones/smtp")>(), enviarSmtp: mocks.send }));
import * as modulo from "./notificaciones";
import { conexionNotificaciones, enviarCorreoRegistrado } from "./notificaciones";
import type { ConexionIntegracion } from "@/generated/prisma/client";
const conexion = { id: 1, activa: true, proveedor: "smtp", configuracion: { remitente: "russell@example.com", url_plataforma: "https://russell.example" }, credenciales: { contrasena: "cifrada" } } as unknown as ConexionIntegracion;
const aviso = { titulo: "Prueba de correo", texto: "Texto privado", ruta: "/config/conexiones", referencia: "Prueba de envío #1" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([conexion]); mocks.decrypt.mockReturnValue({ usuario: "u", contrasena: "sensible" });
  mocks.send.mockResolvedValue(undefined); mocks.transaction.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("correo de Russell: solo el reporte para gerencia y la prueba de envío", () => {
  it("no expone envíos por evento (balances, menciones, soporte)", () => {
    expect(Object.keys(modulo).sort()).toEqual(["conexionNotificaciones", "enviarCorreoRegistrado", "enviarHtmlRegistrado"]);
  });
});

describe("conexión de correo del reporte para gerencia", () => {
  it("selecciona solamente un SMTP/Gmail de producción, activo y marcado", async () => {
    expect(await conexionNotificaciones()).toEqual(conexion);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { categoria: "CORREO", proveedor: { in: ["smtp", "gmail"] }, activa: true, entorno: "PRODUCCION", configuracion: { path: ["usar_para_notificaciones"], equals: true } }, take: 2 }));
    mocks.findMany.mockResolvedValue([conexion, conexion]);
    await expect(conexionNotificaciones()).rejects.toThrow("varios SMTP");
  });
  it("sin conexión marcada devuelve null", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await conexionNotificaciones()).toBeNull();
  });
});

describe("correo de prueba de envío", () => {
  it("envía por destinatario único y registra aceptación sin contenido ni claves", async () => {
    await enviarCorreoRegistrado(conexion, ["ana@example.com", "ana@example.com", "luis@example.com"], aviso);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ultimaEjecucionEstado: "ok", ultimoUsoEn: expect.any(Date) }) }));
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ tipo: "ENVIO_CORREO", estado: "ok" });
    expect(JSON.stringify(mocks.create.mock.calls)).not.toMatch(/sensible|Texto privado|ana@example/);
  });
  it("un rechazo no bloquea otros destinatarios y registra el resultado parcial", async () => {
    mocks.send.mockRejectedValueOnce(new Error("credencial sensible"));
    const r = await enviarCorreoRegistrado(conexion, ["ana@example.com", "luis@example.com"], aviso);
    expect(r.ok).toBe(false); expect(r.message).toContain("1 correo(s) aceptado"); expect(r.message).toContain("1 con error");
    expect(r.message).not.toContain("sensible"); expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it("credenciales ilegibles quedan registradas como error sin usar otra cuenta", async () => {
    mocks.decrypt.mockImplementationOnce(() => { throw new Error("clave secreta rota"); });
    const r = await enviarCorreoRegistrado(conexion, ["ana@example.com"], aviso);
    expect(r.ok).toBe(false); expect(r.message).not.toContain("secreta"); expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].data.estado).toBe("error");
  });
  it("un fallo de registro no repite correos aceptados", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValueOnce(new Error("sin BD"));
    const r = await enviarCorreoRegistrado(conexion, ["ana@example.com"], aviso);
    expect(r.ok).toBe(true); expect(r.message).toContain("No se pudo guardar"); expect(mocks.send).toHaveBeenCalledOnce();
    log.mockRestore();
  });
  it("indica la dirección inválida de Russell sin confundirla con autenticación SMTP", async () => {
    const r = await enviarCorreoRegistrado({ ...conexion, configuracion: { url_plataforma: "incorrecta" } }, ["ana@example.com"], aviso);
    expect(r.ok).toBe(false); expect(r.message).toContain("dirección de Russell"); expect(r.message).toContain("no es válida"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("lleva el enlace «Abrir Russell» hacia la ruta indicada cuando la conexión tiene dirección", async () => {
    await enviarCorreoRegistrado(conexion, ["ana@example.com"], aviso);
    expect(mocks.send.mock.calls[0][2].texto).toContain("Abrir Russell: https://russell.example/config/conexiones");
  });
});

describe("correo de prueba sin dirección de Russell en la conexión", () => {
  // La dirección es opcional (producción puede no tener dominio ni HTTPS): el correo sale, sin el enlace.
  for (const [descripcion, configuracion] of [
    ["sin la clave", { remitente: "russell@example.com" }],
    ["vacía", { remitente: "russell@example.com", url_plataforma: "" }],
  ] as const) {
    it(`sale bien y sin enlace con la dirección ${descripcion}`, async () => {
      await enviarCorreoRegistrado({ ...conexion, configuracion }, ["ana@example.com"], aviso);
      expect(mocks.send).toHaveBeenCalledOnce();
      const mensaje = mocks.send.mock.calls[0][2];
      expect(mensaje.destinatario).toBe("ana@example.com");
      expect(mensaje.asunto).toBe("Russell · Prueba de correo");
      expect(mensaje.texto).toContain("Texto privado");
      expect(mensaje.texto).not.toContain("Abrir Russell");
      expect(mensaje.html).toContain("Texto privado");
      expect(mensaje.html).not.toContain("Abrir Russell");
      expect(mensaje.html).not.toContain("href=");
      // El logotipo sigue viajando incrustado: no depende de ninguna dirección.
      expect(mensaje.html).toContain("cid:logo-russell-bedford");
      // Resultado registrado como correcto, no como error de configuración.
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ultimaEjecucionEstado: "ok" }) }));
      expect(mocks.create.mock.calls[0][0].data).toMatchObject({ tipo: "ENVIO_CORREO", estado: "ok" });
    });
  }
});
