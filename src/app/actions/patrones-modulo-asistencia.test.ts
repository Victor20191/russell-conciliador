import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";

const mocks = vi.hoisted(() => ({
  permiso: vi.fn(), usuario: vi.fn(), erp: vi.fn(), proponer: vi.fn(), disponible: vi.fn(), consumo: vi.fn(), subir: vi.fn(), crear: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.permiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.usuario }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => String(e), registrarError: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ iaDisponible: mocks.disponible }));
vi.mock("@/lib/modulos/asistencia/ia", () => ({ proponerSpecInventarioIA: mocks.proponer, ErrorProveedorAsistenciaInventario: class extends Error {} }));
vi.mock("@/lib/ia/uso", () => ({ registrarConsumoIA: mocks.consumo }));
vi.mock("@/lib/storage/objetos", () => ({ almacenamientoDisponible: () => true, subirObjeto: mocks.subir, eliminarObjeto: vi.fn(), obtenerObjeto: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { erp: { findUnique: mocks.erp } } }));
vi.mock("@/lib/concurrency", () => ({ tomarCandadoTransaccion: vi.fn(), transaccionSerializable: (fn: (tx: unknown) => unknown) => fn({ versionPatronArchivoModulo: { findMany: async () => [], create: mocks.crear } }) }));

import { asistirMuestraPatronInventario, crearVersionPatron, ventanaMuestraPatron, type AsistenciaMuestraPatron } from "./patrones-modulo";
import { ingerir } from "@/lib/balance/extraccion/ingesta";
import { transformarModulo } from "@/lib/modulos/extraccion/transformar";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";

const nombre = "05_siesa_producto_en_varias_filas_2026-09.xlsx";
const fuente = (inicio: string, desplazamientoFila = 0, fin?: string) => ({ columna: 1, desplazamientoFila, selector: { tipo: "etiqueta" as const, inicio, ...(fin ? { fin } : {}) } });
const spec: SpecModulo = {
  hoja: "Inventario por bloques", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {},
  lecturaEstructurada: {
    version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Ref:" }, maxFilas: 4 },
    seccion: { condicion: { columna: 1, operador: "empieza", texto: "TIPO DE INVENTARIO:" }, fuente: fuente("TIPO DE INVENTARIO:") },
    campos: [
      { rol: "referencia", fuente: fuente("Ref:") }, { rol: "descripcion", fuente: fuente("Descripción:", 1) },
      { rol: "cantidad", fuente: fuente("Cantidad:", 2) }, { rol: "valorUnitario", fuente: fuente("Unit:", 3, "| Total:") },
      { rol: "valorTotal", fuente: fuente("Total:", 3) },
    ],
    totales: [{ tipo: "general", condicion: { columna: 1, operador: "empieza", texto: "TOTAL GENERAL:" }, fuente: fuente("TOTAL GENERAL:") }],
  },
};
const uso = { tipoOperacion: "extraccion_tabular", modelo: "modelo-prueba", usage: { input_tokens: 12, output_tokens: 10 } };
async function formulario(previa?: AsistenciaMuestraPatron) {
  const fd = new FormData();
  fd.set("moduloCodigo", "INV"); fd.set("erpId", "3");
  fd.set("archivo", new File([await readFile(`outputs/pruebas-inventario-siesa/${nombre}`)], nombre));
  if (previa?.asistenciaJson) fd.set("asistenciaJson", previa.asistenciaJson);
  return fd;
}
async function confirmar(primera: AsistenciaMuestraPatron) {
  const fd = await formulario(primera);
  fd.set("respuestasJson", JSON.stringify(Object.fromEntries(primera.lectura!.preguntas.map((p) => [p.id, p.opciones?.[0].valor ?? "confirmado"]))));
  return asistirMuestraPatronInventario(fd);
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.permiso.mockResolvedValue({ ok: true });
  mocks.usuario.mockResolvedValue({ id: 1, name: "Admin" });
  mocks.erp.mockResolvedValue({ id: 3, code: "SIESA", name: "SIESA", active: true });
  mocks.disponible.mockReturnValue(true);
  const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
  const archivo = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
  if (archivo.modo !== "tabular") throw new Error("Fixture inválido");
  spec.hoja = archivo.hojas[0].nombre;
  mocks.proponer.mockResolvedValue({ spec, confianza: 0.98, usos: [uso], preguntas: [] });
  mocks.crear.mockResolvedValue({ id: 45, version: 1 });
});

describe("Nuevo patrón INV: muestra asistida sin cargar un cliente", () => {
  it("reconstruye el XLSX de 18 productos, confirma sin repetir IA y guarda la versión compartida", async () => {
    const primera = await asistirMuestraPatronInventario(await formulario());
    expect(primera.ok).toBe(true);
    expect(primera.lectura?.errores).toEqual([]);
    expect(primera.lectura?.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, totalDeclarado: 19_140_500, diferencia: 0 });
    expect(primera.lectura?.ejemplosLectura?.[0].campos).toEqual(expect.arrayContaining([expect.objectContaining({ rol: "referencia", valor: "MP-001" })]));
    expect(primera.lectura?.listoParaBorrador).toBe(false);
    expect(mocks.crear).not.toHaveBeenCalled(); expect(mocks.subir).not.toHaveBeenCalled();
    expect(mocks.consumo).toHaveBeenCalledWith([uso], expect.objectContaining({ modulo: "INV", usuarioId: 1, archivoNombre: nombre }));
    const final = await confirmar(primera);
    expect(final.lectura?.listoParaBorrador).toBe(true);
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
    const fd = await formulario(final);
    fd.set("specJson", JSON.stringify(final.lectura!.spec)); fd.set("aprobar", "1");
    expect(await crearVersionPatron(fd)).toMatchObject({ ok: true, versionId: 45 });
    const guardada = mocks.crear.mock.calls[0][0].data;
    expect(guardada.estado).toBe("aprobada"); expect(guardada.specJson.lecturaEstructurada).toBeTruthy();
    expect(guardada).not.toHaveProperty("clienteOrigenId");
    const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
    const archivo = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
    if (archivo.modo !== "tabular") throw new Error();
    const movimientos = transformarModulo(MODULOS_IMPORT.INV, guardada.specJson, archivo.hojas[0]).filas.filter((f) => f.tipoFila === "movimiento");
    expect(movimientos).toHaveLength(18);
    expect(movimientos.reduce((n, f) => n + Number(f.datos.cantidad), 0)).toBe(875);
    expect(new Set(movimientos.map((f) => f.clasificador)).size).toBe(3);
  });

  it("no guarda una propuesta pendiente ni reglas estructuradas sin revisar", async () => {
    const primera = await asistirMuestraPatronInventario(await formulario());
    for (const previa of [primera, undefined]) {
      const fd = await formulario(previa); fd.set("specJson", JSON.stringify(spec));
      expect(await crearVersionPatron(fd)).toMatchObject({ ok: false, message: expect.stringContaining("confirma") });
    }
    expect(mocks.subir).not.toHaveBeenCalled();
  });

  it.each(["archivo", "aplicativo", "usuario", "firma", "reglas"])("invalida una confirmación al cambiar %s", async (cambio) => {
    const final = await confirmar(await asistirMuestraPatronInventario(await formulario()));
    const fd = await formulario(final); fd.set("specJson", JSON.stringify(final.lectura!.spec));
    if (cambio === "archivo") fd.set("archivo", new File(["Tipo,Referencia,Valor total\nMP,A,1"], "otra.csv"));
    if (cambio === "aplicativo") mocks.erp.mockResolvedValue({ id: 4, code: "SAP", name: "SAP", active: true });
    if (cambio === "usuario") mocks.usuario.mockResolvedValue({ id: 2, name: "Otro" });
    if (cambio === "firma") {
      const modificado = JSON.parse(final.asistenciaJson!); modificado.datos.lectura.resumen.valorLeido = 1;
      fd.set("asistenciaJson", JSON.stringify(modificado));
    }
    if (cambio === "reglas") fd.set("specJson", JSON.stringify({ ...final.lectura!.spec, subtotales: "nunca" }));
    expect(await crearVersionPatron(fd)).toMatchObject({ ok: false });
    expect(mocks.subir).not.toHaveBeenCalled();
  });

  it("autoriza antes de leer o enviar el archivo al proveedor", async () => {
    mocks.permiso.mockResolvedValue({ ok: false, message: "Sin permiso" });
    expect(await asistirMuestraPatronInventario(await formulario())).toEqual({ ok: false, message: "Sin permiso" });
    expect(mocks.erp).not.toHaveBeenCalled(); expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("mantiene dudas semánticas y sólo reconsulta IA cuando llegan respuestas nuevas", async () => {
    mocks.proponer.mockResolvedValueOnce({ spec, confianza: 0.5, usos: [uso], preguntas: [{ id: "ia_unitario", etiqueta: "¿Unit significa costo unitario?", evidencia: [{ hoja: spec.hoja, fila: 6, columna: 1 }] }] });
    const primera = await asistirMuestraPatronInventario(await formulario());
    const sinCambios = await asistirMuestraPatronInventario(await formulario(primera));
    expect(sinCambios.lectura?.listoParaBorrador).toBe(false);
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
    const fd = await formulario(sinCambios); fd.set("respuestasJson", JSON.stringify({ [sinCambios.lectura!.preguntas[0].id]: "Sí, es costo unitario" }));
    const aclarada = await asistirMuestraPatronInventario(fd);
    expect(mocks.proponer).toHaveBeenCalledTimes(2);
    expect(aclarada.lectura?.preguntas.map((p) => p.id)).toEqual(["confirmar_lectura_estructurada"]);
  });

  it("permite corregir sin confirmar primero ejemplos incorrectos", async () => {
    const primera = await asistirMuestraPatronInventario(await formulario());
    const fd = await formulario(primera); fd.set("instrucciones", "El tipo se hereda del encabezado de cada sección.");
    const corregida = await asistirMuestraPatronInventario(fd);
    expect(corregida.ok).toBe(true); expect(mocks.proponer).toHaveBeenCalledTimes(2);
    const repetida = await formulario(corregida); repetida.set("instrucciones", "El tipo se hereda del encabezado de cada sección.");
    await asistirMuestraPatronInventario(repetida);
    expect(mocks.proponer).toHaveBeenCalledTimes(2);
  });

  it("sin proveedor conserva el análisis y devuelve un bloqueo explicable", async () => {
    mocks.disponible.mockReturnValue(false);
    const r = await asistirMuestraPatronInventario(await formulario());
    expect(r.ok).toBe(true); expect(r.analisis).toBeTruthy(); expect(r.lectura?.listoParaBorrador).toBe(false);
    expect(r.lectura?.advertencias.join(" ")).toContain("no está configurada");
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("un archivo tabular compatible no consume IA y permite revisar sus columnas", async () => {
    const fd = await formulario(); fd.set("archivo", new File(["Tipo,Referencia,Cantidad,Valor total\nMP,A,3,300\nPT,B,2,200"], "simple.csv"));
    const r = await asistirMuestraPatronInventario(fd);
    expect(r.lectura?.listoParaBorrador).toBe(true); expect(mocks.proponer).not.toHaveBeenCalled();
    fd.set("asistenciaJson", r.asistenciaJson!);
    fd.set("specManualJson", JSON.stringify({ ...r.lectura!.spec, clasificadorModo: "global", columnas: { ...r.lectura!.spec!.columnas, tipo: 0 } }));
    const revisada = await asistirMuestraPatronInventario(fd);
    expect(revisada.lectura?.listoParaBorrador).toBe(true);
    expect(revisada.lectura?.spec?.clasificadorModo).toBe("global");
    expect(mocks.proponer).not.toHaveBeenCalled();
  });
});

it("un mapa manual nuevo reemplaza la respuesta anterior de tipo global", async () => {
  const fd = await formulario(); fd.set("archivo", new File(["Tipo,Referencia,Cantidad,Valor total\n,A,3,300\n,B,2,200"], "sin-tipo.csv"));
  const inicial = await asistirMuestraPatronInventario(fd);
  expect(inicial.lectura?.preguntas.map((p) => p.id)).toContain("modo_tipo");
  fd.set("asistenciaJson", inicial.asistenciaJson!); fd.set("respuestasJson", JSON.stringify({ modo_tipo: "global" }));
  const global = await asistirMuestraPatronInventario(fd);
  expect(global.lectura?.spec?.clasificadorModo).toBe("global");
  fd.set("asistenciaJson", global.asistenciaJson!); fd.set("respuestasJson", "{}");
  fd.set("specManualJson", JSON.stringify({ ...global.lectura!.spec, clasificadorModo: "columna", columnas: { ...global.lectura!.spec!.columnas, tipo: 2 } }));
  const corregida = await asistirMuestraPatronInventario(fd);
  expect(corregida.lectura?.spec?.clasificadorModo).toBe("columna");
  expect(corregida.lectura?.spec?.columnas.tipo).toBe(2);
  expect(corregida.lectura?.resumen.tipoInventario).toBe("A, B");
  expect(mocks.proponer).not.toHaveBeenCalled();
});

it("una continuación vencida o modificada se rechaza antes de llamar IA", async () => {
  const primera = await asistirMuestraPatronInventario(await formulario());
  const fd = await formulario(primera);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3 * 60 * 60 * 1000);
  try {
    expect(await asistirMuestraPatronInventario(fd)).toMatchObject({ ok: false, message: expect.stringContaining("Vuelve a analizar") });
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
  } finally { vi.restoreAllMocks(); }
});

it("las indicaciones históricas no eliminan una duda semántica que quedó sin responder", async () => {
  mocks.proponer.mockResolvedValueOnce({ spec, confianza: 0.7, usos: [uso], preguntas: [
    { id: "ia_unitario", etiqueta: "¿Unit es el costo unitario?", evidencia: [{ hoja: spec.hoja, fila: 6, columna: 1 }] },
    { id: "ia_tipo", etiqueta: "¿El título aplica a todos los productos de la sección?", evidencia: [{ hoja: spec.hoja, fila: 2, columna: 1 }] },
  ] });
  const fd = await formulario(); fd.set("instrucciones", "Cada producto está en cuatro filas.");
  const primera = await asistirMuestraPatronInventario(fd);
  expect(primera.lectura?.preguntas).toHaveLength(2);
  const parcial = await formulario(primera); parcial.set("respuestasJson", JSON.stringify({ ia_unitario: "Sí, es costo unitario" }));
  const segunda = await asistirMuestraPatronInventario(parcial);
  expect(segunda.lectura?.listoParaBorrador).toBe(false);
  expect(segunda.lectura?.preguntas.map((p) => p.id)).toContain("ia_tipo");
});

it("no anuncia listo si elegir una fila exacta de total no produce una regla reutilizable", async () => {
  const fd = await formulario(); fd.set("archivo", new File(["Detalle\nItem: A | Valor: 100\nTOTAL: 100\nTOTAL: 120"], "varios-totales.csv"));
  const bytes = new TextEncoder().encode("Detalle\nItem: A | Valor: 100\nTOTAL: 100\nTOTAL: 120");
  const ingesta = await ingerir(bytes.buffer, "varios-totales.csv");
  if (ingesta.modo !== "tabular") throw new Error();
  mocks.proponer.mockResolvedValue({ confianza: 0.95, usos: [], preguntas: [], spec: {
    hoja: ingesta.hojas[0].nombre, filaEncabezado: 1, primeraFilaDatos: 2, columnas: {}, clasificadorModo: "global",
    lecturaEstructurada: { version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Item:" }, maxFilas: 1 },
      campos: [{ rol: "referencia", fuente: fuente("Item:", 0, "| Valor:") }, { rol: "valorTotal", fuente: fuente("Valor:") }],
      totales: [{ tipo: "general", condicion: { columna: 1, operador: "empieza", texto: "TOTAL:" }, fuente: fuente("TOTAL:") }],
    },
  } });
  const primera = await asistirMuestraPatronInventario(fd);
  expect(primera.lectura?.preguntas.map((p) => p.id)).toContain("total_archivo");
  fd.set("asistenciaJson", primera.asistenciaJson!); fd.set("respuestasJson", JSON.stringify({ total_archivo: "fila:4" }));
  const segunda = await asistirMuestraPatronInventario(fd);
  fd.set("asistenciaJson", segunda.asistenciaJson!); fd.set("respuestasJson", JSON.stringify({ confirmar_lectura_estructurada: segunda.lectura!.preguntas[0].opciones![0].valor }));
  const tercera = await asistirMuestraPatronInventario(fd);
  expect(tercera.lectura?.listoParaBorrador).toBe(false);
  expect(tercera.lectura?.advertencias.join(" ")).toContain("regla reutilizable");
});

it("una indicación nueva retira el tipo global anterior antes de aplicar la propuesta IA", async () => {
  const fd = await formulario(); fd.set("archivo", new File(["Tipo,Referencia,Cantidad,Valor total\n,A,3,300\n,B,2,200"], "sin-tipo.csv"));
  const inicial = await asistirMuestraPatronInventario(fd);
  fd.set("asistenciaJson", inicial.asistenciaJson!); fd.set("respuestasJson", JSON.stringify({ modo_tipo: "global" }));
  const global = await asistirMuestraPatronInventario(fd);
  mocks.proponer.mockResolvedValue({ spec: { ...global.lectura!.spec, clasificadorModo: "columna", columnas: { tipo: 2, cantidad: 3, valorTotal: 4 } }, confianza: 0.99, usos: [uso], preguntas: [] });
  fd.set("asistenciaJson", global.asistenciaJson!); fd.set("respuestasJson", "{}"); fd.set("instrucciones", "El tipo está en la columna Referencia, no es global.");
  const corregida = await asistirMuestraPatronInventario(fd);
  expect(corregida.lectura?.spec?.clasificadorModo).toBe("columna");
  expect(corregida.lectura?.spec?.columnas.tipo).toBe(2);
  expect(corregida.lectura?.resumen.tipoInventario).toBe("A, B");
});

describe("Nuevo patrón INV: lectura por ejemplo", () => {
  async function hoja05() {
    const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
    const archivo = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
    if (archivo.modo !== "tabular") throw new Error();
    return archivo.hojas[0];
  }
  async function modelo05() {
    const h = await hoja05();
    const celda = (fila: number) => String(h.filas[h.filasFisicas!.indexOf(fila)][0]);
    const tramo = (fila: number, buscado: string) => { const t = celda(fila); const inicio = t.lastIndexOf(buscado); return { fila, columna: 1, inicio, fin: inicio + buscado.length }; };
    const ultima = h.filasFisicas!.at(-1)!;
    return {
      version: 1, hoja: h.nombre, columnas: [], ignorarColumnas: [],
      productos: [{ asignaciones: [
        { rol: "referencia", ...tramo(3, "MP-001") }, { rol: "descripcion", ...tramo(4, "Lámina de acero de prueba") },
        { rol: "cantidad", ...tramo(5, "120") }, { rol: "valorUnitario", ...tramo(6, "2500") }, { rol: "valorTotal", ...tramo(6, "300000") },
      ] }],
      secciones: [tramo(2, "Materias primas")],
      totales: [{ ...tramo(ultima, "19140500"), tipo: "general" }],
      ignorarFilas: [{ fila: 1, motivo: "Título del informe sin datos" }],
    };
  }

  it("deduce la regla desde un producto armado, sin IA, y la guarda tras confirmar", async () => {
    const fd = await formulario(); fd.set("modeloJson", JSON.stringify(await modelo05()));
    const primera = await asistirMuestraPatronInventario(fd);
    expect(primera.ok).toBe(true);
    expect(mocks.proponer).not.toHaveBeenCalled();
    expect(primera.lectura?.origen).toBe("manual");
    expect(primera.lectura?.errores).toEqual([]);
    expect(primera.lectura?.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, diferencia: 0 });
    expect(primera.lectura?.preguntas.map((p) => p.id)).toEqual(["confirmar_lectura_estructurada"]);
    const final = await confirmar(primera);
    expect(final.lectura?.listoParaBorrador).toBe(true);
    expect(mocks.proponer).not.toHaveBeenCalled();
    const guardar = await formulario(final);
    guardar.set("specJson", JSON.stringify(final.lectura!.spec)); guardar.set("aprobar", "1");
    expect(await crearVersionPatron(guardar)).toMatchObject({ ok: true });
  });

  it("rechaza coordenadas manipuladas sin consultar la IA", async () => {
    const m = await modelo05();
    m.productos[0].asignaciones[0] = { ...m.productos[0].asignaciones[0], fila: 9999 };
    const fd = await formulario(); fd.set("modeloJson", JSON.stringify(m));
    const r = await asistirMuestraPatronInventario(fd);
    expect(r.lectura?.errores.join(" ")).toContain("vacía");
    expect(r.lectura?.listoParaBorrador).toBe(false);
    expect(mocks.proponer).not.toHaveBeenCalled();
    const malformado = await formulario(); malformado.set("modeloJson", JSON.stringify({ ...m, codigo: "return 1" }));
    expect(await asistirMuestraPatronInventario(malformado)).toMatchObject({ ok: false });
  });

  it("cuando los ejemplos no alcanzan consulta la IA una sola vez y exige que los respete", async () => {
    const fd = await formulario(); fd.set("archivo", new File(["Inventario\nA1\n2\nB2\n3"], "sin-rotulos.csv"));
    const h = await ingerir(new TextEncoder().encode("Inventario\nA1\n2\nB2\n3").buffer, "sin-rotulos.csv");
    if (h.modo !== "tabular") throw new Error();
    const m = { version: 1, hoja: h.hojas[0].nombre, tipoUnico: true, columnas: [], secciones: [], totales: [], ignorarFilas: [], ignorarColumnas: [],
      productos: [{ asignaciones: [{ rol: "referencia", fila: 2, columna: 1 }, { rol: "valorTotal", fila: 3, columna: 1 }] }] };
    // La IA propone leer cada fila como producto: contradice el ejemplo (A1 con valor 2).
    mocks.proponer.mockResolvedValue({ confianza: 0.95, usos: [uso], preguntas: [], spec: {
      hoja: h.hojas[0].nombre, filaEncabezado: 1, primeraFilaDatos: 2, columnas: {}, clasificadorModo: "global",
      lecturaEstructurada: { version: 1, registro: { ancla: { columna: 1, operador: "no_vacia" }, maxFilas: 1 }, campos: [{ rol: "valorTotal", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "completa" } } }] },
    } });
    fd.set("modeloJson", JSON.stringify(m));
    const r = await asistirMuestraPatronInventario(fd);
    expect(mocks.proponer).toHaveBeenCalled();
    const [entrada, evaluar] = mocks.proponer.mock.calls[0];
    expect(entrada.ejemplosUsuario).toEqual([expect.objectContaining({ filaInicio: 2 })]);
    expect(evaluar(mocks.proponer.mock.results[0] ? (await mocks.proponer.mock.results[0].value).spec : null)).toBe(false);
    expect(r.lectura?.spec).toBeNull();
    expect(r.lectura?.errores.join(" ")).toContain("no respeta los productos que armaste");
    const llamadas = mocks.proponer.mock.calls.length;
    fd.set("asistenciaJson", r.asistenciaJson!);
    await asistirMuestraPatronInventario(fd);
    expect(mocks.proponer).toHaveBeenCalledTimes(llamadas);
  });

  it("la ventana entrega filas físicas y lo que la lectura reconoce en ese tramo", async () => {
    const fd = await formulario();
    fd.set("specJson", JSON.stringify(spec)); fd.set("filaDesde", "3"); fd.set("cantidad", "8");
    const r = await ventanaMuestraPatron(fd);
    if (!r.ok) throw new Error(r.message);
    expect(r.ventana.filas[0].fila).toBe(3);
    expect(r.ventana.filas[0].celdas[0].t).toBe("Ref: MP-001");
    expect(r.ventana.lectura?.registros).toBe(18);
    expect(r.ventana.lectura?.trazas[0].campos.find((c) => c.rol === "referencia")).toMatchObject({ valor: "MP-001", fuentes: [{ fila: 3, columna: 1 }] });
    mocks.permiso.mockResolvedValue({ ok: false, message: "Sin permiso" });
    expect(await ventanaMuestraPatron(fd)).toEqual({ ok: false, message: "Sin permiso" });
  });
});
