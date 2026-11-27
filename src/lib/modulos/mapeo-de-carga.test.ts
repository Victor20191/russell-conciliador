import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import { transformarModulo, type FilaModulo } from "./extraccion/transformar";
import { celdaDeTexto, mapeoDeCarga, preguntasCargaDeModulo, respuestasCargaDeFormulario, type RespuestasCarga } from "./mapeo-de-carga";
import { revisarMapeoMuestra } from "./patrones/revision-mapeo";
import { normalizarSpecModulo, normalizarSpecModuloArchivo } from "./perfil-modulo";
import { camposRespuestasPrueba, RESPUESTAS_PRUEBA_INICIALES } from "./respuestas-carga-prueba";

const CAR = descriptorModulo("CAR")!;
const INV = descriptorModulo("INV")!;
const NOM = descriptorModulo("NOM")!;
const ING = descriptorModulo("ING")!;
const AFI = descriptorModulo("AFI")!;

const hoja = (nombre: string, filas: CeldaCruda[][], columnaInicial?: number): GridHoja =>
  ({ nombre, filas, ...(columnaInicial ? { columnaInicial } : {}) });

const resumen = (filas: readonly FilaModulo[]) =>
  filas.map((f) => [f.filaNum, f.tipoFila, f.valor, f.clasificador, f.motivo ?? null, f.omitida ?? null]);

/** Lo que leería la CARGA: el mapeo con las respuestas, sin tolerar nada. */
function leerComoCarga(descriptor = CAR, spec: SpecModulo, h: GridHoja, respuestas: RespuestasCarga, conPatron: boolean) {
  const mapeo = mapeoDeCarga(descriptor, normalizarSpecModuloArchivo(descriptor, spec), h, respuestas, { conPatron });
  if (!mapeo.ok) throw new Error(mapeo.message);
  return transformarModulo(descriptor, mapeo.spec, h).filas;
}

/** Lo que muestra la PRUEBA del mapeo con las mismas respuestas. */
function leerComoPrueba(descriptor = CAR, spec: SpecModulo, h: GridHoja, respuestas: RespuestasCarga, conPatron: boolean) {
  const revision = revisarMapeoMuestra(descriptor, [h], spec, { exigirTipoFormato: false, carga: { respuestas, conPatron } });
  expect(revision.carga?.pendientes, "la carga no rechazaría estas respuestas").toEqual([]);
  return revision.lectura?.filas ?? [];
}

// ---------------------------------------------------------------------------------------------
// Los archivos de cada módulo, mínimos pero con lo que cada respuesta cambia.
// ---------------------------------------------------------------------------------------------

// INDAER: «Total Cliente .....» por cliente y «Totales» al pie; el patrón marca la columna D.
const VENCIMIENTOS = hoja("Sheet1", [
  [null, "Tipo", null, "Documento", null, "Fecha", "Sin Vencer", "0 a 30"],
  [null, null, "BOGOTA", null, null, null, 300, 50],
  [null, null, null, null, 800111222, "CLIENTE UNO SAS", null, null],
  [null, "FE", null, 101, null, "Sep.22/2026", 100, 0],
  [null, "FE", null, 102, null, "Sep.23/2026", 0, 200],
  [null, null, null, "Total Cliente .....", null, null, 100, 200],
  [null, null, null, null, 900333444, "CLIENTE DOS SAS", null, null],
  [null, "FN", null, 7, null, "Sep.29/2026", 50, 0],
  [null, null, null, "Total Cliente .....", null, null, 50, 0],
  [null, null, null, "Totales ...............", null, null, 150, 200],
]);
const PATRON_CARTERA: SpecModulo = normalizarSpecModulo(CAR, {
  hoja: "Sheet1",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { cuenta: 5, nit: 5, nombre: 6, documento: 4, tipoDocumento: 2, fecha: 6, total: 0 },
  clasificadorModo: "arrastrar",
  valorFormula: [{ columna: 7, signo: "+" }, { columna: 8, signo: "+" }],
  tipoFormato: "documento",
  subtotales: "manual",
  subtotalesColumna: 4,
  subtotalesTexto: "Total cliente",
});

const KARDEX = hoja("Kardex", [
  ["Tipo", "Referencia", "Descripción", "Cantidad", "Unitario", "Total"],
  ["MP", "R1", "Harina", 2, 50, 100],
  ["MP", "R2", "Azúcar", 4, 50, 200],
  ["Total MP", null, null, null, null, 300],
  ["PT", "R3", "Pan", 1, 70, 70],
  ["Total general", null, null, null, null, 370],
]);
const PATRON_INV: SpecModulo = {
  hoja: "Kardex",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
  clasificadorModo: "columna",
};

const NOMINA = hoja("ACUMULADOS DE NOMINA", [
  ["Código", "Concepto", "Cédula", "Empleado", "Centro de costo", "Valor"],
  ["8", "Bonificación", "1144", "Ana Ruiz", "GYA", 100],
  ["8", "Bonificación", "2255", "Luis Gil", "MOD", 50],
  ["1", "Sueldo", "1144", "Ana Ruiz", "GYA", 1000],
]);
const PATRON_NOM: SpecModulo = {
  hoja: "ACUMULADOS DE NOMINA",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { codigo: 1, concepto: 2, cedula: 3, empleado: 4, agrupador: 5, valor: 6 },
};

const VENTAS = hoja("Ventas", [
  ["Concepto", "Factura", "Cliente", "Ingreso neto"],
  ["Ventas nacionales", "FE-1", "Cliente uno", 1000],
  ["Nota crédito", "NC-1", "Cliente uno", 200],
]);
const PATRON_ING: SpecModulo = {
  hoja: "Ventas",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { concepto: 1, documento: 2, tercero: 3, valor: 4 },
};

const ACTIVOS = hoja("Activos", [
  ["Grupo", "Placa", "Descripción", "Costo"],
  ["152805", "A-1", "Portátil", 5_000_000],
  ["152405", "A-2", "Escritorio", 1_200_000],
]);
const PATRON_AFI: SpecModulo = {
  hoja: "Activos",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { grupo: 1, placa: 2, descripcion: 3, costo: 4 },
};

// ---------------------------------------------------------------------------------------------

describe("paridad: la prueba del mapeo lee exactamente como la carga", () => {
  const casos: { nombre: string; descriptor: typeof CAR; spec: SpecModulo; hoja: GridHoja; respuestas: RespuestasCarga; conPatron: boolean }[] = [
    {
      nombre: "Cartera con patrón · «Sí» al total (la marcadora «Total cliente» sigue)",
      descriptor: CAR, spec: PATRON_CARTERA, hoja: VENCIMIENTOS, conPatron: true,
      respuestas: { fechaCorte: "2026-09-30", total: { trae: true, columna: 4, fila: 10 } },
    },
    {
      nombre: "Cartera con patrón · «No» al total",
      descriptor: CAR, spec: PATRON_CARTERA, hoja: VENCIMIENTOS, conPatron: true,
      respuestas: { fechaCorte: "2026-09-30", total: { trae: false } },
    },
    {
      nombre: "Cartera con el mapeo armado en la carga (la celda del total viene en el mapeo)",
      descriptor: CAR, hoja: VENCIMIENTOS, conPatron: false, respuestas: {},
      spec: { ...PATRON_CARTERA, subtotalesColumna: 4, subtotalesFila: 10, subtotalesTexto: "Total cliente" },
    },
    {
      nombre: "Inventarios con patrón · clasificador confirmado y «No» al total",
      descriptor: INV, spec: PATRON_INV, hoja: KARDEX, conPatron: true,
      respuestas: { clasificador: { columna: 1, modo: "columna" }, total: { trae: false } },
    },
    {
      nombre: "Nómina con patrón · sin separar por centro de costo y agrupado por concepto",
      descriptor: NOM, spec: PATRON_NOM, hoja: NOMINA, conPatron: true,
      respuestas: { total: { trae: false }, separarAgrupador: false, agruparPor: "concepto" },
    },
    {
      nombre: "Ingresos con patrón · solo notas crédito en positivo",
      descriptor: ING, spec: PATRON_ING, hoja: VENTAS, conPatron: true,
      respuestas: { total: { trae: false }, contenidoArchivo: "notas_credito", signoNotasCredito: "positivo" },
    },
    {
      nombre: "Activos fijos con patrón · solo la depreciación",
      descriptor: AFI, spec: PATRON_AFI, hoja: ACTIVOS, conPatron: true,
      respuestas: { total: { trae: false }, contenidoActivos: "depreciacion" },
    },
  ];

  for (const c of casos) {
    it(c.nombre, () => {
      const carga = leerComoCarga(c.descriptor, c.spec, c.hoja, c.respuestas, c.conPatron);
      expect(carga.length).toBeGreaterThan(0);
      expect(resumen(leerComoPrueba(c.descriptor, c.spec, c.hoja, c.respuestas, c.conPatron))).toEqual(resumen(carga));
    });
  }

  it("INDAER: la prueba ya no muestra los «Total cliente» fuera mientras la carga los suma", () => {
    const respuestas: RespuestasCarga = { fechaCorte: "2026-09-30", total: { trae: true, columna: 4, fila: 10 } };
    const carga = leerComoCarga(CAR, PATRON_CARTERA, VENCIMIENTOS, respuestas, true);
    const suman = carga.filter((f) => f.tipoFila === "movimiento" && f.valor !== 0).map((f) => f.valor);
    expect(suman).toEqual([100, 200, 50]);
    expect(carga.filter((f) => f.tipoFila === "total").map((f) => f.filaNum)).toEqual([6, 9, 10]);
  });

  it("la celda escrita como en Excel («D10») es la misma respuesta que columna + fila del modal", () => {
    const delModal: RespuestasCarga = { total: { trae: true, columna: 4, fila: 10 } };
    const escrita: RespuestasCarga = { total: { trae: true }, celdaTotal: "d10" };
    expect(resumen(leerComoPrueba(CAR, PATRON_CARTERA, VENCIMIENTOS, escrita, true)))
      .toEqual(resumen(leerComoCarga(CAR, PATRON_CARTERA, VENCIMIENTOS, delModal, true)));
  });
});

describe("mapeoDeCarga", () => {
  it("la carga corta en la primera respuesta que falta; la prueba la anota y sigue", () => {
    const carga = mapeoDeCarga(CAR, PATRON_CARTERA, VENCIMIENTOS, {}, { conPatron: true });
    expect(carga).toEqual({ ok: false, message: "Indica si el archivo trae el valor total.", noProcesable: false });
    const prueba = mapeoDeCarga(CAR, PATRON_CARTERA, VENCIMIENTOS, {}, { conPatron: true, faltantes: "seguir" });
    expect(prueba.ok && prueba.pendientes).toContain("Indica si el archivo trae el valor total.");
  });

  it("lo que no sirve del ARCHIVO marca el original como no procesable; lo del formulario no", () => {
    const celdaVacia = mapeoDeCarga(CAR, PATRON_CARTERA, VENCIMIENTOS, { total: { trae: true, columna: 2, fila: 10 } }, { conPatron: true });
    expect(celdaVacia).toEqual({ ok: false, message: "La celda B10 no existe o está vacía en este archivo.", noProcesable: true });
    const sinAgrupar = mapeoDeCarga(NOM, PATRON_NOM, NOMINA, { total: { trae: false }, separarAgrupador: true }, { conPatron: true });
    expect(sinAgrupar).toMatchObject({ ok: false, noProcesable: false });
  });

  it("dice con qué respuestas leyó, en palabras del modal", () => {
    const mapeo = mapeoDeCarga(NOM, PATRON_NOM, NOMINA, { total: { trae: false }, separarAgrupador: false, agruparPor: "concepto", periodo: "2026-09" }, { conPatron: true });
    expect(mapeo.ok && mapeo.aplicadas).toEqual([
      "¿Trae el valor total? No",
      "¿Separar por centro de costo? No",
      "Agrupar los conceptos por nombre del concepto",
      "Mes de corte: 2026-09",
    ]);
  });

  it("un anexo de Nómina se agrupa como su cargue, con el mismo aviso que antes", () => {
    const sinCuenta = mapeoDeCarga(NOM, PATRON_NOM, NOMINA, { total: { trae: false }, separarAgrupador: true }, { conPatron: true, anexoAgruparPor: "cuenta" });
    expect(sinCuenta).toMatchObject({ ok: false, message: expect.stringContaining("El cargue al que agregas este archivo agrupa por") });
  });

  it("celdaDeTexto entiende la celda como en Excel", () => {
    expect(celdaDeTexto("M160")).toEqual({ columna: 13, fila: 160 });
    expect(celdaDeTexto(" aa 3 ")).toEqual({ columna: 27, fila: 3 });
    expect(celdaDeTexto("160")).toBeNull();
    expect(celdaDeTexto("M0")).toBeNull();
  });
});

describe("las respuestas viajan con los mismos campos en la prueba y en la carga", () => {
  it("lo que arma el panel del editor se lee igual que lo que manda el modal", () => {
    const preguntas = preguntasCargaDeModulo(NOM);
    const campos = camposRespuestasPrueba(preguntas, PATRON_NOM, {
      ...RESPUESTAS_PRUEBA_INICIALES,
      total: "si",
      celdaTotal: "F4",
      separarCentro: "no",
      agruparPor: "concepto",
      mes: "2026-09",
    });
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(campos)) fd.set(clave, valor);
    expect(respuestasCargaDeFormulario(fd)).toMatchObject({
      total: { trae: true },
      celdaTotal: "F4",
      separarAgrupador: false,
      agruparPor: "concepto",
      periodo: "2026-09",
    });
  });

  it("Ingresos: el panel supone lo más habitual y manda los signos que la carga exige", () => {
    const campos = camposRespuestasPrueba(preguntasCargaDeModulo(ING), PATRON_ING, RESPUESTAS_PRUEBA_INICIALES);
    expect(campos).toEqual({ totalArchivo: "no", contenidoArchivo: "mixto", signoVentas: "positivo", signoNotasCredito: "negativo" });
  });

  it("la TRM se escribe como en Colombia y llega como número", () => {
    const campos = camposRespuestasPrueba(preguntasCargaDeModulo(CAR), { ...PATRON_CARTERA, monedaArchivo: "USD" }, { ...RESPUESTAS_PRUEBA_INICIALES, trm: "4.150,25" });
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(campos)) fd.set(clave, valor);
    expect(respuestasCargaDeFormulario(fd).trmCierre).toBe(4150.25);
  });
});

// ---------------------------------------------------------------------------------------------
// CANDADO: una sola puerta. Si alguien vuelve a aplicar una respuesta de la carga en otro lado,
// la prueba del mapeo y el borrador pueden volver a leer distinto.
// ---------------------------------------------------------------------------------------------

const RAIZ = join(process.cwd(), "src");
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((nombre) => {
  const ruta = join(dir, nombre);
  return statSync(ruta).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
});
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8").replace(/\r\n/g, "\n");
/** El cuerpo de una función exportada, hasta la siguiente declaración de primer nivel. */
const cuerpo = (fuente: string, firma: string): string => {
  const ini = fuente.indexOf(firma);
  expect(ini, firma).toBeGreaterThanOrEqual(0);
  const fin = fuente.indexOf("\nexport ", ini + firma.length);
  return fuente.slice(ini, fin < 0 ? undefined : fin);
};

describe("candado: las respuestas de la carga solo se aplican en mapeo-de-carga.ts", () => {
  const RESPUESTAS = [
    "aplicarTotalDeCarga",
    "aplicarClasificadorDeCarga",
    "aplicarAgrupadorDeCarga",
    "aplicarAgruparPorDeCarga",
    "aplicarContenidoDeCarga",
    "aplicarContenidoActivosDeCarga",
  ];
  const PERMITIDOS = new Set(["lib/modulos/mapeo-de-carga.ts", "lib/modulos/patrones/aplicar.ts"]);

  // Recorre todo `src`: con la suite completa en paralelo tarda más que los 5 s por defecto.
  it("ningún otro archivo las llama", { timeout: 60_000 }, () => {
    const llamada = new RegExp(`\\b(${RESPUESTAS.join("|")})\\s*\\(`, "g");
    const infractores = archivos(RAIZ)
      .map((ruta) => relative(RAIZ, ruta).split(sep).join("/"))
      .filter((ruta) => !PERMITIDOS.has(ruta))
      .flatMap((ruta) => [...new Set([...leer(ruta).matchAll(llamada)].map((m) => m[1]))].map((f) => `${ruta}: ${f}`));
    expect(infractores).toEqual([]);
  });

  it("la carga y las dos pruebas leen las respuestas con el mismo lector y por la misma puerta", () => {
    const carga = cuerpo(leer("app/actions/modulos-datos.ts"), "export async function leerDatosModulo(");
    expect(carga).toContain("mapeoDeCarga(");
    expect(carga).toContain("respuestasCargaDeFormulario(formData)");
    const pruebaCarga = cuerpo(leer("app/actions/modulos-datos.ts"), "export async function probarMapeoCarga(");
    expect(pruebaCarga).toContain("carga: { respuestas: respuestasCargaDeFormulario(formData), conPatron: false }");
    expect(pruebaCarga).toContain("carga: revision.carga");
    const pruebaPatron = cuerpo(leer("app/actions/patrones-modulo.ts"), "export async function probarMapeoPatron(");
    expect(pruebaPatron).toMatch(/carga: \{ respuestas: [^}]*respuestasCargaDeFormulario\(formData\)/);
    expect(pruebaPatron).toContain("carga: revision.carga");
  });

  it("el modal manda las mismas respuestas a «Leer y crear borrador» y a la prueba", () => {
    const modal = leer("app/(app)/modulos/[codigo]/cargar-modulo-modal.tsx");
    expect(modal).toContain("for (const [clave, valor] of Object.entries(camposRespuestasCarga())) fd.set(clave, valor);");
    expect(modal).toContain("respuestas={camposRespuestasCarga}");
  });

  it("cada campo que arman el modal y el panel lo lee el servidor", () => {
    const lector = cuerpo(leer("lib/modulos/mapeo-de-carga.ts"), "export function respuestasCargaDeFormulario(");
    const modal = leer("app/(app)/modulos/[codigo]/cargar-modulo-modal.tsx");
    const armador = modal.slice(modal.indexOf("const camposRespuestasCarga = "), modal.indexOf("const leer = () =>"));
    const panel = cuerpo(leer("lib/modulos/respuestas-carga-prueba.ts"), "export function camposRespuestasPrueba(");
    const claves = [...new Set([...`${armador}\n${panel}`.matchAll(/campos\.(\w+) =/g)].map((m) => m[1]))];
    expect(claves.length).toBeGreaterThan(10);
    expect(claves.filter((clave) => !lector.includes(`"${clave}"`))).toEqual([]);
  });
});
