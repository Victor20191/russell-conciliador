import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), transaction: vi.fn(), decrypt: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { conexionIntegracion: { findMany: vi.fn(), update: mocks.update }, ejecucionConexion: { create: mocks.create }, $transaction: mocks.transaction } }));
vi.mock("@/lib/conexiones/credenciales", () => ({ descifrarCredenciales: mocks.decrypt }));
vi.mock("@/lib/conexiones/smtp", async (original) => ({ ...await original<typeof import("@/lib/conexiones/smtp")>(), enviarSmtp: mocks.send }));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { enviarHtmlRegistrado } from "./notificaciones";
import type { ConexionIntegracion } from "@/generated/prisma/client";

const conexion = { id: 1, activa: true, proveedor: "smtp", configuracion: { remitente: "russell@example.com" }, credenciales: { contrasena: "cifrada" } } as unknown as ConexionIntegracion;
const correo = { asunto: "Reporte de uso y avances", html: "<div>cuerpo</div>", texto: "cuerpo", referencia: "Reporte para gerencia (programado)" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decrypt.mockReturnValue({ usuario: "u", contrasena: "sensible" });
  mocks.send.mockResolvedValue(undefined);
  mocks.transaction.mockResolvedValue([]);
});

describe("enviarHtmlRegistrado", () => {
  it("manda el HTML propio y el texto alterno, uno por destinatario y sin repetir direcciones", async () => {
    const r = await enviarHtmlRegistrado(conexion, ["Ana@x.co", "ana@x.co", " luis@x.co "], correo, "Sistema (envío programado)");
    expect(r).toMatchObject({ ok: true, aceptados: 2, fallidos: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const [config, credenciales, mensaje] = mocks.send.mock.calls[0];
    expect(config).toEqual({ remitente: "russell@example.com" });
    expect(credenciales).toEqual({ usuario: "u", contrasena: "sensible" });
    // Sin la plantilla de notificación: el HTML es exactamente el recibido, sin adjuntos en línea.
    expect(mensaje).toEqual({ destinatario: "ana@x.co", asunto: "Reporte de uso y avances", texto: "cuerpo", html: "<div>cuerpo</div>" });
    expect(mocks.send.mock.calls[1][2].destinatario).toBe("luis@x.co");
  });

  it("pasa los adjuntos en línea (CID) a cada mensaje, para que el HTML no dependa de ninguna dirección", async () => {
    const imagenes = [{ cid: "logo-russell-bedford-azul", nombre: "russell-bedford-azul.png", contenido: Buffer.from("png"), tipo: "image/png" as const }];
    await enviarHtmlRegistrado(conexion, ["ana@x.co", "luis@x.co"], { ...correo, html: '<img src="cid:logo-russell-bedford-azul">', imagenes });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const llamada of mocks.send.mock.calls) expect(llamada[2].imagenes).toEqual(imagenes);
  });

  it("registra el resultado en la conexión y en su historial, sin contenido ni direcciones", async () => {
    await enviarHtmlRegistrado(conexion, ["ana@x.co"], correo, "Sistema (envío programado)");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ ultimaEjecucionEstado: "ok" }) }));
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      conexionId: 1, tipo: "ENVIO_CORREO", estado: "ok", ejecutadoPor: "Sistema (envío programado)",
    });
    expect(mocks.create.mock.calls[0][0].data.mensaje).toContain("Reporte para gerencia (programado) · 1 correo(s) aceptado(s)");
    expect(JSON.stringify(mocks.create.mock.calls)).not.toMatch(/ana@x\.co|cuerpo|sensible/);
  });

  it("un rechazo no bloquea a los demás y deja un resultado parcial sin filtrar errores originales", async () => {
    mocks.send.mockRejectedValueOnce(new Error("credencial sensible"));
    const r = await enviarHtmlRegistrado(conexion, ["ana@x.co", "luis@x.co"], correo);
    expect(r).toMatchObject({ ok: false, aceptados: 1, fallidos: 1 });
    expect(r.message).toContain("1 correo(s) aceptado");
    expect(r.message).toContain("1 con error");
    expect(r.message).not.toContain("sensible");
    expect(mocks.create.mock.calls[0][0].data.estado).toBe("error");
  });

  it("sin destinatarios o con credenciales ilegibles no envía y queda como error", async () => {
    const vacio = await enviarHtmlRegistrado(conexion, [], correo);
    expect(vacio).toMatchObject({ ok: false, aceptados: 0, fallidos: 1 });
    expect(mocks.send).not.toHaveBeenCalled();

    mocks.decrypt.mockImplementationOnce(() => { throw new Error("clave secreta rota"); });
    const ilegible = await enviarHtmlRegistrado(conexion, ["ana@x.co"], correo);
    expect(ilegible.ok).toBe(false);
    expect(ilegible.message).not.toContain("secreta");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("una conexión inactiva no envía nada", async () => {
    const r = await enviarHtmlRegistrado({ ...conexion, activa: false } as ConexionIntegracion, ["ana@x.co"], correo);
    expect(r).toMatchObject({ ok: false, aceptados: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("un asunto con saltos de línea se aplana (no se inyectan cabeceras)", async () => {
    await enviarHtmlRegistrado(conexion, ["ana@x.co"], { ...correo, asunto: "Uno\r\nBcc: x@y.co" });
    expect(mocks.send.mock.calls[0][2].asunto).toBe("Uno Bcc: x@y.co");
  });

  it("un fallo al guardar el historial no repite los correos aceptados", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValueOnce(new Error("sin BD"));
    const r = await enviarHtmlRegistrado(conexion, ["ana@x.co"], correo);
    expect(r).toMatchObject({ ok: true, aceptados: 1 });
    expect(r.message).toContain("No se pudo guardar");
    expect(mocks.send).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
