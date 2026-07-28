import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComentarioAprobacion } from "./comentario-aprobacion";
import type { RevisionReubicacionBalance } from "@/lib/balance/revisiones-reubicacion-balance";

const revision: RevisionReubicacionBalance = {
  filaNum: 737,
  codigo: "28059501",
  nombre: "CONSIGNACIONES SIN IDENTIFICAR",
  monto: -302_477_965.9,
  claseOrigen: "2",
  claseDestino: "1",
  destinoCodigo: "13170103",
  destinoNombre: "EDUCACION FORMAL-SUPERIOR",
  justificacion: "Se aprueba movimiento de la cuenta por criterio contable validado.",
  revisadaPor: "Victor Rivera",
  revisadaEn: "2026-07-28T19:48:04.335Z",
};

describe("constancias del balance oficial", () => {
  it("muestra una reubicación aprobada como constancia verde y no como advertencia", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: null,
        reubicaciones: [revision],
        version: "versión v2",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "28 jul 2026",
      }),
    );

    expect(html).toContain("Reubicaciones contables aprobadas");
    expect(html).toContain("Guardadas en versión v2");
    expect(html).toContain(revision.justificacion);
    expect(html).not.toContain("Nota aclaratoria adicional");
    expect(html).not.toContain("border-l-warn-500");
  });

  it("mantiene la nota adicional separada cuando ambas constancias existen", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "Diferencia del archivo confirmada con el cliente.",
        reubicaciones: [revision],
        version: "versión v2",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "28 jul 2026",
      }),
    );

    expect(html).toContain("Nota aclaratoria adicional");
    expect(html).toContain("Diferencia del archivo confirmada con el cliente.");
    expect(html).toContain("Reubicaciones contables aprobadas");
  });
});
