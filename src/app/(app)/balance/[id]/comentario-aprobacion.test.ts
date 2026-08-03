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

  it("mantiene una nota voluntaria como constancia genérica", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "Diferencia desde saldo inicial confirmada con el cliente.",
        reubicaciones: [revision],
        version: "versión v2",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "28 jul 2026",
      }),
    );

    expect(html).toContain("Nota aclaratoria adicional");
    expect(html).toContain("Diferencia desde saldo inicial confirmada con el cliente.");
    expect(html).toContain("Reubicaciones contables aprobadas");
    expect(html).not.toContain("Advertencia del archivo fuente");
  });

  it("conserva en el oficial la advertencia completa y su justificación", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "Diferencia revisada y confirmada con el cliente.",
        advertenciaArchivoFuente: true,
        diferenciaArchivoFuente: -317_519_035.98,
        version: "versión v2",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "28 jul 2026",
      }),
    );

    expect(html).toContain("Advertencia del archivo fuente");
    expect(html).toContain("No es un error del sistema");
    expect(html).toContain("Los totales coinciden, pero el archivo no cumple la ecuación contable.");
    expect(html).toContain("Partida doble cuadrada");
    expect(html).toContain("Totales cruzan con el archivo");
    expect(html).toContain("Sin alertas por cuenta");
    expect(html).toContain("Justificación de aprobación");
    expect(html).toContain("Diferencia revisada y confirmada con el cliente.");
    expect(html).toContain("versión v2");
    expect(html).not.toContain("Nota aclaratoria adicional");
  });
});
