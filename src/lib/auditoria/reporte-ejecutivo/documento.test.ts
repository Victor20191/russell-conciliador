import { describe, expect, test } from "vitest";
import { calcularResumenUso, conteosPorFamiliaCanon } from "./metricas";
import { evaluarAdopcion } from "./adopcion";
import { construirDocumentoConsistente, construirPromptLecturaConsistente, parsearLecturaConsistente } from "./documento";
import type { NovedadReporteEjecutivoContexto } from "./prompt";
import { compararUso } from "./comparativo";

const uso = calcularResumenUso({
  eventos: [{ user: "Ana <script>", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 7, createdAt: "2026-09-01T10:00:00Z" }],
  periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-07T23:59:59Z",
});
const adopcion = evaluarAdopcion({ cambios: [], conteosPorFamilia: conteosPorFamiliaCanon([]) });
const novedades: NovedadReporteEjecutivoContexto[] = [{
  numero: "1.15.1", titulo: "Avances", resumen: null, estado: "publicada", publicadoEn: null,
  cambios: [{ tipo: "correccion", titulo: "<img src=x onerror=alert(1)>", descripcion: "A & B", modulo: "balance", ruta: null, comoOperar: null, ejemplo: null, estadoFuncionalidad: "disponible" }],
}];
const contexto = { uso, adopcion, novedades };

describe("documento consistente", () => {
  test("repite exactamente el documento y mantiene el orden de sus secciones", () => {
    const a = construirDocumentoConsistente(contexto);
    expect(a).toEqual(construirDocumentoConsistente(contexto));
    const ids = ["lo-mas-importante", "decisiones", "indicadores", "avances", "proximos-pasos"];
    const posiciones = ids.map((id) => a.html.indexOf(`id="${id}"`));
    expect(posiciones.every((posicion) => posicion >= 0)).toBe(true);
    expect(posiciones).toEqual([...posiciones].sort((x, y) => x - y));
    expect(a.html).toContain("Operaciones registradas: <strong>1</strong>");
    expect(a.html).toContain("Usuarios con operaciones: <strong>1</strong>");
    expect(a.html).toContain("2026-09-01T00:00:00.000Z");
    expect(a.html).toContain('id="rd-graficos-uso"');
  });

  test("escapa los textos de datos y conserva todos los avances recibidos", () => {
    const html = construirDocumentoConsistente({ ...contexto, corte: "<script>corte</script>" }).html;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("Ana &lt;script&gt;");
    const muchos = { ...novedades[0], cambios: Array.from({ length: 85 }, (_, i) => ({ ...novedades[0].cambios[0], titulo: `Avance-${i}` })) };
    const completo = construirDocumentoConsistente({ ...contexto, novedades: [muchos] }).html;
    expect(completo).toContain("Avance-84");
  });

  test("JSON no válido, HTML, cifras o nombres nuevos caen a documento factual", () => {
    for (const texto of ["no JSON", "<html>texto</html>", '{"lectura":"Subió 50%","recomendaciones":[]}', '{"lectura":"Pedro lideró el equipo","recomendaciones":[]}']) {
      expect(parsearLecturaConsistente(texto)).toBeNull();
      expect(construirDocumentoConsistente({ ...contexto, lecturaIA: parsearLecturaConsistente(texto) }))
        .toEqual(construirDocumentoConsistente(contexto));
    }
  });

  test("acepta exclusivamente orientación editorial sin hechos nuevos", () => {
    const lectura = "La actividad de un módulo ofrece evidencia relacionada, pero no confirma el uso de cada funcionalidad individual.";
    const parsed = parsearLecturaConsistente(JSON.stringify({ lectura, recomendaciones: ["Revisar el detalle de actividad junto con el contexto operativo del equipo."] }));
    expect(parsed).not.toBeNull();
    expect(construirDocumentoConsistente({ ...contexto, lecturaIA: parsed }).html).toContain(lectura);
    expect(construirPromptLecturaConsistente(contexto)).toContain("No agregues cifras");
    expect(construirPromptLecturaConsistente(contexto)).not.toContain("Ana");
    expect(parsearLecturaConsistente(JSON.stringify({ ...parsed, extra: true }))).toBeNull();
  });
});

describe("sección de comparativo", () => {
  const usoPrevio = calcularResumenUso({
    eventos: Array.from({ length: 10 }, (_, i) => ({
      user: "Ana", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 7,
      createdAt: `2026-08-2${i % 8}T10:00:00Z`,
    })),
    periodoDesde: "2026-08-25T00:00:00Z", periodoHasta: "2026-08-31T23:59:59Z",
  });
  const comparativo = compararUso({ actual: uso, previo: usoPrevio, base: "reporte_anterior", generadoEn: "2026-09-01T08:00:00Z" });

  test("sin comparativo el documento no cambia", () => {
    expect(construirDocumentoConsistente({ ...contexto, comparativo: null })).toEqual(
      construirDocumentoConsistente(contexto),
    );
  });

  test("con comparativo agrega la sección y la alerta visible antes de los indicadores", () => {
    const doc = construirDocumentoConsistente({ ...contexto, comparativo });
    expect(doc.html).toContain('id="comparativo"');
    expect(doc.html).toContain("¿Subió o bajó el uso?");
    // La alerta describe la caída (1 operación contra 10 del período previo).
    expect(doc.html).toContain("El uso bajó");
    expect(doc.html.indexOf('id="comparativo"')).toBeLessThan(doc.html.indexOf('id="indicadores"'));
    // Y queda resumida en «Lo más importante».
    expect(doc.html.indexOf("Frente al reporte anterior")).toBeLessThan(doc.html.indexOf('id="comparativo"'));
  });
});

describe("colores del comparativo", () => {
  const usoPrevioAlto = calcularResumenUso({
    eventos: Array.from({ length: 10 }, (_, i) => ({
      user: "Ana", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 7,
      createdAt: `2026-08-2${i % 8}T10:00:00Z`,
    })),
    periodoDesde: "2026-08-25T00:00:00Z", periodoHasta: "2026-08-31T23:59:59Z",
  });

  test("pinta cada variación con su color: verde sube, rojo baja", () => {
    const baja = compararUso({ actual: uso, previo: usoPrevioAlto, base: "reporte_anterior" });
    const html = construirDocumentoConsistente({ ...contexto, comparativo: baja }).html;
    expect(html).toContain("#9a2a22"); // rojo en la caída y en el banner
    const sube = compararUso({ actual: usoPrevioAlto, previo: uso, base: "reporte_anterior" });
    expect(construirDocumentoConsistente({ ...contexto, comparativo: sube }).html).toContain("#2f6b3f");
  });

  test("el banner usa la flecha del nivel, no la de la medida", () => {
    // Variación del 0 %: «estable» aunque la medida no tenga dirección de caída.
    const igual = compararUso({ actual: uso, previo: { ...uso, periodoDesde: "2026-08-25T00:00:00Z", periodoHasta: "2026-08-31T23:59:59Z" }, base: "reporte_anterior" });
    const html = construirDocumentoConsistente({ ...contexto, comparativo: igual }).html;
    expect(html).toContain("= El uso se mantuvo estable");
  });
});
