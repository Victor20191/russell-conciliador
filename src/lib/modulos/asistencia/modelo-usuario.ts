// LECTURA POR EJEMPLO (INV): lo que el usuario arma sobre la grilla del archivo original para
// enseñar cómo se lee. Coordenadas de Excel —fila física y columna física 1-based—, nunca las de
// la grilla compacta. Es EVIDENCIA, no regla: el servidor relee cada texto del archivo y deduce
// las reglas (`deducir-lectura.ts`). Puro y sin `server-only`: lo comparten la UI y el servidor.
import * as z from "zod";
import { ROLES_LECTURA_INVENTARIO, tokenNumerico, type RolLecturaInventario } from "../extraccion/lectura-estructurada";

export const MAX_PRODUCTOS_EJEMPLO = 5;
const fila = z.number().int().min(1).max(1_048_576);
const columna = z.number().int().min(1).max(16_384);
const posicion = z.number().int().min(0).max(32_767);
const rol = z.enum(ROLES_LECTURA_INVENTARIO);
const motivo = z.string().trim().min(8, "Explica el motivo con al menos 8 caracteres.").max(200);

const senal = { fila, columna, inicio: posicion.optional(), fin: posicion.optional() };
const tramoValido = (s: { inicio?: number; fin?: number }) => (s.inicio == null) === (s.fin == null) && (s.inicio == null || s.fin! > s.inicio);
const MENSAJE_TRAMO = "El pedazo de texto elegido no es válido.";

const AsignacionSchema = z.object({ rol, ...senal }).strict().refine(tramoValido, MENSAJE_TRAMO);
const SenalSchema = z.object(senal).strict().refine(tramoValido, MENSAJE_TRAMO);
const TotalSchema = z.object({ ...senal, tipo: z.enum(["general", "subtotal"]) }).strict().refine(tramoValido, MENSAJE_TRAMO);

export const ModeloUsuarioSchema = z.object({
  version: z.literal(1),
  hoja: z.string().trim().min(1).max(120),
  /** Productos armados a mano. `filaInicio` marca dónde empieza el bloque si no es la fila del primer dato. */
  productos: z.array(z.object({ filaInicio: fila.optional(), asignaciones: z.array(AsignacionSchema).max(6) }).strict()).max(MAX_PRODUCTOS_EJEMPLO),
  /** Columnas enteras arrastradas a un campo; `filaTitulos` es la fila de sus rótulos. */
  columnas: z.array(z.object({ rol, columna, filaTitulos: fila }).strict()).max(6),
  /** Títulos cuyo texto da el Tipo de inventario a los productos de abajo. */
  secciones: z.array(SenalSchema).max(12),
  totales: z.array(TotalSchema).max(12),
  ignorarFilas: z.array(z.object({ fila, motivo }).strict()).max(12),
  ignorarColumnas: z.array(z.object({ columna, motivo }).strict()).max(32),
  /** Todo el archivo es un solo inventario (no hay tipo que leer). */
  tipoUnico: z.boolean().optional(),
}).strict().superRefine((m, ctx) => {
  m.productos.forEach((p, i) => {
    const vistos = new Set<string>();
    p.asignaciones.forEach((a, j) => {
      if (vistos.has(a.rol)) ctx.addIssue({ code: "custom", path: ["productos", i, "asignaciones", j], message: `El campo ${ETIQUETA_ROL[a.rol]} se repite en el producto ${i + 1}.` });
      vistos.add(a.rol);
    });
  });
  const columnas = new Set<string>();
  const ocupadas = new Map<number, RolLecturaInventario>();
  m.columnas.forEach((c, i) => {
    if (columnas.has(c.rol)) ctx.addIssue({ code: "custom", path: ["columnas", i], message: `El campo ${ETIQUETA_ROL[c.rol]} ya tiene una columna.` });
    columnas.add(c.rol);
    // Una columna entera en varios campos no separa nada: si la celda mezcla datos, se marca
    // el pedazo de cada uno.
    const previo = ocupadas.get(c.columna);
    if (previo) ctx.addIssue({ code: "custom", path: ["columnas", i], message: `La columna ya está en ${ETIQUETA_ROL[previo]}. Si sus celdas traen varios datos, selecciona en una celda el pedazo de cada campo en lugar de la columna entera.` });
    ocupadas.set(c.columna, c.rol);
  });
  if (!m.productos.some((p) => p.asignaciones.length) && !m.columnas.length) ctx.addIssue({ code: "custom", path: ["productos"], message: "Arma al menos un producto o arrastra una columna a un campo." });
});

export type ModeloUsuarioInventario = z.infer<typeof ModeloUsuarioSchema>;
export type AsignacionEjemplo = ModeloUsuarioInventario["productos"][number]["asignaciones"][number];
export type ProductoEjemplo = ModeloUsuarioInventario["productos"][number];

/** Producto ya verificado por el servidor: coordenadas físicas y el texto REAL del archivo. */
export type EjemploVerificado = {
  filaInicio: number;
  campos: { rol: RolLecturaInventario; fila: number; columna: number; texto: string; valor: string }[];
};

export const ETIQUETA_ROL: Record<RolLecturaInventario, string> = {
  tipo: "Tipo", referencia: "Referencia", descripcion: "Descripción",
  cantidad: "Cantidad", valorUnitario: "Valor unitario", valorTotal: "Valor total",
};
export const INICIAL_ROL: Record<RolLecturaInventario, string> = {
  tipo: "T", referencia: "R", descripcion: "D", cantidad: "C", valorUnitario: "U", valorTotal: "V",
};
const NUMERICOS = new Set<RolLecturaInventario>(["cantidad", "valorUnitario", "valorTotal"]);
export const esRolNumerico = (r: RolLecturaInventario) => NUMERICOS.has(r);

export function modeloVacio(hoja: string): ModeloUsuarioInventario {
  return { version: 1, hoja, productos: [{ asignaciones: [] }], columnas: [], secciones: [], totales: [], ignorarFilas: [], ignorarColumnas: [] };
}

const SEPARADORES_BORDE = /[|;·]/;
/** Núcleo de un tramo: sin espacios ni separadores sueltos en los bordes (lo mismo que recorta el motor). */
export function nucleoTramo(texto: string, inicio = 0, fin = texto.length): [number, number] {
  let a = Math.max(0, inicio);
  let b = Math.min(texto.length, fin);
  while (a < b && (/\s/.test(texto[a]) || SEPARADORES_BORDE.test(texto[a]))) a++;
  while (b > a && (/\s/.test(texto[b - 1]) || SEPARADORES_BORDE.test(texto[b - 1]))) b--;
  return [a, b];
}

/** Clave estable para saber si el modelo cambió y no repetir trabajo (ni IA). */
export function claveModelo(modelo: ModeloUsuarioInventario): string {
  const productos = modelo.productos
    .filter((p) => p.asignaciones.length)
    .map((p) => ({ filaInicio: p.filaInicio ?? null, asignaciones: [...p.asignaciones].sort((x, y) => x.rol.localeCompare(y.rol)) }));
  return JSON.stringify({ ...modelo, productos });
}

export type AvisoAsignacion = { nivel: "error" | "aviso"; mensaje: string };

/**
 * Lo que se le dice al usuario AL SOLTAR un dato en un campo, antes de reprocesar. Las mismas
 * reglas que después aplica el motor: así un error no se descubre recién al guardar.
 */
export function avisoAsignacion(r: RolLecturaInventario, texto: string, tramo?: { inicio: number; fin: number }): AvisoAsignacion | null {
  const [a, b] = nucleoTramo(texto, tramo?.inicio, tramo?.fin);
  if (a >= b) return { nivel: "error", mensaje: "La selección está vacía." };
  const fragmento = texto.slice(a, b);
  if (!esRolNumerico(r)) return null;
  if (!/[0-9]/.test(fragmento)) return { nivel: "error", mensaje: `${ETIQUETA_ROL[r]} debe ser un número y «${fragmento.slice(0, 40)}» no tiene cifras.` };
  if (tokenNumerico(fragmento, r).mezclado) return { nivel: "error", mensaje: `Selecciona solo el número: «${fragmento.slice(0, 40)}» mezcla cifras con rótulos u otros valores.` };
  const antes = texto.slice(0, a).trimEnd().at(-1);
  const despues = texto.slice(b).trimStart()[0];
  if ((antes && /[-−(+]/.test(antes)) || (despues && /[)%-]/.test(despues))) return { nivel: "aviso", mensaje: "Junto al número hay un signo o paréntesis: inclúyelo en la selección si hace parte del valor." };
  return null;
}

/** Asigna (o reemplaza) un dato en un producto; quita ese mismo tramo de cualquier otro campo del producto. */
export function asignarEnProducto(producto: ProductoEjemplo, asignacion: AsignacionEjemplo): ProductoEjemplo {
  const mismoTramo = (x: AsignacionEjemplo) => x.fila === asignacion.fila && x.columna === asignacion.columna
    && (x.inicio ?? 0) < (asignacion.fin ?? Infinity) && (asignacion.inicio ?? 0) < (x.fin ?? Infinity);
  return { ...producto, asignaciones: [...producto.asignaciones.filter((x) => x.rol !== asignacion.rol && !mismoTramo(x)), asignacion] };
}

export function quitarDeProducto(producto: ProductoEjemplo, r: RolLecturaInventario): ProductoEjemplo {
  return { ...producto, asignaciones: producto.asignaciones.filter((x) => x.rol !== r) };
}
