/**
 * ÁRBOL del balance abierto por tercero — la misma lectura jerárquica del
 * borrador de balance (grupo → cuenta → subcuenta → auxiliar) pero cuyo último
 * peldaño, la cuenta imputable, se abre en sus TERCEROS.
 *
 * Módulo PURO (sin BD ni `server-only`). Recibe las filas de
 * `balance_tercero_detalle` tal como se guardaron y reconstruye:
 *
 *  · Las AGRUPADORAS que el archivo trajo como fila propia (1305, 130505…: sin
 *    NIT ni nombre de tercero, código de menos de 8 díg.). Su saldo es el
 *    DECLARADO por el archivo; la suma de sus hijas se compara y la diferencia
 *    se expone como `descuadre`, igual que en el borrador.
 *  · Las IMPUTABLES (8 díg.). El archivo suele traer, además de la fila por
 *    tercero, una fila «propia» de la cuenta (sin NIT ni nombre) con su total:
 *    es el subtotal declarado, NO un tercero — si se sumara junto a los terceros
 *    el saldo se contaría dos veces. Sin fila propia, el total es Σ terceros.
 *  · Los niveles que el archivo NO trajo (típicamente el grupo de 2 díg.) se
 *    derivan del código y suman a sus hijas; el nombre del grupo sale del PUC.
 *
 * Los montos NO se persisten agregados: se recalculan al leer, así que cambiar
 * una regla aquí se refleja de inmediato en los cargues existentes.
 */

import { GRUPOS_PUC } from "./calcular";
import { coincideFiltroNumerico } from "./filtros-detalle";
import { codigoEmpiezaPor } from "./busqueda-cuenta";
import type { FilaBalanceTercero } from "./tercero-vista";

export type NivelArbolTercero = 2 | 4 | 6 | 8;

export type Montos = {
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/** Una fila (cuenta imputable × tercero) tal como vino en el archivo. */
export type TerceroDeCuenta = Montos & {
  id: number;
  nit: string | null;
  nombre: string | null;
};

export type NodoArbolTercero = Montos & {
  codigo: string;
  nivel: NivelArbolTercero;
  /** Nombre de la cuenta; `null` cuando el nivel se derivó y el PUC no lo conoce. */
  nombre: string | null;
  tipoFila: "agrupadora" | "movimiento";
  /** `true` si el archivo trajo una fila propia para este código (montos declarados). */
  declarado: boolean;
  /** Solo imputables: cuenta Russell homologada (null = sin homologar). */
  cuenta6Russell: string | null;
  /** Declarado − Σ hijas (o Σ terceros). `null` si no hay fila declarada o nada que sumar. */
  descuadre: number | null;
  /** NITs únicos bajo el nodo. */
  terceros: number;
  /** Filas de tercero sin NIT bajo el nodo (no cruzan contra el auxiliar). */
  filasSinNit: number;
  hijos: NodoArbolTercero[];
  /** Solo imputables: los terceros que componen la cuenta, en el orden del archivo. */
  detalleTerceros: TerceroDeCuenta[];
  /**
   * Marca de FILTRADO: la lista de terceros se podó por una coincidencia
   * (búsqueda o filtro de tercero) y la UI debe abrirla sola.
   */
  abrirTerceros?: boolean;
};

const MONTOS_CERO: Montos = { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };

function sumarMontos(a: Montos, b: Montos): Montos {
  return {
    saldoInicial: a.saldoInicial + b.saldoInicial,
    debitos: a.debitos + b.debitos,
    creditos: a.creditos + b.creditos,
    saldoFinal: a.saldoFinal + b.saldoFinal,
  };
}

function soloDigitos(codigo: string): string {
  return codigo.replace(/\D/g, "");
}

/** Nivel PUC del código: 2/4/6 exactos; todo lo más largo que 6 es imputable (8). */
export function nivelDeCodigo(codigo: string): NivelArbolTercero {
  const n = soloDigitos(codigo).length;
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  return 8;
}

/** Código del padre por prefijo (2 ← 4 ← 6 ← 8); `null` para la raíz. */
export function codigoPadre(codigo: string): string | null {
  const nivel = nivelDeCodigo(codigo);
  if (nivel === 2) return null;
  const largoPadre = nivel === 8 ? 6 : nivel - 2;
  return soloDigitos(codigo).slice(0, largoPadre);
}

/**
 * Fila «propia» de una cuenta: el archivo la trajo sin tercero (ni NIT ni
 * nombre). Para agrupadoras es la única forma que existe; para imputables es el
 * subtotal declarado de la cuenta.
 */
export function esFilaPropiaDeCuenta(fila: Pick<FilaBalanceTercero, "nitTercero" | "nombreTercero">): boolean {
  return !fila.nitTercero?.trim() && !fila.nombreTercero?.trim();
}

type NodoEnConstruccion = NodoArbolTercero & {
  montosDeclarados: Montos | null;
  nits: Set<string>;
};

function nombreDerivado(codigo: string, nivel: NivelArbolTercero): string | null {
  if (nivel === 2) return GRUPOS_PUC[codigo] ?? null;
  return null;
}

/**
 * Construye el árbol completo a partir de las filas del detalle. Determinista:
 * las hermanas se ordenan por código y los terceros conservan el orden de
 * inserción del archivo (id ascendente).
 */
export function construirArbolTercero(filas: readonly FilaBalanceTercero[]): NodoArbolTercero[] {
  const nodos = new Map<string, NodoEnConstruccion>();
  const raices: NodoEnConstruccion[] = [];

  const asegurar = (codigoCrudo: string): NodoEnConstruccion => {
    const codigo = soloDigitos(codigoCrudo) || codigoCrudo;
    const existente = nodos.get(codigo);
    if (existente) return existente;
    const nivel = nivelDeCodigo(codigo);
    const nodo: NodoEnConstruccion = {
      codigo,
      nivel,
      nombre: nombreDerivado(codigo, nivel),
      tipoFila: nivel === 8 ? "movimiento" : "agrupadora",
      declarado: false,
      cuenta6Russell: null,
      descuadre: null,
      terceros: 0,
      filasSinNit: 0,
      hijos: [],
      detalleTerceros: [],
      ...MONTOS_CERO,
      montosDeclarados: null,
      nits: new Set<string>(),
    };
    nodos.set(codigo, nodo);
    const padre = codigoPadre(codigo);
    if (padre === null) raices.push(nodo);
    else asegurar(padre).hijos.push(nodo);
    return nodo;
  };

  const ordenadas = [...filas].sort((a, b) => a.id - b.id);
  for (const f of ordenadas) {
    const nodo = asegurar(f.cuenta8);
    // El nombre lo aporta cualquier fila del código (la primera no vacía).
    if (!nodo.nombre && f.nombreCuenta?.trim()) nodo.nombre = f.nombreCuenta.trim();
    if (!nodo.cuenta6Russell && f.cuenta6Russell) nodo.cuenta6Russell = f.cuenta6Russell;

    const montos: Montos = {
      saldoInicial: f.saldoInicial,
      debitos: f.debitos,
      creditos: f.creditos,
      saldoFinal: f.saldoFinal,
    };
    if (esFilaPropiaDeCuenta(f)) {
      // Fila propia → montos DECLARADOS del código (si vienen varias, se suman).
      nodo.declarado = true;
      nodo.montosDeclarados = sumarMontos(nodo.montosDeclarados ?? MONTOS_CERO, montos);
      continue;
    }
    // Una fila con tercero bajo un código de menos de 8 díg. es raro pero posible
    // (ERP que imputa directo en la subcuenta): se trata como imputable igual.
    nodo.tipoFila = "movimiento";
    nodo.detalleTerceros.push({
      id: f.id,
      nit: f.nitTercero?.trim() || null,
      nombre: f.nombreTercero?.trim() || null,
      ...montos,
    });
  }

  const consolidar = (nodo: NodoEnConstruccion): void => {
    nodo.hijos.sort((a, b) => a.codigo.localeCompare(b.codigo));
    let suma: Montos = MONTOS_CERO;
    let hayQueSumar = false;
    for (const t of nodo.detalleTerceros) {
      suma = sumarMontos(suma, t);
      hayQueSumar = true;
      if (t.nit) nodo.nits.add(t.nit);
      else nodo.filasSinNit += 1;
    }
    for (const hija of nodo.hijos) {
      const h = hija as NodoEnConstruccion;
      consolidar(h);
      suma = sumarMontos(suma, h);
      hayQueSumar = true;
      for (const nit of h.nits) nodo.nits.add(nit);
      nodo.filasSinNit += h.filasSinNit;
    }
    const finales = nodo.montosDeclarados ?? suma;
    nodo.saldoInicial = finales.saldoInicial;
    nodo.debitos = finales.debitos;
    nodo.creditos = finales.creditos;
    nodo.saldoFinal = finales.saldoFinal;
    nodo.descuadre = nodo.montosDeclarados && hayQueSumar
      ? redondear(nodo.montosDeclarados.saldoFinal - suma.saldoFinal)
      : null;
    nodo.terceros = nodo.nits.size;
  };

  raices.sort((a, b) => a.codigo.localeCompare(b.codigo));
  raices.forEach(consolidar);

  const limpiar = (nodo: NodoEnConstruccion): NodoArbolTercero => {
    const { montosDeclarados: _m, nits: _n, hijos, ...resto } = nodo;
    void _m; void _n;
    return { ...resto, hijos: hijos.map((h) => limpiar(h as NodoEnConstruccion)) };
  };
  return raices.map(limpiar);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export type ResumenArbolTercero = Montos & {
  cuentas: number;
  terceros: number;
  filasSinNit: number;
  saldoSinNit: number;
  homologadas: number;
  sinHomologar: number;
  /** Nodos con fila declarada cuyo total no cuadra con su desglose. */
  descuadres: number;
};

/** Los números que encabezan la pantalla, sacados del árbol (sin doble conteo). */
export function resumirArbolTercero(arbol: readonly NodoArbolTercero[]): ResumenArbolTercero {
  const nits = new Set<string>();
  let cuentas = 0;
  let homologadas = 0;
  let filasSinNit = 0;
  let saldoSinNit = 0;
  let descuadres = 0;
  let total: Montos = MONTOS_CERO;

  const rec = (n: NodoArbolTercero) => {
    if (n.descuadre != null && n.descuadre !== 0) descuadres += 1;
    if (n.tipoFila === "movimiento") {
      cuentas += 1;
      if (n.cuenta6Russell) homologadas += 1;
      for (const t of n.detalleTerceros) {
        if (t.nit) nits.add(t.nit);
        else {
          filasSinNit += 1;
          saldoSinNit += t.saldoFinal;
        }
      }
    }
    n.hijos.forEach(rec);
  };
  for (const raiz of arbol) {
    rec(raiz);
    total = sumarMontos(total, raiz);
  }

  return {
    ...total,
    cuentas,
    terceros: nits.size,
    filasSinNit,
    saldoSinNit,
    homologadas,
    sinHomologar: cuentas - homologadas,
    descuadres,
  };
}

// ---------------------------------------------------------------------------
// Filtros de la tabla (búsqueda global, columnas y nivel máximo).
// ---------------------------------------------------------------------------

export type FiltroHomologadaTercero = "todas" | "si" | "no";

export const OPCIONES_FILTRO_HOMOLOGADA: { value: FiltroHomologadaTercero; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "si", label: "Homologadas" },
  { value: "no", label: "Sin homologar" },
];

export type FiltrosColumnasTercero = {
  codigo: string;
  cuenta: string;
  tercero: string;
  saldoAnterior: string;
  debito: string;
  credito: string;
  saldo: string;
  homologada: FiltroHomologadaTercero;
};

export const FILTROS_COLUMNAS_TERCERO_INICIALES: FiltrosColumnasTercero = {
  codigo: "",
  cuenta: "",
  tercero: "",
  saldoAnterior: "",
  debito: "",
  credito: "",
  saldo: "",
  homologada: "todas",
};

export function hayFiltrosColumnasTercero(f: FiltrosColumnasTercero): boolean {
  return f.codigo.trim() !== ""
    || f.cuenta.trim() !== ""
    || f.tercero.trim() !== ""
    || f.saldoAnterior.trim() !== ""
    || f.debito.trim() !== ""
    || f.credito.trim() !== ""
    || f.saldo.trim() !== ""
    || f.homologada !== "todas";
}

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Los NIT se comparan también sin puntos ni guiones: el usuario copia «901.660.053». */
function coincideTercero(t: TerceroDeCuenta, entrada: string): boolean {
  const q = normalizar(entrada);
  if (!q) return true;
  const qNit = q.replace(/[.\-\s]/g, "");
  const nit = normalizar(t.nit);
  return nit.includes(q)
    || (qNit !== "" && nit.replace(/[.\-\s]/g, "").includes(qNit))
    || normalizar(t.nombre).includes(q);
}

function coincideMontos(m: Montos, f: FiltrosColumnasTercero): boolean {
  return coincideFiltroNumerico(m.saldoInicial, f.saldoAnterior)
    && coincideFiltroNumerico(m.debitos, f.debito)
    && coincideFiltroNumerico(m.creditos, f.credito)
    && coincideFiltroNumerico(m.saldoFinal, f.saldo);
}

export type OpcionesFiltroArbolTercero = {
  /** Búsqueda global: prefijo de código, nombre de cuenta, NIT o nombre del tercero. */
  busqueda?: string;
  filtros?: FiltrosColumnasTercero;
  /** 0 = todos los niveles; 2/4/6/8 = poda lo más profundo que ese nivel. */
  nivelMax?: number;
  /** Solo cuentas imputables sin homologar (con sus ancestros). */
  soloSinHomologar?: boolean;
};

/**
 * Poda el árbol conservando cada coincidencia con su ruta de ancestros. Los
 * terceros se filtran dentro de su cuenta: si la coincidencia vino por el
 * tercero (NIT/nombre), la cuenta queda marcada `abrirTerceros` para que la UI
 * la despliegue sola. Sin criterios devuelve el mismo array (identidad).
 */
export function filtrarArbolTercero(
  arbol: readonly NodoArbolTercero[],
  opciones: OpcionesFiltroArbolTercero,
): NodoArbolTercero[] {
  const busqueda = normalizar(opciones.busqueda);
  const filtros = opciones.filtros ?? FILTROS_COLUMNAS_TERCERO_INICIALES;
  const nivelMax = opciones.nivelMax ?? 0;
  const soloSinHomologar = opciones.soloSinHomologar ?? false;
  const hayColumnas = hayFiltrosColumnasTercero(filtros);
  if (!busqueda && !hayColumnas && nivelMax === 0 && !soloSinHomologar) return [...arbol];

  const filtroCodigo = normalizar(filtros.codigo);
  const filtroCuenta = normalizar(filtros.cuenta);
  const filtroTercero = filtros.tercero.trim();
  const hayCriterioTercero = filtroTercero !== "" || busqueda !== "";

  const coincideCuenta = (n: NodoArbolTercero): boolean => {
    if (filtroCodigo && !codigoEmpiezaPor(n.codigo, filtroCodigo)) return false;
    if (filtroCuenta && !normalizar(n.nombre).includes(filtroCuenta)) return false;
    if (!coincideMontos(n, filtros)) return false;
    if (n.tipoFila === "movimiento") {
      if (filtros.homologada === "si" && !n.cuenta6Russell) return false;
      if (filtros.homologada === "no" && n.cuenta6Russell) return false;
      if (soloSinHomologar && n.cuenta6Russell) return false;
    } else if (filtros.homologada !== "todas" || soloSinHomologar) {
      // La homologación es de la imputable: la agrupadora solo pasa como ancestro.
      return false;
    }
    // Un filtro de tercero exige que la cuenta tenga algún tercero que lo cumpla.
    if (filtroTercero && !n.detalleTerceros.some((t) => coincideTercero(t, filtroTercero))) return false;
    return true;
  };

  const coincideBusquedaCuenta = (n: NodoArbolTercero): boolean =>
    busqueda === "" || codigoEmpiezaPor(n.codigo, busqueda) || normalizar(n.nombre).includes(busqueda);

  const podar = (rama: readonly NodoArbolTercero[]): NodoArbolTercero[] => {
    const resultado: NodoArbolTercero[] = [];
    for (const nodo of rama) {
      if (nivelMax > 0 && nodo.nivel > nivelMax) continue;
      const hijos = podar(nodo.hijos);

      // Terceros: se conservan los que cumplen el filtro de tercero Y (la búsqueda
      // global coincide con la cuenta O con el propio tercero).
      const cuentaCoincideBusqueda = coincideBusquedaCuenta(nodo);
      let terceros = nodo.detalleTerceros;
      let tercerosPodados = false;
      if (hayCriterioTercero || hayColumnas) {
        terceros = nodo.detalleTerceros.filter((t) =>
          (filtroTercero === "" || coincideTercero(t, filtroTercero))
          && (cuentaCoincideBusqueda || coincideTercero(t, busqueda)),
        );
        tercerosPodados = terceros.length !== nodo.detalleTerceros.length;
      }
      const coincidePorTercero = !cuentaCoincideBusqueda && busqueda !== "" && terceros.length > 0;
      const coincideColumnas = coincideCuenta(nodo);
      const coincidePropia = coincideColumnas && (cuentaCoincideBusqueda || coincidePorTercero);

      if (coincidePropia) {
        resultado.push({
          ...nodo,
          hijos,
          detalleTerceros: terceros,
          abrirTerceros: coincidePorTercero || (tercerosPodados && terceros.length > 0) || undefined,
        });
      } else if (hijos.length > 0) {
        // Ancestro de una coincidencia: se conserva la ruta, sin sus terceros.
        resultado.push({ ...nodo, hijos, detalleTerceros: [] });
      }
    }
    return resultado;
  };

  return podar(arbol);
}

/** Cuenta nodos (sin terceros) — para los contadores de la barra. */
export function contarNodosArbolTercero(arbol: readonly NodoArbolTercero[]): number {
  let n = 0;
  const rec = (x: NodoArbolTercero) => { n += 1; x.hijos.forEach(rec); };
  arbol.forEach(rec);
  return n;
}

/** Códigos de todos los nodos con algo que desplegar (hijas o terceros). */
export function codigosDesplegables(arbol: readonly NodoArbolTercero[]): Set<string> {
  const s = new Set<string>();
  const rec = (x: NodoArbolTercero) => {
    if (x.hijos.length > 0 || x.detalleTerceros.length > 0) s.add(x.codigo);
    x.hijos.forEach(rec);
  };
  arbol.forEach(rec);
  return s;
}
