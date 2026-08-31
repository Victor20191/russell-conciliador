import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ControlSubtotales } from "@/lib/modulos/subtotales";
import { ValidacionSubtotales } from "./validacion-subtotales";

const vacio: ControlSubtotales = { grupos: [], granTotal: null, descuadres: 0, noValidados: 0 };
const render = (control: ControlSubtotales) => renderToStaticMarkup(createElement(ValidacionSubtotales, { control }));

describe("ValidacionSubtotales", () => {
  it("dice literalmente NO VALIDADO cuando no detectó controles", () => {
    const html = render(vacio);
    expect(html).toContain("Validación de subtotales");
    expect(html).toContain("NO VALIDADO:");
    expect(html).toContain("no se identificaron filas de subtotal ni de total general");
    expect(html).toContain("No se identificó una fila de subtotal para comparar");
    expect(html).toContain("No se identificó una fila de total general para comparar");
  });

  it("muestra SÍ COINCIDE para subtotales y total general comprobados", () => {
    const control: ControlSubtotales = {
      grupos: [{
        clasificador: "Paneles",
        filaSubtotal: 10,
        bloque: { desde: 2, hasta: 9, items: 8 },
        sumaMovimientos: 1_000,
        subtotalArchivo: 1_000,
        diferencia: 0,
        estado: "cuadra",
      }],
      granTotal: { filaNum: 11, sumaMovimientos: 1_000, subtotalArchivo: 1_000, diferencia: 0, estado: "cuadra" },
      descuadres: 0,
      noValidados: 0,
    };
    const html = render(control);
    expect(html).toContain("SÍ COINCIDE:");
    expect(html.match(/SÍ COINCIDE/g)).toHaveLength(3);
    expect(html).toContain("Subtotal · Paneles");
    expect(html).toContain("Total general");
  });

  it("distingue NO COINCIDE de NO VALIDADO", () => {
    const control: ControlSubtotales = {
      grupos: [
        {
          clasificador: "Paneles",
          filaSubtotal: 10,
          bloque: { desde: 2, hasta: 9, items: 8 },
          sumaMovimientos: 900,
          subtotalArchivo: 1_000,
          diferencia: 100,
          estado: "descuadre",
        },
        {
          clasificador: "Sensores",
          filaSubtotal: 12,
          bloque: { desde: 11, hasta: 11, items: 1 },
          sumaMovimientos: 50,
          subtotalArchivo: 50,
          diferencia: null,
          estado: "no_validado",
        },
      ],
      granTotal: null,
      descuadres: 1,
      noValidados: 1,
    };
    const html = render(control);
    expect(html).toContain("NO COINCIDE:");
    expect(html).toContain("Δ");
    expect(html).toContain("Archivo");
    expect(html).toContain("— NO VALIDADO");
    expect(html).toContain("No hay al menos 2 movimientos comparables");
  });
});
