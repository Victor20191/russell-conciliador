import { describe, expect, it } from "vitest";
import { compararLecturasInventario, conservarEdicionesInventario, intentoInventarioVigente, leerAsistenciaInventario, type AsistenciaInventarioGuardada } from "./asistencia-inventario-estado";

const original = { filaNum: 5, clasificador: "Materia prima", valor: 100, datos: { referencia: "REF-01", cantidad: 2, valorTotal: 100, descripcion: "A" }, tipoFila: "movimiento", omitida: null };
const actual = { ...original, hoja: "Inventario", tipoFilaForzado: null, padreManual: null };
const filaTotal = { filaNum: 6, clasificador: null, valor: 100, datos: { valorTotal: 100 }, tipoFila: "total", motivo: "gran_total:rotulo", omitida: null };
const totalActual = { ...filaTotal, hoja: "Inventario", tipoFilaForzado: null, padreManual: null, motivoTipoFila: filaTotal.motivo };
const traza = () => ({ version: 1, filaAncla: 5, filasOrigen: [5, 6], tipo: "registro", campos: [
  { rol: "referencia", fuentes: [{ fila: 5, columna: 1, inicio: 0, fin: 6 }] },
  { rol: "valorTotal", fuentes: [{ fila: 6, columna: 2, inicio: 7, fin: 10 }] },
] });

describe("relectura de inventarios conserva decisiones por fila física", () => {
  it("compara el borrador editado y la propuesta con ajustes preservados, no dos totales crudos", () => {
    const resumen = { filasIncluidas: 1, filasExcluidas: 1, valorLeido: 100, totalDeclarado: 100, diferencia: 0, hoja: "Inventario", tipoInventario: "Materia prima" };
    const editada = { ...actual, valor: 90, datos: { ...actual.datos, valorTotal: 90 } };
    const r = compararLecturasInventario([editada, totalActual], [original, filaTotal], [{ ...original, valor: 120 }, filaTotal], resumen, { ...resumen, valorLeido: 120 }, ["cantidad", "valorTotal"]);
    expect(r.resumenAnterior.valorLeido).toBe(90);
    expect(r.resumen.valorLeido).toBe(90);
    expect(r.resumenAnterior.totalDeclarado).toBe(100);
    expect(r.resumen.totalDeclarado).toBe(100);
    expect(r.resumen.diferencia).toBe(10);
    expect(r.edicionesManuales).toBe(1);
    expect(r.hayEdicionesIncompatibles).toBe(false);
  });
  it("retira el control de ambas lecturas cuando un total se convierte manualmente en movimiento", () => {
    const resumen = { filasIncluidas: 1, filasExcluidas: 1, valorLeido: 100, totalDeclarado: 100, diferencia: 0, hoja: "Inventario", tipoInventario: "Materia prima" };
    const rescatada = { ...totalActual, tipoFila: "movimiento", tipoFilaForzado: "movimiento" };
    const r = compararLecturasInventario([actual, rescatada], [original, filaTotal], [original, filaTotal], resumen, resumen, ["cantidad", "valorTotal"]);
    expect(r.resumenAnterior).toMatchObject({ filasIncluidas: 2, valorLeido: 200, totalDeclarado: null, diferencia: null });
    expect(r.resumen).toMatchObject({ filasIncluidas: 2, valorLeido: 200, totalDeclarado: null, diferencia: null });
    expect(r.edicionesManuales).toBe(1);
    expect(r.hayEdicionesIncompatibles).toBe(false);
  });
  it("recalcula el importe del control con el motivo persistido y el ajuste que conservará la propuesta", () => {
    const resumen = { filasIncluidas: 1, filasExcluidas: 1, valorLeido: 100, totalDeclarado: 100, diferencia: 0, hoja: "Inventario", tipoInventario: "Materia prima" };
    // Prisma trae motivoTipoFila, mientras que la transformación trae motivo.
    const corregida = { ...totalActual, motivo: undefined, valor: 130, datos: { valorTotal: 130 } };
    const r = compararLecturasInventario([actual, corregida], [original, filaTotal], [original, filaTotal], resumen, resumen, ["cantidad", "valorTotal"]);
    expect(r.resumenAnterior).toMatchObject({ valorLeido: 100, totalDeclarado: 130, diferencia: 30 });
    expect(r.resumen).toMatchObject({ valorLeido: 100, totalDeclarado: 130, diferencia: 30 });
  });
  it("no confunde los valores recalculados del mapa nuevo con ajustes humanos", () => {
    const nueva = { ...original, valor: 120, datos: { ...original.datos, valorTotal: 120 } };
    const r = conservarEdicionesInventario([actual], [original], [nueva], "Inventario", "Inventario");
    expect(r.cantidad).toBe(0);
    expect(r.cambios.size).toBe(0);
  });
  it("preserva sólo los campos editados sin devolver al mapa anterior los demás campos", () => {
    const editada = { ...actual, datos: { ...actual.datos, descripcion: "Corregida" }, clasificador: "Mercancía" };
    const nueva = { ...original, datos: { ...original.datos, cantidad: 3, valorTotal: 150 } };
    const r = conservarEdicionesInventario([editada], [original], [nueva], "Inventario", "Inventario");
    expect(r.cambios.get(5)).toEqual({ clasificador: "Mercancía", datos: { descripcion: "Corregida" } });
    expect(r.incompatibles).toEqual([]);
  });
  it("una referencia distinta en la misma fila no recibe ediciones del producto anterior", () => {
    const r = conservarEdicionesInventario([{ ...actual, omitida: true }], [original], [{ ...original, datos: { referencia: "REF-02" } }], "Inventario", "Inventario");
    expect(r.incompatibles).toEqual([5]);
    expect(r.cambios.size).toBe(0);
  });
  it("cambiar de hoja, perder una fila o su padre exige resolver el ajuste", () => {
    const editada = { ...actual, padreManual: 2 };
    expect(conservarEdicionesInventario([editada], [original], [original], "Inventario", "Otra").incompatibles).toEqual([5]);
    expect(conservarEdicionesInventario([editada], [original], [], "Inventario", "Inventario").incompatibles).toEqual([5]);
    expect(conservarEdicionesInventario([editada], [original], [original], "Inventario", "Inventario").incompatibles).toEqual([5]);
  });
  it("preserva el rescate explícito de una fila omitida por el motor", () => {
    const base = { ...original, omitida: true };
    const r = conservarEdicionesInventario([{ ...actual, omitida: false }], [base], [base], "Inventario", "Inventario");
    expect(r.cambios.get(5)).toEqual({ omitida: false });
  });
  it("conserva ajustes de una reconstrucción con la misma procedencia sin copiarlos a su traza", () => {
    const origen = traza();
    const base = { ...original, datos: { ...original.datos, __origenInventario: JSON.stringify(origen) } };
    const nuevaTraza = { ...origen, filasOrigen: [...origen.filasOrigen].reverse(), campos: [...origen.campos].reverse() };
    const nueva = { ...base, datos: { ...base.datos, __origenInventario: JSON.stringify(nuevaTraza) } };
    const editada = { ...actual, datos: base.datos, omitida: true };
    const r = conservarEdicionesInventario([editada], [base], [nueva], "Inventario", "Inventario");
    expect(r.cambios.get(5)).toEqual({ omitida: true });
    expect(r.incompatibles).toEqual([]);
  });
  it("cambiar filas componentes o celdas fuente invalida el ajuste aunque ancla y referencia coincidan", () => {
    const base = { ...original, datos: { ...original.datos, __origenInventario: JSON.stringify(traza()) } };
    const editada = { ...actual, datos: base.datos, omitida: true };
    const fuentesDistintas = traza();
    fuentesDistintas.campos[1].fuentes[0].columna = 3;
    for (const origen of [{ ...traza(), filasOrigen: [5, 6, 7] }, fuentesDistintas]) {
      const nueva = { ...base, datos: { ...base.datos, __origenInventario: JSON.stringify(origen) } };
      const r = conservarEdicionesInventario([editada], [base], [nueva], "Inventario", "Inventario");
      expect(r.incompatibles).toEqual([5]);
      expect(r.cambios.size).toBe(0);
    }
  });
  it("otro fragmento de la misma celda no recibe la corrección del importe anterior", () => {
    const base = { ...original, datos: { ...original.datos, __origenInventario: JSON.stringify(traza()) } };
    const editada = { ...actual, datos: base.datos, valor: 90 };
    const otroFragmento = traza();
    otroFragmento.campos[1].fuentes[0] = { fila: 6, columna: 2, inicio: 20, fin: 23 };
    const nueva = { ...base, datos: { ...base.datos, __origenInventario: JSON.stringify(otroFragmento) } };
    expect(conservarEdicionesInventario([editada], [base], [nueva], "Inventario", "Inventario").incompatibles).toEqual([5]);
  });
  it("la evidencia nueva por sí sola no se interpreta como edición humana", () => {
    const base = { ...original, datos: { ...original.datos, __origenInventario: JSON.stringify(traza()) } };
    const sinEdiciones = { ...actual, datos: original.datos };
    const r = conservarEdicionesInventario([sinEdiciones], [base], [base], "Inventario", "Inventario");
    expect(r.cantidad).toBe(0);
    expect(r.cambios.size).toBe(0);
  });
  it("no traslada ajustes cuando falta la traza anterior o está corrupta", () => {
    const base = { ...original, datos: { ...original.datos, __origenInventario: JSON.stringify(traza()) } };
    for (const origen of [undefined, "{incompleto", JSON.stringify({ ...traza(), version: 2 })]) {
      const editada = { ...actual, omitida: true, datos: { ...original.datos, __origenInventario: origen } };
      expect(conservarEdicionesInventario([editada], [base], [base], "Inventario", "Inventario").incompatibles).toEqual([5]);
    }
    const editadaLegada = { ...actual, omitida: true };
    expect(conservarEdicionesInventario([editadaLegada], [original], [base], "Inventario", "Inventario").incompatibles).toEqual([5]);
  });
});

describe("recepción privada y reintentos", () => {
  it("rechaza metadata ajena o corrupta", () => {
    expect(leerAsistenciaInventario(null)).toBeNull();
    expect(leerAsistenciaInventario({ version: 1, estado: "aprobada" })).toBeNull();
  });
  it("un intento vigente impide repetir IA; uno vencido permite recuperación", () => {
    const intento = { estado: "analizando", venceEn: "2026-10-03T12:30:00Z" } as AsistenciaInventarioGuardada;
    expect(intentoInventarioVigente(intento, Date.parse("2026-10-03T12:00:00Z"))).toBe(true);
    expect(intentoInventarioVigente(intento, Date.parse("2026-10-03T12:31:00Z"))).toBe(false);
    expect(intentoInventarioVigente({ ...intento, estado: "borrador_preparado" }, Date.parse("2026-10-03T12:00:00Z"))).toBe(false);
  });
});
