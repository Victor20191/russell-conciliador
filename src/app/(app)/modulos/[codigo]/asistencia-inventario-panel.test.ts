import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/asistencia-inventario", () => ({ conservarLecturaInventario: vi.fn(), consultarAsistenciaInventario: vi.fn(), prepararBorradorInventario: vi.fn(), ventanaOriginalInventario: vi.fn() }));
vi.mock("./editor-mapeo-modulo", () => ({ EditorMapeoModulo: () => null }));

import { AsistenciaInventarioPanel, type ResultadoAsistenciaVista } from "./asistencia-inventario-panel";

const resumen = { filasIncluidas: 3, filasExcluidas: 1, valorLeido: 1500, totalDeclarado: 1500, diferencia: 0, hoja: "Inventario", tipoInventario: "Materia prima" };
const render = (resultado: ResultadoAsistenciaVista, correccion = false) => renderToStaticMarkup(createElement(AsistenciaInventarioPanel, {
  recepcionLoteId: "c0d85e14-23bb-46d7-ade3-916f96c79c82", periodo: "2026-09", resultadoInicial: resultado,
  roles: [], correccion, onPreparado: vi.fn(),
}));

describe("asistencia de inventario: controles antes de cambiar un borrador", () => {
  it("muestra la comparación y bloquea aplicar si hay ediciones incompatibles sin aceptar", () => {
    const html = render({ ok: true, estado: "propuesta_lista", revision: 2, resumen, resumenAnterior: { ...resumen, valorLeido: 1000 }, hayEdicionesIncompatibles: true }, true);
    expect(html).toContain("Comparación de la lectura actual y la propuesta");
    expect(html).toContain("acepto descartar los cambios manuales");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aplicar nueva lectura<\/button>/);
  });

  it("las preguntas pendientes no permiten continuar sin respuesta", () => {
    const html = render({ ok: true, estado: "requiere_respuesta", preguntas: [{ id: "hoja", etiqueta: "¿Cuál hoja cargar?", opciones: [{ valor: "A", etiqueta: "A" }, { valor: "B", etiqueta: "B" }] }] });
    expect(html).toContain("¿Cuál hoja cargar?");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continuar al borrador<\/button>/);
  });

  it("sin una hoja leída no muestra el resumen en ceros, y con una hoja leída sí aunque no traiga registros", () => {
    const enCeros = { filasIncluidas: 0, filasExcluidas: 0, valorLeido: 0, totalDeclarado: null, diferencia: null, tipoInventario: null };
    const preguntas = [{ id: "hoja", etiqueta: "Hay inventario en varias hojas. ¿Cuál quieres cargar?", opciones: [{ valor: "Sheet1", etiqueta: "Sheet1" }, { valor: "Detalle", etiqueta: "Detalle" }] }];
    const sinLeer = render({ ok: true, estado: "requiere_respuesta", resumen: { ...enCeros, hoja: null }, preguntas });
    expect(sinLeer).not.toContain("Registros incluidos");
    expect(sinLeer).not.toContain("Valor leído");
    expect(sinLeer).toContain("¿Cuál quieres cargar?");
    expect(sinLeer).toContain("Diseñador de formato");
    expect(render({ ok: true, estado: "requiere_respuesta", resumen: { ...enCeros, hoja: "Sheet1" } })).toContain("Registros incluidos");
  });

  describe("hoja del archivo a la vista", () => {
    const hojasArchivo = [{ nombre: "Sheet1", oculta: false }, { nombre: "Detalle", oculta: false }, { nombre: "Respaldo", oculta: true }];
    const leida = { ...resumen, hoja: "Sheet1" };

    it("con varias pestañas deja escoger, con la leída marcada y las ocultas señaladas", () => {
      const html = render({ ok: false, estado: "error_recuperable", resumen: leida, hojasArchivo });
      expect(html).toContain("Hoja del archivo");
      expect(html).toMatch(/<option value="Sheet1" selected="">Sheet1<\/option>/);
      expect(html).toContain(">Detalle</option>");
      expect(html).toContain(">Respaldo (oculta)</option>");
      expect(html).not.toContain("Selecciona la hoja");
    });

    it("sin lectura todavía pide escoger en vez de suponer una hoja", () => {
      const html = render({ ok: false, estado: "error_recuperable", hojasArchivo });
      expect(html).toContain("Hoja del archivo");
      expect(html).toContain("Selecciona la hoja");
    });

    it("retoma la hoja elegida aunque su lectura no haya salido", () => {
      const html = render({ ok: true, estado: "requiere_respuesta", resumen: { ...leida, hoja: null }, hojaElegida: "Detalle", hojasArchivo });
      expect(html).toMatch(/<option value="Detalle" selected="">Detalle<\/option>/);
    });

    it("con una sola pestaña no hay nada que escoger", () => {
      expect(render({ ok: false, estado: "error_recuperable", resumen: leida, hojasArchivo: [hojasArchivo[0]] })).not.toContain("Hoja del archivo");
    });

    it("no se duplica con la pregunta de la hoja ni aparece si ya no se puede cambiar la lectura", () => {
      const pregunta = { id: "hoja", etiqueta: "Hay inventario en varias hojas. ¿Cuál quieres cargar?", opciones: [{ valor: "Sheet1", etiqueta: "Sheet1" }, { valor: "Detalle", etiqueta: "Detalle" }] };
      expect(render({ ok: true, estado: "requiere_respuesta", preguntas: [pregunta], hojasArchivo })).not.toContain("Hoja del archivo");
      expect(render({ ok: true, estado: "confirmado", resumen: leida, hojasArchivo })).not.toContain("Hoja del archivo");
      expect(render({ ok: true, estado: "analizando", resumen: leida, hojasArchivo })).not.toContain("Hoja del archivo");
    });
  });

  it("muestra los datos separados con sus celdas físicas y exige confirmar los ejemplos", () => {
    const html = render({ ok: true, estado: "requiere_respuesta", ejemplosLectura: [{ fila: 9, campos: [
      { rol: "referencia", valor: "REF-001", fuentes: [{ hoja: "Existencias", fila: 9, columna: 1, texto: "Ref: REF-001 | Tipo: MP | Cant: 8" }] },
      { rol: "cantidad", valor: 8, fuentes: [{ hoja: "Existencias", fila: 11, columna: 27, texto: "Cantidad: 8" }] },
    ] }], preguntas: [{ id: "confirmar_lectura_estructurada", etiqueta: "¿Los ejemplos corresponden a tus productos?", opciones: [{ valor: "huella", etiqueta: "Sí, la lectura es correcta" }] }] });
    expect(html).toContain("Así interpretamos tu archivo");
    expect(html).toContain("Origen en el archivo");
    expect(html).toContain("Existencias · A9");
    expect(html).toContain("Existencias · AA11");
    expect(html).toContain("Ref: REF-001 | Tipo: MP | Cant: 8");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continuar al borrador<\/button>/);
  });

  it("acompaña las dudas de IA con evidencia de la celda sin interpretar HTML del archivo", () => {
    const html = render({ ok: true, estado: "requiere_respuesta", preguntas: [{ id: "ia_cantidad", requiereIA: true, etiqueta: "¿Qué representa el 8?", evidencia: [{ hoja: "Existencias", fila: 9, columna: 1, texto: "<img src=x onerror=alert(1)> / 8" }] }] });
    expect(html).toContain("Existencias · A9");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });

  it("un intento en curso ofrece consultar sin habilitar otra lectura", () => {
    const html = render({ ok: true, estado: "analizando", revision: 1 });
    expect(html).toContain("Consultar avance");
    expect(html).not.toContain("Continuar al borrador");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });

  it("distingue un total declarado en cero de la ausencia de control", () => {
    const conCero = render({ ok: true, estado: "requiere_respuesta", resumen: { ...resumen, totalDeclarado: 0, diferencia: -1500 } });
    expect(conCero).not.toContain("No identificado");
    expect(conCero).not.toContain("Sin control independiente");
    const sinTotal = render({ ok: true, estado: "requiere_respuesta", resumen: { ...resumen, totalDeclarado: null, diferencia: null } });
    expect(sinTotal).toContain("Sin control independiente");
  });

  it("abrir la corrección no ofrece releer hasta que se expliquen cambios", () => {
    const html = render({ ok: true, estado: "borrador_preparado", revision: 1, resumen }, true);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Revisar propuesta<\/button>/);
    expect(html).not.toContain("Aplicar nueva lectura");
  });

  it("permite conservar explícitamente una lectura previa al abandonar una propuesta o error", () => {
    for (const estado of ["propuesta_lista", "requiere_respuesta", "error_recuperable"] as const) {
      const html = render({ ok: estado !== "error_recuperable", estado, revision: 2, resumen, resumenAnterior: resumen }, true);
      expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Conservar lectura actual<\/button>/);
    }
  });

  it("no permite conservar antes de una primera lectura ni mientras sigue analizando", () => {
    const inicial = render({ ok: true, estado: "requiere_respuesta", revision: 1, resumen });
    expect(inicial).not.toContain("Conservar lectura actual");
    const enCurso = render({ ok: true, estado: "analizando", revision: 2, resumen, resumenAnterior: resumen }, true);
    expect(enCurso).not.toContain("Conservar lectura actual");
    expect(enCurso).toContain("Consultar avance");
  });

  it("ofrece corregir armando un ejemplo sobre el archivo, salvo con la carga confirmada o en curso", () => {
    expect(render({ ok: true, estado: "requiere_respuesta", resumen })).toContain("Diseñador de formato");
    expect(render({ ok: true, estado: "confirmado", resumen })).not.toContain("Diseñador de formato");
    expect(render({ ok: true, estado: "analizando" })).not.toContain("Diseñador de formato");
  });
});
