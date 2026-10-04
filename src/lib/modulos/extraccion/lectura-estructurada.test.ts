import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "../descriptores";
import { normalizarSpecModulo, validarSpecModulo } from "../perfil-modulo";
import { aplicarPatronASpec } from "../patrones/aplicar";
import { coincidenciaPatron } from "../patrones/coincidencia";
import { mejorVersion, type VersionCandidata } from "../patrones/mejor-version";
import { SpecModuloSchema, type SpecModulo } from "./esquema";
import { aplicarSelector, ejecutarLecturaEstructurada, LecturaEstructuradaSchema, prepararSpecLecturaEstructurada, trasladarLecturaEstructurada, type FuenteLectura, type LecturaEstructurada } from "./lectura-estructurada";
import { transformarModulo } from "./transformar";

const INV = MODULOS_IMPORT.INV;
const fuente = (selector: FuenteLectura["selector"], desplazamientoFila = 0, columna = 1): FuenteLectura => ({ columna, desplazamientoFila, selector });
const etiquetas: LecturaEstructurada = {
  version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Ref:" }, maxFilas: 1 },
  campos: [
    { rol: "referencia", fuente: fuente({ tipo: "etiqueta", inicio: "Ref:", fin: "Tipo:" }) },
    { rol: "tipo", fuente: fuente({ tipo: "etiqueta", inicio: "Tipo:", fin: "Cant:" }) },
    { rol: "cantidad", fuente: fuente({ tipo: "etiqueta", inicio: "Cant:", fin: "Unit:" }) },
    { rol: "valorUnitario", fuente: fuente({ tipo: "etiqueta", inicio: "Unit:", fin: "Importe:" }) },
    { rol: "valorTotal", fuente: fuente({ tipo: "etiqueta", inicio: "Importe:" }) },
  ],
  totales: [{ condicion: { columna: 1, operador: "empieza", texto: "Total:" }, fuente: fuente({ tipo: "etiqueta", inicio: "Total:" }), tipo: "general" }],
};
const baseSpec = (lecturaEstructurada: LecturaEstructurada): SpecModulo => ({ hoja: "INV", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {}, lecturaEstructurada });
const hoja = (filas: GridHoja["filas"], extras: Partial<GridHoja> = {}): GridHoja => ({ nombre: "INV", filas: [["Datos de inventario"], ...filas], ...extras });

describe("lectura declarativa de inventario irregular", () => {
  it("separa campos etiquetados en una celda, conserva importes y traza física", () => {
    const original = hoja([["Ref: A-01 · Tipo: MP · Cant: 2 · Unit: 1250 · Importe: 2500"], ["Ref: B-02 · Tipo: PT · Cant: 3 · Unit: 100 · Importe: 300"], ["Total: 2800"]]);
    const resultado = transformarModulo(INV, baseSpec(etiquetas), original);
    expect(resultado.erroresLectura).toEqual([]);
    expect(resultado.filas.filter((f) => f.tipoFila === "movimiento").map((f) => [f.filaNum, f.clasificador, f.datos.referencia, f.valor])).toEqual([[2, "MP", "A-01", 2500], [3, "PT", "B-02", 300]]);
    expect(resultado.filas.find((f) => f.filaNum === 4)).toMatchObject({ tipoFila: "total", valor: 2800 });
    expect(resultado.trazasLectura?.[0].campos.find((c) => c.rol === "cantidad")).toMatchObject({ valor: "2", fuentes: [{ fila: 2, columna: 1 }] });
    expect(JSON.parse(resultado.filas[0].datos.__origenInventario as string)).toMatchObject({ version: 1, filaAncla: 2, filasOrigen: [2], tipo: "registro" });
  });

  it("separa por un delimitador literal sin confundir decimales con columnas", () => {
    const reglas: LecturaEstructurada = { version: 1, registro: { ancla: { columna: 1, operador: "no_vacia" }, maxFilas: 1 }, campos: ["referencia", "tipo", "cantidad", "valorUnitario", "valorTotal"].map((rol, i) => ({ rol: rol as LecturaEstructurada["campos"][number]["rol"], fuente: fuente({ tipo: "separador", separador: "|", indice: i + 1 }) })) };
    const r = transformarModulo(INV, baseSpec(reglas), hoja([["A-01|MP|2,5|1.200,00|3.000,00"]]));
    expect(r.erroresLectura).toEqual([]);
    expect(r.filas[0].datos).toMatchObject({ referencia: "A-01", tipo: "MP", cantidad: 2.5, valorUnitario: 1200, valorTotal: 3000 });
  });

  it("reconstruye bloques de filas físicas compactadas y hereda sección", () => {
    const reglas: LecturaEstructurada = { version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Referencia:" }, maxFilas: 4 }, seccion: { condicion: { columna: 1, operador: "empieza", texto: "Tipo:" }, fuente: fuente({ tipo: "etiqueta", inicio: "Tipo:" }) }, campos: [
      { rol: "referencia", fuente: fuente({ tipo: "etiqueta", inicio: "Referencia:" }) },
      { rol: "cantidad", fuente: fuente({ tipo: "etiqueta", inicio: "Cantidad:" }, 2) },
      { rol: "valorUnitario", fuente: fuente({ tipo: "etiqueta", inicio: "Costo:" }, 3) },
    ] };
    const original = hoja([["Tipo: Materia prima"], ["Referencia: A-01"], ["Cantidad: 2"], ["Costo: 1000"]], { filasFisicas: [1, 2, 3, 5, 6], columnaInicial: 2 });
    const r = transformarModulo(INV, baseSpec(reglas), original);
    expect(r.erroresLectura).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ filaNum: 3, clasificador: "Materia prima", valor: 2000 });
    expect(r.trazasLectura?.[0].filasOrigen).toEqual([2, 3, 5, 6]);
    expect(r.trazasLectura?.[0].campos[1].fuentes[0]).toMatchObject({ fila: 5, columna: 3 });
  });

  it("lee tramos fijos y detecta cualquier texto no explicado", () => {
    const reglas: LecturaEstructurada = { version: 1, registro: { ancla: { columna: 1, operador: "no_vacia" }, maxFilas: 1 }, campos: [
      { rol: "referencia", fuente: fuente({ tipo: "posicion", inicio: 1, longitud: 4 }) },
      { rol: "tipo", fuente: fuente({ tipo: "posicion", inicio: 5, longitud: 2 }) },
      { rol: "valorTotal", fuente: fuente({ tipo: "posicion", inicio: 7, longitud: 4 }) },
    ] };
    expect(ejecutarLecturaEstructurada(hoja([["A001MP1200"]]), reglas, 2).errores).toEqual([]);
    expect(ejecutarLecturaEstructurada(hoja([["A001MP1200 OCULTO 999"]]), reglas, 2).errores.join(" ")).toContain("Contenido sin interpretar");
  });

  it("un tramo fijo no puede perder el signo o paréntesis del número", () => {
    const reglas: LecturaEstructurada = { version: 1, registro: { ancla: { columna: 1, operador: "no_vacia" }, maxFilas: 1 }, campos: [
      { rol: "referencia", fuente: fuente({ tipo: "posicion", inicio: 1, longitud: 4 }) },
      { rol: "tipo", fuente: fuente({ tipo: "posicion", inicio: 5, longitud: 2 }) },
      { rol: "valorTotal", fuente: fuente({ tipo: "posicion", inicio: 8, longitud: 4 }) },
    ] };
    expect(ejecutarLecturaEstructurada(hoja([["A001MP 1200"]]), reglas, 2).errores).toEqual([]);
    for (const dato of ["A001MP-1200", "A001MP(1200)", "A001MP 1200-"]) {
      expect(ejecutarLecturaEstructurada(hoja([[dato]]), reglas, 2).errores.join(" ")).toContain("signo numérico sin interpretar");
    }
  });

  it("no consume la fila del siguiente producto para completar un bloque truncado", () => {
    const reglas = structuredClone(etiquetas);
    reglas.registro.maxFilas = 2;
    reglas.campos.find((c) => c.rol === "valorTotal")!.fuente.desplazamientoFila = 1;
    const r = ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10"], ["Ref: B · Tipo: MP · Cant: 1 · Unit: 20 · Importe: 20"]]), reglas, 2);
    expect(r.errores.join(" ")).toMatch(/otro bloque/);
  });

  it("no pierde detalle anterior al inicio aunque se adelante también el encabezado", () => {
    const original = hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10"], ["Ref: B · Tipo: MP · Cant: 1 · Unit: 20 · Importe: 20"]]);
    expect(ejecutarLecturaEstructurada(original, etiquetas, 3).errores.join(" ")).toContain("fila 2 anterior");
    const sinRotulo = { ...etiquetas, registro: { ancla: { columna: 1, operador: "no_vacia" as const }, maxFilas: 1 } };
    expect(ejecutarLecturaEstructurada(original, sinRotulo, 3).errores.join(" ")).toContain("fila 2 anterior");
    expect(ejecutarLecturaEstructurada(original, sinRotulo, 2).errores).toEqual([]);
  });

  it("no concatena cifras de una selección mixta y solo admite unidades conocidas", () => {
    const mezcladas = structuredClone(etiquetas);
    mezcladas.campos = [{ rol: "valorTotal", fuente: fuente({ tipo: "completa" }) }];
    expect(ejecutarLecturaEstructurada(hoja([["Ref: A12 · Cant: 2 · Total: 20"]]), mezcladas, 2).errores.join(" ")).toContain("texto mezclado");
    const original = hoja([["Ref: A · Tipo: MP · Cant: 2 kg · Unit: COP 1.200,50 · Importe: $ 2.401,00"]]);
    const resultado = transformarModulo(INV, baseSpec(etiquetas), original);
    expect(resultado.erroresLectura).toEqual([]);
    expect(resultado.filas[0].datos).toMatchObject({ cantidad: 2, valorUnitario: 1200.5, valorTotal: 2401 });
    expect(ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 2 · Unit: 10 · Importe: 20"], ["Total: 20 Referencias: 1"]]), etiquetas, 2).errores.join(" ")).toContain("total de la fila 3");
    for (const total of ["Total: no disponible", "Total:"]) {
      expect(ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 2 · Unit: 10 · Importe: 20"], [total]]), etiquetas, 2).errores.join(" ")).toContain("total declarado en la fila 3");
    }
  });

  it("no descarta un renglón imprevisto entre registros ni una columna auxiliar sin decisión", () => {
    const r = ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10", 200], ["Ajuste extraño por 50"]]), etiquetas, 2);
    expect(r.errores.join(" ")).toContain("columna 2");
    expect(r.errores.join(" ")).toContain("fila 3");
    const declaradas = { ...etiquetas, ignorarColumnas: [{ columna: 2, motivo: "Código de bodega informativo" }], ignorarFilas: [{ condicion: { columna: 1, operador: "igual" as const, texto: "Fin del informe" }, motivo: "Pie fijo del reporte sin movimientos" }] };
    const explicada = ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10", 200], ["Fin del informe"]]), declaradas, 2);
    expect(explicada.errores).toEqual([]);
    expect(explicada.advertencias).toHaveLength(2);
  });

  it("bloquea etiquetas repetidas, fuentes solapadas y reglas que intentan omitir todo", () => {
    const repetida = ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10 Importe: 20"]]), etiquetas, 2);
    expect(repetida.errores.join(" ")).toContain("aparece varias veces");
    const solapadas = structuredClone(etiquetas);
    solapadas.campos[2].fuente = solapadas.campos[4].fuente;
    expect(ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10"]]), solapadas, 2).errores.join(" ")).toContain("mismo tramo");
    expect(LecturaEstructuradaSchema.safeParse({ ...etiquetas, ignorarFilas: [{ condicion: { columna: 1, operador: "no_vacia" }, motivo: "Omitir todo indiscriminadamente" }] }).success).toBe(false);
    expect(LecturaEstructuradaSchema.safeParse({ ...etiquetas, codigo: "return 2000" }).success).toBe(false);
    expect(LecturaEstructuradaSchema.safeParse({ ...etiquetas, registro: { ...etiquetas.registro, maxFilas: 100000 } }).success).toBe(false);
  });

  it("canoniza sin alterar ni guardar la grilla original y preserva gramática en el patrón", () => {
    const original = hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10"]]);
    const antes = structuredClone(original);
    const spec = baseSpec(etiquetas);
    const preparada = prepararSpecLecturaEstructurada(spec, original);
    expect(preparada.spec).not.toHaveProperty("lecturaEstructurada");
    expect(preparada.spec).toMatchObject({ filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, referencia: 2, cantidad: 4, valorTotal: 6 } });
    expect(original).toEqual(antes);
    expect(SpecModuloSchema.parse(spec).lecturaEstructurada).toEqual(etiquetas);
    expect(normalizarSpecModulo(INV, spec).lecturaEstructurada).toEqual(etiquetas);
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, spec))).toBeNull();
    expect(normalizarSpecModulo(MODULOS_IMPORT.AFI, spec)).not.toHaveProperty("lecturaEstructurada");
  });

  it("conserva el arrastre elegido y la celda que aporta el tipo del registro", () => {
    const reglas: LecturaEstructurada = { version: 1, registro: { ancla: { columna: 2, operador: "empieza", texto: "Item:" }, maxFilas: 1 }, campos: [
      { rol: "tipo", fuente: fuente({ tipo: "completa" }) },
      { rol: "referencia", fuente: fuente({ tipo: "etiqueta", inicio: "Item:", fin: "Costo:" }, 0, 2) },
      { rol: "valorTotal", fuente: fuente({ tipo: "etiqueta", inicio: "Costo:" }, 0, 2) },
    ] };
    const r = transformarModulo(INV, { ...baseSpec(reglas), clasificadorModo: "arrastrar" }, hoja([["MP", "Item:A|Costo:100"], [null, "Item:B|Costo:200"]]));
    expect(r.erroresLectura).toEqual([]);
    expect(r.filas.map((f) => f.clasificador)).toEqual(["MP", "MP"]);
    expect(r.trazasLectura?.[1].campos.find((c) => c.rol === "tipo")?.fuentes).toEqual(expect.arrayContaining([expect.objectContaining({ fila: 2, columna: 1, texto: "MP" })]));
  });

  it("un patrón de una sola columna se encuentra y se traslada a otra columna", () => {
    const spec = baseSpec(etiquetas);
    const version: VersionCandidata = { id: 10, version: 1, estado: "validada_cliente", clienteOrigenId: 1, hoja: "INV", filaEncabezado: 1, primeraFilaDatos: 2, encabezado: ["Datos de inventario"], spec };
    const original = hoja([[null, "Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10"]]);
    original.filas[0] = [null, "Datos de inventario"];
    const ubicacion = mejorVersion(INV, [original], [version]);
    expect(ubicacion?.coincidencia.elegible).toBe(true);
    const aplicada = aplicarPatronASpec(INV, ubicacion!, original);
    expect(aplicada.spec.lecturaEstructurada?.registro.ancla.columna).toBe(2);
    expect(aplicada.spec.lecturaEstructurada?.campos.every((c) => c.fuente.columna === 2)).toBe(true);
    expect(transformarModulo(INV, aplicada.spec, original).erroresLectura).toEqual([]);
    expect(mejorVersion(INV, [hoja([["MP"]])], [{ ...version, spec: { ...spec, lecturaEstructurada: undefined } }])).toBeNull();
  });

  it("no reutiliza un patrón al faltar cualquier fuente aunque coincidan otras columnas", () => {
    const reglas = { ...etiquetas, seccion: { condicion: { columna: 2, operador: "empieza" as const, texto: "Seccion:" }, fuente: fuente({ tipo: "etiqueta", inicio: "Seccion:" }, 0, 2) } };
    expect(trasladarLecturaEstructurada(reglas, { 1: 3 })).toBeNull();
    const coincidencia = coincidenciaPatron(INV, { encabezado: ["Datos", "Bloque", "Extra1", "Extra2", "Extra3", "Extra4", "Extra5", "Extra6"], spec: baseSpec(reglas) }, ["Datos", "Extra1", "Extra2", "Extra3", "Extra4", "Extra5", "Extra6"]);
    expect(coincidencia.faltantesRequeridos.join(" ")).toContain("Bloque");
    expect(coincidencia.elegible).toBe(false);
  });

  it("aplicarSelector ubica el tramo de cada forma con la misma semántica del motor", () => {
    const texto = "Ref: A-01 | Cant: 2 | Total: 20";
    expect(aplicarSelector(texto, { tipo: "etiqueta", inicio: "ref:", fin: "|" })).toMatchObject({ ok: true, valor: "A-01", inicioCobertura: 0 });
    expect(aplicarSelector(texto, { tipo: "separador", separador: "|", indice: 3 })).toMatchObject({ ok: true, valor: "Total: 20" });
    expect(aplicarSelector(texto, { tipo: "separador", separador: "|", indice: 9 })).toEqual({ ok: false, motivo: "segmento" });
    expect(aplicarSelector(texto, { tipo: "etiqueta", inicio: "Bodega:" })).toEqual({ ok: false, motivo: "etiqueta" });
    expect(aplicarSelector(texto, { tipo: "posicion", inicio: 6, longitud: 4 })).toMatchObject({ ok: true, valor: "A-01" });
    expect(aplicarSelector(texto, { tipo: "posicion", inicio: 40, longitud: 4 })).toEqual({ ok: false, motivo: "tramo" });
  });

  it("ubica cada problema en su fila y columna física para señalarlo en la grilla", () => {
    const r = ejecutarLecturaEstructurada(hoja([["Ref: A · Tipo: MP · Cant: 1 · Unit: 10 · Importe: 10", 200], ["Ajuste extraño por 50"]], { columnaInicial: 1 }), etiquetas, 2);
    expect(r.incidencias).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 2, columna: 3, tipo: "sin_interpretar" }),
      expect.objectContaining({ fila: 3, columna: 2, tipo: "sin_interpretar" }),
    ]));
    expect(r.incidencias.every((i) => r.errores.includes(i.mensaje))).toBe(true);
  });
});
