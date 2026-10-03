import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { SpecModulo } from "../extraccion/esquema";
import { validarLecturaInventario } from "./validar";
import type { LecturaEstructurada } from "../extraccion/lectura-estructurada";

const encabezado = ["Tipo", "Referencia", "Descripción", "Cantidad", "Valor unitario", "Valor total"];
const spec: SpecModulo = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 }, clasificadorModo: "columna" };
const hoja = (filas: GridHoja["filas"]): GridHoja => ({ nombre: "Inventario", filas: [encabezado, ...filas] });
const detalle = [["Materia prima", "A", "Producto A", 2, 10, 20], ["Materia prima", "B", "Producto B", 3, 10, 30]];

describe("validación completa de la lectura de inventarios", () => {
  it("calcula el resumen desde los movimientos y excluye el total original", () => {
    const r = validarLecturaInventario({ hojas: [hoja([...detalle, ["Total general", null, null, null, null, 50]])], spec, origen: "patron" });
    expect(r.listoParaBorrador).toBe(true);
    expect(r.preguntas).toEqual([]);
    expect(r.resumen).toMatchObject({ filasIncluidas: 2, filasExcluidas: 1, valorLeido: 50, totalDeclarado: 50, diferencia: 0 });
  });

  it("informa una diferencia real de total sin cambiar importes ni invalidar el mapa", () => {
    const original = hoja([...detalle, ["Total general", null, null, null, null, 55]]);
    const antes = structuredClone(original);
    const r = validarLecturaInventario({ hojas: [original], spec, origen: "patron" });
    expect(r.estructuraValida).toBe(true);
    expect(r.resumen).toMatchObject({ valorLeido: 50, totalDeclarado: 55, diferencia: 5 });
    expect(r.advertencias.some((a) => a.includes("difiere"))).toBe(true);
    expect(original).toEqual(antes);
  });

  it("conserva el valor original cuando cantidad por costo unitario difiere", () => {
    const r = validarLecturaInventario({ hojas: [hoja([["Materia prima", "A", "Producto", 2, 10, 25]])], spec });
    expect(r.resumen.valorLeido).toBe(25);
    expect(r.listoParaBorrador).toBe(true);
    expect(r.advertencias.some((a) => a.includes("cantidad×valorUnitario"))).toBe(true);
  });

  it("rechaza columnas inexistentes, roles obligatorios y la cantidad usada como valor", () => {
    for (const columnas of [{ ...spec.columnas, valorTotal: 80 }, { ...spec.columnas, valorTotal: 0 }, { ...spec.columnas, valorTotal: 4, cantidad: 0 }]) {
      const r = validarLecturaInventario({ hojas: [hoja(detalle)], spec: { ...spec, columnas } });
      expect(r.estructuraValida).toBe(false);
      expect(r.errores.length).toBeGreaterThan(0);
    }
  });

  it("no acepta un mapa que pierda un bloque con importes por encima del inicio", () => {
    const r = validarLecturaInventario({ hojas: [hoja([detalle[0], [], ["Otra sección"], detalle[1]])], spec: { ...spec, primeraFilaDatos: 5 } });
    expect(r.estructuraValida).toBe(false);
    expect(r.errores.some((e) => e.includes("por encima"))).toBe(true);
  });

  it("pregunta cómo tratar tipos vacíos y aplica la respuesta sin IA", () => {
    const original = hoja([detalle[0], [null, "B", "Producto B", 3, 10, 30]]);
    const sinResolver = validarLecturaInventario({ hojas: [original], spec, origen: "ia" });
    expect(sinResolver.preguntas.map((p) => p.id)).toContain("modo_tipo");
    expect(sinResolver.listoParaBorrador).toBe(false);
    const resuelta = validarLecturaInventario({ hojas: [original], spec, origen: "ia", respuestas: { modo_tipo: "arrastrar" } });
    expect(resuelta.preguntas).toEqual([]);
    expect(resuelta.listoParaBorrador).toBe(true);
    expect(resuelta.resumen.valorLeido).toBe(50);
  });

  it("solicita decisión sólo para rótulos ambiguos nuevos y respeta un patrón aprobado", () => {
    const original = hoja(detalle.map((fila) => [...fila, 60]));
    original.filas[0] = [...encabezado, "Valor total"];
    const nuevo = validarLecturaInventario({ hojas: [original], spec, origen: "ia" });
    expect(nuevo.preguntas.map((p) => p.id)).toContain("columna_valor");
    const aprobado = validarLecturaInventario({ hojas: [original], spec, origen: "patron" });
    expect(aprobado.preguntas).toEqual([]);
    const elegido = validarLecturaInventario({ hojas: [original], spec, origen: "ia", respuestas: { columna_valor: "6" } });
    expect(elegido.preguntas).toEqual([]);
  });

  it("conserva índices físicos al elegir un total entre varias cifras", () => {
    const original = hoja([...detalle, ["Total general", null, null, null, null, 50], ["Total general", null, null, null, null, 70]]);
    original.filasFisicas = [5, 8, 10, 20, 22];
    const pendiente = validarLecturaInventario({ hojas: [original], spec, origen: "ia" });
    expect(pendiente.preguntas.find((p) => p.id === "total_archivo")?.opciones?.map((o) => o.valor)).toEqual(["fila:20", "fila:22"]);
    const elegida = validarLecturaInventario({ hojas: [original], spec, respuestas: { total_archivo: "fila:20" } });
    expect(elegida.spec?.subtotalesFila).toBe(20);
    expect(elegida.errores).toEqual([]);
    expect(elegida.preguntas).toEqual([]);
    expect(elegida.resumen.totalDeclarado).toBe(50);
  });

  it("procesa toda la hoja, incluidas anomalías que quedan fuera de cualquier vista previa", () => {
    const filas = Array.from({ length: 1500 }, (_, i) => ["Tipo", `P-${i}`, "Producto", 1, 2, i === 750 ? 7 : 2]);
    const r = validarLecturaInventario({ hojas: [hoja(filas)], spec });
    expect(r.resumen.filasIncluidas).toBe(1500);
    expect(r.resumen.valorLeido).toBe(3005);
    expect(r.advertencias.some((a) => a.includes("Fila 752"))).toBe(true);
  });

  it("detecta un importe ilegible aunque el motor omita esa fila por estar en cero", () => {
    const original = hoja([detalle[0], ["Materia prima", "B", "Producto B", null, null, "ilegible"]]);
    const r = validarLecturaInventario({ hojas: [original], spec, origen: "patron" });
    expect(r.estructuraValida).toBe(true);
    expect(r.listoParaBorrador).toBe(false);
    expect(r.errores.some((e) => e.includes("ilegible o ausente"))).toBe(true);
    expect(r.resumen.valorLeido).toBe(20);
  });

  it("permite derivar sólo celdas vacías con cantidad y costo, nunca un texto corrupto", () => {
    const vacia = validarLecturaInventario({ hojas: [hoja([["Materia", "A", "Producto", 2, 10, null]])], spec });
    expect(vacia.resumen.valorLeido).toBe(20);
    expect(vacia.listoParaBorrador).toBe(true);
    const corrupta = validarLecturaInventario({ hojas: [hoja([["Materia", "A", "Producto", 2, 10, "error"]])], spec });
    expect(corrupta.listoParaBorrador).toBe(false);
  });

  it("respeta un valor cero explícito y registra la discrepancia sin reemplazarlo por cantidad por costo", () => {
    const r = validarLecturaInventario({ hojas: [hoja([["Materia", "A", "Producto", 2, 10, 0]])], spec, origen: "patron" });
    expect(r.resumen.valorLeido).toBe(0);
    expect(r.resumen.filasIncluidas).toBe(1);
    expect(r.listoParaBorrador).toBe(true);
    expect(r.advertencias.some((a) => a.includes("valorTotal (0)") && a.includes("(20)"))).toBe(true);
  });

  it("un cambio reutilizable del patrón se considera manual, una coordenada de total no", () => {
    const original = hoja([...detalle, ["Total general", null, null, null, null, 50]]);
    const global = validarLecturaInventario({ hojas: [original], spec, origen: "patron", respuestas: { modo_tipo: "global" } });
    expect(global.origen).toBe("manual");
    const total = validarLecturaInventario({ hojas: [original], spec, origen: "patron", respuestas: { total_archivo: "fila:4" } });
    expect(total.origen).toBe("patron");
  });
});

const fuenteEtiqueta = (inicio: string, fin?: string, desplazamientoFila = 0) => ({ columna: 1, desplazamientoFila, selector: { tipo: "etiqueta" as const, inicio, ...(fin ? { fin } : {}) } });
const reglasMixtas: LecturaEstructurada = {
  version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Ref:" }, maxFilas: 1 },
  campos: [
    { rol: "referencia", fuente: fuenteEtiqueta("Ref:", "Tipo:") }, { rol: "tipo", fuente: fuenteEtiqueta("Tipo:", "Cant:") },
    { rol: "cantidad", fuente: fuenteEtiqueta("Cant:", "Unit:") }, { rol: "valorUnitario", fuente: fuenteEtiqueta("Unit:", "Total:") }, { rol: "valorTotal", fuente: fuenteEtiqueta("Total:") },
  ],
  totales: [{ condicion: { columna: 1, operador: "empieza", texto: "Total general:" }, fuente: fuenteEtiqueta("Total general:"), tipo: "general" }],
};
const specMixto: SpecModulo = { hoja: "Mixto", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {}, lecturaEstructurada: reglasMixtas };
const hojaMixta: GridHoja = { nombre: "Mixto", filas: [["Registro"], ["Ref:A | Tipo:MP | Cant:2 | Unit:10 | Total:20"], ["Ref:B | Tipo:PT | Cant:3 | Unit:10 | Total:30"], ["Total general:50"]] };

describe("validación de estructuras mixtas y primera confirmación", () => {
  it("lee etiquetas de una misma celda, muestra evidencia y exige confirmar el mapa una sola vez", () => {
    const inicial = validarLecturaInventario({ hojas: [hojaMixta], spec: specMixto, origen: "ia" });
    expect(inicial.errores).toEqual([]);
    expect(inicial.resumen).toMatchObject({ filasIncluidas: 2, valorLeido: 50, totalDeclarado: 50, diferencia: 0 });
    expect(inicial.listoParaBorrador).toBe(false);
    const pregunta = inicial.preguntas.find((p) => p.id === "confirmar_lectura_estructurada")!;
    expect(pregunta.requiereIA).not.toBe(true);
    expect(inicial.ejemplosLectura?.[0]).toMatchObject({ fila: 2, campos: expect.arrayContaining([{ rol: "referencia", valor: "A", fuentes: [{ hoja: "Mixto", fila: 2, columna: 1, texto: hojaMixta.filas[1][0] }] }]) });
    const confirmado = validarLecturaInventario({ hojas: [hojaMixta], spec: specMixto, origen: "ia", respuestas: { confirmar_lectura_estructurada: pregunta.opciones![0].valor } });
    expect(confirmado.listoParaBorrador).toBe(true);
    expect(confirmado.preguntas).toEqual([]);
    expect(confirmado.spec?.lecturaEstructurada).toEqual(reglasMixtas);
  });

  it("una respuesta antigua no confirma reglas nuevas y un patrón validado se reutiliza sin preguntas", () => {
    const inicial = validarLecturaInventario({ hojas: [hojaMixta], spec: specMixto, origen: "ia" });
    const nuevaRegla: SpecModulo = { ...specMixto, lecturaEstructurada: { ...reglasMixtas, registro: { ...reglasMixtas.registro, ancla: { columna: 1, operador: "contiene", texto: "Ref:" } } } };
    const cambiada = validarLecturaInventario({ hojas: [hojaMixta], spec: nuevaRegla, origen: "ia", respuestas: { confirmar_lectura_estructurada: inicial.preguntas[0].opciones![0].valor } });
    expect(cambiada.listoParaBorrador).toBe(false);
    expect(cambiada.preguntas[0].opciones![0].valor).not.toBe(inicial.preguntas[0].opciones![0].valor);
    const patron = validarLecturaInventario({ hojas: [hojaMixta], spec: specMixto, origen: "patron" });
    expect(patron.listoParaBorrador).toBe(true);
    expect(patron.preguntas).toEqual([]);
  });

  it("reúne un producto de varias filas y conserva las coordenadas de cada campo", () => {
    const vertical: GridHoja = { nombre: "Mixto", filas: [["Registro"], ["Ref:A | Tipo:MP"], ["Cant:2"], ["Unit:10 | Total:20"], ["Ref:B | Tipo:PT"], ["Cant:3"], ["Unit:10 | Total:30"], ["Total general:50"]] };
    const reglas: LecturaEstructurada = { ...reglasMixtas, registro: { ...reglasMixtas.registro, maxFilas: 3 }, campos: [
      { rol: "referencia", fuente: fuenteEtiqueta("Ref:", "Tipo:") }, { rol: "tipo", fuente: fuenteEtiqueta("Tipo:") },
      { rol: "cantidad", fuente: fuenteEtiqueta("Cant:", undefined, 1) }, { rol: "valorUnitario", fuente: fuenteEtiqueta("Unit:", "Total:", 2) }, { rol: "valorTotal", fuente: fuenteEtiqueta("Total:", undefined, 2) },
    ] };
    const r = validarLecturaInventario({ hojas: [vertical], spec: { ...specMixto, lecturaEstructurada: reglas }, origen: "patron" });
    expect(r.errores).toEqual([]);
    expect(r.resumen).toMatchObject({ filasIncluidas: 2, valorLeido: 50 });
    expect(r.ejemplosLectura?.[0].campos.find((c) => c.rol === "cantidad")?.fuentes[0].fila).toBe(3);
    expect(r.ejemplosLectura?.[1].campos.find((c) => c.rol === "valorTotal")?.fuentes[0].fila).toBe(7);
  });

  it("bloquea cifras ilegibles y cualquier registro no cubierto, incluidos los intermedios", () => {
    const corrupta = validarLecturaInventario({ hojas: [{ ...hojaMixta, filas: [hojaMixta.filas[0], ["Ref:A | Tipo:MP | Cant:2 | Unit:10 | Total:ilegible"]] }], spec: specMixto, origen: "patron" });
    expect(corrupta.listoParaBorrador).toBe(false);
    expect(corrupta.errores.some((e) => e.includes("ilegible"))).toBe(true);
    const filas = Array.from({ length: 900 }, (_, i) => [i === 450 ? "OTRO PRODUCTO Costo:250" : `Ref:A${i} | Tipo:MP | Cant:2 | Unit:10 | Total:20`]);
    const r = validarLecturaInventario({ hojas: [{ nombre: "Mixto", filas: [["Registro"], ...filas] }], spec: specMixto, origen: "patron" });
    expect(r.listoParaBorrador).toBe(false);
    expect(r.estructuraValida).toBe(false);
    expect(r.errores.some((e) => e.includes("452"))).toBe(true);
  });

  it("no permite concatenar números de una celda compuesta interpretándola como importe completo", () => {
    const reglas: LecturaEstructurada = { ...reglasMixtas, campos: reglasMixtas.campos.map((c) => c.rol === "valorTotal" ? { ...c, fuente: { ...c.fuente, selector: { tipo: "completa" as const } } } : c) };
    const r = validarLecturaInventario({ hojas: [hojaMixta], spec: { ...specMixto, lecturaEstructurada: reglas }, origen: "patron" });
    expect(r.listoParaBorrador).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
  });

  it("no oculta un registro adelantando el inicio de datos ni acepta índices fuera de la hoja", () => {
    const fuera = validarLecturaInventario({ hojas: [hojaMixta], spec: { ...specMixto, primeraFilaDatos: 90 }, origen: "patron" });
    expect(fuera.estructuraValida).toBe(false);
    const omitido = validarLecturaInventario({ hojas: [hojaMixta], spec: { ...specMixto, primeraFilaDatos: 3 }, origen: "patron" });
    expect(omitido.listoParaBorrador).toBe(false);
    expect(omitido.errores.some((e) => e.includes("entre el encabezado"))).toBe(true);
  });

  it("muestra tipos representativos y un tipo vacío ofrece una salida determinista que funciona", () => {
    const filas = ["MP", "MP", "MP", "PP", "PP", "PT"].map((tipo, i) => [`Ref:A${i} | Tipo:${tipo} | Cant:2 | Unit:10 | Total:20`]);
    const representativa = validarLecturaInventario({ hojas: [{ nombre: "Mixto", filas: [["Registro"], ...filas] }], spec: specMixto, origen: "ia" });
    expect(representativa.ejemplosLectura?.map((e) => e.campos.find((c) => c.rol === "tipo")?.valor)).toEqual(["MP", "PP", "PT"]);
    const sinTipo = { nombre: "Mixto", filas: [["Registro"], ["Ref:A | Tipo: | Cant:2 | Unit:10 | Total:20"]] };
    const pendiente = validarLecturaInventario({ hojas: [sinTipo], spec: specMixto, origen: "ia" });
    expect(pendiente.preguntas.map((p) => p.id)).toEqual(["modo_tipo"]);
    expect(pendiente.preguntas[0].opciones?.map((o) => o.valor)).toEqual(["global"]);
    const global = validarLecturaInventario({ hojas: [sinTipo], spec: specMixto, origen: "ia", respuestas: { modo_tipo: "global" } });
    expect(global.preguntas.map((p) => p.id)).toEqual(["confirmar_lectura_estructurada"]);
  });

  it("aplica la elección física entre dos totales aunque las columnas simples estén en cero", () => {
    const dosTotales = { ...hojaMixta, filas: [...hojaMixta.filas, ["Total general:60"]] };
    const pendiente = validarLecturaInventario({ hojas: [dosTotales], spec: specMixto, origen: "ia" });
    expect(pendiente.preguntas.map((p) => p.id)).toContain("total_archivo");
    const elegida = validarLecturaInventario({ hojas: [dosTotales], spec: specMixto, origen: "ia", respuestas: { total_archivo: "fila:5" } });
    expect(elegida.preguntas.map((p) => p.id)).not.toContain("total_archivo");
    expect(elegida.spec?.subtotalesFila).toBe(5);
    expect(elegida.resumen).toMatchObject({ totalDeclarado: 60, diferencia: 10 });
  });

  it("bloquea un producto reconstruido que el transformador confunde con un total", () => {
    const original = { nombre: "Mixto", filas: [["Registro"], ["Ref:A | Tipo:MP | Cant:2 | Unit:10 | Total:20"], ["Ref: | Tipo:Total general | Cant: | Unit: | Total:20"]] };
    const r = validarLecturaInventario({ hojas: [original], spec: specMixto, origen: "patron" });
    expect(r.listoParaBorrador).toBe(false);
    expect(r.errores.some((e) => e.includes("reconstruidos quedaron fuera"))).toBe(true);
  });

  it("un total válido no oculta cantidad o costo ilegible ni los corrige mediante derivación", () => {
    for (const [cantidad, unitario] of [["no disponible", "10"], ["2", "ilegible"], ["", "10"]]) {
      const r = validarLecturaInventario({ hojas: [{ nombre: "Mixto", filas: [["Registro"], [`Ref:A | Tipo:MP | Cant:${cantidad} | Unit:${unitario} | Total:20`]] }], spec: specMixto, origen: "patron" });
      expect(r.estructuraValida).toBe(true);
      expect(r.listoParaBorrador).toBe(false);
      expect(r.errores.some((e) => e.includes("campo") && e.includes("ilegible o ausente"))).toBe(true);
    }
  });
});
