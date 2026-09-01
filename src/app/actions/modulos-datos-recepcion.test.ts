import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventos: [] as string[],
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  clientFindUnique: vi.fn(),
  originalFindUnique: vi.fn(),
  originalCreate: vi.fn(),
  originalUpdateMany: vi.fn(),
  subirObjeto: vi.fn(),
  obtenerObjeto: vi.fn(),
  ingerir: vi.fn(),
  leerCeldaFisicaArchivo: vi.fn(),
  revalidatePath: vi.fn(),
  registrarError: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, error: unknown) => error instanceof Error ? error.message : String(error),
  registrarError: mocks.registrarError,
}));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => true,
  subirObjeto: mocks.subirObjeto,
  obtenerObjeto: mocks.obtenerObjeto,
  eliminarObjeto: vi.fn(),
}));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({
  ingerir: mocks.ingerir,
  leerCeldaFisicaArchivo: mocks.leerCeldaFisicaArchivo,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findUnique: mocks.clientFindUnique },
    archivoOriginalModulo: {
      findUnique: mocks.originalFindUnique,
      create: mocks.originalCreate,
      updateMany: mocks.originalUpdateMany,
    },
  },
}));

import { analizarArchivoModulo, ubicarCeldaArchivoModulo } from "./modulos-datos";

const BYTES = new Uint8Array([80, 75, 3, 4, 0, 255, 10]);
const SHA = createHash("sha256").update(BYTES).digest("hex");

function formulario(recepcionLoteId?: string): FormData {
  const datos = new FormData();
  datos.set("moduloCodigo", "ING");
  datos.set("clienteId", "17");
  datos.set("archivo", new File([BYTES], "facturacion-corrupta.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  if (recepcionLoteId) datos.set("recepcionLoteId", recepcionLoteId);
  return datos;
}

describe("analizarArchivoModulo · recepción durable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventos.length = 0;
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Analista" });
    mocks.clientFindUnique.mockResolvedValue({ name: "Cliente prueba", nit: "900123456" });
    mocks.originalFindUnique.mockResolvedValue(null);
    mocks.originalCreate.mockImplementation(async () => {
      mocks.eventos.push("fila");
      return {};
    });
    mocks.subirObjeto.mockImplementation(async () => {
      mocks.eventos.push("objeto");
    });
    mocks.originalUpdateMany.mockImplementation(async (args: { data?: { disponible?: boolean; estado?: string } }) => {
      if (args.data?.estado === "no_procesable") mocks.eventos.push("no_procesable");
      else if (args.data?.disponible) mocks.eventos.push("disponible");
      return { count: 1 };
    });
    mocks.ingerir.mockImplementation(async () => {
      mocks.eventos.push("parser");
      throw new Error("XLSX corrupto");
    });
  });

  it("crea la fila y conserva bytes+SHA antes del parser, aun cuando el archivo no es procesable", async () => {
    const resultado = await analizarArchivoModulo(formulario());

    expect(resultado.ok).toBe(false);
    expect(resultado.recepcionLoteId).toMatch(/[0-9a-f-]{36}/);
    expect(resultado.message).toContain("Bitácora");
    expect(mocks.eventos).toEqual(["fila", "objeto", "disponible", "parser", "no_procesable"]);

    const metadata = mocks.originalCreate.mock.calls[0][0].data;
    expect(metadata).toMatchObject({
      moduloCodigo: "ING",
      clienteId: 17,
      nombreArchivo: "facturacion-corrupta.xlsx",
      tamanoBytes: BYTES.byteLength,
      huellaSha256: SHA,
      estado: "recibido",
      disponible: false,
      softwareOrigen: null,
      ubicacionOrigen: null,
      reflejoContableEsperado: null,
    });
    const subida = mocks.subirObjeto.mock.calls[0][0];
    expect(subida.cuerpo).toEqual(BYTES);
    expect(mocks.originalUpdateMany.mock.calls.at(-1)?.[0].data).toEqual({
      estado: "no_procesable",
      disponible: true,
    });
  });

  it("no eleva disponible si la recepción falla antes de ejecutar PutObject", async () => {
    const loteId = "9b4e5d99-b1b2-4b1d-a231-2d1f47f27ec2";
    mocks.originalFindUnique.mockResolvedValue({
      loteId,
      clienteId: 17,
      moduloCodigo: "ING",
      nombreArchivo: "facturacion-corrupta.xlsx",
      tamanoBytes: BYTES.byteLength,
      huellaSha256: SHA,
      claveObjeto: `software/modulos/ing/clientes/17/originales/${loteId}/facturacion-corrupta.xlsx`,
      disponible: false,
      estado: "recibido",
    });
    mocks.originalUpdateMany
      .mockRejectedValueOnce(new Error("BD interrumpida antes de S3"))
      .mockResolvedValueOnce({ count: 1 });

    const resultado = await analizarArchivoModulo(formulario(loteId));

    expect(resultado.ok).toBe(false);
    expect(mocks.subirObjeto).not.toHaveBeenCalled();
    expect(mocks.originalUpdateMany.mock.calls[1][0].data).toEqual({ estado: "no_procesable" });
    expect(resultado.message).toContain("original no está disponible");
  });

  it("un reintento que solo envía el ERP conserva ubicación y reflejo ya documentados", async () => {
    const loteId = "d20810cb-ec7e-43a5-8fd7-a25a86646bbf";
    mocks.originalFindUnique.mockResolvedValue({
      loteId,
      clienteId: 17,
      moduloCodigo: "ING",
      nombreArchivo: "facturacion-corrupta.xlsx",
      tamanoBytes: BYTES.byteLength,
      huellaSha256: SHA,
      claveObjeto: `software/modulos/ing/clientes/17/originales/${loteId}/facturacion-corrupta.xlsx`,
      disponible: true,
      estado: "recibido",
    });

    const datos = formulario(loteId);
    datos.set("softwareOrigen", "SIIGO");
    await analizarArchivoModulo(datos);

    expect(mocks.originalUpdateMany.mock.calls[0][0].data).toEqual({ estado: "recibido", softwareOrigen: "SIIGO" });
    expect(mocks.originalUpdateMany.mock.calls[0][0].data).not.toHaveProperty("ubicacionOrigen");
    expect(mocks.originalUpdateMany.mock.calls[0][0].data).not.toHaveProperty("reflejoContableEsperado");
  });
});

describe("ubicarCeldaArchivoModulo", () => {
  const loteId = "d20810cb-ec7e-43a5-8fd7-a25a86646bbf";
  const entrada = {
    moduloCodigo: "INV",
    clienteId: 17,
    recepcionLoteId: loteId,
    hoja: "Inventario",
    columna: 13,
    fila: 1347,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.originalFindUnique.mockResolvedValue({
      clienteId: 17,
      moduloCodigo: "INV",
      nombreArchivo: "inventario.xlsx",
      tamanoBytes: BYTES.byteLength,
      huellaSha256: SHA,
      claveObjeto: `software/modulos/inv/clientes/17/originales/${loteId}/inventario.xlsx`,
      disponible: true,
      estado: "recibido",
    });
    mocks.obtenerObjeto.mockResolvedValue({ cuerpo: BYTES, contentType: "application/octet-stream" });
    mocks.leerCeldaFisicaArchivo.mockResolvedValue({
      hojaExiste: true,
      filaExiste: true,
      valor: 1_200_978_578.51,
    });
  });

  it("lee la coordenada exacta del original íntegro y devuelve solo su contenido", async () => {
    await expect(ubicarCeldaArchivoModulo(entrada)).resolves.toEqual({
      ok: true,
      direccion: "M1347",
      valor: 1_200_978_578.51,
    });
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(1, "modulos_datos:crear");
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "modulos_datos:crear", { clientId: 17 });
    expect(mocks.leerCeldaFisicaArchivo).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "inventario.xlsx",
      "Inventario",
      1347,
      13,
    );
  });

  it("rechaza el objeto cuando su contenido no coincide con la metadata durable", async () => {
    mocks.obtenerObjeto.mockResolvedValue({ cuerpo: new Uint8Array([...BYTES, 99]), contentType: "application/octet-stream" });

    const resultado = await ubicarCeldaArchivoModulo(entrada);

    expect(resultado).toEqual({ ok: false, message: "El archivo original no supera la verificación de integridad." });
    expect(mocks.leerCeldaFisicaArchivo).not.toHaveBeenCalled();
    expect(mocks.registrarError).toHaveBeenCalledWith(
      "ubicarCeldaArchivoModulo.integridad",
      expect.any(Error),
    );
  });
});
