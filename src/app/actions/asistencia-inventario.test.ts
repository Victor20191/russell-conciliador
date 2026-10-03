import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { AsistenciaInventarioGuardada } from "@/lib/modulos/asistencia-inventario-estado";
import type { ResultadoAsistenciaInventario } from "@/lib/modulos/asistencia/tipos";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";

const m = vi.hoisted(() => ({
  permiso: vi.fn(), original: vi.fn(), actualizar: vi.fn(), lote: vi.fn(), filas: vi.fn(),
  guardarLote: vi.fn(), crearFilas: vi.fn(), borrarFilas: vi.fn(), tx: vi.fn(),
  objeto: vi.fn(), ingerir: vi.fn(), resolver: vi.fn(), validar: vi.fn(), consumo: vi.fn(), aplicativo: vi.fn(), versiones: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  archivoOriginalModulo: { findUnique: m.original, updateMany: m.actualizar },
  moduloImportacionLote: { findUnique: m.lote, create: m.guardarLote, update: m.guardarLote },
  moduloImportacionStaging: { findMany: m.filas, createMany: m.crearFilas, deleteMany: m.borrarFilas },
  versionPatronArchivoModulo: { updateMany: vi.fn() },
} }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: m.permiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: 9, name: "Prueba" }) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/concurrency", () => ({ transaccionSerializable: m.tx, tomarCandadoTransaccion: vi.fn() }));
vi.mock("@/lib/storage/objetos", () => ({ obtenerObjeto: m.objeto }));
vi.mock("@/lib/ia/uso", () => ({ registrarConsumoIA: m.consumo }));
vi.mock("@/lib/balance/extraccion/ingesta", () => ({ ingerir: m.ingerir }));
vi.mock("@/lib/modulos/asistencia/resolver", () => ({ resolverLecturaInventario: m.resolver }));
vi.mock("@/lib/modulos/asistencia/validar", () => ({ validarLecturaInventario: m.validar }));
vi.mock("@/lib/modulos/patrones/servidor", () => ({ aplicativoConfirmadoDeCarga: m.aplicativo, versionesPatronCandidatas: m.versiones }));

import prisma from "@/lib/prisma";
import { conservarLecturaInventario, consultarAsistenciaInventario, prepararBorradorInventario } from "./asistencia-inventario";
const ID = "00000000-0000-4000-8000-000000000001";
const bytes = new Uint8Array([1, 2, 3]);
const spec = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, referencia: 2, descripcion: 0, cantidad: 3, valorUnitario: 0, valorTotal: 4 } };
const hojas = [{ nombre: "Inventario", filas: [["Tipo", "Referencia", "Cantidad", "Valor total"], ["Mercancía", "REF-01", 2, 100]] }];
const resumen = { filasIncluidas: 1, filasExcluidas: 0, valorLeido: 100, totalDeclarado: null, diferencia: null, hoja: "Inventario", tipoInventario: "Mercancía" };
const resultado: ResultadoAsistenciaInventario = { spec, resumen, preguntas: [], advertencias: [], errores: [], usos: [], origen: "ia", estructuraValida: true, listoParaBorrador: true };
const baseOriginal = { id: 1, loteId: ID, clienteId: 7, moduloCodigo: "INV", estado: "recibido", revisionAsistencia: 0, asistenciaJson: null, disponible: true, claveObjeto: "privado/prueba", huellaSha256: createHash("sha256").update(bytes).digest("hex"), tamanoBytes: 3, nombreArchivo: "prueba.xlsx", nombreCliente: "Cliente de prueba", softwareOrigen: "SIESA" };
let original: Record<string, unknown>;

function configurarBorrador(estado: AsistenciaInventarioGuardada["estado"] = "propuesta_lista") {
  const asistencia: AsistenciaInventarioGuardada = {
    version: 1, estado, operacionId: "operacion-5", venceEn: new Date(Date.now() - 1000).toISOString(),
    erpId: 3, periodo: "2026-09", anexoEncabezadoId: null, instrucciones: "Revisar el tipo", respuestas: { modo_tipo: "global" },
    resultado: structuredClone(resultado),
    aplicado: { spec: structuredClone(spec), resumen: structuredClone(resumen), revision: 2, origen: "manual", encabezado: [...hojas[0].filas[0]], versionBaseId: 8 },
    versionBaseId: 20, encabezado: [...hojas[0].filas[0]],
  };
  const lote = {
    id: 10, loteId: ID, clienteId: 7, moduloCodigo: "INV", anexoEncabezadoId: null,
    actualizadoEn: new Date("2026-10-03T10:00:00Z"), periodoFinal: new Date("2026-10-31T00:00:00Z"),
    specJson: { ...spec, asistenciaRevision: 2 }, patronVersionId: null, patronCoincidencia: null,
  };
  original = { ...baseOriginal, estado: "borrador", periodo: "2026-10", revisionAsistencia: 5, asistenciaJson: asistencia };
  m.lote.mockResolvedValue(lote);
  return { asistencia, lote };
}

beforeEach(() => {
  vi.clearAllMocks();
  original = { ...baseOriginal };
  m.permiso.mockResolvedValue({ ok: true });
  m.original.mockImplementation(async () => ({ ...original }));
  m.actualizar.mockImplementation(async ({ data, where }) => {
    if (where.revisionAsistencia != null && where.revisionAsistencia !== original.revisionAsistencia) return { count: 0 };
    original = { ...original, ...data };
    return { count: 1 };
  });
  m.lote.mockResolvedValue(null);
  m.filas.mockResolvedValue([]);
  m.objeto.mockResolvedValue({ cuerpo: bytes });
  m.ingerir.mockResolvedValue({ modo: "tabular", hojas });
  m.resolver.mockResolvedValue(structuredClone(resultado));
  m.validar.mockReturnValue(structuredClone(resultado));
  m.aplicativo.mockResolvedValue({ ok: true, aplicativo: { id: 3, name: "SIESA", manual: false } });
  m.versiones.mockResolvedValue({ versiones: [], total: 0 });
  m.tx.mockImplementation(async (fn) => fn(prisma));
});

describe("asistencia de inventario, autoridad del original y continuidad", () => {
  it("autoriza al cliente real del original antes de leer datos o invocar IA", async () => {
    m.permiso.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "Sin alcance" });
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 });
    expect(r).toMatchObject({ ok: false, message: "Sin alcance" });
    expect(m.permiso).toHaveBeenLastCalledWith("modulos_datos:crear", { clientId: 7 });
    expect(m.objeto).not.toHaveBeenCalled();
    expect(m.resolver).not.toHaveBeenCalled();
  });
  it("un hash diferente impide crear staging y conserva la recepción recuperable", async () => {
    m.objeto.mockResolvedValue({ cuerpo: new Uint8Array([9, 9, 9]) });
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 });
    expect(r).toMatchObject({ ok: false, estado: "error_recuperable" });
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(original.estado).toBe("recibido");
  });
  it("el archivo confirmado o descartado no se puede reinterpretar", async () => {
    for (const estado of ["cargado", "descartado"]) {
      original.estado = estado;
      expect(await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 })).toMatchObject({ ok: false });
    }
    expect(m.resolver).not.toHaveBeenCalled();
  });
  it("prepara automáticamente el borrador sin crear un patrón reutilizable", async () => {
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 });
    expect(r).toMatchObject({ ok: true, estado: "borrador_preparado", loteId: ID, resumen });
    expect(m.guardarLote).toHaveBeenCalledOnce();
    expect(m.crearFilas).toHaveBeenCalledOnce();
    expect(original.estado).toBe("borrador");
    expect((original.asistenciaJson as { aplicado: { origen: string } }).aplicado.origen).toBe("ia");
  });
  it("las dudas mantienen el original, sin staging parcial", async () => {
    m.resolver.mockResolvedValue({ ...resultado, listoParaBorrador: false, preguntas: [{ id: "columna_tipo", etiqueta: "¿Cuál tipo?" }] });
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 });
    expect(r).toMatchObject({ estado: "requiere_respuesta" });
    expect(m.guardarLote).not.toHaveBeenCalled();
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(await consultarAsistenciaInventario({ recepcionLoteId: ID })).toMatchObject({ estado: "requiere_respuesta", spec });
    expect(m.resolver).toHaveBeenCalledOnce();
  });
  it("no repite IA ni permite que una revisión obsoleta escriba", async () => {
    original.revisionAsistencia = 4;
    original.asistenciaJson = { version: 1, estado: "analizando", operacionId: "a", erpId: 3, periodo: "2026-09", venceEn: new Date(Date.now() + 60_000).toISOString() };
    expect(await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 })).toMatchObject({ estado: "analizando", revision: 4 });
    original.asistenciaJson = null;
    expect(await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3, revisionEsperada: 2 })).toMatchObject({ ok: false, revision: 4 });
    expect(m.resolver).not.toHaveBeenCalled();
    expect(m.crearFilas).not.toHaveBeenCalled();
  });

  it("usa el período actual del lote aunque asistencia y formulario conserven el anterior", async () => {
    configurarBorrador();
    const propuesta = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", revisionEsperada: 5, instrucciones: "Revisar" });
    expect(propuesta).toMatchObject({ ok: true, estado: "propuesta_lista", periodo: "2026-10", revision: 6 });
    expect((original.asistenciaJson as AsistenciaInventarioGuardada).periodo).toBe("2026-10");
    const aplicada = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", revisionEsperada: 6, aplicarPropuesta: true });
    expect(aplicada).toMatchObject({ ok: true, estado: "borrador_preparado", periodo: "2026-10", revision: 7 });
    expect(original.periodo).toBe("2026-10");
    expect(m.guardarLote.mock.calls.at(-1)?.[0].data).not.toHaveProperty("periodoFinal");
  });

  it("el spec manual prevalece sobre respuestas anteriores y reenviadas", async () => {
    configurarBorrador();
    const manual = { ...spec, clasificadorModo: "arrastrar" as const };
    m.validar.mockReturnValue({ ...structuredClone(resultado), spec: manual, origen: "manual" });
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5, specManual: manual, respuestas: { modo_tipo: "global", columna_tipo: "4" } });
    expect(r).toMatchObject({ ok: true, estado: "propuesta_lista" });
    expect(m.validar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ spec: manual, respuestas: {}, origen: "manual" }));
    expect(m.resolver).not.toHaveBeenCalled();
    expect((original.asistenciaJson as AsistenciaInventarioGuardada).respuestas).toEqual({});
  });

  it("un fallo de transacción conserva el snapshot aplicado, separado de la propuesta nueva", async () => {
    const { asistencia } = configurarBorrador();
    const anterior = structuredClone(asistencia.aplicado);
    const propuesta = { ...spec, clasificadorModo: "global" as const, columnas: { ...spec.columnas, tipo: 0 } };
    asistencia.resultado = { ...structuredClone(resultado), spec: propuesta };
    m.validar.mockReturnValue({ ...structuredClone(resultado), spec: propuesta });
    m.tx.mockRejectedValueOnce(new Error("Transacción interrumpida"));
    const r = await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5, aplicarPropuesta: true });
    expect(r).toMatchObject({ ok: false, estado: "error_recuperable", revision: 6 });
    const guardada = original.asistenciaJson as AsistenciaInventarioGuardada;
    expect(guardada.aplicado).toEqual(anterior);
    expect(guardada.resultado?.spec).toEqual(propuesta);
    expect(guardada.estado).toBe("error_recuperable");
    expect(original.estado).toBe("borrador");
    expect(m.borrarFilas).not.toHaveBeenCalled();
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(m.guardarLote).not.toHaveBeenCalled();
  });

  it("responder una duda no vuelve a enviar las instrucciones ya aplicadas", async () => {
    configurarBorrador("requiere_respuesta");
    await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5, respuestas: { modo_tipo: "arrastrar" } });
    expect(m.resolver).toHaveBeenCalledWith(expect.objectContaining({ instrucciones: "", forzarIA: false, respuestas: { modo_tipo: "arrastrar" } }));
  });

  it("reanuda preguntas semánticas guardadas y sólo envía como nuevas las respuestas que cambiaron", async () => {
    const { asistencia } = configurarBorrador("requiere_respuesta");
    const pregunta = { id: "ia_campos_compartidos", etiqueta: "¿Qué representa el último número?", requiereIA: true };
    asistencia.resultado = { ...resultado, listoParaBorrador: false, preguntas: [pregunta] };
    asistencia.respuestas = { modo_tipo: "global", ia_campos_compartidos: "Cantidad" };
    m.resolver.mockResolvedValue(asistencia.resultado);

    await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5, respuestas: { modo_tipo: "global", ia_campos_compartidos: "Valor total" } });
    expect(m.resolver).toHaveBeenLastCalledWith(expect.objectContaining({
      preguntasPendientes: [pregunta],
      respuestas: { modo_tipo: "global", ia_campos_compartidos: "Valor total" },
      respuestasNuevas: { ia_campos_compartidos: "Valor total" },
    }));
    await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 6, respuestas: { modo_tipo: "global", ia_campos_compartidos: "Valor total" } });
    expect(m.resolver).toHaveBeenLastCalledWith(expect.objectContaining({ preguntasPendientes: [pregunta], respuestasNuevas: {} }));
    expect(m.crearFilas).not.toHaveBeenCalled();
  });

  it("conserva ejemplos y celdas originales mientras espera confirmar una lectura estructurada", async () => {
    const ejemplosLectura = [{ fila: 2, campos: [{ rol: "referencia", valor: "REF-01", fuentes: [{ hoja: "Inventario", fila: 2, columna: 1, texto: "Ref: REF-01 | Cant: 2" }] }] }];
    const preguntas = [{ id: "confirmar_lectura_estructurada", etiqueta: "¿La interpretación es correcta?", opciones: [{ valor: "huella", etiqueta: "Sí, corresponde" }] }];
    m.resolver.mockResolvedValue({ ...resultado, listoParaBorrador: false, ejemplosLectura, preguntas });
    expect(await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 })).toMatchObject({ estado: "requiere_respuesta", ejemplosLectura, preguntas });
    expect(await consultarAsistenciaInventario({ recepcionLoteId: ID })).toMatchObject({ ejemplosLectura, preguntas });
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(m.guardarLote).not.toHaveBeenCalled();
  });

  it("una explicación nueva puede rechazar la interpretación sin arrastrar su aceptación anterior", async () => {
    const { asistencia } = configurarBorrador("requiere_respuesta");
    asistencia.respuestas = { confirmar_lectura_estructurada: "confirmar:anterior", modo_tipo: "global" };
    m.resolver.mockResolvedValue({ ...resultado, listoParaBorrador: false, preguntas: [{ id: "confirmar_lectura_estructurada", etiqueta: "Revisa los ejemplos ajustados", opciones: [{ valor: "confirmar:nueva", etiqueta: "Sí" }] }] });
    await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5, instrucciones: "El tipo pertenece a cada sección, no es global." });
    expect(m.resolver).toHaveBeenLastCalledWith(expect.objectContaining({ forzarIA: true, respuestas: {}, instrucciones: "El tipo pertenece a cada sección, no es global." }));
    expect(m.crearFilas).not.toHaveBeenCalled();
  });

  it("el guardado vuelve a bloquear una fila reconstruida que el motor confunde con un total", async () => {
    const estructurada: SpecModulo = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {}, lecturaEstructurada: {
      version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Item:" }, maxFilas: 1 }, campos: [
        { rol: "referencia", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Item:", fin: "Tipo:" } } },
        { rol: "tipo", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Tipo:", fin: "Costo:" } } },
        { rol: "valorTotal", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Costo:" } } },
      ],
    } };
    m.ingerir.mockResolvedValue({ modo: "tabular", hojas: [{ nombre: "Inventario", filas: [["Detalle"], ["Item:A · Tipo:MP · Costo:100"], ["Item:Total general · Tipo:MP · Costo:100"]] }] });
    m.resolver.mockResolvedValue({ ...resultado, spec: estructurada, listoParaBorrador: true });
    expect(await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-09", erpId: 3 })).toMatchObject({ estado: "error_recuperable" });
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(m.guardarLote).not.toHaveBeenCalled();
  });

  it("reintentar un fallo del proveedor fuerza IA aunque haya un mapa de respaldo", async () => {
    const { asistencia } = configurarBorrador("error_recuperable");
    asistencia.resultado!.errorProveedorIA = true;
    asistencia.resultado!.listoParaBorrador = false;
    await prepararBorradorInventario({ recepcionLoteId: ID, periodo: "2026-10", revisionEsperada: 5 });
    expect(m.resolver).toHaveBeenCalledWith(expect.objectContaining({ forzarIA: true, instrucciones: "Revisar el tipo", specBase: spec }));
  });
});

describe("conservar la lectura aplicada de inventario", () => {
  it("descarta sólo la propuesta y sincroniza una revisión monótona sin leer ni escribir filas ni IA", async () => {
    const { asistencia } = configurarBorrador();
    const aplicada = structuredClone(asistencia.aplicado!);
    const r = await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 5 });
    expect(r).toMatchObject({ ok: true, estado: "borrador_preparado", revision: 6, periodo: "2026-10", spec: aplicada.spec });
    expect(original.revisionAsistencia).toBe(6);
    const guardada = original.asistenciaJson as AsistenciaInventarioGuardada;
    expect(guardada.aplicado).toEqual({ ...aplicada, revision: 6 });
    expect(guardada.resultado).toMatchObject({ spec: aplicada.spec, origen: aplicada.origen, resumen: aplicada.resumen });
    expect(guardada).toMatchObject({ instrucciones: "", respuestas: {}, versionBaseId: aplicada.versionBaseId });
    expect(m.guardarLote).toHaveBeenCalledExactlyOnceWith({ where: { id: 10 }, data: { specJson: { ...spec, asistenciaRevision: 6 } } });
    expect(m.filas).not.toHaveBeenCalled();
    expect(m.borrarFilas).not.toHaveBeenCalled();
    expect(m.crearFilas).not.toHaveBeenCalled();
    expect(m.objeto).not.toHaveBeenCalled();
    expect(m.resolver).not.toHaveBeenCalled();
    expect(m.validar).not.toHaveBeenCalled();
  });

  it("rechaza una petición obsoleta sin reservar revisión ni abrir transacción", async () => {
    configurarBorrador();
    expect(await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 4 })).toMatchObject({ ok: false, message: expect.stringContaining("lectura cambió") });
    expect(original.revisionAsistencia).toBe(5);
    expect(m.actualizar).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
  });

  it("no descarta una operación de lectura que todavía está vigente", async () => {
    const { asistencia } = configurarBorrador("analizando");
    asistencia.venceEn = new Date(Date.now() + 60_000).toISOString();
    expect(await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 5 })).toMatchObject({ estado: "analizando", revision: 5 });
    expect(m.actualizar).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.resolver).not.toHaveBeenCalled();
  });

  it("permite conservar tras vencer un intento y no revive la operación anterior", async () => {
    const { asistencia } = configurarBorrador("analizando");
    const operacionAnterior = asistencia.operacionId;
    expect(await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 5 })).toMatchObject({ ok: true, estado: "borrador_preparado", revision: 6 });
    expect((original.asistenciaJson as AsistenciaInventarioGuardada).operacionId).not.toBe(operacionAnterior);
    expect(m.resolver).not.toHaveBeenCalled();
  });

  it("la reserva concurrente se comprueba otra vez antes de actualizar el lote", async () => {
    configurarBorrador();
    m.tx.mockImplementationOnce(async (fn) => {
      original.revisionAsistencia = 6;
      return fn(prisma);
    });
    expect(await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 5 })).toMatchObject({ ok: false, message: expect.stringContaining("Otra operación") });
    expect(m.guardarLote).not.toHaveBeenCalled();
    expect(m.borrarFilas).not.toHaveBeenCalled();
  });

  it("no conserva si el lote ya no corresponde a la revisión aplicada", async () => {
    const { lote } = configurarBorrador();
    lote.specJson.asistenciaRevision = 1;
    expect(await conservarLecturaInventario({ recepcionLoteId: ID, revisionEsperada: 5 })).toMatchObject({ ok: false, message: expect.stringContaining("borrador cambió") });
    expect(m.actualizar).not.toHaveBeenCalled();
    expect(m.guardarLote).not.toHaveBeenCalled();
  });
});
