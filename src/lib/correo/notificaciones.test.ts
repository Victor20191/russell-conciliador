import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lote: vi.fn(), dato: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), transaction: vi.fn(), decrypt: vi.fn(), send: vi.fn(), recipients: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { moduloImportacionLote: { findUnique: mocks.lote }, moduloDatoEncabezado: { findUnique: mocks.dato }, conexionIntegracion: { findMany: mocks.findMany, update: mocks.update }, ejecucionConexion: { create: mocks.create }, $transaction: mocks.transaction } }));
vi.mock("@/lib/conexiones/credenciales", () => ({ descifrarCredenciales: mocks.decrypt }));
vi.mock("@/lib/conexiones/smtp", async (original) => ({ ...await original<typeof import("@/lib/conexiones/smtp")>(), enviarSmtp: mocks.send }));
vi.mock("./destinatarios", () => ({ destinatariosAviso: mocks.recipients }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { conexionNotificaciones, enviarAvisoCorreo, enviarCorreoRegistrado, programarAvisoCorreo } from "./notificaciones";
import type { ConexionIntegracion } from "@/generated/prisma/client";
const conexion = { id: 1, activa: true, proveedor: "smtp", configuracion: { remitente: "russell@example.com", url_plataforma: "https://russell.example" }, credenciales: { contrasena: "cifrada" } } as unknown as ConexionIntegracion;
const aviso = { titulo: "Novedad", texto: "Texto privado", ruta: "/balance/1", permiso: "balance:ver", clienteId: 12, referencia: "Notificación #1" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "production");
  mocks.findMany.mockResolvedValue([conexion]); mocks.decrypt.mockReturnValue({ usuario: "u", contrasena: "sensible" });
  mocks.recipients.mockResolvedValue(["ana@example.com"]); mocks.send.mockResolvedValue(undefined); mocks.transaction.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("notificaciones conectadas al SMTP", () => {
  it("selecciona solamente un SMTP/Gmail de producción, activo y marcado", async () => {
    expect(await conexionNotificaciones()).toEqual(conexion);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { categoria: "CORREO", proveedor: { in: ["smtp", "gmail"] }, activa: true, entorno: "PRODUCCION", configuracion: { path: ["usar_para_notificaciones"], equals: true } }, take: 2 }));
    mocks.findMany.mockResolvedValue([conexion, conexion]);
    await expect(conexionNotificaciones()).rejects.toThrow("varios SMTP");
  });
  it("sin conexión seleccionada no busca destinatarios ni envía", async () => {
    mocks.findMany.mockResolvedValue([]); await enviarAvisoCorreo(aviso);
    expect(mocks.recipients).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("no envía automáticamente en desarrollo ni deja promesas sueltas", async () => {
    vi.stubEnv("NODE_ENV", "development"); programarAvisoCorreo(aviso); await enviarAvisoCorreo(aviso);
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.findMany).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production"); programarAvisoCorreo(aviso);
    expect(mocks.send).not.toHaveBeenCalled(); await mocks.after.mock.calls[0][0]();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("envía por destinatario y registra aceptación sin contenido ni claves", async () => {
    mocks.recipients.mockResolvedValue(["ana@example.com", "ana@example.com", "luis@example.com"]);
    await enviarAvisoCorreo(aviso);
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
  it("sin destinatarios autorizados no hay envío", async () => {
    mocks.recipients.mockResolvedValue([]); await enviarAvisoCorreo(aviso); expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("destino del correo de mención", () => {
  it("abre el UUID de un borrador aunque su conversación use el id numérico", async () => {
    mocks.lote.mockResolvedValue({ moduloCodigo: "nomina", loteId: "8f4b9e41-a3bc-47ff-a2ac-ab5803067317" });
    await enviarAvisoCorreo({ ...aviso, entidad: { tipo: "modulos_borrador", id: 62 } });
    expect(mocks.recipients).toHaveBeenCalledWith(expect.objectContaining({ permisoRuta: "modulos_datos:crear", modoAlcance: "escritura" }));
    expect(mocks.lote).toHaveBeenCalledWith({ where: { id: 62 }, select: { moduloCodigo: true, loteId: true } });
    expect(mocks.send.mock.calls[0][2].texto).toContain("/modulos/nomina/borradores/8f4b9e41-a3bc-47ff-a2ac-ab5803067317");
  });
  it("los cargues confirmados conservan el id numérico en su enlace", async () => {
    mocks.dato.mockResolvedValue({ moduloCodigo: "nomina" });
    await enviarAvisoCorreo({ ...aviso, entidad: { tipo: "modulos_datos", id: 62 } });
    expect(mocks.send.mock.calls[0][2].texto).toContain("/modulos/nomina/62");
  });
  it("no envía una mención cuyo borrador fue eliminado", async () => {
    mocks.lote.mockResolvedValue(null);
    await enviarAvisoCorreo({ ...aviso, entidad: { tipo: "modulos_borrador", id: 62 } });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("indica la dirección inválida de Russell sin confundirla con autenticación SMTP", async () => {
    const r = await enviarCorreoRegistrado({ ...conexion, configuracion: { url_plataforma: "incorrecta" } }, ["ana@example.com"], aviso);
    expect(r.ok).toBe(false); expect(r.message).toContain("dirección HTTPS de Russell"); expect(mocks.send).not.toHaveBeenCalled();
  });
});
