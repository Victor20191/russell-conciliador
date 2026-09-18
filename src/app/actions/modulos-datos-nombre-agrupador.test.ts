import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

// Borrador: ponerle nombre a las filas «(sin clasificar)» / «GLOBAL», y la barra «Agrupador»
// alineando la columna y `datos[rol]`.
const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  loteFindUnique: vi.fn(),
  encabezadoFindUnique: vi.fn(),
  executeRaw: vi.fn(),
  stagingUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, error: unknown) => (error instanceof Error ? error.message : String(error)),
  registrarError: vi.fn(),
}));
vi.mock("@/lib/storage/objetos", () => ({
  almacenamientoDisponible: () => false,
  subirObjeto: vi.fn(),
  obtenerObjeto: vi.fn(),
  eliminarObjeto: vi.fn(),
}));
vi.mock("@/lib/modulos/patrones/servidor", () => ({
  aplicativoConfirmadoDeCarga: vi.fn(),
  versionesPatronCandidatas: vi.fn(async () => ({ versiones: [], total: 0 })),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findUnique: vi.fn(async () => ({ name: "PLASMAR S.A.S." })) },
    moduloImportacionLote: { findUnique: mocks.loteFindUnique, update: vi.fn() },
    moduloDatoEncabezado: { findUnique: mocks.encabezadoFindUnique },
    moduloImportacionStaging: { updateMany: mocks.stagingUpdateMany },
    archivoOriginalModulo: { updateMany: vi.fn() },
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}));

import { aplicarCambiosBorradorModulo, nombrarAgrupadorBorrador } from "./modulos-datos";

/** Lo que recibió `$executeRaw`: el texto de la sentencia y sus valores, con el filtro aplanado. */
function sentencia(llamada: unknown[]) {
  const [partes, ...valores] = llamada as [TemplateStringsArray, ...unknown[]];
  const filtro = valores[4] as Prisma.Sql;
  return { texto: partes.join("?"), valor: valores[0], rol: valores[1], lote: valores[3], filtro: filtro.strings.join("?"), filtroValores: filtro.values };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermiso.mockResolvedValue({ ok: true });
  mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Luisa Martinez" });
  mocks.loteFindUnique.mockResolvedValue({ clienteId: 43, moduloCodigo: "CAR", anexoEncabezadoId: null });
  mocks.encabezadoFindUnique.mockResolvedValue({ version: 3, periodo: "2025-12" });
  mocks.executeRaw.mockResolvedValue(1098);
  mocks.stagingUpdateMany.mockReturnValue({ count: 1 });
  mocks.transaction.mockResolvedValue([]);
});

describe("nombrarAgrupadorBorrador", () => {
  it("nombra las filas sin clasificar en la columna y en la cuenta del archivo (Cartera)", async () => {
    const r = await nombrarAgrupadorBorrador({ loteId: "lote-1", grupo: "sin_clasificar", nombre: "  USD " });

    expect(r).toEqual({ ok: true, message: "Las 1098 filas quedaron como «USD»." });
    const s = sentencia(mocks.executeRaw.mock.calls[0]);
    expect(s.texto).toContain('UPDATE "modulo_importacion_staging"');
    expect(s.texto).toContain("jsonb_set");
    expect(s).toMatchObject({ valor: "USD", rol: "cuenta", lote: "lote-1" });
    expect(s.filtro).toContain('"clasificador" IS NULL');
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:crear", { clientId: 43 });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      action: "NOMBRÓ agrupador del borrador",
      detail: "CAR · 1098 fila(s) «(sin clasificar)» → «USD»",
      clientId: 43,
    });
  });

  it("en un anexo la auditoría dice a qué versión se suma", async () => {
    mocks.loteFindUnique.mockResolvedValue({ clienteId: 43, moduloCodigo: "CAR", anexoEncabezadoId: 64 });

    await nombrarAgrupadorBorrador({ loteId: "lote-2", grupo: "sin_clasificar", nombre: "COP" });

    expect(mocks.logAudit.mock.calls[0][0].detail).toContain("anexo a la v3 de 2025-12");
  });

  it("renombra el GLOBAL de Inventarios en su rol «tipo»", async () => {
    mocks.loteFindUnique.mockResolvedValue({ clienteId: 7, moduloCodigo: "INV", anexoEncabezadoId: null });

    const r = await nombrarAgrupadorBorrador({ loteId: "lote-3", grupo: "global", nombre: "BODEGA NORTE" });

    expect(r.ok).toBe(true);
    const s = sentencia(mocks.executeRaw.mock.calls[0]);
    expect(s).toMatchObject({ valor: "BODEGA NORTE", rol: "tipo" });
    expect(s.filtro).toContain('"clasificador" = ');
    expect(s.filtroValores).toEqual(["GLOBAL"]);
  });

  it("rechaza el nombre reservado, el vacío, dejarlo igual y Nómina", async () => {
    expect((await nombrarAgrupadorBorrador({ loteId: "l", grupo: "sin_clasificar", nombre: "(sin clasificar)" })).ok).toBe(false);
    expect((await nombrarAgrupadorBorrador({ loteId: "l", grupo: "sin_clasificar", nombre: "  " })).ok).toBe(false);
    expect(await nombrarAgrupadorBorrador({ loteId: "l", grupo: "global", nombre: "GLOBAL" })).toEqual({ ok: false, message: "Ya se llama «GLOBAL»." });
    mocks.loteFindUnique.mockResolvedValue({ clienteId: 7, moduloCodigo: "NOM", anexoEncabezadoId: null });
    expect(await nombrarAgrupadorBorrador({ loteId: "l", grupo: "sin_clasificar", nombre: "X" })).toEqual({
      ok: false,
      message: "En Nómina el agrupador es el código del concepto: no se renombra.",
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("sin filas del grupo lo dice y no audita; sin alcance no escribe", async () => {
    mocks.executeRaw.mockResolvedValue(0);
    expect(await nombrarAgrupadorBorrador({ loteId: "l", grupo: "global", nombre: "X" })).toEqual({
      ok: false,
      message: "No hay filas «GLOBAL» en este borrador.",
    });
    expect(mocks.logAudit).not.toHaveBeenCalled();

    mocks.executeRaw.mockClear();
    mocks.authorizePermiso.mockImplementation(async (_p: string, opciones?: { clientId?: number }) =>
      opciones?.clientId ? { ok: false, message: "Sin acceso al cliente." } : { ok: true });
    expect(await nombrarAgrupadorBorrador({ loteId: "l", grupo: "sin_clasificar", nombre: "X" })).toEqual({ ok: false, message: "Sin acceso al cliente." });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});

describe("aplicarCambiosBorradorModulo · barra «Agrupador»", () => {
  it("escribe el agrupador en la columna y en datos[rol], una sentencia por valor", async () => {
    const r = await aplicarCambiosBorradorModulo("lote-1", [
      { filaNum: 5, clasificador: "COP" },
      { filaNum: 6, clasificador: " COP " },
      { filaNum: 7, clasificador: "" },
      { filaNum: 8, omitida: true },
    ]);

    expect(r).toEqual({ ok: true, message: "Cambios guardados." });
    const sentencias = mocks.executeRaw.mock.calls.map(sentencia);
    expect(sentencias).toHaveLength(2);
    expect(sentencias[0]).toMatchObject({ valor: "COP", rol: "cuenta", filtroValores: [5, 6] });
    expect(sentencias[1]).toMatchObject({ valor: null, rol: "cuenta", filtroValores: [7] });
    // Omitir sigue por su camino, sin tocar el agrupador.
    expect(mocks.stagingUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.stagingUpdateMany).toHaveBeenCalledWith({ where: { loteId: "lote-1", filaNum: 8 }, data: { omitida: true } });
  });

  it("en Nómina solo cambia la columna (su clasificador es el código del concepto)", async () => {
    mocks.loteFindUnique.mockResolvedValue({ clienteId: 7, moduloCodigo: "NOM" });

    await aplicarCambiosBorradorModulo("lote-n", [{ filaNum: 3, clasificador: "001" }]);

    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.stagingUpdateMany).toHaveBeenCalledWith({ where: { loteId: "lote-n", filaNum: { in: [3] } }, data: { clasificador: "001" } });
  });
});
