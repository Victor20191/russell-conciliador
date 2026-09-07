import { beforeEach, describe, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { reporteEjecutivoUsoIA: db } }));
import { ajustarMaquetacionReporte } from "./maquetacion";
import { claveAlcanceReporte, guardarInstantanea, leerInstantanea } from "./instantaneas";
const desde = new Date("2026-08-01T00:00:00Z");
const hasta = new Date("2026-08-31T23:59:59.999Z");
const row = {
  id: 8, titulo: "Original", html: "<html>Original</html>", modelo: "modelo-original",
  creadoEn: desde, totalAcciones: 103, totalUsuarios: 5, totalNovedades: 27,
  metadatos: { porcentajeAdopcion: 50, versionIdsIncluidos: [1, 2], corte: hasta.toISOString() },
};
const input = {
  clave: "alcance", anteriorId: null, report: { titulo: "Nuevo", html: "<html>Nuevo</html>" },
  modelo: "modelo-nuevo", desde, hasta, totalAcciones: 105, totalUsuarios: 6, totalNovedades: 30,
  porcentajeAdopcion: 70, versionIdsIncluidos: [3], corte: hasta.toISOString(), fuente: { uso: {} }, userId: 1,
};
beforeEach(() => vi.resetAllMocks());
describe("instantáneas de reportes", () => {
  test("misma clave por período y selección, sin importar orden o duplicados", () => {
    expect(claveAlcanceReporte(desde, hasta, [2, 1, 2])).toBe(claveAlcanceReporte(desde, hasta, [1, 2]));
    expect(claveAlcanceReporte(desde, hasta, null)).toBe(claveAlcanceReporte(desde, hasta, []));
    expect(claveAlcanceReporte(desde, hasta, null)).not.toBe(claveAlcanceReporte(desde, hasta, [1, 2]));
    expect(claveAlcanceReporte(desde, hasta, [1])).not.toBe(claveAlcanceReporte(hasta, hasta, [1]));
  });
  test("lee documento, alcance, cifras, modelo y corte de la misma revisión", async () => {
    db.findFirst.mockResolvedValue(row);
    expect(await leerInstantanea("alcance")).toEqual({
      id: 8, report: { titulo: row.titulo, html: ajustarMaquetacionReporte(row.html) }, model: row.modelo,
      generatedAt: desde.toISOString(), totalAcciones: 103, totalUsuarios: 5, totalNovedades: 27,
      porcentajeAdopcion: 50, versionIdsIncluidos: [1, 2], corte: hasta.toISOString(),
    });
  });
  test("conflicto concurrente devuelve íntegra la primera revisión guardada", async () => {
    db.create.mockRejectedValue({ code: "P2002" });
    db.findUnique.mockResolvedValue(row);
    const result = await guardarInstantanea(input);
    expect(result.report.html).toBe(ajustarMaquetacionReporte(row.html));
    expect(result.totalAcciones).toBe(103);
    expect(result.porcentajeAdopcion).toBe(50);
    expect(result.versionIdsIncluidos).toEqual([1, 2]);
  });
  test("actualizar crea otra clave y conserva la fuente completa", async () => {
    db.create.mockResolvedValue(row);
    await guardarInstantanea(input);
    await guardarInstantanea({ ...input, anteriorId: 8 });
    const primera = db.create.mock.calls[0][0].data;
    const siguiente = db.create.mock.calls[1][0].data;
    expect(primera.huellaContexto).not.toBe(siguiente.huellaContexto);
    expect(primera.claveAlcance).toBe(siguiente.claveAlcance);
    expect(siguiente.metadatos.fuente).toEqual(input.fuente);
  });
  test("falla si no se puede guardar o leer sin devolver una versión efímera", async () => {
    db.findFirst.mockRejectedValue(new Error("BD no disponible"));
    await expect(leerInstantanea("alcance")).rejects.toThrow("BD no disponible");
    db.create.mockRejectedValue(new Error("BD no disponible"));
    await expect(guardarInstantanea(input)).rejects.toThrow("BD no disponible");
    db.findFirst.mockResolvedValue({ ...row, metadatos: null });
    await expect(leerInstantanea("alcance")).rejects.toThrow();
  });
});
