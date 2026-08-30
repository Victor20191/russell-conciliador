import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  findUnique: vi.fn(),
  getCurrentUser: vi.fn(),
  obtenerObjeto: vi.fn(),
  registrarError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { archivoOriginalModulo: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/storage/objetos", () => ({ obtenerObjeto: mocks.obtenerObjeto }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.registrarError }));

import { GET } from "./route";

const CUERPO = new TextEncoder().encode("original-exacto-del-modulo");
const HUELLA = createHash("sha256").update(CUERPO).digest("hex");

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    clienteId: 23,
    nombreArchivo: "facturacion-agosto.xlsx",
    tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tamanoBytes: CUERPO.byteLength,
    huellaSha256: HUELLA,
    claveObjeto: "software/modulos/ing/clientes/23/originales/lote/archivo.xlsx",
    disponible: true,
    ...overrides,
  };
}

function llamar(id = "12") {
  return GET(
    new Request(`http://localhost/api/modulos/archivos-originales/${id}`),
    { params: Promise.resolve({ id }) },
  );
}

describe("GET /api/modulos/archivos-originales/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 7, name: "Usuario Staff" });
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 7, role: "Staff" });
    mocks.findUnique.mockResolvedValue(metadata());
    mocks.obtenerObjeto.mockResolvedValue({
      cuerpo: CUERPO,
      contentType: "application/octet-stream",
    });
  });

  it("exige una sesión autenticada antes de autorizar o consultar metadata", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const respuesta = await llamar();

    expect(respuesta.status).toBe(401);
    expect(mocks.authorizePermiso).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.obtenerObjeto).not.toHaveBeenCalled();
  });

  it("falla cerrado sin el permiso global antes de consultar la bitácora", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });

    const respuesta = await llamar();

    expect(respuesta.status).toBe(403);
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:ver");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza identificadores inválidos sin consultar metadata", async () => {
    const respuesta = await llamar("abc");

    expect(respuesta.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("responde 404 cuando no existe la fila de bitácora", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);

    expect((await llamar()).status).toBe(404);
    expect(mocks.obtenerObjeto).not.toHaveBeenCalled();
  });

  it("oculta como 404 un original fuera del alcance del usuario", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true, userId: 7, role: "Staff" })
      .mockResolvedValueOnce({ ok: false, message: "Sin alcance." });

    const respuesta = await llamar();

    expect(respuesta.status).toBe(404);
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(
      2,
      "modulos_datos:ver",
      { clientId: 23, modo: "lectura" },
    );
    expect(mocks.obtenerObjeto).not.toHaveBeenCalled();
  });

  it.each([
    ["no está marcado como disponible", { disponible: false }],
    ["no tiene clave del objeto", { claveObjeto: null }],
    ["no tiene tamaño durable", { tamanoBytes: null }],
    ["no tiene una huella SHA-256 válida", { huellaSha256: "incompleta" }],
  ])("no descarga cuando la metadata %s", async (_caso, cambio) => {
    mocks.findUnique.mockResolvedValueOnce(metadata(cambio));

    const respuesta = await llamar();

    expect(respuesta.status).toBe(404);
    expect(mocks.obtenerObjeto).not.toHaveBeenCalled();
  });

  it("falla cerrado cuando el objeto ya no está en el almacenamiento", async () => {
    mocks.obtenerObjeto.mockResolvedValueOnce(null);

    const respuesta = await llamar();

    expect(respuesta.status).toBe(404);
    expect(respuesta.headers.get("Content-Disposition")).toBeNull();
  });

  it.each([
    ["la huella", { huellaSha256: "0".repeat(64) }],
    ["el tamaño", { tamanoBytes: CUERPO.byteLength + 1 }],
  ])("rechaza el binario cuando no coincide %s de la metadata", async (_caso, cambio) => {
    mocks.findUnique.mockResolvedValueOnce(metadata(cambio));

    const respuesta = await llamar();

    expect(respuesta.status).toBe(409);
    expect(respuesta.headers.get("Content-Disposition")).toBeNull();
    expect(mocks.registrarError).toHaveBeenCalledOnce();
  });

  it("sirve exactamente los bytes verificados y fuerza una descarga no cacheable", async () => {
    const respuesta = await llamar();

    expect(respuesta.status).toBe(200);
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(CUERPO);
    expect(respuesta.headers.get("Content-Length")).toBe(String(CUERPO.byteLength));
    expect(respuesta.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(respuesta.headers.get("Content-Disposition")).toContain(
      'attachment; filename="facturacion-agosto.xlsx"',
    );
    expect(respuesta.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(mocks.obtenerObjeto).toHaveBeenCalledWith(
      "software/modulos/ing/clientes/23/originales/lote/archivo.xlsx",
    );
  });

  it("neutraliza rutas, comillas, caracteres de control y Unicode en Content-Disposition", async () => {
    mocks.findUnique.mockResolvedValueOnce(metadata({
      nombreArchivo: "../../Facturación \"Q3\"\r\n.xlsx",
      tipoContenido: "tipo/invalido\r\nX-Inyectado: si",
    }));
    mocks.obtenerObjeto.mockResolvedValueOnce({
      cuerpo: CUERPO,
      contentType: "tambien/invalido\r\nX-Inyectado: si",
    });

    const respuesta = await llamar();
    const disposicion = respuesta.headers.get("Content-Disposition") ?? "";

    expect(respuesta.status).toBe(200);
    expect(disposicion).toContain('filename="Facturacion _Q3_.xlsx"');
    expect(disposicion).toContain("filename*=UTF-8''Facturaci%C3%B3n%20_Q3_.xlsx");
    expect(disposicion).not.toContain("../");
    expect(disposicion).not.toContain("\r");
    expect(disposicion).not.toContain("\n");
    expect(respuesta.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("responde 500 sin servir bytes si falla el proveedor de objetos", async () => {
    mocks.obtenerObjeto.mockRejectedValueOnce(new Error("S3 no disponible"));

    const respuesta = await llamar();

    expect(respuesta.status).toBe(500);
    expect(respuesta.headers.get("Content-Disposition")).toBeNull();
    expect(mocks.registrarError).toHaveBeenCalledWith(
      "GET /api/modulos/archivos-originales/[id]",
      expect.any(Error),
    );
  });
});
