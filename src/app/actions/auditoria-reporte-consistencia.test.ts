import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), leer: vi.fn(), guardar: vi.fn(), ia: vi.fn(), audit: vi.fn(),
  eventos: vi.fn(), conexiones: vi.fn(), versiones: vi.fn(), clientes: vi.fn(), usuarios: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  $transaction: (operacion: (tx: unknown) => Promise<unknown>) => operacion({
    auditEntry: { findMany: mocks.eventos }, accessLog: { groupBy: mocks.conexiones },
    platformVersion: { findMany: mocks.versiones }, client: { findMany: mocks.clientes }, user: { findMany: mocks.usuarios },
  }),
  auditEntry: { findMany: mocks.eventos }, accessLog: { groupBy: mocks.conexiones },
  platformVersion: { findMany: mocks.versiones }, client: { findMany: mocks.clientes }, user: { findMany: mocks.usuarios },
} }));
vi.mock("@/lib/rbac/reporte-ejecutivo", () => ({ authorizeReporteEjecutivo: mocks.auth }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 1, name: "Ana" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: vi.fn(() => "Error BD") }));
vi.mock("@/lib/opencode", () => ({ completarTextoOpenCode: mocks.ia, mensajeErrorOpenCode: vi.fn(() => "Error del reporte") }));
vi.mock("@/lib/rbac/publicacion", () => ({ modulosPublicadosParaTodos: vi.fn(async () => new Set(["balance"])) }));
vi.mock("@/lib/auditoria/reporte-ejecutivo/instantaneas", () => ({ claveAlcanceReporte: vi.fn(() => "clave"), leerInstantanea: mocks.leer, guardarInstantanea: mocks.guardar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { generarReporteEjecutivoUso } from "./auditoria-reporte";

const scope = { desde: "2026-09-01", hasta: "2026-09-07" };
const snapshot = {
  id: 9, report: { titulo: "Guardado", html: "<html>Original</html>" }, model: "modelo-original",
  generatedAt: "2026-09-01T12:00:00Z", totalAcciones: 103, totalUsuarios: 7, totalNovedades: 4,
  porcentajeAdopcion: 75, versionIdsIncluidos: [3, 5], corte: "2026-09-01T11:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.leer.mockResolvedValue(snapshot);
  mocks.guardar.mockResolvedValue(snapshot);
  mocks.eventos.mockResolvedValue([]);
  mocks.conexiones.mockResolvedValue([]);
  mocks.versiones.mockResolvedValue([]);
  mocks.clientes.mockResolvedValue([]);
  mocks.usuarios.mockResolvedValue([]);
  mocks.ia.mockResolvedValue({ text: "{}" });
});

describe("consistencia de generación del reporte", () => {
  test("reutiliza documento y metadata congelados sin consultar actividad ni IA", async () => {
    expect(await generarReporteEjecutivoUso(scope)).toEqual({ ok: true, ...snapshot, desdeCache: true });
    expect(mocks.eventos).not.toHaveBeenCalled();
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("autoriza antes de leer la instantánea", async () => {
    mocks.auth.mockResolvedValue({ ok: false, message: "Sin permisos" });
    expect(await generarReporteEjecutivoUso(scope)).toEqual({ ok: false, message: "Sin permisos" });
    expect(mocks.leer).not.toHaveBeenCalled();
  });

  test("actualizar consulta actividad y guarda una plantilla factual con revisión anterior", async () => {
    const result = await generarReporteEjecutivoUso({ ...scope, actualizar: true });
    expect(result).toMatchObject({ ok: true, desdeCache: false });
    expect(mocks.eventos).toHaveBeenCalledTimes(1);
    expect(mocks.ia).toHaveBeenCalledTimes(1);
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      anteriorId: 9, totalAcciones: 0, totalUsuarios: 0,
      report: expect.objectContaining({ html: expect.stringContaining('id="lo-mas-importante"') }),
    }));
  });

  test("rechaza versiones seleccionadas ausentes o no publicadas antes de llamar IA", async () => {
    mocks.leer.mockResolvedValue(null);
    mocks.versiones.mockResolvedValue([{ id: 3 }]);
    const result = await generarReporteEjecutivoUso({ ...scope, versionIds: [3, 5] });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.versiones).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "publicada", id: { in: [3, 5] } },
    }));
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("cancelar durante IA evita auditoría y guardado", async () => {
    const controller = new AbortController();
    mocks.ia.mockImplementation(async () => { controller.abort(); return { text: "{}" }; });
    expect(await generarReporteEjecutivoUso({ ...scope, actualizar: true }, controller.signal))
      .toEqual({ ok: false, message: "Generación cancelada." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("fallo al leer almacenamiento no genera otro documento con IA", async () => {
    mocks.leer.mockRejectedValue(new Error("BD no disponible"));
    expect(await generarReporteEjecutivoUso(scope)).toMatchObject({ ok: false });
    expect(mocks.ia).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  test("fallo al guardar no se presenta como generación exitosa", async () => {
    mocks.guardar.mockRejectedValue(new Error("BD no disponible"));
    expect(await generarReporteEjecutivoUso({ ...scope, actualizar: true })).toMatchObject({ ok: false });
  });
});
