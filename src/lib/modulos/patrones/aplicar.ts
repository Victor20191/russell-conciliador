// Spec de ESTE archivo a partir de la versión de patrón que le corresponde — puro.
//
// La versión guarda el mapeo con las columnas de su muestra. El archivo puede traer las mismas
// columnas en otra letra, otra fila de encabezado u otros rangos de vencimiento: aquí se trasladan
// por el rótulo que las ubicó (`coincidenciaPatron`). Lo que no se pudo ubicar se avisa.
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { detectarFamilias } from "../extraccion/sugerir";
import { modoClasificadorDe, normalizarSpecModuloArchivo, validarSpecModulo } from "../perfil-modulo";
import type { UbicacionPatron } from "./mejor-version";
import { esRotuloFamilia, normalizarRotulo } from "./rotulos";

export type SpecAplicado = { spec: SpecModulo; advertencias: string[] };

type Familias = NonNullable<SpecModulo["familias"]>;

/**
 * Rangos de vencimiento del archivo, con la clase que la versión les dio (una columna que el
 * administrador marcó «excluir» sigue excluida) y sin las que retiró del mapeo.
 */
function familiasDelArchivo(
  descriptor: DescriptorModulo,
  ubicacion: UbicacionPatron,
  columnasDeRoles: ReadonlySet<number>,
): Familias | undefined {
  const base = ubicacion.version.spec;
  const detectadas = detectarFamilias(descriptor, ubicacion.encabezadoArchivo);
  if (!detectadas) return undefined;
  const salida: Familias = {};
  for (const [nombre, columnas] of Object.entries(detectadas)) {
    const delPatron = base.familias?.[nombre] ?? [];
    if (delPatron.length === 0) continue;
    const incluidas = new Map(delPatron.map((c) => [normalizarRotulo(c.etiqueta), c]));
    // Rótulos de familia que la muestra traía pero el patrón NO lee: el administrador los quitó.
    const retiradas = new Set(
      ubicacion.version.encabezado
        .filter((celda) => esRotuloFamilia(descriptor, celda))
        .map((celda) => normalizarRotulo(celda))
        .filter((rotulo) => !incluidas.has(rotulo)),
    );
    const elegidas = columnas
      .filter((c) => !columnasDeRoles.has(c.columna))
      .filter((c) => !retiradas.has(normalizarRotulo(c.etiqueta)))
      .map((c) => {
        const clase = incluidas.get(normalizarRotulo(c.etiqueta))?.clase;
        return clase ? { ...c, clase } : c;
      });
    if (elegidas.length > 0) salida[nombre] = elegidas;
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
}

export function aplicarPatronASpec(descriptor: DescriptorModulo, ubicacion: UbicacionPatron): SpecAplicado {
  const { version, coincidencia } = ubicacion;
  const base = version.spec;
  const mapa = coincidencia.mapaColumnas;
  const advertencias: string[] = [];
  const rotuloDe = (columna: number): string => {
    const texto = String(version.encabezado[columna - 1] ?? "").trim();
    return texto ? `«${texto}»` : "sin rótulo";
  };

  const columnas: Record<string, number> = {};
  for (const rol of descriptor.columnas) {
    const columna = base.columnas[rol.nombre] ?? 0;
    if (columna < 1) {
      columnas[rol.nombre] = 0;
      continue;
    }
    const destino = mapa[columna];
    columnas[rol.nombre] = destino ?? 0;
    if (destino == null) advertencias.push(`No se encontró la columna de «${rol.etiqueta}» (${rotuloDe(columna)}): no se leerá.`);
  }

  const spec: SpecModulo = {
    ...base,
    hoja: ubicacion.hoja,
    filaEncabezado: ubicacion.filaEncabezado,
    primeraFilaDatos: ubicacion.filaEncabezado + Math.max(1, version.primeraFilaDatos - version.filaEncabezado),
    columnas,
  };
  delete spec.familias;
  delete spec.subtotalesFila;

  if (descriptor.familiasDinamicas?.length) {
    const usadas = new Set(Object.values(columnas).filter((c) => c > 0));
    const familias = familiasDelArchivo(descriptor, ubicacion, usadas);
    if (familias) spec.familias = familias;
    else if (Object.keys(base.familias ?? {}).length > 0) {
      advertencias.push("El archivo no trae los rangos de vencimiento del patrón.");
    }
  }

  if (base.subtotales === "manual") {
    const destino = base.subtotalesColumna ? mapa[base.subtotalesColumna] : undefined;
    if (destino != null) spec.subtotalesColumna = destino;
    else {
      spec.subtotales = "auto";
      delete spec.subtotalesColumna;
      delete spec.subtotalesTexto;
      advertencias.push("No se encontró la columna que marca los totales: se detectarán automáticamente.");
    }
  }

  if (base.filaTercero) {
    const rotulo = mapa[base.filaTercero.columnaRotulo];
    const clave = mapa[base.filaTercero.columnaClave];
    const nombre = base.filaTercero.columnaNombre ? mapa[base.filaTercero.columnaNombre] : undefined;
    if (rotulo != null && clave != null) {
      spec.filaTercero = { ...base.filaTercero, columnaRotulo: rotulo, columnaClave: clave, ...(nombre != null ? { columnaNombre: nombre } : {}) };
      if (base.filaTercero.columnaNombre && nombre == null) delete spec.filaTercero.columnaNombre;
    } else {
      delete spec.filaTercero;
      advertencias.push("No se encontraron las columnas de la fila rotulada del tercero.");
    }
  }

  return { spec: normalizarSpecModuloArchivo(descriptor, spec), advertencias };
}

/** Columna del clasificador que el analista confirmó al cargar: -1 = un único valor para todo el archivo. */
export const CLASIFICADOR_GLOBAL_CARGA = -1;

export type EleccionClasificador = { columna: number; modo?: string | null };

export type ClasificadorDeCarga =
  | { ok: true; spec: SpecModulo; cambio: boolean }
  | { ok: false; message: string };

/**
 * Aplica al spec de ESTE archivo la columna del clasificador que el analista confirmó al cargar
 * con un patrón (Inventarios: «Tipo de inventario», `confirmarClasificadorEnCarga`). Es un dato
 * del cargue, como la fila del total: la versión del patrón no cambia.
 *
 * Una columna nueva conserva el modo del patrón (con uno global pasa a «columna») salvo que el
 * analista pida «columna» o «arrastrar»; «sección» solo se mantiene si el patrón ya lo usaba,
 * porque depende de otros ajustes que la confirmación no pide.
 */
export function aplicarClasificadorDeCarga(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  eleccion: EleccionClasificador,
  anchoHoja: number,
): ClasificadorDeCarga {
  const rol = descriptor.clasificador;
  const etiqueta = descriptor.columnas.find((c) => c.nombre === rol)?.etiqueta ?? "clasificador";
  const modoActual = modoClasificadorDe(spec);
  const columnaActual = spec.columnas[rol] ?? 0;
  let siguiente: SpecModulo;
  if (eleccion.columna === CLASIFICADOR_GLOBAL_CARGA) {
    siguiente = { ...spec, clasificadorModo: "global" };
  } else if (Number.isInteger(eleccion.columna) && eleccion.columna >= 1 && eleccion.columna <= anchoHoja) {
    const pedido = eleccion.modo === "columna" || eleccion.modo === "arrastrar"
      ? eleccion.modo
      : eleccion.modo === "seccion" && modoActual === "seccion" ? "seccion" : null;
    const modo = pedido ?? (modoActual === "global" ? "columna" : modoActual);
    siguiente = { ...spec, columnas: { ...spec.columnas, [rol]: eleccion.columna }, clasificadorModo: modo };
  } else {
    return { ok: false, message: `Confirma la columna de «${etiqueta}» de este archivo.` };
  }
  delete siguiente.arrastrarClasificador;
  const normalizado = normalizarSpecModuloArchivo(descriptor, siguiente);
  const error = validarSpecModulo(descriptor, normalizado);
  if (error) return { ok: false, message: error };
  const modoNuevo = modoClasificadorDe(normalizado);
  const cambio = modoNuevo !== modoActual || (modoNuevo !== "global" && normalizado.columnas[rol] !== columnaActual);
  return { ok: true, spec: normalizado, cambio };
}
