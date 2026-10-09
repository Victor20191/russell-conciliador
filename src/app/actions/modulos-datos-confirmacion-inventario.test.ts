import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsistenciaInventarioGuardada } from "@/lib/modulos/asistencia-inventario-estado";

const m = vi.hoisted(() => ({
  permiso: vi.fn(), lote: vi.fn(), original: vi.fn(), guardarOriginal: vi.fn(), confirmarOriginal: vi.fn(),
  buscarEncabezado: vi.fn(), crearEncabezado: vi.fn(), actualizarEncabezado: vi.fn(), filas: vi.fn(), purgarFilas: vi.fn(), purgarLote: vi.fn(),
  aprender: vi.fn(), candado: vi.fn(), tx: vi.fn(), eventos: [] as string[], antesTx: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: m.permiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 8, name: "Analista" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_contexto: string, e: unknown) => e instanceof Error ? e.message : String(e), registrarError: vi.fn() }));
vi.mock("@/lib/storage/objetos", () => ({ almacenamientoDisponible: () => false, subirObjeto: vi.fn(), obtenerObjeto: vi.fn(), eliminarObjeto: vi.fn() }));
vi.mock("@/lib/modulos/patrones/servidor", () => ({ aplicativoConfirmadoDeCarga: vi.fn(), versionesPatronCandidatas: vi.fn() }));
vi.mock("@/lib/modulos/patrones/aprender-confirmado", () => ({ aprenderPatronInventarioConfirmado: m.aprender }));
vi.mock("@/lib/concurrency", () => ({ transaccionSerializable: m.tx, tomarCandadoTransaccion: m.candado }));
vi.mock("@/lib/prisma", () => ({ default: {
  client: { findUnique: vi.fn(async () => ({ name: "Cliente de prueba" })) },
  moduloImportacionLote: { findUnique: m.lote, deleteMany: m.purgarLote },
  archivoOriginalModulo: { findUnique: m.original, updateMany: m.guardarOriginal, update: m.confirmarOriginal },
  moduloDatoEncabezado: { findUnique: m.buscarEncabezado, findFirst: vi.fn(async () => null), create: m.crearEncabezado, updateMany: vi.fn(), update: m.actualizarEncabezado },
  moduloImportacionStaging: { findMany: m.filas, deleteMany: m.purgarFilas },
  comment: { updateMany: vi.fn() },
} }));

import prisma from "@/lib/prisma";
import { cargarBorradorModulo } from "./modulos-datos";

const ID = "recepcion-inventario-prueba";
const spec = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, valorTotal: 2 } };
let asistencia: AsistenciaInventarioGuardada;
let original: Record<string, unknown>;
let lote: Record<string, unknown>;

function formulario(revision: string | null = "3") {
  const fd = new FormData();
  fd.set("loteId", ID);
  fd.set("periodo", "2026-09");
  fd.set("verificaciones", JSON.stringify({ consignacion_recibida: { respuesta: "no" }, consignacion_entregada: { respuesta: "no" } }));
  if (revision != null) fd.set("revisionAsistenciaEsperada", revision);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.antesTx.mockReset();
  m.eventos.length = 0;
  asistencia = {
    version: 1, estado: "borrador_preparado", erpId: 4, periodo: "2026-09", operacionId: "operacion-3", venceEn: "2026-10-03T12:30:00Z",
    anexoEncabezadoId: null, instrucciones: "", respuestas: {}, resultado: null, versionBaseId: null, encabezado: ["Tipo", "Valor total"],
    aplicado: { spec, revision: 3, origen: "ia", versionBaseId: null, encabezado: ["Tipo", "Valor total"],
      resumen: { hoja: "Inventario", filasIncluidas: 1, filasExcluidas: 0, valorLeido: 100, totalDeclarado: null, diferencia: null, tipoInventario: "Materia prima" } },
  };
  original = { id: 9, clienteId: 5, moduloCodigo: "INV", estado: "borrador", encabezadoId: null, revisionAsistencia: 3, esAnexo: false, asistenciaJson: asistencia };
  lote = { id: 11, loteId: ID, clienteId: 5, moduloCodigo: "INV", archivoNombre: "prueba.xlsx", archivoTam: "1 KB", origenExtraccion: "ia", anexoEncabezadoId: null, specJson: { ...spec, asistenciaRevision: 3 }, patronVersionId: null, patronCoincidencia: null };
  m.permiso.mockResolvedValue({ ok: true });
  m.lote.mockImplementation(async () => ({ ...lote }));
  m.original.mockImplementation(async () => { m.eventos.push("leer-original"); return { ...original }; });
  m.buscarEncabezado.mockResolvedValue(null);
  m.candado.mockImplementation(async (_tx, clave) => { m.eventos.push(clave); });
  m.tx.mockImplementation(async (fn) => { await m.antesTx(); return fn(prisma); });
  m.filas.mockImplementation(async () => { m.eventos.push("leer-filas"); return [{ filaNum: 2, hoja: "Inventario", clasificador: "Materia prima", valor: 100, datos: { referencia: "A", tipo: "Materia prima", cantidad: 2, valorTotal: 100 }, tipoFila: "movimiento", omitida: null, motivoTipoFila: null }]; });
  m.crearEncabezado.mockImplementation(async () => { m.eventos.push("promover"); return { id: 90 }; });
  m.guardarOriginal.mockImplementation(async ({ data }) => { Object.assign(original, data); m.eventos.push("original-cargado"); return { count: 1 }; });
  m.aprender.mockImplementation(async () => { m.eventos.push("aprender"); return { id: 30, version: 6, reutilizada: false }; });
  m.purgarFilas.mockResolvedValue({ count: 1 });
  m.purgarLote.mockResolvedValue({ count: 1 });
});

describe("cargarBorradorModulo · revisión visible de inventario", () => {
  it("valida dentro del candado y aprende sólo después de promover el original", async () => {
    const r = await cargarBorradorModulo(undefined, formulario());
    expect(r).toMatchObject({ ok: true, encabezadoId: 90, modo: "version" });
    expect(m.eventos.indexOf(`modulo-borrador:${ID}`)).toBeLessThan(m.eventos.indexOf("leer-original"));
    expect(m.eventos.indexOf("leer-original")).toBeLessThan(m.eventos.indexOf("leer-filas"));
    expect(m.eventos.indexOf("original-cargado")).toBeLessThan(m.eventos.indexOf("aprender"));
    expect(m.aprender).toHaveBeenCalledOnce();
    expect(m.purgarLote).toHaveBeenCalledOnce();
  });

  it.each([null, "", "2", "4", "3.0", "-3", "1e0", "9007199254740993"])("rechaza revisión ausente, inválida u obsoleta: %s", async (revision) => {
    expect(await cargarBorradorModulo(undefined, formulario(revision))).toMatchObject({ ok: false, message: expect.stringContaining("lectura cambió") });
    expect(m.filas).not.toHaveBeenCalled();
    expect(m.crearEncabezado).not.toHaveBeenCalled();
    expect(m.aprender).not.toHaveBeenCalled();
    expect(m.purgarLote).not.toHaveBeenCalled();
  });

  it.each(["analizando", "propuesta_lista", "requiere_respuesta", "error_recuperable"] as const)("no promueve el borrador mientras la asistencia está %s", async (estado) => {
    asistencia.estado = estado;
    expect(await cargarBorradorModulo(undefined, formulario())).toMatchObject({ ok: false, message: expect.stringContaining("lectura pendiente") });
    expect(m.filas).not.toHaveBeenCalled();
    expect(m.crearEncabezado).not.toHaveBeenCalled();
  });

  it("detecta una lectura nueva aplicada después de abrir la pantalla", async () => {
    m.antesTx.mockImplementationOnce(() => {
      original.revisionAsistencia = 4;
      asistencia.aplicado!.revision = 4;
      lote.specJson = { ...spec, asistenciaRevision: 4 };
    });
    expect(await cargarBorradorModulo(undefined, formulario("3"))).toMatchObject({ ok: false, message: expect.stringContaining("lectura cambió") });
    expect(m.crearEncabezado).not.toHaveBeenCalled();
    expect(m.aprender).not.toHaveBeenCalled();
  });

  it("no acepta que el lote y la asistencia aplicada tengan revisiones diferentes", async () => {
    lote.specJson = { ...spec, asistenciaRevision: 2 };
    expect(await cargarBorradorModulo(undefined, formulario())).toMatchObject({ ok: false, message: expect.stringContaining("lectura cambió") });
    expect(m.filas).not.toHaveBeenCalled();
  });

  it("no degrada una asistencia corrupta a carga histórica", async () => {
    original.asistenciaJson = null;
    expect(await cargarBorradorModulo(undefined, formulario())).toMatchObject({ ok: false, message: expect.stringContaining("lectura pendiente") });
    expect(m.crearEncabezado).not.toHaveBeenCalled();
  });

  it("mantiene la promoción de inventarios históricos sin revisión de asistencia", async () => {
    original.revisionAsistencia = 0;
    original.asistenciaJson = null;
    lote.specJson = spec;
    expect(await cargarBorradorModulo(undefined, formulario(null))).toMatchObject({ ok: true, encabezadoId: 90 });
    expect(m.aprender).not.toHaveBeenCalled();
    expect(m.crearEncabezado).toHaveBeenCalledOnce();
  });

  it("con «Guardar este formato como patrón» desmarcada no aprende ni enlaza una versión", async () => {
    const fd = formulario();
    fd.set("guardarComoPatron", "0");
    expect(await cargarBorradorModulo(undefined, fd)).toMatchObject({ ok: true, encabezadoId: 90 });
    expect(m.aprender).not.toHaveBeenCalled();
    expect(m.actualizarEncabezado).not.toHaveBeenCalled();
    expect(m.confirmarOriginal).toHaveBeenCalledWith(expect.objectContaining({
      data: { asistenciaJson: expect.objectContaining({ estado: "confirmado", patronAprendidoId: null }) },
    }));
  });

  it("marcada (o sin el campo, como una pestaña anterior) aprende como siempre", async () => {
    const fd = formulario();
    fd.set("guardarComoPatron", "1");
    expect(await cargarBorradorModulo(undefined, fd)).toMatchObject({ ok: true });
    expect(m.aprender).toHaveBeenCalledOnce();
  });

  it("el reintento posterior al commit conserva su respuesta idempotente", async () => {
    m.buscarEncabezado.mockResolvedValueOnce({ id: 90, clienteId: 5, version: 1 });
    expect(await cargarBorradorModulo(undefined, formulario(null))).toMatchObject({ ok: true, encabezadoId: 90, message: expect.stringContaining("ya había sido cargada") });
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.aprender).not.toHaveBeenCalled();
  });
});
