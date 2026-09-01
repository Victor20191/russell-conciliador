import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ControlSubtotales } from "@/lib/modulos/subtotales";
import { ValidacionArchivo, type ResumenValidacionArchivo } from "./validacion-archivo";

const RESUMEN: ResumenValidacionArchivo = { items: 1_343, sumaMovimientos: 1_200_978_578.51 };
const sinControl: ControlSubtotales = { grupos: [], granTotal: null, descuadres: 0, noValidados: 0 };
const render = (control: ControlSubtotales, resumen: ResumenValidacionArchivo = RESUMEN) =>
  renderToStaticMarkup(createElement(ValidacionArchivo, { control, resumen }));

describe("ValidacionArchivo", () => {
  it("cuadra: contrasta el total declarado contra la Σ de movimientos", () => {
    const html = render({
      ...sinControl,
      granTotal: { filaNum: 1_347, subtotalArchivo: 1_200_978_578.51, sumaMovimientos: 1_200_978_578.51, diferencia: 0, estado: "cuadra" },
    });
    expect(html).toContain("Validación del archivo");
    expect(html).toContain("Cuadra:");
    expect(html).toContain("total declarado");
    expect(html).toContain("1.200.978.578,51");
    expect(html).toContain("fila 1347");
    expect(html).toContain("1.343 ítems se cargarán");
    // La barra es lo ÚNICO que informa el cuadre: ni tarjetas ni contadores lo repiten.
    expect(html).not.toContain("TOTAL DECLARADO POR EL ARCHIVO");
    expect(html).not.toContain("agrupadores distintos");
  });

  it("descuadre: dice cuánto y no lo presenta como cuadrado", () => {
    const html = render({
      ...sinControl,
      granTotal: { filaNum: 900, subtotalArchivo: 1_000, sumaMovimientos: 1_400, diferencia: -400, estado: "descuadre" },
      descuadres: 1,
    });
    expect(html).toContain("No coincide:");
    expect(html).toContain("diferencia");
    expect(html).not.toContain("Cuadra:");
  });

  it("sin total en el archivo: lo dice literalmente en vez de afirmar un cuadre", () => {
    const html = render(sinControl);
    expect(html).toContain("No validado:");
    expect(html).toContain("el archivo no declara un total comparable");
    expect(html).toContain("Sin total en el archivo");
    // La Σ de movimientos se sigue mostrando: es lo que se cargará.
    expect(html).toContain("1.200.978.578,51");
  });

  it("resume los subtotales por grupo y solo detalla los que no cuadran", () => {
    const html = render({
      granTotal: { filaNum: 50, subtotalArchivo: 1_000, sumaMovimientos: 1_000, diferencia: 0, estado: "cuadra" },
      grupos: [
        { clasificador: "Paneles", filaSubtotal: 10, bloque: { desde: 2, hasta: 9, items: 8 }, sumaMovimientos: 600, subtotalArchivo: 600, diferencia: 0, estado: "cuadra" },
        { clasificador: "Teclados", filaSubtotal: 20, bloque: { desde: 11, hasta: 19, items: 9 }, sumaMovimientos: 400, subtotalArchivo: 500, diferencia: 100, estado: "descuadre" },
      ],
      descuadres: 1,
      noValidados: 0,
    });
    expect(html).toContain("no cuadra");
    expect(html).toContain("Teclados");
    expect(html).toContain("fila 20");
    // El grupo que sí cuadra no ensucia el panel con una tarjeta propia.
    expect(html).not.toContain("Paneles");
  });
});

describe("ValidacionArchivo · modo «cargado»", () => {
  const cuadra = { filaNum: 1_345, subtotalArchivo: 1_200_978_578.51, sumaMovimientos: 1_200_978_578.51, diferencia: 0, estado: "cuadra" as const };

  it("habla en pasado: el cargue ya ocurrió", () => {
    const html = renderToStaticMarkup(createElement(ValidacionArchivo, {
      control: { ...sinControl, granTotal: cuadra },
      resumen: RESUMEN,
      modo: "cargado" as const,
      origen: { archivos: 1, archivosConTotal: 1 },
    }));
    expect(html).toContain("Cuadra:");
    expect(html).toContain("1.343 ítems cargados");
    expect(html).not.toContain("se cargarán");
    expect(html).toContain("fila 1345 del archivo");
  });

  it("con varios archivos no señala una fila: dice de dónde salió el total", () => {
    const html = renderToStaticMarkup(createElement(ValidacionArchivo, {
      control: { ...sinControl, granTotal: { ...cuadra, filaNum: 0 } },
      resumen: RESUMEN,
      modo: "cargado" as const,
      origen: { archivos: 3, archivosConTotal: 3 },
    }));
    expect(html).toContain("declarado por los 3 archivos de la versión");
    expect(html).not.toContain("fila 0");
  });

  it("cobertura parcial: lo dice en vez de afirmar un cuadre o un descuadre", () => {
    const html = renderToStaticMarkup(createElement(ValidacionArchivo, {
      control: sinControl,
      resumen: RESUMEN,
      modo: "cargado" as const,
      origen: { archivos: 2, archivosConTotal: 1 },
    }));
    expect(html).toContain("No validado:");
    expect(html).toContain("solo 1 de 2 archivos");
    expect(html).not.toContain("Cuadra:");
  });
});
