import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AsistenciaMuestraPanel } from "./asistencia-muestra-panel";
import { resultadoInventarioVacio } from "@/lib/modulos/asistencia/tipos";

const render = (extra: Partial<Parameters<typeof AsistenciaMuestraPanel>[0]> = {}) => renderToStaticMarkup(createElement(AsistenciaMuestraPanel, {
  trabajando: false, pendiente: false, onPendiente: vi.fn(), onRevisar: vi.fn(), onReiniciar: vi.fn(), ...extra,
}));

describe("asistencia visible en Nuevo patrón", () => {
  it("muestra ejemplos y bloquea validación hasta responder, manteniendo disponible la corrección", () => {
    const html = render({ lectura: { ...resultadoInventarioVacio("ia"), preguntas: [{ id: "confirmar_lectura_estructurada", etiqueta: "¿Cada producto se interpreta correctamente?", opciones: [{ valor: "confirmar:huella", etiqueta: "Sí" }] }], ejemplosLectura: [{ fila: 3, campos: [{ rol: "referencia", valor: "MP-001", fuentes: [{ hoja: "Bloques", columna: 1, fila: 3, texto: "Ref: MP-001" }] }] }] } });
    expect(html).toContain("MP-001"); expect(html).toContain("Bloques · A3");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Validar respuestas/);
    expect(html).toContain("Explica cómo se lee el archivo");
    expect(html).not.toContain("Continuar al borrador");
  });
  it("distingue el mapa listo de cambios aún pendientes y deshabilita mientras consulta", () => {
    const lectura = { ...resultadoInventarioVacio(), listoParaBorrador: true };
    expect(render({ lectura })).toContain("Puedes guardar el patrón");
    expect(render({ lectura, pendiente: true })).not.toContain("Puedes guardar el patrón");
    expect(render({ lectura, pendiente: true })).toContain("Validar ajustes");
    expect(render({ trabajando: true })).toMatch(/<fieldset[^>]*disabled=""/);
  });
  it("permite reiniciar tras una revisión vencida conservando la muestra", () => {
    const html = render({ error: "La revisión venció" });
    expect(html).toContain("Reintentar lectura");
    expect(html).toContain("Volver a analizar la muestra desde el inicio");
  });
});
