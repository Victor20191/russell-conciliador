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

  it("muestra en el oficial la advertencia resumida y su justificación", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "Comentario 3 de agosto",
        advertenciaArchivoFuente: true,
        diferenciaArchivoFuente: 2_808_623_852.78,
        version: "versión v3",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "03/Ago/2026 4:29 p. m.",
      }),
    );

    expect(html).toContain("Advertencia del archivo fuente");
    expect(html).toContain(
      "No cuadra:</span> Activo = Pasivo + Patrimonio + Resultado · diferencia",
    );
    expect(html).toContain("Partida doble cuadrada");
    expect(html).toContain("Totales cruzan con el archivo");
    expect(html).toContain("Sin alertas por cuenta");
    expect(html).toContain("$ 2.808.623.852,78");
    expect(html).toContain("Justificación de aprobación");
    expect(html).toContain("Comentario 3 de agosto");
    expect(html).toContain("versión v3");
    expect(html).not.toContain("No es un error del sistema");
    expect(html).not.toContain(
      "Los totales coinciden, pero el archivo no cumple la ecuación contable.",
    );
    expect(html).not.toContain("Russell reprodujo correctamente los valores del archivo");
    expect(html).not.toContain("Nota aclaratoria adicional");
  });
});
