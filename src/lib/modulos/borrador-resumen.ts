// RESUMEN DEL BORRADOR de un módulo — puro, sin BD.
//
// El borrador solía mandar al navegador TODAS las filas del staging. Con un archivo grande eso
// no llega: el módulo de nómina de INCODOL (125.043 filas) son 73,5 MB de JSON y la página se
// quedaba en el esqueleto para siempre (24/Sep/2026). Ahora la pantalla recibe solo estos
// agregados —calculados con las MISMAS funciones puras de siempre— y pide el detalle de un
// grupo cuando el usuario lo abre.
//
// La fila que entra aquí viene SIN `datos`: esa columna es la pesada (73 de los 74 MB) y traerla
// entera tarda medio minuto contra la base remota. Lo que el criterio necesita de `datos` llega
// aparte y ya resuelto: qué filas en cero imputan, qué cuenta declara cuánto y qué filas tienen
// novedad. Ver `borrador-servidor.ts`.
import type { DescriptorModulo } from "./descriptores";
import { detectarFilasTotalizadoras } from "./fila-totalizadora";
import { controlSubtotales, type ControlSubtotales } from "./subtotales";
import { esRenglonEstructura } from "./renglones-archivo";
import type { ControlesFormatoCartera } from "./cartera/controles-formato";
import type { ColumnaDetalle } from "./cartera/columnas-cartera";

/** Fila del staging tal como la leen la tabla del borrador y la exportación. */
export type FilaBorrador = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
  tipoFila: string;
  omitida: boolean | null;
  motivo?: string | null;
};

/** La misma fila sin `datos`: lo que basta para agrupar, sumar y controlar los subtotales. */
export type FilaSlim = Omit<FilaBorrador, "datos">;

/** Lo que devuelve `filasBorradorModulo`: una página de filas de UN grupo del borrador. */
export type PaginaFilasBorrador = {
  ok: boolean;
  message?: string;
  filas: FilaBorrador[];
  /** Filas del grupo que pasan los filtros (para saber si falta por traer). */
  total: number;
};

/** Cómo se nombra el grupo de las filas que no traen clasificador. */
export const GRUPO_SIN_CLASIFICAR = "(sin clasificar)";

export type GrupoBorrador = {
  clasificador: string;
  /** Filas del grupo que la tabla muestra (sin los renglones de estructura). */
  filas: number;
  /** Renglones de cuenta / sin identificación: ocultos salvo que se pidan. */
  estructura: number;
  /** Filas que se cargarían (imputables). */
  items: number;
  subtotal: number;
  /** Total que el archivo imprime en el renglón de la cuenta, si lo trae. */
  declarado: number | null;
  novedades: number;
};

export type ResumenBorrador = {
  totalFilas: number;
  imputables: number;
  total: number;
  renglonesEstructura: number;
  grupos: GrupoBorrador[];
  /** Agrupadores del archivo, para el datalist de la asignación en bloque. */
  agrupadores: string[];
  columnasVisibles: ColumnaDetalle[];
  columnasOcultas: ColumnaDetalle[];
  /** Filas con novedad (negativos, descuadres, totalizadoras, subtotales que no cuadran). */
  novedades: number[];
  /** true si `novedades` se recortó: la pantalla lo dice en vez de mentir con el conteo. */
  novedadesRecortadas: boolean;
  /** Detalle de las novedades que el panel enumera (recortado: el conteo va aparte). */
  negativos: { filaNum: number; etiqueta: string; valor: number }[];
  negativosFilas: number;
  descuadres: { filaNum: number; etiqueta: string; declarado: number; esperado: number }[];
  descuadresFilas: number;
  totalizadoras: { filaNum: number; valor: number; resto: number }[];
  control: ControlSubtotales;
  controlesFormato: ControlesFormatoCartera | null;
};

/** Tope de filas con novedad que viajan al navegador (solo sirven para resaltar y filtrar). */
const MAX_NOVEDADES = 5_000;
/** Tope del DETALLE que enumera el panel de novedades (el conteo es el real). */
const MAX_DETALLE_NOVEDAD = 50;

export const claveGrupo = (clasificador: string | null | undefined): string => clasificador?.trim() || GRUPO_SIN_CLASIFICAR;

const redondear = (v: number) => Math.round(v * 100) / 100;

export type InsumosResumen = {
  /** TODAS las filas del lote, sin `datos`. */
  filas: readonly FilaSlim[];
  descriptor: DescriptorModulo;
  columnas: readonly ColumnaDetalle[];
  /** Filas con `valor` 0 que aun así imputan porque alguna columna numérica no lo está. */
  imputablesEnCero: ReadonlySet<number>;
  /** Total que el archivo imprime en el renglón de cada cuenta (`seccion_cuenta`). */
  declaradoPorCuenta: ReadonlyMap<string, number>;
  /** Columnas que traen dato en alguna fila del archivo. */
  columnasConDatos: ReadonlySet<string>;
  negativos: { filaNum: number; etiqueta: string; valor: number }[];
  descuadres: { filaNum: number; etiqueta: string; declarado: number; esperado: number }[];
  controlesFormato: ControlesFormatoCartera | null;
};

/**
 * Todo lo que la pantalla del borrador necesita saber del archivo COMPLETO. El veredicto es el
 * mismo que calculaba el navegador: cambia dónde se calcula y cuánto viaja.
 */
export function resumirBorrador(input: InsumosResumen): ResumenBorrador {
  const { filas, descriptor, columnas, imputablesEnCero, declaradoPorCuenta, columnasConDatos } = input;
  const esImputableFila = (f: FilaSlim) =>
    f.tipoFila === "movimiento" && f.omitida !== true && (f.valor !== 0 || imputablesEnCero.has(f.filaNum));

  const imputables = filas.filter(esImputableFila);

  const novedades = new Set<number>([...input.negativos.map((n) => n.filaNum), ...input.descuadres.map((d) => d.filaNum)]);
  const totalizadoras = detectarFilasTotalizadoras(imputables.map((f) => ({ filaNum: f.filaNum, valor: f.valor })));
  for (const t of totalizadoras) novedades.add(t.filaNum);

  const control = controlSubtotales(
    filas.map((f) => ({ ...f, datos: {} })),
    (f) => esImputableFila(f as FilaSlim),
  );
  for (const g of control.grupos) if (g.estado === "descuadre") novedades.add(g.filaSubtotal);
  if (control.granTotal?.estado === "descuadre") novedades.add(control.granTotal.filaNum);

  // Grupos en el orden en que aparecen en el archivo.
  const orden: string[] = [];
  const porGrupo = new Map<string, GrupoBorrador>();
  let renglonesEstructura = 0;
  for (const f of filas) {
    const k = claveGrupo(f.clasificador);
    let g = porGrupo.get(k);
    if (!g) {
      g = { clasificador: k, filas: 0, estructura: 0, items: 0, subtotal: 0, declarado: declaradoPorCuenta.get(k) ?? null, novedades: 0 };
      porGrupo.set(k, g);
      orden.push(k);
    }
    if (esRenglonEstructura(f)) { g.estructura += 1; renglonesEstructura += 1; } else g.filas += 1;
    if (esImputableFila(f)) { g.items += 1; g.subtotal += f.valor; }
    if (novedades.has(f.filaNum)) g.novedades += 1;
  }
  for (const g of porGrupo.values()) g.subtotal = redondear(g.subtotal);

  // Columnas visibles: la del valor y el clasificador siempre; el resto, si el archivo las trae
  // (lo dice `columnasConDatos`) y no son un rango que no suma al saldo.
  const visibles: ColumnaDetalle[] = [];
  const ocultas: ColumnaDetalle[] = [];
  for (const columna of columnas) {
    const fija = columna.esValor === true || columna.nombre === descriptor.clasificador;
    if (fija || columnasConDatos.has(claveColumna(columna))) visibles.push(columna);
    else ocultas.push(columna);
  }

  const listaNovedades = [...novedades].sort((a, b) => a - b);
  return {
    totalFilas: filas.length,
    imputables: imputables.length,
    total: redondear(imputables.reduce((s, f) => s + f.valor, 0)),
    renglonesEstructura,
    grupos: orden.map((k) => porGrupo.get(k)!),
    agrupadores: [...new Set(filas.map((f) => f.clasificador?.trim()).filter((c): c is string => !!c))].sort(),
    columnasVisibles: visibles,
    columnasOcultas: ocultas,
    novedades: listaNovedades.slice(0, MAX_NOVEDADES),
    novedadesRecortadas: listaNovedades.length > MAX_NOVEDADES,
    negativos: input.negativos.slice(0, MAX_DETALLE_NOVEDAD),
    negativosFilas: new Set(input.negativos.map((n) => n.filaNum)).size,
    descuadres: input.descuadres.slice(0, MAX_DETALLE_NOVEDAD),
    descuadresFilas: input.descuadres.length,
    totalizadoras: totalizadoras.map((t) => ({ filaNum: t.filaNum, valor: t.valor, resto: t.resto })),
    control,
    controlesFormato: input.controlesFormato,
  };
}

/** Llave con la que se pregunta si una columna trae dato: el rol, o el rango dentro de su familia. */
export function claveColumna(columna: ColumnaDetalle): string {
  return columna.familia ? `${columna.familia.clave}.${columna.familia.etiqueta}` : columna.nombre;
}
