import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  findUnique: vi.fn(),
  getCurrentUser: vi.fn(),
  obtenerEvidenciaTicket: vi.fn(),
  registrarError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { supportTicketAttachment: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.registrarError }));
vi.mock("@/lib/storage/evidencias-tickets", () => ({
  obtenerEvidenciaTicket: mocks.obtenerEvidenciaTicket,
}));

import { GET } from "./route";

function llamar(id = "12") {
  return GET(new Request(`http://localhost/api/soporte/adjuntos/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/soporte/adjuntos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 7, name: "Usuario Staff" });
    mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
      permiso === "soporte:ver"
        ? { ok: true, userId: 7, role: "Staff" }
        : { ok: false, message: "Sin permiso." },
    );
    mocks.findUnique.mockResolvedValue({
      objectKey: "tickets/12/captura.png",
      contentType: "image/png",
      fileName: "captura-pantalla.png",
      ticket: { createdById: 99 },
    });
    mocks.obtenerEvidenciaTicket.mockResolvedValue({
      cuerpo: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    });
  });

  it("exige una sesión autenticada", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const respuesta = await llamar();
    expect(respuesta.status).toBe(401);
    expect(mocks.authorizePermiso).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza un identificador inválido antes de autorizar o consultar", async () => {
    const respuesta = await llamar("abc");
    expect(respuesta.status).toBe(400);
    expect(mocks.authorizePermiso).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("falla cerrado sin soporte:ver antes de consultar la evidencia", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso." });
    const respuesta = await llamar();
    expect(respuesta.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("responde 404 cuando el adjunto no existe", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await llamar()).status).toBe(404);
  });

  it("permite ver evidencia interna creada por otro usuario", async () => {
    const respuesta = await llamar();
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe("image/png");
    expect(respuesta.headers.get("Content-Disposition")).toBeNull();
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("incluye Content-Disposition para forzar descarga cuando se solicita download=1", async () => {
    const respuesta = await GET(
      new Request("http://localhost/api/soporte/adjuntos/12?download=1"),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Disposition")).toContain('attachment; filename="captura-pantalla.png"');
  });

  it("aísla un SVG con scripts al abrirlo directamente y evita reutilizarlo tras revocar permisos", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/registro-acceso",{method:"POST"})</script><rect width="12" height="12"/></svg>';
    mocks.findUnique.mockResolvedValueOnce({ objectKey: "tickets/12/imagen.svg", contentType: "image/svg+xml", fileName: "imagen.svg", ticket: { createdById: 99 } });
    mocks.obtenerEvidenciaTicket.mockResolvedValueOnce({ cuerpo: new TextEncoder().encode(svg), contentType: "image/svg+xml" });
    const respuesta = await llamar();
    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe(svg);
    const politica = respuesta.headers.get("Content-Security-Policy")!;
    expect(politica.split("; ")).toContain("sandbox");
    expect(politica).toContain("default-src 'none'");
    expect(politica).toContain("script-src 'none'");
    expect(politica).not.toContain("allow-same-origin");
    expect(respuesta.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(respuesta.headers.get("Cache-Control")).toContain("no-store");
  });

  it("descarga nombres con Unicode y saltos de línea sin inyectar cabeceras", async () => {
    mocks.findUnique.mockResolvedValueOnce({ objectKey: "tickets/12/imagen.svg", contentType: "image/svg+xml", fileName: '../../evidencia "ñ"\r\nX-Inyectado: 1.svg', ticket: { createdById: 99 } });
    const respuesta = await GET(new Request("http://localhost/api/soporte/adjuntos/12?download=1"), { params: Promise.resolve({ id: "12" }) });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Disposition")).not.toMatch(/[\r\n]/);
    expect(respuesta.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    expect(respuesta.headers.get("X-Inyectado")).toBeNull();
  });

  it("oculta evidencia pública a usuarios no administradores", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      objectKey: "tickets/publico/captura.png",
      contentType: "image/png",
      fileName: "captura.png",
      ticket: { createdById: null },
    });
    const respuesta = await llamar();
    expect(respuesta.status).toBe(404);
    expect(mocks.obtenerEvidenciaTicket).not.toHaveBeenCalled();
  });

  it("permite a Xentria ver evidencia pública", async () => {
    mocks.authorizePermiso.mockResolvedValue({
      ok: true,
      userId: 1,
      role: "Administrador",
    });
    mocks.findUnique.mockResolvedValueOnce({
      objectKey: "tickets/publico/captura.png",
      contentType: "image/png",
      fileName: "captura.png",
      ticket: { createdById: null },
    });
    const respuesta = await llamar();
    expect(respuesta.status).toBe(200);
    expect(mocks.obtenerEvidenciaTicket).toHaveBeenCalledWith("tickets/publico/captura.png");
  });
});
