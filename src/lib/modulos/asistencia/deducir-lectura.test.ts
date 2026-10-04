import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "../descriptores";
import { transformarModulo } from "../extraccion/transformar";
import { validarSpecModulo } from "../perfil-modulo";
import { deducirLectura } from "./deducir-lectura";
import { modeloDesdeLectura } from "./modelo-sugerido";
import { modeloVacio, type ModeloUsuarioInventario } from "./modelo-usuario";
import { validarLecturaInventario } from "./validar";
import { verificarEjemplos } from "./verificar-ejemplos";

const INV = MODULOS_IMPORT.INV;
async function hojasDe(nombre: string): Promise<GridHoja[]> {
  const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
  const ingesta = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
  if (ingesta.modo !== "tabular") throw new Error("Fixture inválido");
  return ingesta.hojas;
}
/** Tramo [inicio, fin) del texto `buscado` dentro de la celda. */
function tramo(texto: string, buscado: string, desde = 0) {
  const inicio = texto.indexOf(buscado, desde);
  if (inicio < 0) throw new Error(`«${buscado}» no está en «${texto}»`);
  return { inicio, fin: inicio + buscado.length };
}
const modelo = (hoja: string, cambios: Partial<ModeloUsuarioInventario>): ModeloUsuarioInventario => ({ ...modeloVacio(hoja), ...cambios });

describe("lectura por ejemplo: aceptación con las muestras ficticias SIESA", () => {
  it("04 · campos en una celda: un producto armado basta y lee el archivo completo sin IA", async () => {
    const hojas = await hojasDe("04_siesa_campos_en_una_celda_2026-09.xlsx");
    const hoja = hojas[0];
    const t = String(hoja.filas[1][0]);
    const total = String(hoja.filas.at(-1)![0]);
    const m = modelo(hoja.nombre, {
      productos: [{ asignaciones: [
        { rol: "referencia", fila: 2, columna: 1, ...tramo(t, "MP-001") },
        { rol: "descripcion", fila: 2, columna: 1, ...tramo(t, "Lámina de acero de prueba") },
        { rol: "tipo", fila: 2, columna: 1, ...tramo(t, "Materias primas") },
        { rol: "cantidad", fila: 2, columna: 1, ...tramo(t, "120") },
        { rol: "valorUnitario", fila: 2, columna: 1, ...tramo(t, "2500") },
        { rol: "valorTotal", fila: 2, columna: 1, ...tramo(t, "300000") },
      ] }],
      totales: [{ fila: hoja.filasFisicas?.at(-1) ?? hoja.filas.length, columna: 1, tipo: "general", ...tramo(total, "19140500") }],
    });
    const r = deducirLectura(hojas, m);
    expect(r.errores).toEqual([]);
    expect(r.dudas.filter((d) => d.bloqueante)).toEqual([]);
    expect(r.diferencias).toEqual([]);
    expect(r.modo).toBe("estructurada");
    expect(r.spec?.lecturaEstructurada?.registro.ancla).toMatchObject({ operador: "empieza", texto: "Ref:" });
    expect(validarSpecModulo(INV, r.spec!)).toBeNull();
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(lectura.errores).toEqual([]);
    expect(lectura.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, totalDeclarado: 19_140_500, diferencia: 0 });
    // Una regla deducida también se confirma: los ejemplos que muestra son otros productos.
    expect(lectura.preguntas.map((p) => p.id)).toEqual(["confirmar_lectura_estructurada"]);
  });

  it("04 · el producto de ejemplo puede ser uno del medio: los anteriores no quedan fuera", async () => {
    const hojas = await hojasDe("04_siesa_campos_en_una_celda_2026-09.xlsx");
    const hoja = hojas[0];
    const fila = 10;
    const t = String(hoja.filas[hoja.filasFisicas?.indexOf(fila) ?? fila - 1][0]);
    const total = String(hoja.filas.at(-1)![0]);
    const valor = (rotulo: string) => t.split(rotulo)[1].split("|")[0].trim();
    const r = deducirLectura(hojas, modelo(hoja.nombre, {
      productos: [{ asignaciones: [
        { rol: "referencia", fila, columna: 1, ...tramo(t, valor("Ref:")) },
        { rol: "tipo", fila, columna: 1, ...tramo(t, valor("Tipo:")) },
        { rol: "valorTotal", fila, columna: 1, ...tramo(t, valor("Total:"), t.indexOf("Total:")) },
      ] }],
      totales: [{ fila: hoja.filasFisicas?.at(-1) ?? hoja.filas.length, columna: 1, tipo: "general", ...tramo(total, "19140500") }],
    }));
    expect(r.errores).toEqual([]);
    expect(r.spec?.primeraFilaDatos).toBe(2);
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    // Sin marcar descripción, cantidad ni unitario, esos textos quedan sin interpretar: la lectura lo dice.
    expect(lectura.errores.join(" ")).toContain("Contenido sin interpretar");
  });

  it("05 · producto en varias filas: un producto + el título de sección + el total", async () => {
    const hojas = await hojasDe("05_siesa_producto_en_varias_filas_2026-09.xlsx");
    const hoja = hojas[0];
    const celda = (fila: number) => String(hoja.filas[hoja.filasFisicas!.indexOf(fila)][0]);
    const ultima = hoja.filasFisicas!.at(-1)!;
    const m = modelo(hoja.nombre, {
      productos: [{ asignaciones: [
        { rol: "referencia", fila: 3, columna: 1, ...tramo(celda(3), "MP-001") },
        { rol: "descripcion", fila: 4, columna: 1, ...tramo(celda(4), "Lámina de acero de prueba") },
        { rol: "cantidad", fila: 5, columna: 1, ...tramo(celda(5), "120") },
        { rol: "valorUnitario", fila: 6, columna: 1, ...tramo(celda(6), "2500") },
        { rol: "valorTotal", fila: 6, columna: 1, ...tramo(celda(6), "300000") },
      ] }],
      secciones: [{ fila: 2, columna: 1, ...tramo(celda(2), "Materias primas") }],
      totales: [{ fila: ultima, columna: 1, tipo: "general", ...tramo(celda(ultima), "19140500") }],
      ignorarFilas: [{ fila: 1, motivo: "Título del informe sin datos" }],
    });
    const r = deducirLectura(hojas, m);
    expect(r.errores).toEqual([]);
    expect(r.diferencias).toEqual([]);
    const reglas = r.spec!.lecturaEstructurada!;
    expect(reglas.registro).toMatchObject({ ancla: { operador: "empieza", texto: "Ref:" }, maxFilas: 4 });
    expect(reglas.seccion?.condicion).toMatchObject({ operador: "empieza", texto: "TIPO DE INVENTARIO:" });
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(lectura.errores).toEqual([]);
    expect(lectura.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, totalDeclarado: 19_140_500, diferencia: 0 });
    const movimientos = transformarModulo(INV, r.spec!, hoja).filas.filter((f) => f.tipoFila === "movimiento");
    expect(new Set(movimientos.map((f) => f.clasificador)).size).toBe(3);
  });

  it("01 · tabular: arrastrar columnas produce un mapeo por columnas que lee la muestra", async () => {
    const hojas = await hojasDe("01_siesa_base_2026-09.xlsx");
    const hoja = hojas[0];
    // C «Tipo inventario», F «Referencia», K «Costo prom. tot. (ins)»; títulos en la fila 1.
    const m = modelo(hoja.nombre, {
      productos: [],
      columnas: [
        { rol: "tipo", columna: 3, filaTitulos: 1 },
        { rol: "referencia", columna: 6, filaTitulos: 1 },
        { rol: "valorTotal", columna: 11, filaTitulos: 1 },
      ],
    });
    const r = deducirLectura(hojas, m);
    expect(r.errores).toEqual([]);
    expect(r.modo).toBe("tabular");
    expect(r.spec?.lecturaEstructurada).toBeUndefined();
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(lectura.estructuraValida).toBe(true);
    expect(lectura.resumen.filasIncluidas).toBeGreaterThan(0);
  });
});

describe("lectura por ejemplo: precarga desde lo que ya se entendió", () => {
  it.each(["04_siesa_campos_en_una_celda_2026-09", "05_siesa_producto_en_varias_filas_2026-09"])("%s: la precarga de la lectura de la IA se reprocesa igual sin IA", async (base) => {
    const hojas = await hojasDe(`${base}.xlsx`);
    const { primera } = JSON.parse(await readFile(`outputs/pruebas-inventario-siesa/${base}.ia-real.json`, "utf8"));
    const original = validarLecturaInventario({ hojas, spec: primera.spec, origen: "ia" });
    expect(original.modeloSugerido).toBeDefined();
    const r = deducirLectura(hojas, original.modeloSugerido);
    expect(r.errores).toEqual([]);
    expect(r.diferencias).toEqual([]);
    const relectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(relectura.errores).toEqual([]);
    expect(relectura.resumen).toEqual(original.resumen);
  });

  it("una lectura por columnas se precarga como columnas enteras", async () => {
    const hojas = await hojasDe("01_siesa_base_2026-09.xlsx");
    const spec = { hoja: hojas[0].nombre, filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 3, referencia: 6, valorTotal: 11 } };
    const m = modeloDesdeLectura(hojas[0], spec, []);
    expect(m?.columnas).toEqual([{ rol: "tipo", columna: 3, filaTitulos: 1 }, { rol: "referencia", columna: 6, filaTitulos: 1 }, { rol: "valorTotal", columna: 11, filaTitulos: 1 }]);
  });
});

const hojaMemoria = (filas: GridHoja["filas"], extras: Partial<GridHoja> = {}): GridHoja[] => [{ nombre: "INV", filas: [["Inventario de prueba"], ...filas], ...extras }];

describe("lectura por ejemplo: reglas deducidas", () => {
  it("separa por delimitador sin rótulos y elige la forma que generaliza a toda la hoja", () => {
    const hojas = hojaMemoria([["A-01|MP|2|1200|2400"], ["B-22|PT|3|100|300"], ["C-333|MP|1|50|50"]]);
    const t = "A-01|MP|2|1200|2400";
    const r = deducirLectura(hojas, modelo("INV", { productos: [{ asignaciones: [
      { rol: "referencia", fila: 2, columna: 1, ...tramo(t, "A-01") },
      { rol: "tipo", fila: 2, columna: 1, ...tramo(t, "MP") },
      { rol: "cantidad", fila: 2, columna: 1, ...tramo(t, "2") },
      { rol: "valorUnitario", fila: 2, columna: 1, ...tramo(t, "1200") },
      { rol: "valorTotal", fila: 2, columna: 1, ...tramo(t, "2400") },
    ] }] }));
    expect(r.errores).toEqual([]);
    expect(r.spec?.lecturaEstructurada?.campos.map((c) => c.fuente.selector)).toEqual([
      { tipo: "separador", separador: "|", indice: 2 },
      { tipo: "separador", separador: "|", indice: 1 },
      { tipo: "separador", separador: "|", indice: 3 },
      { tipo: "separador", separador: "|", indice: 4 },
      { tipo: "separador", separador: "|", indice: 5 },
    ]);
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(lectura.errores).toEqual([]);
    expect(lectura.resumen).toMatchObject({ filasIncluidas: 3, valorLeido: 2750 });
  });

  it("respeta columnas físicas desplazadas y filas vacías compactadas", () => {
    // La grilla arranca en C (columnaInicial 2) y las filas físicas 4 y 8 están vacías: el
    // desplazamiento es de filas FÍSICAS, así que el total queda 3 filas debajo en ambos productos.
    const hojas = hojaMemoria([["Ref: A1"], ["Cant: 2"], ["Total: 20"], ["Ref: B2"], ["Cant: 3"], ["Total: 30"]], { columnaInicial: 2, filasFisicas: [1, 2, 3, 5, 6, 7, 9] });
    const r = deducirLectura(hojas, modelo("INV", { tipoUnico: true, productos: [{ asignaciones: [
      { rol: "referencia", fila: 2, columna: 3, ...tramo("Ref: A1", "A1") },
      { rol: "cantidad", fila: 3, columna: 3, ...tramo("Cant: 2", "2") },
      { rol: "valorTotal", fila: 5, columna: 3, ...tramo("Total: 20", "20") },
    ] }] }));
    expect(r.errores).toEqual([]);
    const reglas = r.spec!.lecturaEstructurada!;
    expect(reglas.registro.maxFilas).toBe(4);
    expect(reglas.campos.find((c) => c.rol === "valorTotal")?.fuente).toMatchObject({ columna: 1, desplazamientoFila: 3 });
    expect(r.spec?.clasificadorModo).toBe("global");
    const lectura = validarLecturaInventario({ hojas, spec: r.spec!, origen: "manual" });
    expect(lectura.errores).toEqual([]);
    expect(lectura.resumen).toMatchObject({ filasIncluidas: 2, valorLeido: 50 });
  });

  it("explica una posición incoherente entre dos productos de ejemplo", () => {
    const hojas = hojaMemoria([["Ref: A", "MP", 10], ["Ref: B", 10, "MP"]]);
    const r = deducirLectura(hojas, modelo("INV", { productos: [
      { asignaciones: [{ rol: "referencia", fila: 2, columna: 1, ...tramo("Ref: A", "A") }, { rol: "tipo", fila: 2, columna: 2 }, { rol: "valorTotal", fila: 2, columna: 3 }] },
      { asignaciones: [{ rol: "referencia", fila: 3, columna: 1, ...tramo("Ref: B", "B") }, { rol: "tipo", fila: 3, columna: 3 }, { rol: "valorTotal", fila: 3, columna: 2 }] },
    ] }));
    expect(r.spec).toBeNull();
    expect(r.errores.join(" ")).toContain("la misma columna en todos");
  });

  it("rechaza la misma celda entera en varios campos y coordenadas que no existen", () => {
    const hojas = hojaMemoria([["Ref: A · Tipo: MP · Total: 10"]]);
    const misma = deducirLectura(hojas, modelo("INV", { productos: [{ asignaciones: [{ rol: "referencia", fila: 2, columna: 1 }, { rol: "valorTotal", fila: 2, columna: 1 }] }] }));
    expect(misma.errores.join(" ")).toContain("selecciona el pedazo de cada campo");
    const fuera = deducirLectura(hojas, modelo("INV", { tipoUnico: true, productos: [{ asignaciones: [{ rol: "valorTotal", fila: 99, columna: 1 }] }] }));
    expect(fuera.errores.join(" ")).toContain("vacía");
    const tramoFalso = deducirLectura(hojas, modelo("INV", { tipoUnico: true, productos: [{ asignaciones: [{ rol: "valorTotal", fila: 2, columna: 1, inicio: 0, fin: 999 }] }] }));
    expect(tramoFalso.errores.join(" ")).toContain("ya no coincide");
  });

  it("exige decidir de dónde sale el tipo", () => {
    const hojas = hojaMemoria([["Ref: A · Total: 10"]]);
    const r = deducirLectura(hojas, modelo("INV", { productos: [{ asignaciones: [{ rol: "valorTotal", fila: 2, columna: 1, ...tramo("Ref: A · Total: 10", "10") }] }] }));
    expect(r.errores.join(" ")).toContain("Tipo de inventario");
  });

  it("deja duda bloqueante cuando el inicio del producto no se distingue con un texto fijo", () => {
    // Todas las filas del bloque tienen contenido en la misma columna y sin rótulo común.
    const hojas = hojaMemoria([["A1"], ["2"], ["B2"], ["3"]]);
    const r = deducirLectura(hojas, modelo("INV", { tipoUnico: true, productos: [{ asignaciones: [
      { rol: "referencia", fila: 2, columna: 1 }, { rol: "valorTotal", fila: 3, columna: 1 },
    ] }] }));
    expect(r.spec).toBeNull();
    expect(r.dudas).toEqual([expect.objectContaining({ tipo: "ancla", bloqueante: true })]);
  });

  it("la verificación rechaza una regla que no reproduce lo marcado", () => {
    const hojas = hojaMemoria([["Ref: A-01 X · Total: 10"]]);
    const r = deducirLectura(hojas, modelo("INV", { tipoUnico: true, productos: [{ asignaciones: [
      { rol: "referencia", fila: 2, columna: 1, ...tramo("Ref: A-01 X · Total: 10", "A-01 X") },
      { rol: "valorTotal", fila: 2, columna: 1, ...tramo("Ref: A-01 X · Total: 10", "10") },
    ] }] }));
    expect(r.diferencias).toEqual([]);
    const otra = structuredClone(r.spec!);
    otra.lecturaEstructurada!.campos[0].fuente.selector = { tipo: "posicion", inicio: 6, longitud: 4 };
    expect(verificarEjemplos(hojas[0], otra, r.ejemplos).diferencias.join(" ")).toContain("tú marcaste «A-01 X»");
  });
});
