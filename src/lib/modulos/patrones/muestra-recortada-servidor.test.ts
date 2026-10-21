import { beforeEach, describe, expect, it, vi } from "vitest";
import { huellaSha256Archivo } from "../archivo-original";

const CUERPO = new Uint8Array([1, 2, 3, 4]);

const mocks = vi.hoisted(() => ({
  versionFindUnique: vi.fn(),
  versionUpdateMany: vi.fn(),
  originalFindUnique: vi.fn(),
  subirObjeto: vi.fn(),
  eliminarObjeto: vi.fn(),
  obtenerObjeto: vi.fn(),
  ingerir: vi.fn(),
  generarMuestraRecortada: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  versionPatronArchivoModulo: { findUnique: mocks.versionFindUnique, updateMany: mocks.versionUpdateMany },
  archivoOriginalModulo: { findUnique: mocks.originalFindUnique },
} }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn() }));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => true,
  subirObjeto: mocks.subirObjeto,
  eliminarObjeto: mocks.eliminarObjeto,
  obtenerObjeto: mocks.obtenerObjeto,
}));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({ ingerir: mocks.ingerir }));
vi.mock("./muestra-recortada", () => ({ FILAS_DATOS_MUESTRA: 100, generarMuestraRecortada: mocks.generarMuestraRecortada }));

import { guardarMuestraRecortada } from "./muestra-recortada-servidor";

const SPEC = { hoja: "Kardex", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, valorTotal: 2 } };

describe("guardarMuestraRecortada · cliente de la muestra (21/Oct/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.versionFindUnique.mockResolvedValue({
      id: 4, version: 2, moduloCodigo: "INV", estado: "validada_cliente", hoja: "Kardex", filaEncabezado: 1, primeraFilaDatos: 2,
      encabezadoJson: ["Tipo", "Valor total"], specJson: SPEC, muestraClaveObjeto: null, muestraOrigen: null,
      archivoOrigenId: 9, clienteOrigenId: 5, erp: { code: "SIIGO" },
    });
    mocks.originalFindUnique.mockResolvedValue({
      clienteId: 5, nombreCliente: "KAKARAKA S.A.S.", moduloCodigo: "INV", nombreArchivo: "Kardex dic.xlsx",
      tamanoBytes: CUERPO.byteLength, huellaSha256: huellaSha256Archivo(CUERPO), claveObjeto: "originales/9", disponible: true,
    });
    mocks.obtenerObjeto.mockResolvedValue({ cuerpo: CUERPO });
    mocks.ingerir.mockResolvedValue({ modo: "tabular", hojas: [{ nombre: "Kardex", filas: [["Tipo", "Valor total"], ["MP", 10]] }] });
    mocks.generarMuestraRecortada.mockResolvedValue({ ok: true, nombre: "Kardex dic.xlsx", bytes: new Uint8Array([9, 9]), filasDatos: 1 });
    mocks.versionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("la copia del original queda como muestra del cliente de ese original", async () => {
    expect(await guardarMuestraRecortada(4)).toMatchObject({ ok: true, yaTenia: false });
    const { data } = mocks.versionUpdateMany.mock.calls[0][0];
    expect(data).toMatchObject({ muestraOrigen: "recorte_original", muestraClienteId: 5, muestraClienteNombre: "KAKARAKA S.A.S." });
  });
});
