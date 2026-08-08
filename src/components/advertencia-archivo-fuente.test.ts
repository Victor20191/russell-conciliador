import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdvertenciaArchivoFuenteDetalle } from "./advertencia-archivo-fuente";

describe("AdvertenciaArchivoFuenteDetalle", () => {
  it("resume el diagnóstico sin retirar la acción, las señales ni el detalle", () => {
    const html = renderToStaticMarkup(
      createElement(AdvertenciaArchivoFuenteDetalle, {
        diferencia: 2_808_623_852.78,
        resumida: true,
        accion: createElement("button", null, "Comentario de aprobación · Obligatorio"),
        detalle: createElement("div", null, "Justificación de aprobación"),
      }),
    );

    expect(html).toContain(
      "No cuadra:</span> Activo = Pasivo + Patrimonio + Resultado · diferencia",
    );
    expect(html).toContain("$ 2.808.623.852,78");
    expect(html).toContain("Comentario de aprobación · Obligatorio");
    expect(html).toContain("Justificación de aprobación");
    expect(html).toContain("Partida doble cuadrada");
    expect(html).toContain("Totales cruzan con el archivo");
    expect(html).toContain("Sin alertas por cuenta");
    expect(html).not.toContain("No es un error del sistema");
    expect(html).not.toContain(
      "Los totales coinciden, pero el archivo no cumple la ecuación contable.",
    );
    expect(html).not.toContain("Russell reprodujo correctamente los valores del archivo");
  });
});
