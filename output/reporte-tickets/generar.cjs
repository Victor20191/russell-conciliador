const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, ShadingType, BorderStyle, LevelFormat, PageNumber, Footer, PageBreak,
} = require("docx");

const AZUL = "1F3A5F";
const GRIS = "F2F4F7";
const FONT = "Calibri";
const L = AlignmentType.LEFT, R = AlignmentType.RIGHT;

const p = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts.para, children: [new TextRun({ text, font: FONT, size: 22, ...opts.run })] });

const h = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font: FONT })] });

const bullet = (runs) =>
  new Paragraph({
    numbering: { reference: "vinetas", level: 0 },
    spacing: { after: 80 },
    children: runs.map((r) => (typeof r === "string" ? new TextRun({ text: r, font: FONT, size: 21 }) : new TextRun({ font: FONT, size: 21, ...r }))),
  });

const cell = (text, w, { bold = false, fill, align = L } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, font: FONT, size: 20, color: fill === AZUL ? "FFFFFF" : "000000" })] })],
  });

const tabla = (widths, encabezado, filas, opts = {}) =>
  new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: encabezado.map((t, i) => cell(t, widths[i], { bold: true, fill: AZUL, align: opts.align?.[i] })) }),
      ...filas.map((f, ri) => {
        const destacada = opts.boldRows?.includes(ri);
        return new TableRow({ children: f.map((t, i) => cell(String(t), widths[i], { bold: destacada, fill: destacada ? GRIS : undefined, align: opts.align?.[i] })) });
      }),
    ],
  });

// ---------- Datos (corte 3-sep-2026) ----------
const pendientes = [
  ["TKT-57", "En proceso", "Error en página", "Inventarios", "Camilo Pérez", 8],
  ["TKT-2", "En evaluación", "Validación de cuentas asociadas al kárdex", "Inventarios", "Russell 1", 15],
  ["TKT-8", "En evaluación", "El Zarzal, importación masiva de equivalencias", "Inventarios", "Manuela Gutiérrez", 10],
  ["TKT-20", "En evaluación", "ImpactHub, homologación sin respetar el primer dígito", "Balance", "Manuela Gutiérrez", 10],
  ["TKT-24", "En evaluación", "Inversiones Pevel, campos poco claros en el editor", "Balance", "Manuela Gutiérrez", 10],
  ["TKT-56", "En evaluación", "Cierre de asignación de cuenta automático", "Inventarios", "russell plataforma", 10],
  ["TKT-62", "En evaluación", "Parametrizar tabla de agrupadores", "Inventarios", "Luisa Martínez", 8],
  ["TKT-63", "En evaluación", "No puedo cargar el balance de Muma julio 2026", "Balance", "Russell 3", 7],
  ["TKT-64", "En evaluación", "Rehomologación", "Balance", "Yuli Atehortúa", 6],
  ["TKT-66", "En evaluación", "Claridad en cargue de documento", "Balance", "Russell 2", 3],
  ["TKT-67", "En evaluación", "Ajuste de versiones en el prevalidador", "Balance", "Camilo Pérez", 2],
  ["TKT-4", "Abierto", "Cruce contable", "Inventarios", "Russell 1", 15],
  ["TKT-59", "Abierto", "Revisar con Érica, visual del plan estándar", "Mapeo plan estándar", "Luisa Martínez", 8],
  ["TKT-68", "Abierto", "Seleccionar cuentas de asociación", "Inventarios", "Yuli Atehortúa", 2],
  ["TKT-69", "Abierto", "Ventana emergente al guardar cambios", "Inventarios", "Yuli Atehortúa", 2],
];

const queSolicita = [
  ["TKT-57", "Se presentan errores al cargar el módulo de Inventarios. Es el único caso que ya está en proceso."],
  ["TKT-2", "Que la plataforma no permita continuar el proceso del kárdex mientras existan cuentas contables sin asociar."],
  ["TKT-8", "Poder importar en bloque las equivalencias de inventario cuando el kárdex del cliente no trae las cuentas."],
  ["TKT-20", "Caso de prueba de Fundación ImpactHub: la homologación no respeta el primer dígito de la cuenta."],
  ["TKT-24", "Caso de prueba de Inversiones Pevel: los campos del editor de estructura no son claros para el usuario."],
  ["TKT-56", "Que el buscador de cuentas del módulo de Inventarios se cierre solo al elegir la cuenta."],
  ["TKT-62", "Una tabla por cliente que agrupe varios agrupadores de inventario contra las cuentas del cliente."],
  ["TKT-63", "El balance de Muma de julio 2026 no fue leído ni procesado; posiblemente por la composición del archivo."],
  ["TKT-64", "Al volver al balance para rehomologar una cuenta ya enviada al módulo, el flujo no se comportó como se esperaba."],
  ["TKT-66", "La carga permite arrastrar el archivo, pero la pantalla no lo indica."],
  ["TKT-67", "Mostrar el histórico de aprobaciones y rechazos en el prevalidador."],
  ["TKT-4", "Poder identificar y excluir con justificación las cuentas que por su naturaleza no cruzan con los módulos."],
  ["TKT-59", "Definir si la vista de Subgrupos se necesita, ya que repite información del plan estándar. Requiere revisión con Érica."],
  ["TKT-68", "Una vista de las referencias que quedan pendientes por asignar cuenta cuando hay muchas bodegas."],
  ["TKT-69", "La plataforma dejó salir de Inventarios sin avisar que había asociaciones sin guardar y se perdieron."],
];

const resueltosSinCerrar = [
  ["TKT-14", "Alarmar, cuenta clase 73 homologada en clase 23", "Balance", "26-ago"],
  ["TKT-16", "Coordinadora de Tanques, cuentas clase 7 homologadas en clase 5", "Balance", "26-ago"],
  ["TKT-21", "Grupo Formarte, solicitudes repetidas y homologaciones", "Balance", "26-ago"],
  ["TKT-43", "Redplas, descuentos en compras homologados en proveedores", "Balance", "26-ago"],
  ["TKT-44", "Redplas, costo laboral homologado en pasivos", "Balance", "26-ago"],
  ["TKT-61", "Mapeo valor total de inventario", "Inventarios", "2-sep"],
  ["TKT-70", "Cruce entre módulo y balance", "Inventarios", "2-sep"],
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: AZUL, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: AZUL, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: L, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1100, left: 1200, right: 1200 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Plataforma Russell · Reporte de tickets · Página ", font: FONT, size: 18, color: "6B7280" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "6B7280" })] })] }),
    },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Reporte de estado de tickets", font: FONT, size: 40, bold: true, color: AZUL })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Plataforma Russell · Mesa de ayuda interna", font: FONT, size: 24, color: "4B5563" })] }),
      new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } }, children: [new TextRun({ text: "Corte: 3 de septiembre de 2026 · Fuente: base de datos de producción", font: FONT, size: 20, color: "6B7280" })] }),

      // 1
      h("1. Resumen general"),
      p("La mesa de ayuda inició operación el 18 de agosto de 2026. Desde entonces se han registrado 71 tickets: 15 siguen pendientes y 56 ya fueron resueltos o cerrados. El tiempo promedio de resolución de los tickets cerrados fue inferior a un día."),
      tabla([5000, 2200], ["Estado", "Tickets"], [
        ["Abierto", 4], ["En evaluación", 10], ["En proceso", 1],
        ["Pendientes (subtotal)", 15],
        ["Resuelto (pendiente de cierre)", 7], ["Cerrado", 49],
        ["Total histórico", 71],
      ], { boldRows: [3, 6], align: [L, R] }),

      h("Evolución semanal", HeadingLevel.HEADING_2),
      p("La semana del 24 de agosto concentró el grueso de la actividad: allí se cargaron en bloque los casos de las pruebas de funcionamiento de Balance e Inventarios y se resolvió la mayoría de ellos."),
      tabla([3400, 1900, 1900], ["Semana (inicio)", "Creados", "Resueltos"], [
        ["17 de agosto", 5, 3],
        ["24 de agosto", 61, 52],
        ["31 de agosto", 5, 1],
      ], { align: [L, R, R] }),

      // 2
      h("2. Distribución por módulo"),
      p("Balance es el módulo con más tickets acumulados, pero Inventarios es el que tiene más casos pendientes y el de mayor proporción sin resolver."),
      tabla([4000, 1600, 1600, 1600], ["Módulo", "Total", "Pendientes", "Resueltos"], [
        ["Balance", 47, 6, 41],
        ["Inventarios", 21, 8, 13],
        ["Mapeo plan estándar", 2, 1, 1],
        ["Borrador Balance", 1, 0, 1],
      ], { align: [L, R, R, R] }),

      h("Quién reporta y quién resuelve", HeadingLevel.HEADING_2),
      p("Manuela Gutiérrez figura como reportante en 49 de los 71 tickets porque cargó los casos de las pruebas de funcionamiento; el resto proviene del uso diario del equipo. En la resolución, 23 tickets los cerró Administrador Russell y 7 Luisa Martínez; los 26 restantes se cerraron sin registrar responsable (tickets anteriores al historial de eventos)."),

      // 3
      h("3. Detalle de los tickets pendientes"),
      p("Ordenados por estado: primero el que está en proceso, luego los que están en evaluación y por último los abiertos sin atender. La columna «Días» cuenta desde la creación del ticket hasta la fecha de corte."),
      tabla([1000, 1350, 3450, 1500, 1750, 790], ["Código", "Estado", "Asunto", "Módulo", "Reportante", "Días"], pendientes, { align: [L, L, L, L, L, R] }),

      h("Qué solicita cada ticket", HeadingLevel.HEADING_2),
      ...queSolicita.map(([c, t]) => bullet([{ text: c + ". ", bold: true }, t])),

      // 4
      h("4. Resueltos pendientes de cierre"),
      p("Siete tickets ya tienen solución registrada por Luisa Martínez pero siguen en estado «Resuelto» a la espera de que el reportante confirme y se cierren. Cinco son casos de homologación de las pruebas de Balance y dos son de Inventarios."),
      tabla([1000, 4300, 1500, 1200], ["Código", "Asunto", "Módulo", "Resuelto"], resueltosSinCerrar, { align: [L, L, L, R] }),

      // 5
      h("5. Puntos de atención"),
      bullet([{ text: "Los dos tickets más antiguos llevan 15 días. ", bold: true }, "TKT-2 y TKT-4 son de Inventarios y fueron reportados por Russell 1. TKT-4 no ha tenido ningún movimiento desde su creación."]),
      bullet([{ text: "Solo 1 de los 15 pendientes está en proceso. ", bold: true }, "Los 10 tickets en evaluación se han acumulado sin pasar a ejecución."]),
      bullet([{ text: "Inventarios concentra la mayor carga pendiente. ", bold: true }, "Tiene 8 de los 15 casos abiertos y la proporción sin resolver más alta (38 % frente a 13 % en Balance)."]),
      bullet([{ text: "El hilo de mensajes casi no se usa. ", bold: true }, "14 de los 15 pendientes no tienen ningún mensaje, por lo que el reportante no ha recibido una respuesta visible."]),
      bullet([{ text: "Hay 7 tickets resueltos sin cerrar, ", bold: true }, "cinco de ellos desde el 26 de agosto."]),
      bullet([{ text: "Reportantes con más pendientes: ", bold: true }, "Yuli Atehortúa y Manuela Gutiérrez, con 3 tickets cada una."]),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(__dirname, "Reporte_Tickets_Russell_2026-09-03.docx"), buf);
  console.log("ok");
});
