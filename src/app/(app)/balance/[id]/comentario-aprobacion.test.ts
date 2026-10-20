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

  it("un balance cargado descuadrado muestra la justificación con las condiciones que fallaban", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "El ERP no exporta la cuenta de cierre; revisado con el cliente.",
        descuadre: {
          v: 1,
          motivos: [
            { tipo: "partida_doble", monto: 611_898_043.91 },
            { tipo: "agrupadoras", cantidad: 11, masDe: false, codigos: ["11", "13"] },
          ],
          umbrales: { cuadre_contable: 1_000, descuadre: 2_000 },
        },
        version: "versión v1",
        autor: "Victor Rivera",
        rol: "Superadministrador",
        fecha: "19 oct 2026",
      }),
    );

    expect(html).toContain("Justificación del descuadre");
    expect(html).toContain("No cumplía 2 condiciones");
    expect(html).toContain("Total débitos ≠ total créditos");
    expect(html).toContain("11 agrupadoras no cuadran");
    expect(html).toContain("Umbrales al cargar");
    expect(html).toContain("El ERP no exporta la cuenta de cierre; revisado con el cliente.");
    expect(html).not.toContain("Nota aclaratoria adicional");
  });

  it("constancia v2: cada condición con su propio comentario debajo y el umbral único", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "Partida doble: Débitos del cierre fuera del archivo.\nAgrupadoras contra su desglose: Subtotales del ERP sin recalcular.",
        descuadre: {
          v: 2,
          origen: "borrador",
          motivos: [
            { tipo: "partida_doble", monto: 611_898_043.91, comentario: "Débitos del cierre fuera del archivo." },
            { tipo: "agrupadoras", cantidad: 11, masDe: false, codigos: ["11", "13"], comentario: "Subtotales del ERP sin recalcular." },
          ],
          umbrales: { descuadre: 2_000 },
        },
        version: "versión v1",
        autor: "Victor Rivera",
        rol: "Senior",
        fecha: "20 oct 2026",
      }),
    );

    expect(html).toContain("Justificación del descuadre");
    expect(html).toContain("No cumplía 2 condiciones");
    expect(html).toContain("Partida doble");
    expect(html).toContain("Agrupadoras contra su desglose");
    expect(html).toContain("Total débitos ≠ total créditos");
    expect(html).toContain("Umbral al cargar: diferencias y descuadres del balance $ 2.000");
    expect(html).not.toContain("Umbrales al cargar");
    // Cada comentario una sola vez: debajo de su condición, no repetido en el texto plano.
    expect(html.split("Débitos del cierre fuera del archivo.")).toHaveLength(2);
    expect(html.split("Subtotales del ERP sin recalcular.")).toHaveLength(2);
    expect(html).not.toContain("Nota aclaratoria adicional");
  });

  it("archivo fuente v2: su justificación es el comentario de la ecuación y las demás condiciones van aparte", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "El ERP no cierra la ecuación.\nClases contra el archivo: Pasivo sin la cuenta puente.",
        advertenciaArchivoFuente: true,
        diferenciaArchivoFuente: 2_808_623_852.78,
        descuadre: {
          v: 2,
          origen: "archivo_fuente",
          motivos: [
            { tipo: "ecuacion", monto: 2_808_623_852.78, comentario: "El ERP no cierra la ecuación." },
            { tipo: "clases", clases: [{ clase: "Pasivo", diff: 5_000 }], comentario: "Pasivo sin la cuenta puente." },
          ],
          umbrales: { descuadre: 2_000 },
        },
        version: "versión v4",
        autor: "Victor Rivera",
        rol: "Senior",
        fecha: "20 oct 2026",
      }),
    );

    expect(html).toContain("Advertencia del archivo fuente");
    expect(html).toContain("Justificación de aprobación");
    expect(html.split("El ERP no cierra la ecuación.")).toHaveLength(2);
    expect(html).toContain("Justificación del descuadre");
    expect(html).toContain("No cumplía esta condición");
    expect(html).toContain("Clases contra el archivo");
    expect(html.split("Pasivo sin la cuenta puente.")).toHaveLength(2);
    expect(html).not.toContain("Nota aclaratoria adicional");
  });

  it("archivo fuente v2 solo con la ecuación: no repite la justificación del descuadre", () => {
    const html = renderToStaticMarkup(
      createElement(ComentarioAprobacion, {
        comentario: "El ERP no cierra la ecuación.",
        advertenciaArchivoFuente: true,
        diferenciaArchivoFuente: 2_808_623_852.78,
        descuadre: {
          v: 2,
          origen: "archivo_fuente",
          motivos: [{ tipo: "ecuacion", monto: 2_808_623_852.78, comentario: "El ERP no cierra la ecuación." }],
          umbrales: { descuadre: 2_000 },
        },
        version: "versión v4",
        autor: "Victor Rivera",
        rol: "Senior",
        fecha: "20 oct 2026",
      }),
    );

    expect(html).toContain("Justificación de aprobación");
    expect(html.split("El ERP no cierra la ecuación.")).toHaveLength(2);
    expect(html).not.toContain("Justificación del descuadre");
    expect(html).not.toContain("Nota aclaratoria adicional");
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
