// Spec de ESTE archivo a partir de la versión de patrón que le corresponde — puro.
//
// La versión guarda el mapeo con las columnas de su muestra. El archivo puede traer las mismas
// columnas en otra letra, otra fila de encabezado u otros rangos de vencimiento: aquí se trasladan
// por el rótulo que las ubicó (`coincidenciaPatron`). Lo que no se pudo ubicar se avisa.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { detectarFamilias } from "../extraccion/sugerir";
import { letraColumnaModulo, modoClasificadorDe, normalizarSpecModuloArchivo, validarSpecModulo } from "../perfil-modulo";
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

/** Fracción mínima de filas que debe cumplir una señal para mover una columna. */
const UMBRAL_IDENTIFICADOR = 0.9;
const PATRON_IDENTIFICACION = /^\d[\d.\-]{4,}$/;

const textoCelda = (valor: unknown): string => String(valor ?? "").trim();

/**
 * Identificador compartido de la muestra que en ESTE archivo viene repartido en columnas.
 *
 * La muestra de SIESA «por edades» trae en UNA columna el NIT del tercero (su fila de cabecera)
 * y el número del documento (las filas de abajo), así que el patrón mapea `nit` y `documento` a
 * la misma columna. El mismo reporte llega también con el documento en la columna de al lado sin
 * rótulo, o con el NIT repetido en cada fila en otra columna, el nombre bajo «Documento» y el
 * documento en la columna siguiente (TKT CxP Transportes Gómez / María Salomé). Los rótulos
 * coinciden al 100 % y aun así no se leía ningún documento. Aquí se decide por los DATOS: en las
 * filas de documento (las que traen fecha o vencimiento) la columna compartida viene vacía o
 * repite lo de su cabecera; el documento es la columna vecina a la derecha que cambia fila a fila
 * y el NIT, la vecina que tiene forma de identificación. Sin evidencia clara no se toca nada.
 */
function reubicarIdentificadorCompartido(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  hoja: GridHoja,
): { spec: SpecModulo; advertencia?: string } {
  const col = spec.columnas;
  const compartida = col.documento ?? 0;
  if (compartida < 1 || (col.nit ?? 0) !== compartida) return { spec };
  const anclas = [col.fecha ?? 0, col.vencimiento ?? 0].filter((c) => c > 0 && c !== compartida);
  if (anclas.length === 0) return { spec };

  const ocupadas = new Set<number>([
    ...Object.values(col).filter((c) => c > 0),
    ...Object.values(spec.familias ?? {}).flatMap((cols) => cols.map((c) => c.columna)),
  ]);
  ocupadas.delete(compartida);
  const celda = (fila: readonly unknown[], columna: number) => textoCelda(fila[columna - 1]);

  // Filas de documento con su cabecera (la fila no vacía anterior sin fecha ni vencimiento).
  const detalle: { fila: readonly unknown[]; cabecera: readonly unknown[] | null }[] = [];
  const cabeceras: (readonly unknown[])[] = [];
  let cabecera: readonly unknown[] | null = null;
  for (const fila of hoja.filas.slice(Math.max(0, spec.primeraFilaDatos - 1))) {
    if (!fila || fila.every((c) => textoCelda(c) === "")) continue;
    if (anclas.some((c) => celda(fila, c) !== "")) detalle.push({ fila, cabecera });
    else {
      cabecera = fila;
      cabeceras.push(fila);
    }
  }
  if (detalle.length === 0) return { spec };
  const cumple = (n: number, total: number) => total > 0 && n / total >= UMBRAL_IDENTIFICADOR;

  // ¿La columna compartida trae el documento? Si en las filas de documento viene vacía o repite
  // lo de su cabecera, no.
  const noEsDocumento = detalle.filter(({ fila, cabecera: cab }) => {
    const v = celda(fila, compartida);
    return v === "" || (cab != null && v === celda(cab, compartida));
  }).length;
  if (!cumple(noEsDocumento, detalle.length)) return { spec };

  const libre = (c: number) => c >= 1 && !ocupadas.has(c);
  const documento = [compartida + 1, compartida + 2].filter(libre).find((c) => cumple(
    detalle.filter(({ fila, cabecera: cab }) => {
      const v = celda(fila, c);
      return v !== "" && (cab == null || v !== celda(cab, c));
    }).length,
    detalle.length,
  ));
  if (documento == null) return { spec };

  const pareceIdentificacion = (c: number) => {
    const conValor = cabeceras.filter((f) => celda(f, c) !== "");
    return cumple(conValor.filter((f) => PATRON_IDENTIFICACION.test(celda(f, c))).length, conValor.length);
  };
  let nit = compartida;
  let nombre = col.nombre ?? 0;
  if (!pareceIdentificacion(compartida)) {
    const vecina = [compartida - 1, compartida - 2].filter((c) => libre(c) && c !== documento).find(pareceIdentificacion);
    if (vecina != null) {
      nit = vecina;
      if (nombre < 1 && descriptor.columnas.some((r) => r.nombre === "nombre")) nombre = compartida;
    }
  }

  const letra = (c: number) => letraColumnaModulo(c + (hoja.columnaInicial ?? 0));
  const partes = [`documento en ${letra(documento)}`];
  if (nit !== compartida) partes.unshift(`NIT en ${letra(nit)}`);
  if (nombre !== (col.nombre ?? 0)) partes.push(`nombre en ${letra(nombre)}`);
  return {
    spec: { ...spec, columnas: { ...col, nit, documento, ...(nombre > 0 ? { nombre } : {}) } },
    advertencia: `El tercero y el documento vienen en columnas distintas a las de la muestra del patrón: se leen ${partes.join(", ")}.`,
  };
}

export function aplicarPatronASpec(descriptor: DescriptorModulo, ubicacion: UbicacionPatron, hoja?: GridHoja): SpecAplicado {
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

  let final = spec;
  if (hoja) {
    const reubicado = reubicarIdentificadorCompartido(descriptor, spec, hoja);
    final = reubicado.spec;
    if (reubicado.advertencia) advertencias.push(reubicado.advertencia);
  }

  return { spec: normalizarSpecModuloArchivo(descriptor, final), advertencias };
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

/** Rol del centro de costo / grupo que pregunta `confirmarAgrupadorEnCarga` (Nómina). */
export const ROL_AGRUPADOR_CARGA = "agrupador";

export type AgrupadorDeCarga =
  | { ok: true; spec: SpecModulo; separado: boolean }
  | { ok: false; message: string };

/**
 * Aplica al spec de ESTE archivo la respuesta a «¿Separar por centro de costo?» (Nómina,
 * `confirmarAgrupadorEnCarga`). Con «No» el cargue no lee la columna del centro: cada concepto
 * queda en UN renglón del Consolidado y rige lo asignado sin centro (vale para todos los centros).
 * Es un dato del cargue, como el tipo de inventario: la versión del patrón no cambia. Si el
 * patrón no lee esa columna no hay nada que preguntar y el spec sigue igual.
 */
export function aplicarAgrupadorDeCarga(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  separar: boolean | null,
): AgrupadorDeCarga {
  if (!descriptor.confirmarAgrupadorEnCarga || (spec.columnas[ROL_AGRUPADOR_CARGA] ?? 0) < 1) {
    return { ok: true, spec, separado: false };
  }
  if (separar == null) return { ok: false, message: "Indica si este cargue se separa por centro de costo." };
  if (separar) return { ok: true, spec, separado: true };
  const columnas = { ...spec.columnas };
  delete columnas[ROL_AGRUPADOR_CARGA];
  return { ok: true, spec: normalizarSpecModuloArchivo(descriptor, { ...spec, columnas }), separado: false };
}

/** Respuesta a «¿El archivo trae el valor total?» al cargar con patrón (`confirmarTotalEnCarga`). */
export type EleccionTotal = { trae: boolean | null; columna?: number; fila?: number };

export type TotalDeCarga = { ok: true; spec: SpecModulo } | { ok: false; message: string };

/** Última fila de una hoja de Excel: el mismo tope que el esquema del spec. */
const MAX_FILA_HOJA = 1_048_576;

/**
 * Aplica al spec de ESTE archivo la respuesta del analista sobre el valor total (Inventarios). Es
 * un dato del cargue, como el tipo de inventario: la versión del patrón no cambia.
 *
 * - **Sí**: la celda (columna + fila) que ubicó el analista es el gran total del archivo. El modo
 *   de detección del patrón se conserva, así los subtotales por grupo se siguen reconociendo; el
 *   servidor vuelve a leer esa celda del original antes de transformar.
 * - **No**: sin coordenada ni control del total. Un patrón «manual» exige coordenada, así que ese
 *   cargue se lee «por rótulo»: solo las filas rotuladas «Total/Subtotal» salen del detalle, para
 *   no contarlas dos veces.
 */
export function aplicarTotalDeCarga(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  eleccion: EleccionTotal,
  anchoHoja: number,
): TotalDeCarga {
  if (eleccion.trae == null) return { ok: false, message: "Indica si el archivo trae el valor total." };
  const siguiente: SpecModulo = { ...spec };
  delete siguiente.subtotalesFila;
  if (!eleccion.trae) {
    if (siguiente.subtotales === "manual") {
      siguiente.subtotales = "rotulo";
      delete siguiente.subtotalesColumna;
      delete siguiente.subtotalesTexto;
    }
    return { ok: true, spec: normalizarSpecModuloArchivo(descriptor, siguiente) };
  }
  const columna = Number(eleccion.columna);
  const fila = Number(eleccion.fila);
  if (!Number.isInteger(columna) || columna < 1 || columna > anchoHoja) {
    return { ok: false, message: "Elige la columna donde está el valor total." };
  }
  if (!Number.isInteger(fila) || fila < 1 || fila > MAX_FILA_HOJA) {
    return { ok: false, message: "Ubica la fila del valor total en este archivo." };
  }
  siguiente.subtotalesColumna = columna;
  siguiente.subtotalesFila = fila;
  return { ok: true, spec: normalizarSpecModuloArchivo(descriptor, siguiente) };
}
