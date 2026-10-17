import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  autorizar: vi.fn(),
  exigirAbierto: vi.fn(),
  encabezado: vi.fn(),
  detalle: vi.fn(),
  anterior: vi.fn(),
  upsert: vi.fn(),
  auditoria: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
// El cruce por tercero solo se calcula para el saldo contrario de Cartera y CxP: aquí no se usa.
vi.mock("@/lib/modulos/cruce-contable-servidor", () => ({ cargarInsumosCruceModulo: vi.fn(async () => null), construirCruceContableModulo: vi.fn() }));
vi.mock("@/lib/modulos/cruce-tercero-servidor", () => ({ cruceTerceroDeCargue: vi.fn(async () => null) }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 8, name: "Ana Staff" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: m.auditoria }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => (e instanceof Error ? e.message : String(e)) }));
vi.mock("@/lib/conciliacion/verificar-bloqueo", () => ({
  autorizarComentarioAlertaModulo: m.autorizar,
  exigirPeriodoAbierto: m.exigirAbierto,
  respuestaPeriodoEnFirme: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => {
  const tx = { comentarioAlertaModulo: { findUnique: m.anterior, upsert: m.upsert } };
  return {
    default: {
      moduloDatoEncabezado: { findUnique: m.encabezado },
      moduloDatoDetalle: { findMany: m.detalle },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { guardarComentarioAlerta } from "./comentarios-alertas-modulo";

const ENCABEZADO = { id: 74, clienteId: 5, moduloCodigo: "INV", periodo: "2026-09", nombreCliente: "Cliente de prueba" };
const COMENTARIO = "Referencias de muestra sin costo asignado.";

beforeEach(() => {
  vi.clearAllMocks();
  m.encabezado.mockResolvedValue(ENCABEZADO);
  m.autorizar.mockResolvedValue({ ok: true, userId: 8, role: "staff" });
  m.anterior.mockResolvedValue(null);
  m.detalle.mockResolvedValue([
    { filaNum: 2, clasificador: "1435", datos: { referencia: "A", cantidad: 10, valorUnitario: 1, valorTotal: 10 } },
    { filaNum: 3, clasificador: "1435", datos: { referencia: "B", cantidad: 4, valorUnitario: 1, valorTotal: 4 } },
  ]);
});

describe("guardarComentarioAlerta", () => {
  it("guarda el comentario con cómo está hoy la alerta, recalculada en el servidor", async () => {
    const r = await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: `  ${COMENTARIO}  ` });
    expect(r).toEqual({ ok: true, message: "Comentario guardado." });
    expect(m.exigirAbierto).toHaveBeenCalledWith(expect.anything(), ENCABEZADO, expect.objectContaining({ enTransaccion: true }));
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { clienteId_moduloCodigo_periodo_tipo: { clienteId: 5, moduloCodigo: "INV", periodo: "2026-09", tipo: "costo_uno" } },
      create: expect.objectContaining({ comentario: COMENTARIO, referencias: 2, valor: 14, comentadoPor: "Ana Staff", comentadoPorId: 8 }),
    }));
    expect(m.auditoria).toHaveBeenCalledWith(expect.objectContaining({ action: "COMENTÓ ALERTA" }));
  });

  it("editarlo audita el texto anterior", async () => {
    m.anterior.mockResolvedValue({ comentario: "Texto viejo del comentario" });
    const r = await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: COMENTARIO });
    expect(r).toEqual({ ok: true, message: "Comentario actualizado." });
    expect(m.auditoria).toHaveBeenCalledWith(expect.objectContaining({ action: "EDITÓ COMENTARIO DE ALERTA", detail: expect.stringContaining("antes: «Texto viejo del comentario»") }));
  });

  it("rechaza sin permiso, un comentario corto, un tipo desconocido o una alerta que el cargue no tiene", async () => {
    m.autorizar.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    expect(await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: COMENTARIO })).toEqual({ ok: false, message: "Sin permiso." });
    expect((await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: "corto" })).ok).toBe(false);
    expect(await guardarComentarioAlerta({ encabezadoId: 74, tipo: "inventada", comentario: COMENTARIO })).toEqual({ ok: false, message: "Alerta desconocida." });
    expect((await guardarComentarioAlerta({ encabezadoId: 74, tipo: "valores_negativos", comentario: COMENTARIO })).message).toContain("ya no aparece");
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("en Cartera y CxP la alerta sale del auxiliar por tercero (días vencidos vs. corte)", async () => {
    m.encabezado.mockResolvedValue({ ...ENCABEZADO, moduloCodigo: "CXP", fechaCorte: null, nivelSaldo: "documento", formatosCartera: null });
    m.detalle.mockResolvedValue([
      { filaNum: 4, valor: 50_000, imputable: true, nitCanonico: "900000001", nivel: "documento", datos: { nit: "900000001", nombre: "PROVEEDOR", documento: "FV-9", vencimiento: "2026-08-31", diasVencidos: 5 } },
    ]);
    const r = await guardarComentarioAlerta({ encabezadoId: 74, tipo: "dias_vs_corte", comentario: COMENTARIO });
    expect(r).toEqual({ ok: true, message: "Comentario guardado." });
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ tipo: "dias_vs_corte", referencias: 1, valor: 0 }) }));
  });

  it("un módulo que no exige comentarios no los acepta", async () => {
    m.encabezado.mockResolvedValue({ ...ENCABEZADO, moduloCodigo: "AFI" });
    const r = await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: COMENTARIO });
    expect(r).toEqual({ ok: false, message: "Esta alerta no exige comentario en este módulo." });
  });

  it("con la conciliación en firme no guarda", async () => {
    m.exigirAbierto.mockRejectedValueOnce(new Error("La conciliación de este período está en firme."));
    const r = await guardarComentarioAlerta({ encabezadoId: 74, tipo: "costo_uno", comentario: COMENTARIO });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("en firme") });
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
