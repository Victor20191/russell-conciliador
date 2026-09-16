import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  logAudit: vi.fn(),
  ingerir: vi.fn(),
  subirObjeto: vi.fn(),
  eliminarObjeto: vi.fn(),
  erpFindUnique: vi.fn(),
  versionFindUnique: vi.fn(),
  versionUpdateMany: vi.fn(),
  tx: {
    versionPatronArchivoModulo: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 1, name: "Admin" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => String(e), registrarError: vi.fn() }));
vi.mock("@/lib/concurrency", () => ({
  tomarCandadoTransaccion: vi.fn(),
  transaccionSerializable: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
}));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({ ingerir: mocks.ingerir }));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => true,
  subirObjeto: mocks.subirObjeto,
  obtenerObjeto: vi.fn(),
  eliminarObjeto: mocks.eliminarObjeto,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    erp: { findUnique: mocks.erpFindUnique },
    versionPatronArchivoModulo: { findUnique: mocks.versionFindUnique, updateMany: mocks.versionUpdateMany },
  },
}));

import { cambiarEstadoVersionPatron, crearVersionPatron } from "./patrones-modulo";

const HOJA = {
  nombre: "Inventario",
  filas: [
    ["Tipo", "Referencia", "Cantidad", "Valor total"],
    ["MP", "A-1", 3, 300],
    ["PT", "B-2", 1, 150],
  ],
};
const SPEC = {
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, cantidad: 3, valorTotal: 4 },
};

function formulario(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("moduloCodigo", "INV");
  fd.set("erpId", "3");
  fd.set("specJson", JSON.stringify(SPEC));
  fd.set("archivo", new File([new Uint8Array([1, 2, 3])], "kardex.xlsx"));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("patrones de archivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.erpFindUnique.mockResolvedValue({ id: 3, code: "SIIGO", name: "SIIGO", active: true });
    mocks.ingerir.mockResolvedValue({ modo: "tabular", hojas: [HOJA] });
    mocks.subirObjeto.mockResolvedValue(undefined);
    mocks.eliminarObjeto.mockResolvedValue(undefined);
    mocks.tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ version: 1 }, { version: 3 }]);
    mocks.tx.versionPatronArchivoModulo.create.mockImplementation(async ({ data }: { data: { version: number } }) => ({ id: 40, version: data.version }));
  });

  it("crea la versión siguiente con la muestra, el encabezado y el mapeo reutilizable", async () => {
    const r = await crearVersionPatron(formulario({ nota: "Informe de kardex", aprobar: "1" }));

    expect(r).toMatchObject({ ok: true, versionId: 40, version: 4 });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("perfiles_carga:administrar");
    expect(mocks.subirObjeto.mock.calls[0][0].key).toBe("software/modulos/inv/patrones/siigo/v4/kardex.xlsx");
    const data = mocks.tx.versionPatronArchivoModulo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      erpId: 3,
      moduloCodigo: "INV",
      version: 4,
      estado: "aprobada",
      hoja: "Inventario",
      encabezadoJson: ["Tipo", "Referencia", "Cantidad", "Valor total"],
      muestraNombre: "kardex.xlsx",
      nota: "Informe de kardex",
      aprobadoPor: "Admin",
    });
    expect(data.specJson.columnas).toMatchObject({ tipo: 1, valorTotal: 4 });
  });

  it("no crea patrones para «Archivo manual» ni con un mapeo que no lee filas", async () => {
    mocks.erpFindUnique.mockResolvedValueOnce({ id: 9, code: "MANUAL", name: "Archivo manual", active: true });
    expect(await crearVersionPatron(formulario())).toEqual({ ok: false, message: "«Archivo manual» no tiene patrones: se mapea en cada carga." });

    const sinValor = formulario({ specJson: JSON.stringify({ ...SPEC, columnas: { tipo: 1 } }) });
    expect(await crearVersionPatron(sinValor)).toEqual({ ok: false, message: "Falta la columna obligatoria «Valor total»." });
    expect(mocks.subirObjeto).not.toHaveBeenCalled();
  });

  it("si falla el registro, retira la muestra ya subida", async () => {
    mocks.tx.versionPatronArchivoModulo.create.mockRejectedValueOnce(new Error("choque"));
    const r = await crearVersionPatron(formulario());
    expect(r.ok).toBe(false);
    expect(mocks.eliminarObjeto).toHaveBeenCalledWith("software/modulos/inv/patrones/siigo/v4/kardex.xlsx");
  });

  it("aprobar exige la muestra; desactivar no", async () => {
    mocks.versionFindUnique.mockResolvedValue({ id: 7, version: 2, estado: "pendiente", muestraClaveObjeto: null, moduloCodigo: "CXP", erp: { name: "SIESA" } });
    expect(await cambiarEstadoVersionPatron({ id: 7, estado: "aprobada" }))
      .toEqual({ ok: false, message: "Sube el archivo de muestra antes de aprobar la versión." });

    mocks.versionUpdateMany.mockResolvedValue({ count: 1 });
    expect(await cambiarEstadoVersionPatron({ id: 7, estado: "inactiva" })).toEqual({ ok: true, message: "Versión 2 desactivada." });
    expect(mocks.versionUpdateMany).toHaveBeenCalledWith({ where: { id: 7, estado: "pendiente" }, data: { estado: "inactiva" } });
  });
});
