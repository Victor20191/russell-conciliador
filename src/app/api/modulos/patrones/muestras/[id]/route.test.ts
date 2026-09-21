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
  default: { versionPatronArchivoModulo: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/storage/objetos", () => ({ obtenerObjeto: mocks.obtenerObjeto }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.registrarError }));

import { GET } from "./route";

const CUERPO = new TextEncoder().encode("muestra-del-patron");
const HUELLA = createHash("sha256").update(CUERPO).digest("hex");
const CLAVE = "software/modulos/cxp/patrones/siesa/v4/Modulo cxp 2025 (2).xls";

function version(overrides: Record<string, unknown> = {}) {
  return {
    muestraClaveObjeto: CLAVE,
    muestraNombre: "Modulo cxp 2025 (2).xls",
    muestraTamanoBytes: CUERPO.byteLength,
    muestraSha256: HUELLA,
    ...overrides,
  };
}

function llamar(id = "4") {
  return GET(new Request(`http://localhost/api/modulos/patrones/muestras/${id}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/modulos/patrones/muestras/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: 7, name: "Admin" });
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.findUnique.mockResolvedValue(version());
    mocks.obtenerObjeto.mockResolvedValue({ cuerpo: CUERPO, contentType: "application/vnd.ms-excel" });
  });

  it("descarga la muestra tal como se subió, con su nombre y sin caché", async () => {
    const respuesta = await llamar();
    expect(respuesta.status).toBe(200);
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(CUERPO);
    expect(respuesta.headers.get("Content-Type")).toBe("application/vnd.ms-excel");
    expect(respuesta.headers.get("Content-Disposition")).toBe(
      `attachment; filename="Modulo cxp 2025 (2).xls"; filename*=UTF-8''Modulo%20cxp%202025%20%282%29.xls`,
    );
    expect(respuesta.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(respuesta.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:crear");
    expect(mocks.obtenerObjeto).toHaveBeenCalledWith(CLAVE);
  });

  it("exige sesión y el permiso de ver los patrones (cargar módulos) antes de consultar", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await llamar()).status).toBe(401);
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    expect((await llamar()).status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza un identificador inválido", async () => {
    expect((await llamar("abc")).status).toBe(400);
    expect((await llamar("0")).status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("404 si la versión no existe, no tiene muestra o el almacén no la tiene", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await llamar()).status).toBe(404);
    mocks.findUnique.mockResolvedValueOnce(version({ muestraClaveObjeto: null }));
    expect((await llamar()).status).toBe(404);
    mocks.obtenerObjeto.mockResolvedValueOnce(null);
    expect((await llamar()).status).toBe(404);
  });

  it("no entrega una muestra que no coincide con su huella o su tamaño", async () => {
    mocks.findUnique.mockResolvedValueOnce(version({ muestraSha256: "0".repeat(64) }));
    expect((await llamar()).status).toBe(409);
    mocks.findUnique.mockResolvedValueOnce(version({ muestraTamanoBytes: 999 }));
    expect((await llamar()).status).toBe(409);
    expect(mocks.registrarError).toHaveBeenCalledTimes(2);
  });

  it("una versión migrada sin huella ni tamaño se entrega igual", async () => {
    mocks.findUnique.mockResolvedValueOnce(version({ muestraSha256: null, muestraTamanoBytes: null }));
    expect((await llamar()).status).toBe(200);
  });
});
