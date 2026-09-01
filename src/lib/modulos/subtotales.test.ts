import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import {
  MINIMO_FILAS_BLOQUE,
  bloqueDeSubtotal,
  coincideMarcaSubtotal,
  columnasDetalle,
  controlSubtotales,
  detectarColaControl,
  MAX_FILAS_COLA_CONTROL,
  detectarSubtotales,
  estadoGeneralControlSubtotales,
  esRotuloTotal,
  motivoDe,
  type FilaCandidata,
} from "./subtotales";

const INV = MODULOS_IMPORT.INV;
const CAR = MODULOS_IMPORT.CAR;

type Parcial = Partial<FilaCandidata> & { valor: number };
let n = 0;
const fila = (p: Parcial): FilaCandidata => ({
  filaNum: ++n,
  clasificador: p.clasificador ?? null,
  valor: p.valor,
  datos: p.datos ?? {},
  tipoFila: p.tipoFila ?? "movimiento",
  omitida: p.omitida ?? null,
  negrita: p.negrita,
  rotuloClasificador: p.rotuloClasificador,
  motivo: p.motivo,
  marcaManual: p.marcaManual,
  marcaManualExacta: p.marcaManualExacta,
});
const item = (tipo: string, ref: string, valor: number, extra: Partial<FilaCandidata> = {}) =>
  fila({ clasificador: tipo, valor, datos: { tipo, referencia: ref, descripcion: `Ítem ${ref}` }, ...extra });
const sub = (tipo: string | null, valor: number, texto: string | null, extra: Partial<FilaCandidata> = {}) =>
  fila({ clasificador: tipo, valor, datos: { tipo, referencia: null, descripcion: texto }, rotuloClasificador: texto ?? tipo, ...extra });

const reset = () => { n = 0; };

describe("esRotuloTotal / columnasDetalle", () => {
  it("reconoce total, subtotal, gran total y totales", () => {
    for (const s of ["Total", "TOTAL Materia prima", "Subtotal", "Sub-total", "Gran total", "Totales"]) expect(esRotuloTotal(s)).toBe(true);
    expect(esRotuloTotal("Totalizador X")).toBe(false);
    expect(esRotuloTotal("Tornillo total")).toBe(false);
  });
  it("las columnas de detalle son los textos que no son el clasificador ni su alterno, y solo las mapeadas si hay spec", () => {
    expect(columnasDetalle(INV)).toEqual(["referencia", "descripcion"]);
    expect(columnasDetalle(CAR)).toEqual(["documento", "tercero"]);
    expect(columnasDetalle(MODULOS_IMPORT.NOM)).toEqual(["cedula", "empleado", "area"]);
    expect(columnasDetalle(INV, { columnas: { referencia: 2, descripcion: 0 } })).toEqual(["referencia"]);
  });
});

describe("detectarSubtotales", () => {
  it("subtotales ROTULADOS por grupo → subtotal con su grupo y bloque que cuadra", () => {
    reset();
    const filas = [
      item("Materia prima", "R1", 100), item("Materia prima", "R2", 200), sub("Materia prima", 300, "Total Materia prima"),
      item("Producto terminado", "R3", 50), item("Producto terminado", "R4", 70), sub("Producto terminado", 120, "Total Producto terminado"),
    ];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => [d.filaNum, d.clase, d.grupo])).toEqual([[3, "subtotal", "Materia prima"], [6, "subtotal", "Producto terminado"]]);
    expect(det[0].senales).toEqual(["rotulo", "aritmetica"]); // la descripción trae el rótulo, así que no está «sin detalle»
    expect(det[0].bloque).toMatchObject({ desde: 1, hasta: 2, suma: 300, direccion: "arriba" });
    expect(motivoDe(det[0])).toBe("subtotal:rotulo,aritmetica");
  });

  it("SIN rótulo: aritmética + fila sin referencia → subtotal (modo auto)", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 250), sub("A", 350, null), item("B", "R3", 10), item("B", "R4", 20), sub("B", 30, null)];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => d.filaNum)).toEqual([3, 6]);
    expect(det[0].senales).toEqual(["sin_detalle", "aritmetica"]);
    // en modo "rotulo" no se marca
    expect(detectarSubtotales(filas, INV, { modo: "rotulo" })).toEqual([]);
  });

  it("aritmética con referencia y sin negrita → NO es subtotal (falso positivo evitado)", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 250), item("A", "R3", 350)];
    expect(detectarSubtotales(filas, INV)).toEqual([]);
  });

  it("primera fila de OTRO grupo que casualmente suma el bloque anterior → no es subtotal", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 250), fila({ clasificador: "B", valor: 350, datos: { tipo: "B", referencia: null, descripcion: null }, rotuloClasificador: "B" }), item("B", "R4", 20)];
    expect(detectarSubtotales(filas, INV)).toEqual([]);
  });

  it("archivo sin subtotales → nada", () => {
    reset();
    expect(detectarSubtotales([item("A", "R1", 1), item("A", "R2", 2), item("B", "R3", 3)], INV)).toEqual([]);
  });

  it("rotulado que NO cuadra sigue siendo subtotal (para reportar el descuadre)", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 200), sub("A", 999, "Total A")];
    const det = detectarSubtotales(filas, INV);
    expect(det).toHaveLength(1);
    expect(det[0].senales).not.toContain("aritmetica");
    expect(det[0].bloque?.suma).toBe(300);
  });

  it("summary-above: el subtotal precede al bloque", () => {
    reset();
    const filas = [sub("A", 300, null), item("A", "R1", 100), item("A", "R2", 200), sub("B", 30, null), item("B", "R3", 10), item("B", "R4", 20)];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => d.filaNum)).toEqual([1, 4]);
    expect(det[0].senales).toContain("aritmetica_arriba");
    expect(det[0].bloque?.direccion).toBe("abajo");
  });

  it("gran total + subtotales: los subtotales no suman y el gran total se clasifica aparte", () => {
    reset();
    const filas = [
      item("A", "R1", 100), item("A", "R2", 200), sub("A", 300, "Total A"),
      item("B", "R3", 10), item("B", "R4", 20), sub("B", 30, "Total B"),
      sub(null, 330, "Gran total"),
    ];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => [d.filaNum, d.clase])).toEqual([[3, "subtotal"], [6, "subtotal"], [7, "gran_total"]]);
  });

  it("gran total sin subtotales, rotulado «Total», en negrita", () => {
    reset();
    const filas = [item("A", "R1", 100), item("B", "R2", 200), item("C", "R3", 300), sub(null, 600, "Total", { negrita: true })];
    const det = detectarSubtotales(filas, INV);
    expect(det).toHaveLength(1);
    expect(det[0]).toMatchObject({ filaNum: 4, clase: "gran_total" });
  });

  it("CSV sin negrita: rótulo débil con referencia → movimiento; «Total» exacto → subtotal", () => {
    reset();
    const filas = [item("Lubricantes", "L-1", 100), item("Lubricantes", "L-2", 200), item("Lubricantes", "L-3", 50, { datos: { tipo: "Lubricantes", referencia: "L-3", descripcion: "Total lubricantes 20W50" } }), sub("Lubricantes", 350, "Total")];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => d.filaNum)).toEqual([4]);
  });

  it("modo «nunca» no marca nada aunque haya rótulo", () => {
    reset();
    expect(detectarSubtotales([item("A", "R1", 100), item("A", "R2", 200), sub("A", 300, "Total A")], INV, { modo: "nunca" })).toEqual([]);
  });

  it("tolerancias: 0,5 COP y 1 % cuadran; 2 % no", () => {
    const caso = (subtotal: number) => {
      reset();
      const filas = [item("A", "R1", 5000), item("A", "R2", 5000), sub("A", subtotal, null)];
      return detectarSubtotales(filas, INV).length;
    };
    expect(caso(10000.5)).toBe(1);
    expect(caso(10100)).toBe(1);
    expect(caso(10200)).toBe(0);
  });

  it("bloque de una sola fila sin rótulo → no es subtotal", () => {
    reset();
    expect(MINIMO_FILAS_BLOQUE).toBe(2);
    expect(detectarSubtotales([item("A", "R1", 100), sub("A", 100, null), item("B", "R2", 5), item("B", "R3", 6)], INV)).toEqual([]);
  });

  it("negrita + aritmética sin rótulo → subtotal (señal negrita)", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 200), item("A", "R9", 300, { negrita: true })];
    const det = detectarSubtotales(filas, INV);
    expect(det.map((d) => d.senales)).toEqual([["negrita", "aritmetica"]]);
  });

  it("Cartera: subtotal por tipo sin documento ni tercero", () => {
    reset();
    const car = (tipo: string, doc: string | null, saldo: number) => fila({ clasificador: tipo, valor: saldo, datos: { tipo, documento: doc, tercero: doc ? "Cliente X" : null, saldo } });
    const filas = [car("Clientes", "F-1", 100), car("Clientes", "F-2", 200), car("Clientes", null, 300), car("Anticipos", "F-3", 40), car("Anticipos", "F-4", 60), car("Anticipos", null, 100)];
    expect(detectarSubtotales(filas, CAR).map((d) => d.filaNum)).toEqual([3, 6]);
  });
});

describe("bloqueDeSubtotal", () => {
  it("salta agrupadoras y omitidas y corta al cambiar de clasificador", () => {
    reset();
    const filas = [item("Z", "R0", 999), item("A", "R1", 100), fila({ clasificador: "A", valor: 5, tipoFila: "agrupadora" }), item("A", "R2", 200, { omitida: true }), item("A", "R3", 200), sub("A", 300, null)];
    const b = bloqueDeSubtotal(filas, 5, () => false);
    expect(b).toMatchObject({ clasificador: "A", desde: 2, hasta: 5, suma: 300, direccion: "arriba" });
    expect(b?.indices).toEqual([1, 4]);
  });
});

describe("controlSubtotales", () => {
  const armar = () => {
    reset();
    return [
      item("A", "R1", 100), item("A", "R2", 200), sub("A", 300, "Total A", { tipoFila: "total" }),
      item("B", "R3", 10), item("B", "R4", 20), sub("B", 30, "Total B", { tipoFila: "total" }),
      sub(null, 330, "Gran total", { tipoFila: "total", motivo: "gran_total:rotulo,aritmetica" }),
    ];
  };

  it("todo cuadra: un grupo por subtotal y el gran total aparte", () => {
    const c = controlSubtotales(armar());
    expect(c.grupos.map((g) => [g.clasificador, g.sumaMovimientos, g.subtotalArchivo, g.diferencia, g.estado])).toEqual([
      ["A", 300, 300, 0, "cuadra"],
      ["B", 30, 30, 0, "cuadra"],
    ]);
    expect(c.grupos[0].bloque).toEqual({ desde: 1, hasta: 2, items: 2 });
    expect(c.granTotal).toMatchObject({ filaNum: 7, sumaMovimientos: 330, diferencia: 0, estado: "cuadra" });
    expect(c.descuadres).toBe(0);
  });

  it("omitir un ítem deja el grupo sin muestra suficiente y descuadra el gran total", () => {
    const filas = armar();
    filas[1] = { ...filas[1], omitida: true };
    const c = controlSubtotales(filas);
    expect(c.grupos[0]).toMatchObject({ sumaMovimientos: 100, subtotalArchivo: 300, diferencia: null, estado: "no_validado" });
    expect(c.granTotal).toMatchObject({ diferencia: 200, estado: "descuadre" });
    expect(c.descuadres).toBe(1);
    expect(c.noValidados).toBe(1);
  });

  it("rescatar un subtotal (pasa a movimiento) lo saca del control y descuadra al gran total", () => {
    const filas = armar();
    filas[2] = { ...filas[2], tipoFila: "movimiento" };
    const c = controlSubtotales(filas);
    expect(c.grupos.map((g) => g.clasificador)).toEqual(["B"]);
    expect(c.granTotal).toMatchObject({ sumaMovimientos: 630, estado: "descuadre" });
  });

  it("sin filas total → control vacío", () => {
    reset();
    const c = controlSubtotales([item("A", "R1", 1), item("A", "R2", 2)]);
    expect(c).toEqual({ grupos: [], granTotal: null, descuadres: 0, noValidados: 0 });
    expect(estadoGeneralControlSubtotales(c)).toBe("no_validado");
  });

  it("un solo grupo: el subtotal se reporta como grupo, no como gran total", () => {
    reset();
    const c = controlSubtotales([item("A", "R1", 1), item("A", "R2", 2), sub("A", 3, "Total A", { tipoFila: "total" })]);
    expect(c.grupos).toHaveLength(1);
    expect(c.granTotal).toBeNull();
    expect(estadoGeneralControlSubtotales(c)).toBe("coincide");
  });

  it("una fila total sin al menos 2 movimientos comparables queda NO VALIDADA, no descuadrada contra cero", () => {
    reset();
    const c = controlSubtotales([item("A", "R1", 100), sub("A", 100, "Total A", { tipoFila: "total" })]);
    expect(c.grupos[0]).toMatchObject({ estado: "no_validado", diferencia: null, sumaMovimientos: 100 });
    expect(c.descuadres).toBe(0);
    expect(c.noValidados).toBe(1);
    expect(estadoGeneralControlSubtotales(c)).toBe("no_validado");
  });

  it("prioriza NO COINCIDE si hay descuadres aunque otro control no esté validado", () => {
    const c = controlSubtotales(armar());
    c.grupos[0].estado = "no_validado";
    c.noValidados = 1;
    c.grupos[1].estado = "descuadre";
    c.descuadres = 1;
    expect(estadoGeneralControlSubtotales(c)).toBe("no_coincide");
  });
});

describe("control al peso y gran total con rótulo débil", () => {
  it("un subtotal inflado en 150.000 sobre 95 M acusa DESCUADRE aunque esté dentro del 1 %", () => {
    reset();
    const filas = [item("A", "R1", 50_000_000), item("A", "R2", 44_900_235), sub("A", 95_050_235, "Total A", { tipoFila: "total" })];
    const c = controlSubtotales(filas);
    expect(c.grupos[0]).toMatchObject({ diferencia: 150_000, estado: "descuadre" });
    // y 0,5 COP de redondeo sí cuadra
    filas[2] = { ...filas[2], valor: 94_900_235.5 };
    expect(controlSubtotales(filas).grupos[0].estado).toBe("cuadra");
  });

  it("«Total cartera» (rótulo débil) que suma todo el archivo es el gran total, sin grupo", () => {
    reset();
    const car = (tipo: string, doc: string | null, saldo: number) => fila({ clasificador: tipo, valor: saldo, datos: { tipo, documento: doc, tercero: doc ? "X" : null }, rotuloClasificador: tipo });
    const filas = [car("Clientes", "F-1", 100), car("Clientes", "F-2", 200), car("Clientes", null, 300), car("Anticipos", "F-3", 40), car("Anticipos", "F-4", 60), car("Anticipos", null, 100), car("Total cartera", null, 400)];
    const det = detectarSubtotales(filas, CAR);
    expect(det.map((d) => [d.filaNum, d.clase, d.grupo])).toEqual([[3, "subtotal", "Clientes"], [6, "subtotal", "Anticipos"], [7, "gran_total", null]]);
  });
});

describe("modo manual (columna marcadora)", () => {
  it("coincideMarcaSubtotal: sin texto basta un valor; con texto debe contenerlo (sin tildes ni mayúsculas)", () => {
    expect(coincideMarcaSubtotal("TOTAL")).toBe(true);
    expect(coincideMarcaSubtotal(123)).toBe(true);
    expect(coincideMarcaSubtotal("   ")).toBe(false);
    expect(coincideMarcaSubtotal(null)).toBe(false);
    expect(coincideMarcaSubtotal("Total Bodega 3", "total")).toBe(true);
    expect(coincideMarcaSubtotal("ACUMULADO", "Total")).toBe(false);
    expect(coincideMarcaSubtotal("Resúmen línea", "resumen")).toBe(true);
  });

  it("coincideMarcaSubtotal: una marca numérica localizada exige igualdad exacta", () => {
    expect(coincideMarcaSubtotal(1_200_978_578.51, "1200978578.51")).toBe(true);
    expect(coincideMarcaSubtotal(1_200_978_578.51, "1200978578")).toBe(false);
    expect(coincideMarcaSubtotal("1200978578.51", "1200978578.51")).toBe(true);
    expect(coincideMarcaSubtotal("1200978578.510", "1200978578.51")).toBe(false);
  });

  it("marca SOLO las filas señaladas por la columna y les calcula su bloque", () => {
    reset();
    const filas = [
      item("A", "R1", 100), item("A", "R2", 200), item("A", "X", 300, { marcaManual: true }),
      item("B", "R3", 50), item("B", "R4", 70), item("B", "X", 120, { marcaManual: true }),
    ];
    const det = detectarSubtotales(filas, INV, { modo: "manual" });
    expect(det.map((d) => [d.filaNum, d.clase, d.grupo])).toEqual([[3, "subtotal", "A"], [6, "subtotal", "B"]]);
    expect(det[0].senales[0]).toBe("marca_manual");
    expect(det[0].bloque?.suma).toBe(300);
    expect(motivoDe(det[0])).toContain("subtotal:marca_manual");
  });

  it("ninguna heurística agrega filas: un «Total A» sin marca NO es subtotal", () => {
    reset();
    const filas = [item("A", "R1", 100), item("A", "R2", 200), sub("A", 300, "Total A")];
    expect(detectarSubtotales(filas, INV, { modo: "manual" })).toEqual([]);
    expect(detectarSubtotales(filas, INV, { modo: "auto" })).toHaveLength(1);
  });

  it("una fila marcada que vale el archivo entero y no cuadra con un bloque parcial es el gran total", () => {
    reset();
    const filas = [
      item("A", "R1", 100), item("A", "R2", 200), item("A", "X", 300, { marcaManual: true }),
      item("B", "R3", 50), item("B", "R4", 70), item("B", "X", 120, { marcaManual: true }),
      item("", "X", 420, { marcaManual: true }),
    ];
    const det = detectarSubtotales(filas, INV, { modo: "manual" });
    expect(det.map((d) => [d.filaNum, d.clase])).toEqual([[3, "subtotal"], [6, "subtotal"], [7, "gran_total"]]);
  });

  it("la coordenada exacta es el único gran total aunque el mismo valor aparezca antes", () => {
    reset();
    const filas = [
      item("A", "R1", 100),
      item("A", "R2", 200),
      item("A", "CONTROL", 300, { marcaManual: false }),
      item("", "", 300, { marcaManual: true, marcaManualExacta: true }),
    ];

    const det = detectarSubtotales(filas, INV, { modo: "manual" });

    expect(det.map((d) => [d.filaNum, d.clase])).toEqual([[4, "gran_total"]]);
    expect(det[0].senales).toEqual(["marca_manual"]);
  });

  it("no excluye el sufijo si después del total exacto aparece detalle real", () => {
    reset();
    const filas = [
      item("A", "R1", 100),
      item("A", "R2", 200),
      item("", "", 300, { marcaManual: true, marcaManualExacta: true }),
      sub(null, -0.5, null),
      item("B", "R3", 50),
    ];

    const det = detectarSubtotales(filas, INV, { modo: "manual" });

    expect(det.map((d) => [d.filaNum, d.clase])).toEqual([[3, "gran_total"]]);
  });
});

// Cierre al pie SIN rótulos: el caso de los inventarios reales, que terminan con un cuadro
// de conciliación («SALDO INVENTARIO…», «BALANCE DEL INVENTARIO», «SALDO CONTABILIDAD» y sus
// diferencias). Ninguna fila dice «total» y las cifras son casi iguales entre sí, así que ni
// el rótulo ni la aritmética global las veían: entraban como ítems y multiplicaban el módulo.
describe("detectarColaControl · cierre sin rótulos al pie del archivo", () => {
  // Fila del cuadro de cierre: sin referencia ni descripción, el texto va en otra columna.
  const cierre = (valor: number, extra: Partial<FilaCandidata> = {}) =>
    fila({ clasificador: null, valor, datos: { tipo: null, referencia: null, descripcion: null }, ...extra });

  it("marca gran total la fila que vale la Σ del detalle y descarta el resto del cuadro", () => {
    reset();
    const filas = [
      item("A", "R1", 1_000), item("A", "R2", 2_000), item("B", "R3", 3_000),
      cierre(6_000),   // SALDO INVENTARIO = Σ del detalle
      cierre(6_000.5), // BALANCE DEL INVENTARIO (referencia del cliente)
      cierre(-0.5),    // la diferencia entre ambos
      cierre(5_999.9), // SALDO CONTABILIDAD
    ];
    const det = detectarSubtotales(filas, INV, { modo: "auto" });
    expect(det.map((d) => [d.filaNum, d.clase])).toEqual([[4, "gran_total"], [5, "cola_control"], [6, "cola_control"], [7, "cola_control"]]);
    expect(motivoDe(det[0])).toBe("gran_total:cola,sin_detalle,aritmetica");
  });

  it("cuadra el control contra la Σ de movimientos una vez el cuadro queda fuera", () => {
    reset();
    const filas: FilaCandidata[] = [
      item("A", "R1", 1_000), item("A", "R2", 2_000), item("B", "R3", 3_000),
      cierre(6_000, { tipoFila: "total", motivo: "gran_total:cola,sin_detalle,aritmetica" }),
      cierre(6_000.5, { tipoFila: "agrupadora" }),
      cierre(5_999.9, { tipoFila: "agrupadora" }),
    ];
    const ctl = controlSubtotales(filas);
    expect(ctl.granTotal).toMatchObject({ filaNum: 4, subtotalArchivo: 6_000, sumaMovimientos: 6_000, diferencia: 0, estado: "cuadra" });
    expect(ctl.grupos).toEqual([]);
    expect(estadoGeneralControlSubtotales(ctl)).toBe("coincide");
  });

  it("sin una fila que cuadre con el detalle no toca nada (podría ser detalle sin referencia)", () => {
    reset();
    const filas = [item("A", "R1", 1_000), item("A", "R2", 2_000), cierre(999), cierre(888)];
    expect(detectarColaControl(filas, columnasDetalle(INV))).toBeNull();
    expect(detectarSubtotales(filas, INV, { modo: "auto" })).toEqual([]);
  });

  it("el rótulo manda: si la fila que cuadra dice «Total general», la clasifica el rótulo", () => {
    reset();
    const filas = [
      item("A", "R1", 1_000), item("A", "R2", 2_000), item("B", "R3", 3_000),
      // Mismo cierre, pero esta vez el archivo SÍ rotula su total.
      fila({ clasificador: "Total general", valor: 6_000, datos: { tipo: "Total general", referencia: null, descripcion: null }, rotuloClasificador: "Total general" }),
      cierre(5_999.5), // cifra de referencia del cliente: igual queda descartada
    ];
    const det = detectarSubtotales(filas, INV, { modo: "auto" });
    const total = det.find((d) => d.filaNum === 4);
    expect(total?.clase).toBe("gran_total");
    expect(total?.senales).toContain("rotulo"); // por rótulo, no por la cola
    expect(det.find((d) => d.filaNum === 5)?.clase).toBe("cola_control");
  });

  it("solo actúa en modo «auto»: «rotulo» y «manual» conservan su promesa", () => {
    reset();
    const filas = [item("A", "R1", 1_000), item("A", "R2", 2_000), cierre(3_000), cierre(2_999)];
    expect(detectarSubtotales(filas, INV, { modo: "rotulo" })).toEqual([]);
    expect(detectarSubtotales(filas, INV, { modo: "manual" })).toEqual([]);
    expect(detectarSubtotales(filas, INV, { modo: "auto" })).toHaveLength(2);
  });

  it("no se come el archivo: una cola más larga que el tope no es un cierre", () => {
    reset();
    const detalle = [item("A", "R1", 1_000), item("A", "R2", 2_000)];
    const colaLarga = Array.from({ length: MAX_FILAS_COLA_CONTROL + 1 }, (_, i) => cierre(i === 0 ? 3_000 : 10 + i));
    expect(detectarColaControl([...detalle, ...colaLarga], columnasDetalle(INV))).toBeNull();
  });
});
