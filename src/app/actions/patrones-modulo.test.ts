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

import { cambiarEstadoVersionPatron, crearVersionPatron, declararTipoFormatoVersion } from "./patrones-modulo";

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

  it("Cartera y CxP exigen declarar el tipo de formato para crear y para aprobar", async () => {
    mocks.ingerir.mockResolvedValue({
      modo: "tabular",
      hojas: [{ nombre: "CxP", filas: [["NIT", "Nombre", "Documento", "Saldo"], ["900123456", "ACME", "F-1", 100], ["800111222", "BETA", "F-2", 50]] }],
    });
    const specCxp = { hoja: "CxP", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { nit: 1, nombre: 2, documento: 3, total: 4 } };
    const sinTipo = formulario({ moduloCodigo: "CXP", specJson: JSON.stringify(specCxp) });
    expect(await crearVersionPatron(sinTipo)).toEqual({ ok: false, message: "Elige el tipo de formato del archivo: por documento, por edades o por documento y edades." });

    const porEdades = formulario({ moduloCodigo: "CXP", specJson: JSON.stringify({ ...specCxp, tipoFormato: "edades" }) });
    expect(await crearVersionPatron(porEdades)).toEqual({ ok: false, message: "El formato por edades necesita los rangos de vencimiento." });

    const porDocumento = formulario({ moduloCodigo: "CXP", specJson: JSON.stringify({ ...specCxp, tipoFormato: "documento" }) });
    expect(await crearVersionPatron(porDocumento)).toMatchObject({ ok: true });
    const data = mocks.tx.versionPatronArchivoModulo.create.mock.calls.at(-1)?.[0].data;
    expect(data.specJson).toMatchObject({ tipoFormato: "documento", nivel: "documento" });

    mocks.versionFindUnique.mockResolvedValue({
      id: 8, version: 3, estado: "pendiente", muestraClaveObjeto: "software/x.xlsx", moduloCodigo: "CXP",
      specJson: specCxp, erp: { name: "SIESA" },
    });
    expect(await cambiarEstadoVersionPatron({ id: 8, estado: "aprobada" })).toEqual({
      ok: false,
      message: "Elige el tipo de formato del archivo: por documento, por edades o por documento y edades. Edita la versión antes de aprobarla.",
    });
  });
});

describe("declarar el tipo de formato de una versión", () => {
  const ACTUALIZADO = new Date("2026-09-17T10:00:00.000Z");
  const RANGOS = [{ columna: 3, etiqueta: "Corriente", clase: "corriente" }, { columna: 4, etiqueta: "De 1 a 30", clase: "vencido" }];
  const specEdades = { hoja: "CxP", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { nit: 1, nombre: 2, total: 5 }, familias: { edades: RANGOS } };
  const version = (extra: Record<string, unknown> = {}) => ({
    id: 9, version: 2, estado: "aprobada", moduloCodigo: "CXP", specJson: specEdades,
    actualizadoEn: ACTUALIZADO, erp: { name: "SIESA" }, ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.versionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("declara el tipo de una aprobada que no lo tenía, sin tocar sus columnas", async () => {
    mocks.versionFindUnique.mockResolvedValue(version());
    const r = await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "edades" });
    expect(r).toEqual({ ok: true, message: "Versión 2: por edades." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("perfiles_carga:administrar");
    const llamada = mocks.versionUpdateMany.mock.calls[0][0];
    expect(llamada.where).toEqual({ id: 9, estado: "aprobada", actualizadoEn: ACTUALIZADO });
    expect(llamada.data.specJson).toMatchObject({ tipoFormato: "edades", nivel: "tercero", columnas: { nit: 1, nombre: 2, total: 5 } });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      action: "DECLARÓ TIPO DE FORMATO DEL PATRÓN",
      entity: "Cuentas por Pagar · SIESA v2",
      detail: "Por edades · antes: sin declarar (parecía por edades) · versión aprobada",
    });
  });

  it("avisa cuando el tipo cambia cómo se lee cada fila y exige su columna", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ estado: "pendiente" }));
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "documento_edades" }))
      .toEqual({ ok: false, message: "El formato por documento y edades necesita la columna del documento." });
    expect(mocks.versionUpdateMany).not.toHaveBeenCalled();

    mocks.versionFindUnique.mockResolvedValue(version({ estado: "pendiente", specJson: { ...specEdades, columnas: { ...specEdades.columnas, documento: 6 } } }));
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "edades" })).toMatchObject({ ok: true });
    expect(mocks.logAudit.mock.calls.at(-1)?.[0].detail).toBe("Por edades · antes: sin declarar (parecía por documento y edades) · versión pendiente · cada fila pasa de documento a tercero");
  });

  it("una aprobada con tipo declarado no se cambia; tampoco una versión que cambió o de otro módulo", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ specJson: { ...specEdades, tipoFormato: "edades" } }));
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "edades" }))
      .toEqual({ ok: true, message: "La versión 2 ya es por edades." });
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "documento" }))
      .toEqual({ ok: false, message: "Esta versión ya tiene su tipo declarado y no está pendiente: para cambiarlo crea una versión nueva a partir de ella." });

    mocks.versionFindUnique.mockResolvedValue(version());
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: "2026-01-01T00:00:00.000Z", tipoFormato: "edades" }))
      .toEqual({ ok: false, message: "La versión cambió desde que la abriste. Recarga la página." });

    mocks.versionFindUnique.mockResolvedValue(version({ moduloCodigo: "INV" }));
    expect(await declararTipoFormatoVersion({ id: 9, actualizadoEn: ACTUALIZADO.toISOString(), tipoFormato: "edades" }))
      .toEqual({ ok: false, message: "El tipo de formato solo aplica a Cartera y Cuentas por pagar." });
    expect(mocks.versionUpdateMany).not.toHaveBeenCalled();
  });
});
