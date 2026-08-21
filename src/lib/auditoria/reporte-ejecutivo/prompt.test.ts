import { describe, expect, test } from "vitest";
import type { ResumenAdopcion } from "./adopcion";
import type { ResumenUsoFactual } from "./metricas";
import {
  SISTEMA_REPORTE_EJECUTIVO,
  construirPromptReporteEjecutivo,
  normalizarTerminologiaVisibleReporte,
  type NovedadReporteEjecutivoContexto,
} from "./prompt";

const uso: ResumenUsoFactual = {
  periodoDesde: "2026-08-01T00:00:00.000Z",
  periodoHasta: "2026-08-18T23:59:59.999Z",
  totalAcciones: 321,
  totalConexiones: 45,
  totalUsuarios: 8,
  totalClientes: 12,
  primeraAccion: "2026-08-01T08:00:00.000Z",
  ultimaAccion: "2026-08-18T17:00:00.000Z",
  porFamilia: [{ nombre: "Balance de comprobación", total: 200 }],
  topAcciones: [{ nombre: "CARGÓ BALANCE", total: 40 }],
  topUsuarios: [{ usuario: "Ana", correo: "ana@russell.co", total: 100, porFamilia: [] }],
  detalleUsuarios: [],
  topClientes: [{ clienteId: 1, nombre: "Cliente Uno", total: 90 }],
  serieDiaria: [{ fecha: "2026-08-18", total: 20 }],
  evidencia: [],
};

const adopcion: ResumenAdopcion = {
  totalCambios: 2,
  evaluables: 1,
  usadas: 1,
  sinEvidencia: 0,
  noMedibles: 1,
  porcentajeAdopcion: 100,
  items: [],
  porEstado: [{ nombre: "usada", total: 1 }],
};

const novedades: NovedadReporteEjecutivoContexto[] = [
  {
    numero: "1.9.0",
    titulo: "Mejor seguimiento",
    resumen: "Más claridad para la gestión.",
    estado: "publicada",
    publicadoEn: "2026-08-18T12:00:00.000Z",
    cambios: [
      {
        tipo: "mejora",
        titulo: "Resumen por usuario",
        descripcion: "Presenta conexiones y operaciones por persona.",
        modulo: "auditoria",
        ruta: "/config/reportes-ejecutivos",
        comoOperar: "Abrir el reporte y elegir el período.",
        ejemplo: null,
        estadoFuncionalidad: "disponible",
      },
    ],
  },
];

describe("construirPromptReporteEjecutivo", () => {
  test("prioriza la lectura y decisión gerencial antes del detalle", () => {
    const prompt = construirPromptReporteEjecutivo({ uso, adopcion, novedades });

    expect(prompt).toContain("lectura de 3 a 5 minutos");
    expect(prompt).toContain("Las conclusiones van primero");
    expect(prompt).toContain("LENGUAJE GERENCIAL OBLIGATORIO");
    expect(prompt).toContain("sin tecnicismos");
    expect(prompt).toContain("No uses formato de newsletter");

    const resumen = prompt.indexOf("2) LO MÁS IMPORTANTE");
    const decisiones = prompt.indexOf("3) DECISIONES Y ASUNTOS POR ATENDER");
    const indicadores = prompt.indexOf("4) INDICADORES CLAVE DEL PERÍODO");
    const avances = prompt.indexOf("5) AVANCES RELEVANTES");
    const adopcionFuncionalidades = prompt.indexOf(
      "6) ADOPCIÓN DE NUEVAS FUNCIONALIDADES — APARTADO OBLIGATORIO",
    );
    const pasos = prompt.indexOf("7) PRÓXIMOS PASOS");

    expect(resumen).toBeGreaterThan(-1);
    expect(resumen).toBeLessThan(decisiones);
    expect(decisiones).toBeLessThan(indicadores);
    expect(indicadores).toBeLessThan(avances);
    expect(avances).toBeLessThan(adopcionFuncionalidades);
    expect(adopcionFuncionalidades).toBeLessThan(pasos);
  });

  test("separa la adopción según la evidencia realmente disponible", () => {
    const prompt = construirPromptReporteEjecutivo({ uso, adopcion, novedades });

    expect(prompt).toContain("Adopción de nuevas funcionalidades");
    expect(prompt).toContain("«Con actividad relacionada»: items con estado «usada»");
    expect(prompt).toContain("«Sin actividad relacionada»: items con estado «sin_evidencia»");
    expect(prompt).toContain("«No se puede medir»: items con estado «no_medible»");
    expect(prompt).toContain("no demuestra que una funcionalidad individual haya sido usada");
    expect(prompt).toContain("No significa que la funcionalidad no se haya usado");
    expect(prompt).toContain("Si porcentajeAdopcion es numérico");
    expect(prompt).toContain("Si es null, no calcules ni muestres un porcentaje");
    expect(prompt).toContain("En cada grupo menciona máximo 5 funcionalidades");
    expect(prompt).toContain("indica únicamente cuántas adicionales hay");
    expect(prompt).toContain("No nombres usuarios ni deduzcas quién adoptó una funcionalidad");
  });

  test("conserva un único marcador y limita el detalle editorial", () => {
    const prompt = construirPromptReporteEjecutivo({ uso, adopcion, novedades });
    const marcadores = prompt.match(/<section id="rd-graficos-uso"><\/section>/g) ?? [];

    expect(marcadores).toHaveLength(1);
    expect(prompt).toContain("Selecciona máximo 5 novedades");
    expect(prompt).toContain("Título: «Resumen de uso y avances»");
    expect(prompt).toContain("No uses en el documento las palabras «ejecutivo» ni «ejecutiva»");
    expect(prompt).toContain("no hagas una sección extensa por cada cambio");
    expect(prompt).not.toContain("~90–180 palabras por sección");
    expect(prompt).not.toContain("INTRO NARRATIVA");
  });

  test("incluye la base factual sin alterar sus valores", () => {
    const prompt = construirPromptReporteEjecutivo({ uso, adopcion, novedades });

    expect(prompt).toContain('"totalAcciones":321');
    expect(prompt).toContain('"totalConexiones":45');
    expect(prompt).toContain('"porcentajeAdopcion":100');
    expect(prompt).toContain('"titulo":"Resumen por usuario"');
  });
});

describe("SISTEMA_REPORTE_EJECUTIVO", () => {
  test("refuerza audiencia, claridad y rigor factual", () => {
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("gerentes y socios");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("sin tecnicismos");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("No inventas datos");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("solo una señal relacionada");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("ni la atribuyes a usuarios concretos");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("marcador HTML");
    expect(SISTEMA_REPORTE_EJECUTIVO).toContain("reportes de uso y avances");
  });
});

describe("normalizarTerminologiaVisibleReporte", () => {
  test("elimina el término rechazado aunque el modelo lo devuelva", () => {
    const html = normalizarTerminologiaVisibleReporte(
      "<title>Resumen ejecutivo de uso y avances</title><h2>Resumen Ejecutivo</h2><p>Informe ejecutivo para el cliente.</p>",
    );

    expect(html).toContain("<title>Resumen de uso y avances</title>");
    expect(html).toContain("<h2>Lo más importante</h2>");
    expect(html).toContain("<p>Reporte para gerencia del cliente.</p>");
    expect(html).not.toMatch(/ejecutiv[oa]/i);
  });
});
