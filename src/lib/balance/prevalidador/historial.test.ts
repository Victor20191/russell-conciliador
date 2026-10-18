import { describe, expect, it } from "vitest";
import { construirHistorialRevisiones, etiquetaAccionRevision, etiquetaSituacionRevision } from "./historial";

const fila = (id: number, estado: string, iso: string, actor = "Ana", justificacion = "Revisado") => ({
  id,
  estado,
  justificacion,
  actor,
  creadoEn: new Date(iso),
});

describe("construirHistorialRevisiones", () => {
  it("ordena de la más reciente a la más antigua y conserva usuario y comentario", () => {
    const historial = construirHistorialRevisiones(
      [
        fila(1, "aprobada", "2026-10-01T15:00:00Z", "Ana", "Primera revisión"),
        fila(3, "aprobada", "2026-10-03T15:00:00Z", "Luis", "Se corrigió la 4175"),
        fila(2, "revocada", "2026-10-02T15:00:00Z", "Luis", "Homologación de la 41 mal hecha"),
      ],
      "aprobada",
    );
    expect(historial.map((h) => h.id)).toEqual([3, 2, 1]);
    expect(historial[1]).toEqual({
      id: 2,
      accion: "revocada",
      fecha: "2026-10-02T15:00:00.000Z",
      usuario: "Luis",
      comentario: "Homologación de la 41 mal hecha",
      situacion: null,
    });
  });

  it("desempata por id cuando dos revisiones tienen la misma fecha", () => {
    const historial = construirHistorialRevisiones(
      [fila(7, "aprobada", "2026-10-01T15:00:00Z"), fila(8, "revocada", "2026-10-01T15:00:00Z")],
      "revocada",
    );
    expect(historial.map((h) => h.id)).toEqual([8, 7]);
  });

  it("rotula solo la última aprobación según el estado actual", () => {
    const filas = [fila(1, "aprobada", "2026-10-01T15:00:00Z"), fila(2, "aprobada", "2026-10-02T15:00:00Z")];
    expect(construirHistorialRevisiones(filas, "aprobada").map((h) => h.situacion)).toEqual(["vigente", null]);
    expect(construirHistorialRevisiones(filas, "desactualizada").map((h) => h.situacion)).toEqual(["desactualizada", null]);
  });

  it("una revocación como última revisión no lleva rótulo", () => {
    const historial = construirHistorialRevisiones(
      [fila(1, "aprobada", "2026-10-01T15:00:00Z"), fila(2, "revocada", "2026-10-02T15:00:00Z")],
      "revocada",
    );
    expect(historial.map((h) => h.situacion)).toEqual([null, null]);
  });

  it("un estado desconocido se lee como revocación, igual que el contexto", () => {
    expect(construirHistorialRevisiones([fila(1, "otro", "2026-10-01T15:00:00Z")], "revocada")[0].accion).toBe("revocada");
  });

  it("sin revisiones devuelve una lista vacía", () => {
    expect(construirHistorialRevisiones([], "pendiente")).toEqual([]);
  });
});

describe("etiquetas", () => {
  it("nombra la acción y la situación", () => {
    expect(etiquetaAccionRevision("aprobada")).toBe("Aprobación");
    expect(etiquetaAccionRevision("revocada")).toBe("Revocación");
    expect(etiquetaSituacionRevision("vigente")).toBe("Vigente");
    expect(etiquetaSituacionRevision("desactualizada")).toBe("Desactualizada");
    expect(etiquetaSituacionRevision(null)).toBeNull();
  });
});
