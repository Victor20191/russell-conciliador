import { describe, expect, test } from "vitest";
import { clasesGestionXentria } from "./ticket-detalle-modal";

describe("clases de Gestión de Xentria en el modal", () => {
  test("usa el bloque oscuro cuando un ticket cerrado tiene solución", () => {
    const ticketCerrado = {
      status: "cerrado",
      solution: "Respuesta registrada por Xentria.",
    } as const;

    expect(clasesGestionXentria(ticketCerrado)).toEqual({
      bloque: "border-ok-700 bg-ok-700",
      titulo: "text-white",
      respuesta: "text-white",
      firma: "text-white/75",
    });
  });

  test("conserva el bloque claro mientras no exista respuesta", () => {
    expect(clasesGestionXentria({ solution: null })).toEqual({
      bloque: "border-ink-150 bg-ink-50",
      titulo: "text-ink-500",
      respuesta: "text-ink-800",
      firma: "text-ink-600",
    });
  });
});
