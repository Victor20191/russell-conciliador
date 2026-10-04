// Estado del constructor de la lectura por ejemplo: qué pasa al soltar un dato del archivo en un
// destino (un campo del producto activo, un título de sección o un total). Puro: la pantalla solo
// pinta y llama a estas funciones, así las reglas se prueban sin navegador.
import type { IncidenciaLectura, RolLecturaInventario } from "../extraccion/lectura-estructurada";
import {
  asignarEnProducto,
  avisoAsignacion,
  ETIQUETA_ROL,
  MAX_PRODUCTOS_EJEMPLO,
  quitarDeProducto,
  type AvisoAsignacion,
  type ModeloUsuarioInventario,
} from "./modelo-usuario";
import { partesDeCelda } from "./partes-celda";

/** Lo que se arrastra o se selecciona en la grilla. Coordenadas de Excel. */
export type DatoArrastrado =
  | { tipo: "celda"; fila: number; columna: number; texto: string; inicio?: number; fin?: number }
  | { tipo: "columna"; columna: number };

export type DestinoDato =
  | { tipo: "rol"; rol: RolLecturaInventario }
  | { tipo: "seccion" }
  | { tipo: "total"; subtipo: "general" | "subtotal" };

export type ResultadoSoltar = {
  modelo: ModeloUsuarioInventario;
  aviso: AvisoAsignacion | null;
  /** La celda soltada trae varias partes: la pantalla la abre para que se arrastre solo la que va. */
  mostrarPartes?: { fila: number; columna: number };
};

const MAX_MARCAS = 12;
const mismaCelda = (a: { fila: number; columna: number }, b: { fila: number; columna: number }) => a.fila === b.fila && a.columna === b.columna;
const tramoDe = (d: Extract<DatoArrastrado, { tipo: "celda" }>) => (d.inicio != null && d.fin != null && d.fin > d.inicio ? { inicio: d.inicio, fin: d.fin } : {});

export function soltarDato(modelo: ModeloUsuarioInventario, productoActivo: number, destino: DestinoDato, dato: DatoArrastrado, filaTitulos: number): ResultadoSoltar {
  if (dato.tipo === "columna") {
    if (destino.tipo !== "rol") return { modelo, aviso: { nivel: "error", mensaje: "Arrastra la celda del título o del total, no la columna entera." } };
    const ocupada = modelo.columnas.find((c) => c.columna === dato.columna && c.rol !== destino.rol);
    if (ocupada) {
      return { modelo, aviso: { nivel: "error", mensaje: `Esa columna ya está en ${ETIQUETA_ROL[ocupada.rol]}. Si sus celdas traen varios datos, selecciona en una celda el pedazo de cada campo.` } };
    }
    // La columna entera es la regla del campo: los datos sueltos de ese campo sobran.
    return {
      modelo: {
        ...modelo,
        columnas: [...modelo.columnas.filter((c) => c.rol !== destino.rol), { rol: destino.rol, columna: dato.columna, filaTitulos }],
        productos: modelo.productos.map((p) => quitarDeProducto(p, destino.rol)),
      },
      aviso: null,
    };
  }
  const tramo = tramoDe(dato);
  if (destino.tipo === "rol" && !("inicio" in tramo)) {
    // La celda entera en un campo solo sirve si la celda trae UN dato (el error típico es arrastrar
    // «Ref: … | Descripción: … | Tipo: …» completa al campo Tipo).
    const partes = partesDeCelda(dato.texto);
    if (partes.length > 1) {
      return { modelo, mostrarPartes: { fila: dato.fila, columna: dato.columna }, aviso: { nivel: "error", mensaje: `Esta celda trae ${partes.length} datos. Arrastra a ${ETIQUETA_ROL[destino.rol]} solo la parte que le corresponde (abajo de la celda).` } };
    }
  }
  if (destino.tipo === "rol") {
    const aviso = avisoAsignacion(destino.rol, dato.texto, "inicio" in tramo ? tramo as { inicio: number; fin: number } : undefined);
    if (aviso?.nivel === "error") return { modelo, aviso };
    const productos = modelo.productos.length ? [...modelo.productos] : [{ asignaciones: [] }];
    const indice = Math.min(Math.max(0, productoActivo), productos.length - 1);
    productos[indice] = asignarEnProducto(productos[indice], { rol: destino.rol, fila: dato.fila, columna: dato.columna, ...tramo });
    return { modelo: { ...modelo, productos, columnas: modelo.columnas.filter((c) => c.rol !== destino.rol || c.columna === dato.columna) }, aviso };
  }
  if (destino.tipo === "seccion") {
    if (modelo.secciones.length >= MAX_MARCAS) return { modelo, aviso: { nivel: "error", mensaje: "Con unos pocos títulos de sección basta." } };
    return { modelo: { ...modelo, secciones: [...modelo.secciones.filter((s) => !mismaCelda(s, dato)), { fila: dato.fila, columna: dato.columna, ...tramo }] }, aviso: null };
  }
  const aviso = avisoAsignacion("valorTotal", dato.texto, "inicio" in tramo ? tramo as { inicio: number; fin: number } : undefined);
  if (aviso?.nivel === "error") return { modelo, aviso };
  if (modelo.totales.length >= MAX_MARCAS) return { modelo, aviso: { nivel: "error", mensaje: "Con unos pocos totales basta." } };
  return { modelo: { ...modelo, totales: [...modelo.totales.filter((t) => !mismaCelda(t, dato)), { fila: dato.fila, columna: dato.columna, tipo: destino.subtipo, ...tramo }] }, aviso };
}

export function agregarProducto(modelo: ModeloUsuarioInventario): ModeloUsuarioInventario {
  if (modelo.productos.length >= MAX_PRODUCTOS_EJEMPLO) return modelo;
  return { ...modelo, productos: [...modelo.productos, { asignaciones: [] }] };
}

export function quitarProducto(modelo: ModeloUsuarioInventario, indice: number): ModeloUsuarioInventario {
  const productos = modelo.productos.filter((_, i) => i !== indice);
  return { ...modelo, productos: productos.length ? productos : [{ asignaciones: [] }] };
}

export function marcarInicioProducto(modelo: ModeloUsuarioInventario, indice: number, fila: number | null): ModeloUsuarioInventario {
  return { ...modelo, productos: modelo.productos.map((p, i) => {
    if (i !== indice) return p;
    return fila == null ? { asignaciones: p.asignaciones } : { asignaciones: p.asignaciones, filaInicio: fila };
  }) };
}

export type MarcaCelda =
  | { tipo: "rol"; rol: RolLecturaInventario; producto: number; tramo: boolean }
  | { tipo: "columna"; rol: RolLecturaInventario }
  | { tipo: "seccion" }
  | { tipo: "total" };

/** Qué usa el modelo de una celda, para señalarlo en la grilla. */
export function marcasEnCelda(modelo: ModeloUsuarioInventario, fila: number, columna: number): MarcaCelda[] {
  const marcas: MarcaCelda[] = [];
  modelo.productos.forEach((p, producto) => {
    for (const a of p.asignaciones) if (a.fila === fila && a.columna === columna) marcas.push({ tipo: "rol", rol: a.rol, producto, tramo: a.inicio != null });
  });
  for (const c of modelo.columnas) if (c.columna === columna && fila > c.filaTitulos) marcas.push({ tipo: "columna", rol: c.rol });
  if (modelo.secciones.some((s) => s.fila === fila && s.columna === columna)) marcas.push({ tipo: "seccion" });
  if (modelo.totales.some((t) => t.fila === fila && t.columna === columna)) marcas.push({ tipo: "total" });
  return marcas;
}

/** Filas con problemas de lectura (una entrada por fila, con su primer mensaje), para ir a ellas. */
export function filasConProblemas(incidencias: readonly IncidenciaLectura[], tope = 20): { fila: number; columna?: number; mensaje: string }[] {
  const vistas = new Map<number, { fila: number; columna?: number; mensaje: string }>();
  for (const i of incidencias) {
    if (!vistas.has(i.fila)) vistas.set(i.fila, { fila: i.fila, ...(i.columna != null ? { columna: i.columna } : {}), mensaje: i.mensaje });
    if (vistas.size >= tope) break;
  }
  return [...vistas.values()].sort((a, b) => a.fila - b.fila);
}

/** Modelo listo para enviar: sin productos vacíos (el que se está armando puede quedar vacío). */
export function modeloParaEnviar(modelo: ModeloUsuarioInventario): ModeloUsuarioInventario {
  const productos = modelo.productos.filter((p) => p.asignaciones.length > 0);
  return { ...modelo, productos };
}

/**
 * Asigna las partes de una celda que el sistema reconoce por su rótulo: al producto activo
 * («Ref:» → Referencia, «Cant:» → Cantidad…) o como total / título de sección. Las partes sin
 * propuesta quedan para el usuario.
 */
export function asignarPartesSugeridas(modelo: ModeloUsuarioInventario, productoActivo: number, celda: { fila: number; columna: number; texto: string }): ResultadoSoltar {
  let actual = modelo;
  const avisos: string[] = [];
  for (const parte of partesDeCelda(celda.texto)) {
    const destino: DestinoDato | null = parte.rolSugerido ? { tipo: "rol", rol: parte.rolSugerido }
      : parte.marcaSugerida === "seccion" ? { tipo: "seccion" }
        : parte.marcaSugerida ? { tipo: "total", subtipo: parte.marcaSugerida === "total" ? "general" : "subtotal" } : null;
    if (!destino) continue;
    const r = soltarDato(actual, productoActivo, destino, { tipo: "celda", ...celda, inicio: parte.inicio, fin: parte.fin }, 1);
    if (r.aviso?.nivel === "error") avisos.push(r.aviso.mensaje);
    actual = r.modelo;
  }
  return { modelo: actual, aviso: avisos.length ? { nivel: "aviso", mensaje: avisos.join(" ") } : null };
}
