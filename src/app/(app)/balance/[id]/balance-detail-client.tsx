"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  BotonPantallaCompleta,
  CLASE_TARJETA,
  claseScrollTabla,
  propsRegionPantallaCompleta,
  usePantallaCompletaTabla,
} from "@/components/tabla-pantalla-completa";
import { fmt, fmtPct } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { asignarCuentaEstandar, marcarCuentaPendiente, quitarPendiente, validarAlerta, revertirValidacionAlerta, eliminarDetalleBalance } from "@/app/actions/balance";
import Conversacion from "@/components/conversacion";
import type { NodoBalance } from "@/lib/balance/calcular";
import { esSaldoContrarioAccionable, esSaldoContrarioInformativo, type UmbralesAlertas } from "@/lib/balance/umbrales-alertas";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";
import { useSeleccionFilaTabla } from "@/app/(app)/balance/use-seleccion-fila-tabla";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import type { Tab } from "./tabs";
import PrevalidadorTab from "./prevalidador-tab";
import type { PrevalidadorVM } from "@/lib/balance/prevalidador/calcular";
import type { RevisionPrevalidadorVM } from "@/lib/balance/prevalidador/servidor";
import {
  FILTROS_COLUMNAS_DETALLE_INICIALES,
  OPCIONES_FILTRO_VALIDACION,
  filtrarArbolDetallePorColumnas,
  hayFiltrosColumnasDetalle,
  type FiltrosColumnasDetalle,
  type FiltroValidacionDetalle,
} from "@/lib/balance/filtros-detalle";
import { coincideBusquedaCuenta } from "@/lib/balance/busqueda-cuenta";

export type ValidacionInfo = { tipo: string; por: string; en: string; comentario: string };
// Contexto de validación de alertas que se pasa al renderizador de filas.
type ValCtx = {
  puede: boolean;
  mapa: Record<string, ValidacionInfo>;
  revirtiendo: boolean;
  codigoRevirtiendo: string | null;
  onOk: (n: NodoBalance, tipo: string) => void;
  onRevertir: (code: string) => void;
  /** Umbrales de alerta vigentes (parametrizables en /config/parametros). */
  umbrales: UmbralesAlertas;
};

export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
export type EstandarOpcion = { code: string; name: string };
export type Meta = { rows: number; mapped: number; unmapped: number; critical: number; file: string; fileSize: string; frozenBy: string; frozenAt: string; uploadedBy: string; uploadedAt: string };
export type Version = { /** id del encabezado: abre y exporta esa versión. */ id: number; v: string; /** ¿Es la versión OFICIAL del período? */ esOficial: boolean; date: string; uploadedBy: string; role: string; file: string; size: string; rows: number; sumA: number; balanced: boolean; note: string; /** Notas y aprobaciones transferidas desde el borrador. */ approvalNote: string; changes: number; /** Apertura declarada al cargar (`cuenta` | `tercero`); null en cargues anteriores. */ apertura: string | null };

// Filtro de ALERTAS (vive en el padre: el prevalidador bloqueado salta aquí).
// `alertas` = las dos clases juntas; los otros dos aíslan un tipo.
type Filtro = "todo" | "alertas" | "alertas_mapeo" | "alertas_naturaleza";
// Filtro de CLASE PUC, independiente del de alertas: se combinan.
type Clase = "todo" | "balance" | "er";
type Conteo = { mapeo: number; naturaleza: number };

const CLASES_BALANCE = new Set(["1", "2", "3"]);
const CLASES_ER = new Set(["4", "5", "6", "7"]);
/** Niveles seleccionables en el filtro de profundidad (0 = sin límite). */
const NIVELES_FILTRO = [2, 4, 6, 8] as const;
// Nombre del nivel PUC según la longitud del código: 1=Clase, 2=Grupo, 4=Cuenta,
// 6=Subcuenta, 8=Auxiliar (el nivel 8 es la cuenta del cliente / auxiliar).
const NIVEL_LABEL: Record<number, string> = { 1: "Clase", 2: "Grupo", 4: "Cuenta", 6: "Subcuenta", 8: "Auxiliar" };

export default function BalanceDetailClient({
  arbol, estandar, puedeMapear, puedeRevisarPrevalidador, estaCongelado, validations, versions, warnCount, balanceId, comentarios, validaciones, puedeValidar, puedeEliminar, sums, balanced, diffCuadre, umbrales, prevalidador, revisionPrevalidador, tabInicial = null,
}: {
  arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; puedeRevisarPrevalidador: boolean; estaCongelado: boolean; validations: Validation[]; versions: Version[]; warnCount: number; balanceId: number; comentarios: Record<string, number>; validaciones: Record<string, ValidacionInfo>; puedeValidar: boolean; puedeEliminar: boolean; sums: Sums; balanced: boolean; diffCuadre: number;
  /** Pestaña con la que abre la pantalla (viene de `?tab=`). */
  tabInicial?: Tab | null;
  /** Umbrales de alerta vigentes (parametrizables en /config/parametros). */
  umbrales: UmbralesAlertas;
  /** Informe del prevalidador de homologación (recalculado al leer). */
  prevalidador: PrevalidadorVM;
  revisionPrevalidador: RevisionPrevalidadorVM;
}) {
  const [tab, setTab] = useState<Tab>(tabInicial ?? "breakdown");
  const [filtro, setFiltro] = useState<Filtro>("todo");
  // Desde el prevalidador bloqueado se salta a las cuentas que faltan por homologar.
  const irAAlertas = () => { setFiltro("alertas"); setTab("breakdown"); };
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
        <TabBtn on={tab === "clases"} onClick={() => setTab("clases")} label="Saldos por clase" />
        <TabBtn on={tab === "prevalidador"} onClick={() => setTab("prevalidador")} label="Prevalidador" count={prevalidador.estado === "listo" ? prevalidador.filasConDiferencia : undefined} />
      </div>
      {tab === "breakdown" && <BreakdownTab arbol={arbol} estandar={estandar} puedeMapear={puedeMapear} balanceId={balanceId} comentarios={comentarios} validaciones={validaciones} puedeValidar={puedeValidar} puedeEliminar={puedeEliminar} umbrales={umbrales} filtro={filtro} setFiltro={setFiltro} />}
      {tab === "validations" && <ValidationsTab validations={validations} />}
      {tab === "versions" && <VersionsTab versions={versions} balanceId={balanceId} />}
      {tab === "clases" && <ClasesTab sums={sums} balanced={balanced} diffCuadre={diffCuadre} />}
      {tab === "prevalidador" && (
        <PrevalidadorTab
          prevalidador={prevalidador}
          balanceId={balanceId}
          puedeEditar={puedeMapear}
          puedeRevisar={puedeRevisarPrevalidador}
          estaCongelado={estaCongelado}
          revision={revisionPrevalidador}
          onIrADetalle={irAAlertas}
        />
      )}
    </div>
  );
}

/** Llaves de los nodos con hijos (para expandir/contraer todo). */
function keysConHijos(nodos: NodoBalance[]): string[] {
  const ks: string[] = [];
  const walk = (n: NodoBalance) => { if (n.hijos.length) { ks.push(n.key); n.hijos.forEach(walk); } };
  nodos.forEach(walk);
  return ks;
}

/** ¿La hoja tiene alerta de MAPEO (cuenta sin homologar al plan estándar)? */
function esAlertaMapeo(n: NodoBalance): boolean {
  return !(n.nivel === 8 ? !!n.std : n.mapped);
}

/** ¿La hoja tiene alerta de NATURALEZA (saldo contrario) todavía sin validar? */
function esAlertaNaturaleza(n: NodoBalance, validados: Set<string>, umbrales: UmbralesAlertas): boolean {
  return esSaldoContrarioAccionable(n.balance, n.saldoOk, umbrales) && !validados.has(n.code);
}

/**
 * Poda el árbol dejando solo las ramas con alertas. `tipo` acota a un solo tipo
 * ("Sin mapeo" / "Saldo contrario"); las subcuentas sin mapeo se conservan
 * siempre que el tipo de mapeo esté incluido, porque son la alerta misma.
 */
function podarAlertas(
  nodos: NodoBalance[],
  validados: Set<string>,
  umbrales: UmbralesAlertas,
  tipo: "todas" | "mapeo" | "naturaleza" = "todas",
): NodoBalance[] {
  const incluyeMapeo = tipo !== "naturaleza";
  const incluyeNaturaleza = tipo !== "mapeo";
  const out: NodoBalance[] = [];
  for (const n of nodos) {
    const hijos = podarAlertas(n.hijos, validados, umbrales, tipo);
    const hoja =
      n.hijos.length === 0 &&
      ((incluyeMapeo && esAlertaMapeo(n)) || (incluyeNaturaleza && esAlertaNaturaleza(n, validados, umbrales)));
    const subcuentaSinMapeo = incluyeMapeo && n.nivel === 6 && !n.mapped;
    if (hijos.length > 0 || hoja || subcuentaSinMapeo) out.push({ ...n, hijos });
  }
  return out;
}

/** Poda el árbol por profundidad: descarta lo que está por debajo de `nivelMax`. */
function podarNivel(nodos: NodoBalance[], nivelMax: number): NodoBalance[] {
  if (nivelMax === 0) return nodos;
  return nodos
    .filter((n) => n.nivel <= nivelMax)
    .map((n) => ({ ...n, hijos: podarNivel(n.hijos, nivelMax) }));
}

/** Filtra el árbol por código/nombre: si un nodo coincide, incluye su subárbol completo; si no, solo si algún descendiente coincide. */
function podarBusqueda(nodos: NodoBalance[], needle: string): NodoBalance[] {
  const out: NodoBalance[] = [];
  for (const n of nodos) {
    const self = coincideBusquedaCuenta([n.code, n.std], n.name, needle);
    if (self) { out.push(n); continue; }
    const hijos = podarBusqueda(n.hijos, needle);
    if (hijos.length > 0) out.push({ ...n, hijos });
  }
  return out;
}

/** Cuenta de alertas (mapeo / naturaleza) por nodo, sumando sus hojas. Las alertas
 *  de saldo VALIDADAS (OK+comentario) no cuentan. */
function contarAlertas(arbol: NodoBalance[], validados: Set<string>, umbrales: UmbralesAlertas): Map<string, Conteo> {
  const m = new Map<string, Conteo>();
  const walk = (n: NodoBalance): Conteo => {
    let r: Conteo;
    if (n.hijos.length === 0) {
      r = {
        mapeo: esAlertaMapeo(n) ? 1 : 0,
        naturaleza: esAlertaNaturaleza(n, validados, umbrales) ? 1 : 0,
      };
    } else {
      r = n.hijos.reduce<Conteo>((a, h) => { const c = walk(h); return { mapeo: a.mapeo + c.mapeo, naturaleza: a.naturaleza + c.naturaleza }; }, { mapeo: 0, naturaleza: 0 });
    }
    m.set(n.key, r);
    return r;
  };
  arbol.forEach(walk);
  return m;
}

// El filtro vive en el componente padre para que el prevalidador, cuando está
// bloqueado, pueda mandar al usuario directo a las cuentas que faltan por homologar.
function BreakdownTab({ arbol, estandar, puedeMapear, balanceId, comentarios, validaciones, puedeValidar, puedeEliminar, umbrales, filtro, setFiltro }: { arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; balanceId: number; comentarios: Record<string, number>; validaciones: Record<string, ValidacionInfo>; puedeValidar: boolean; puedeEliminar: boolean; umbrales: UmbralesAlertas; filtro: Filtro; setFiltro: (f: Filtro) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Clase PUC y profundidad son filtros PROPIOS de la tabla y se combinan con el
  // de alertas (que vive arriba). `nivelMax` 0 = sin límite.
  const [clase, setClase] = useState<Clase>("todo");
  const [nivelMax, setNivelMax] = useState(0);
  const [filtrosColumnas, setFiltrosColumnas] = useState<FiltrosColumnasDetalle>({
    ...FILTROS_COLUMNAS_DETALLE_INICIALES,
  });
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  // Por defecto TODO contraído: al entrar se ve el encabezado y solo las clases,
  // colapsadas. El usuario expande lo que necesite.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [asignar, setAsignar] = useState<NodoBalance | null>(null);
  const [comentar, setComentar] = useState<NodoBalance | null>(null);
  const [validar, setValidar] = useState<{ nodo: NodoBalance; tipo: string } | null>(null);
  const [eliminar, setEliminar] = useState<NodoBalance | null>(null);
  const { filaSeleccionada, setFilaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  const tablaRef = useRef<HTMLDivElement>(null);
  // Cuenta homologada desde el modal, para devolverle el foco cuando el árbol
  // llegue recalculado. Se identifica por `detalleId` y NO por la clave del nodo:
  // homologar cambia el padre de la hoja (clase/subgrupo/cuenta estándar), así que
  // su `key` —que incorpora esa ruta— es distinta después del refresco. Se guarda
  // también el estándar destino: es lo que distingue el árbol ya refrescado del que
  // sigue en pantalla mientras `router.refresh()` va en camino.
  const [enfoqueMapeo, setEnfoqueMapeo] = useState<{ detalleId: number; codigoEstandar: string; secuencia: number } | null>(null);
  const pendienteScrollRef = useRef<string | null>(null);
  // Handler de borrado (o null si no puede): controla la visibilidad del botón.
  const onEliminar = puedeEliminar ? setEliminar : null;
  const [revirtiendo, startRevertir] = useTransition();
  const [codigoRevirtiendo, setCodigoRevirtiendo] = useState<string | null>(null);

  // Cuentas cuya alerta de saldo ya fue VALIDADA (retiradas del conteo/poda).
  const validados = useMemo(() => new Set(Object.keys(validaciones)), [validaciones]);
  const val: ValCtx = {
    puede: puedeValidar,
    mapa: validaciones,
    revirtiendo,
    codigoRevirtiendo,
    umbrales,
    onOk: (nodo, tipo) => setValidar({ nodo, tipo }),
    onRevertir: (code) => {
      setCodigoRevirtiendo(code);
      startRevertir(async () => {
        try {
          const r = await revertirValidacionAlerta({ balanceId, anchor: code });
          if (r.ok) { notifySuccess(r.message ?? "Validación revertida."); router.refresh(); }
          else notifyError(r.message ?? "No se pudo revertir.");
        } finally {
          setCodigoRevirtiendo(null);
        }
      });
    },
  };

  // Conteo de alertas (mapeo / naturaleza) por nodo + totales del balance.
  const conteos = useMemo(() => contarAlertas(arbol, validados, umbrales), [arbol, validados, umbrales]);
  const totales = useMemo(
    () => arbol.reduce<Conteo>((a, n) => { const c = conteos.get(n.key); return { mapeo: a.mapeo + (c?.mapeo ?? 0), naturaleza: a.naturaleza + (c?.naturaleza ?? 0) }; }, { mapeo: 0, naturaleza: 0 }),
    [arbol, conteos],
  );
  const totalAlertas = totales.mapeo + totales.naturaleza;
  const filtrosColumnasActivos = hayFiltrosColumnasDetalle(filtrosColumnas);

  // Todos los filtros se ENCADENAN (clase → alertas → nivel → búsqueda →
  // columnas) para poder pedir, p. ej., «solo débitos > $1M de las cuentas sin
  // mapear del estado de resultados».
  const visible = useMemo(() => {
    let base = arbol;
    if (clase === "balance") base = base.filter((n) => CLASES_BALANCE.has(n.clase));
    else if (clase === "er") base = base.filter((n) => CLASES_ER.has(n.clase));
    if (filtro !== "todo") {
      const tipo = filtro === "alertas_mapeo" ? "mapeo" : filtro === "alertas_naturaleza" ? "naturaleza" : "todas";
      base = podarAlertas(base, validados, umbrales, tipo);
    }
    base = podarNivel(base, nivelMax);
    const needle = q.trim().toLowerCase();
    if (needle) base = podarBusqueda(base, needle);
    return filtrarArbolDetallePorColumnas(
      base,
      filtrosColumnas,
      validados,
      umbrales,
    );
  }, [arbol, clase, filtro, filtrosColumnas, nivelMax, q, validados, umbrales]);

  const clavesVisiblesConHijos = useMemo(() => keysConHijos(visible), [visible]);
  // En alertas, búsqueda o filtros de columna, el árbol podado se muestra
  // totalmente expandido. `open` no se modifica: al limpiar se recupera la
  // expansión manual que el usuario tenía antes de filtrar.
  const openEff = useMemo(
    () => (filtro !== "todo" || q.trim() || filtrosColumnasActivos
      ? new Set(clavesVisiblesConHijos)
      : open),
    [clavesVisiblesConHijos, filtro, filtrosColumnasActivos, open, q],
  );
  // Sólo cuentan ramas raíz realmente visibles. Un descendiente puede conservar
  // su llave en `open` cuando su padre se cierra, pero ya no está desplegado.
  const hayContenidoExpandido = visible.some(
    (nodo) => nodo.hijos.length > 0 && openEff.has(nodo.key),
  );

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => setOpen(new Set(keysConHijos(arbol)));
  const contraerTodo = () => setOpen(new Set());
  const actualizarFiltroColumna = <K extends keyof FiltrosColumnasDetalle>(
    columna: K,
    valor: FiltrosColumnasDetalle[K],
  ) => setFiltrosColumnas((actuales) => ({ ...actuales, [columna]: valor }));
  const limpiarFiltrosColumnas = () => setFiltrosColumnas({
    ...FILTROS_COLUMNAS_DETALLE_INICIALES,
  });

  // Devuelve el foco a la cuenta recién homologada: limpia los filtros que la
  // ocultarían (en «Sin mapeo» la fila desaparece justo al resolverse), expande la
  // ruta hasta su NUEVO padre, la deja seleccionada en azul y la desplaza a la vista.
  // Depende de `arbol` y solo actúa cuando la hoja YA cuelga del estándar destino:
  // el árbol que hay en pantalla al confirmar todavía es el anterior, y enfocarlo
  // dejaba el foco en la rama vieja justo antes de que la fila se mudara de sitio.
  // Al aplicarlo se consume el enfoque (`secuencia` permite repetirlo en la misma fila).
  useEffect(() => {
    if (!enfoqueMapeo) return;
    const ruta: string[] = [];
    const buscar = (nodos: NodoBalance[], acumulado: string[]): boolean => {
      for (const n of nodos) {
        const actual = [...acumulado, n.key];
        if (n.detalleId === enfoqueMapeo.detalleId && n.std === enfoqueMapeo.codigoEstandar) { ruta.push(...actual); return true; }
        if (buscar(n.hijos, actual)) return true;
      }
      return false;
    };
    if (!buscar(arbol, [])) return;

    // Los cambios de estado se agrupan en un frame (mismo patrón que el enfoque de
    // reubicación del borrador) para no encadenar renders desde el cuerpo del efecto.
    const frame = window.requestAnimationFrame(() => {
      setQ("");
      setClase("todo");
      setNivelMax(0);
      setFiltrosColumnas({ ...FILTROS_COLUMNAS_DETALLE_INICIALES });
      setFiltro("todo");
      // Los ancestros se abren; la propia hoja no tiene hijos que expandir.
      setOpen((prev) => new Set([...prev, ...ruta.slice(0, -1)]));
      const clave = ruta[ruta.length - 1];
      setFilaSeleccionada(clave);
      pendienteScrollRef.current = clave; // el scroll corre cuando la fila esté montada
      setEnfoqueMapeo(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [arbol, enfoqueMapeo, setFiltro, setFilaSeleccionada]);

  // Desplaza a la vista la fila enfocada en cuanto el commit que la revela termina.
  // Sin lista de dependencias: la fila puede montarse uno o dos renders después de
  // abrirse su rama, y el ref hace que este efecto sea inocuo el resto del tiempo.
  useEffect(() => {
    const clave = pendienteScrollRef.current;
    if (clave == null) return;
    const fila = Array.from(
      tablaRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-selection-key]") ?? [],
    ).find((tr) => tr.dataset.selectionKey === clave);
    if (!fila) return;
    pendienteScrollRef.current = null;
    fila.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });

  const nivelBtn = (nivel: number, label: string) => (
    <button
      key={label}
      type="button"
      aria-pressed={nivelMax === nivel}
      onClick={() => setNivelMax(nivel)}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${nivelMax === nivel ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}
    >
      {label}
    </button>
  );

  // Región propia (no `<Card>`) porque en pantalla completa deja de ser tarjeta y
  // pasa a ser un contenedor fijo en columna; `CLASE_TARJETA` conserva el aspecto.
  return (
    <div role="region" aria-label="Detalle del balance por niveles" {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-4 py-2.5">
        <div className="mr-1 flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código o cuenta…"
            className="w-48 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        {/* Clase PUC: separa el balance (1-2-3) del estado de resultados (4-7). */}
        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          <button type="button" aria-pressed={clase === "todo"} onClick={() => setClase("todo")} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${clase === "todo" ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}>Todas</button>
          <button type="button" aria-pressed={clase === "balance"} onClick={() => setClase("balance")} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${clase === "balance" ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}>Balance</button>
          <button type="button" aria-pressed={clase === "er"} onClick={() => setClase("er")} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${clase === "er" ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}>Resultados</button>
        </div>
        {/* Profundidad del árbol, igual que en el borrador. */}
        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {nivelBtn(0, "Todos")}
          {NIVELES_FILTRO.map((n) => nivelBtn(n, `N${n}`))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <FiltroBtn on={filtro === "todo"} onClick={() => setFiltro("todo")} label="Todo" />
          <FiltroBtn on={filtro === "alertas"} onClick={() => setFiltro("alertas")} label="Alertas" count={totalAlertas} tone="warn" />
          {/* Los dos tipos de alerta se separan porque se atacan distinto: las de
              mapeo se resuelven homologando y las de naturaleza, revisando saldo. */}
          {filtro !== "todo" && (
            <>
              <FiltroBtn on={filtro === "alertas_mapeo"} onClick={() => setFiltro(filtro === "alertas_mapeo" ? "alertas" : "alertas_mapeo")} label="Sin mapeo" count={totales.mapeo} tone="warn" />
              <FiltroBtn on={filtro === "alertas_naturaleza"} onClick={() => setFiltro(filtro === "alertas_naturaleza" ? "alertas" : "alertas_naturaleza")} label="Saldo contrario" count={totales.naturaleza} tone="warn" />
            </>
          )}
          {filtrosColumnasActivos && (
            <button
              type="button"
              onClick={limpiarFiltrosColumnas}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <Icon name="x" size={11} /> Limpiar columnas
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-ink-200" />
          <button onClick={expandirTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">
            <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} /> Expandir todo
          </button>
          <button onClick={contraerTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">
            <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} /> Contraer todo
          </button>
          <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
        </div>
      </div>
      <div ref={tablaRef} className={claseScrollTabla(pantallaCompleta)}>
        <table className="balance-detail-row-hover tabla-encabezado-fijo w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="min-w-48 px-4 py-2 font-semibold">
                Código
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Código"
                  value={filtrosColumnas.codigo}
                  onChange={(valor) => actualizarFiltroColumna("codigo", valor)}
                  placeholder="Buscar código"
                />
              </th>
              <th className="min-w-56 px-4 py-2 font-semibold">
                Cuenta
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Cuenta"
                  value={filtrosColumnas.cuenta}
                  onChange={(valor) => actualizarFiltroColumna("cuenta", valor)}
                  placeholder="Buscar cuenta"
                />
              </th>
              <th className="min-w-44 px-4 py-2 font-semibold">
                Mapeo estándar
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Mapeo estándar"
                  value={filtrosColumnas.mapeo}
                  onChange={(valor) => actualizarFiltroColumna("mapeo", valor)}
                  placeholder="Código o sin mapeo"
                />
              </th>
              <th data-separador="true" className="min-w-40 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Saldo anterior
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo anterior"
                  value={filtrosColumnas.saldoAnterior}
                  onChange={(valor) => actualizarFiltroColumna("saldoAnterior", valor)}
                  placeholder="Ej. > 1000000"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Débito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Débito"
                  value={filtrosColumnas.debito}
                  onChange={(valor) => actualizarFiltroColumna("debito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Crédito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Crédito"
                  value={filtrosColumnas.credito}
                  onChange={(valor) => actualizarFiltroColumna("credito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Saldo
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo"
                  value={filtrosColumnas.saldo}
                  onChange={(valor) => actualizarFiltroColumna("saldo", valor)}
                  placeholder="Ej. < 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-32 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Var %
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Variación porcentual"
                  value={filtrosColumnas.variacion}
                  onChange={(valor) => actualizarFiltroColumna("variacion", valor)}
                  placeholder="Ej. > 25"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-44 px-4 py-2 font-semibold">
                Validación
                <select
                  value={filtrosColumnas.validacion}
                  onChange={(evento) => actualizarFiltroColumna(
                    "validacion",
                    evento.target.value as FiltroValidacionDetalle,
                  )}
                  aria-label="Filtrar la columna Validación"
                  className={CLASE_FILTRO_COLUMNA}
                >
                  {OPCIONES_FILTRO_VALIDACION.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                  ))}
                </select>
              </th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-[12.5px] text-ink-400">{filtrosColumnasActivos ? "Sin cuentas que coincidan con los filtros de columna." : q.trim() ? "Sin cuentas que coincidan con la búsqueda." : filtro !== "todo" ? "Sin alertas para este filtro. 🎉" : "Sin cuentas para este filtro."}</td></tr>
            ) : (
              visible.flatMap((n) => filas(n, 0, openEff, toggle, puedeMapear, setAsignar, conteos, comentarios, setComentar, val, onEliminar, filaSeleccionada))
            )}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-ink-100 bg-white px-4 py-2 text-[11.5px] text-ink-500">
        Normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span>: grupo → cuenta → subcuenta → auxiliar (cuenta del cliente).
      </div>
      {asignar && (
        <AsignarModal
          nodo={asignar}
          estandar={estandar}
          onClose={() => setAsignar(null)}
          onAsignado={(detalleId, codigoEstandar) => setEnfoqueMapeo((actual) => ({ detalleId, codigoEstandar, secuencia: (actual?.secuencia ?? 0) + 1 }))}
        />
      )}
      {comentar && <ComentarModal nodo={comentar} balanceId={balanceId} onClose={() => setComentar(null)} />}
      {validar && <ValidarModal nodo={validar.nodo} tipo={validar.tipo} balanceId={balanceId} onClose={() => setValidar(null)} />}
      {eliminar && <EliminarModal nodo={eliminar} onClose={() => setEliminar(null)} />}
    </div>
  );
}

const CLASE_FILTRO_COLUMNA =
  "mt-1 block h-7 w-full rounded-md border border-ink-200 bg-white px-2 text-[11px] font-normal normal-case tracking-normal text-ink-700 outline-none placeholder:text-ink-400 focus:border-blue-400";

function FiltroTextoColumna({
  ariaLabel,
  value,
  onChange,
  placeholder,
  numerico = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  numerico?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numerico ? "decimal" : "search"}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${CLASE_FILTRO_COLUMNA} ${numerico ? "text-right" : "text-left"}`}
    />
  );
}

/** Renderiza recursivamente las filas (nodo + hijos si está expandido). */
function filas(nodo: NodoBalance, depth: number, open: Set<string>, toggle: (k: string) => void, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void, conteos: Map<string, Conteo>, comentarios: Record<string, number>, onComentar: (n: NodoBalance) => void, val: ValCtx, onEliminar: ((n: NodoBalance) => void) | null, filaSeleccionada: string | null): React.ReactElement[] {
  const tieneHijos = nodo.hijos.length > 0;
  const isOpen = open.has(nodo.key);
  const esGrupo = nodo.nivel !== 8;
  const sinMapeo = nodo.nivel === 6 && !nodo.mapped;
  const pad = 16 + depth * 18;
  // Contadores de alertas del subárbol (solo en nodos de agrupación: clase/subgrupo/cuenta estándar).
  const c = tieneHijos ? conteos.get(nodo.key) : undefined;

  const fila = (
    <tr
      key={nodo.key}
      data-selection-key={nodo.key}
      data-selected={filaSeleccionada === nodo.key ? "true" : undefined}
      className={`border-b border-ink-100 ${esGrupo ? (sinMapeo ? "bg-warn-100" : nodo.nivel <= 2 ? "bg-ink-100" : "bg-ink-50") : "hover:bg-ink-50"} ${tieneHijos ? "cursor-pointer" : ""}`}
      onClick={tieneHijos ? () => toggle(nodo.key) : undefined}
    >
      <td className="px-4 py-2 font-mono text-ink-600" style={{ paddingLeft: pad }}>
        {tieneHijos && <span className="mr-1 inline-block align-middle text-ink-400"><Icon name={chevronDivulgacion(isOpen)} size={12} /></span>}
        <span className={esGrupo ? "font-semibold text-ink-700" : "text-[11.5px] text-ink-500"}>{nodo.code}</span>
        <span className="ml-2 rounded border border-ink-200 bg-white px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-ink-500">{NIVEL_LABEL[nodo.nivel]}</span>
        {c && (c.mapeo > 0 || c.naturaleza > 0) && (
          <span className="ml-2 inline-flex items-center gap-1 align-middle">
            {c.mapeo > 0 && <span title={`${c.mapeo} cuenta(s) sin mapeo`} className="inline-flex items-center gap-0.5 rounded bg-warn-100 px-1 text-[10px] font-semibold text-warn-700"><Icon name="warn" size={9} />{c.mapeo}</span>}
            {c.naturaleza > 0 && <span title={`${c.naturaleza} cuenta(s) con naturaleza/saldo contrario`} className="rounded bg-err-100 px-1 text-[10px] font-semibold text-err-700">±{c.naturaleza}</span>}
          </span>
        )}
      </td>
      <td className={`px-4 py-2 ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>
        {nodo.name}
        {nodo.critical && nodo.nivel === 8 && <span className="ml-2"><Chip label="Crítica" tone="warn" /></span>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onComentar(nodo); }}
          title="Comentarios de esta cuenta"
          className={`ml-2 inline-flex items-center gap-0.5 rounded px-1 align-middle text-[11px] hover:bg-ink-100 ${comentarios[nodo.code] ? "text-blue-600" : "text-ink-400 hover:text-ink-600"}`}
        >
          <Icon name="msg" size={12} />{comentarios[nodo.code] ? <span className="font-semibold">{comentarios[nodo.code]}</span> : null}
        </button>
        {onEliminar && nodo.nivel === 8 && nodo.detalleId != null && !nodo.std && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEliminar(nodo); }}
            title="Eliminar registro sin mapeo del balance"
            className="ml-1.5 inline-flex items-center rounded-md border border-err-300 bg-err-100 px-1.5 py-0.5 align-middle font-bold text-err-700 hover:bg-err-200"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </td>
      <td className="px-4 py-2">{celdaMapeo(nodo, puedeMapear, onAsignar)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-400">{fmt(nodo.prevBalance)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.debe)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.haber)}</td>
      <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(nodo.balance)}</td>
      <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${nodo.variation != null && Math.abs(nodo.variation) > 25 ? "text-warn-700" : "text-ink-600"}`}>{fmtPct(nodo.variation)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2">{celdaValidacion(nodo, val)}</td>
    </tr>
  );

  if (!tieneHijos || !isOpen) return [fila];
  return [fila, ...nodo.hijos.flatMap((h) => filas(h, depth + 1, open, toggle, puedeMapear, onAsignar, conteos, comentarios, onComentar, val, onEliminar, filaSeleccionada))];
}

/** Celda de la columna "Validación": alerta de naturaleza/saldo contrario con botón
 *  "Dar OK", o el mismo "OK" si el saldo ya concuerda o si la alerta ya se dio
 *  por buena (con quién/cuándo/comentario y opción de revertir). */
function celdaValidacion(nodo: NodoBalance, val: ValCtx): React.ReactNode {
  if (nodo.saldoOk) return nodo.nivel === 6 && nodo.mapped ? <Chip label="OK" tone="ok" /> : null;
  const tipo = nodo.nivel === 8 ? "naturaleza" : "saldo_contrario";
  const label = nodo.nivel === 8 ? "Naturaleza" : "Saldo contrario";
  if (esSaldoContrarioInformativo(nodo.balance, nodo.saldoOk, val.umbrales)) {
    return (
      <span
        title={`Saldo contrario de hasta ${fmt(val.umbrales.naturaleza)}: se muestra como información y no requiere “Dar OK”.`}
        className="inline-flex items-center rounded border border-err-100 bg-err-100/35 px-1.5 py-0.5 text-[10px] font-medium text-err-500"
      >
        {label} · informativo
      </span>
    );
  }
  const v = val.mapa[nodo.code];
  if (v) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span title={`OK por ${v.por} · ${v.en}\n“${v.comentario}”`} className="cursor-help"><Chip label="OK" tone="ok" /></span>
        {val.puede && (
          <button type="button" disabled={val.revirtiendo} onClick={(e) => { e.stopPropagation(); val.onRevertir(nodo.code); }} title="Revertir la validación (la alerta reaparece)" className="whitespace-nowrap rounded px-1 text-[10.5px] font-medium text-ink-400 hover:bg-ink-100 hover:text-ink-600 disabled:opacity-60">
            {val.codigoRevirtiendo === nodo.code ? (
              <EstadoProcesando>Revirtiendo</EstadoProcesando>
            ) : (
              "Revertir"
            )}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Chip label={label} tone="err" />
      {val.puede && (
        <button type="button" onClick={(e) => { e.stopPropagation(); val.onOk(nodo, tipo); }} title="Dar OK a esta alerta (exige un comentario justificativo)" className="whitespace-nowrap rounded border border-ok-500 bg-ok-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ok-700 hover:bg-ok-500 hover:text-white">Dar OK</button>
      )}
    </span>
  );
}

function celdaMapeo(nodo: NodoBalance, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void): React.ReactNode {
  if (nodo.nivel === 6) return nodo.mapped ? <Chip label="Russell" tone="ok" /> : <Chip label="Sin mapeo" tone="warn" />;
  if (nodo.nivel !== 8) return null;

  const contenido = nodo.std ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-blue-500">
      {nodo.coincidencia != null && nodo.coincidencia < 100 ? "≈" : "→"} {nodo.std}
      {nodo.coincidencia != null && (
        <span className={`rounded px-1 text-[10px] font-semibold ${nodo.coincidencia >= 85 ? "bg-ok-100 text-ok-700" : nodo.coincidencia >= 55 ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{nodo.coincidencia}%</span>
      )}
      {/* El salto de clase contable es invisible en las sumas (se calculan sobre el
          código del cliente) pero mueve la cuenta de estado financiero en este
          árbol y en el cruce contable: se marca donde se puede corregir. */}
      {cruzaClaseContable(nodo.code, nodo.std) && (
        <span title="La cuenta estándar pertenece a otra clase contable: revisa la homologación" className="rounded bg-err-100 px-1 font-sans text-[10px] font-semibold text-err-700">
          Otra clase
        </span>
      )}
    </span>
  ) : nodo.pendiente ? (
    <Chip label="Pendiente por Asignar" tone="blue" />
  ) : (
    <Chip label="Asignar" tone="warn" />
  );

  if (!puedeMapear || nodo.detalleId == null) return contenido;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAsignar(nodo); }}
      title="Asignar / cambiar la cuenta estándar"
      className="rounded hover:bg-ink-100"
    >
      {contenido}
    </button>
  );
}

function AsignarModal({ nodo, estandar, onClose, onAsignado }: { nodo: NodoBalance; estandar: EstandarOpcion[]; onClose: () => void; onAsignado: (detalleId: number, codigoEstandar: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [codigoSeleccionado, setCodigoSeleccionado] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<"solo" | "grupo" | null>(null);
  // `null` = pantalla inicial (elegir destino); "asignar" es el flujo existente
  // de homologar a un estándar; "pendiente"/"quitar" dejan o quitan el
  // marcador «Pendiente por Asignar» sin elegir ningún estándar.
  const [accion, setAccion] = useState<"asignar" | "pendiente" | "quitar" | null>(null);
  const clase = nodo.code.charAt(0);
  const cuenta6 = nodo.code.slice(0, 6);

  const opciones = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = estandar.filter((o) => (t ? `${o.code} ${o.name}`.toLowerCase().includes(t) : o.code.charAt(0) === clase));
    return base.slice(0, 200);
  }, [estandar, q, clase]);
  const seleccionada = useMemo(
    () => estandar.find((o) => o.code === codigoSeleccionado) ?? null,
    [estandar, codigoSeleccionado],
  );

  const confirmarAsignar = () => {
    if (!seleccionada || !alcance) return;
    const fd = new FormData();
    fd.set("detalleId", String(nodo.detalleId));
    fd.set("codigo", seleccionada.code);
    fd.set("alcance", alcance);
    start(async () => {
      const r = await asignarCuentaEstandar(fd);
      if (r?.ok) {
        notifySuccess(r.message ?? "Cuenta asignada.");
        router.refresh();
        // El enfoque se pide ANTES de cerrar y se resuelve solo cuando el árbol
        // refrescado ya trae la cuenta bajo su nueva rama.
        if (nodo.detalleId != null) onAsignado(nodo.detalleId, seleccionada.code);
        onClose();
      } else notifyError(r?.message ?? "No se pudo asignar la cuenta.");
    });
  };

  // Dejar/quitar pendiente no mueve la cuenta a otra rama del árbol (sigue
  // «Sin mapeo»): basta refrescar y cerrar, sin el enfoque de `onAsignado`.
  const confirmarPendiente = () => {
    if (!alcance || (accion !== "pendiente" && accion !== "quitar")) return;
    const fd = new FormData();
    fd.set("detalleId", String(nodo.detalleId));
    fd.set("alcance", alcance);
    start(async () => {
      const r = accion === "quitar" ? await quitarPendiente(fd) : await marcarCuentaPendiente(fd);
      if (r?.ok) {
        notifySuccess(r.message ?? "Listo.");
        router.refresh();
        onClose();
      } else notifyError(r?.message ?? (accion === "quitar" ? "No se pudo quitar el pendiente." : "No se pudo dejar la cuenta pendiente."));
    });
  };

  const volver = () => { setCodigoSeleccionado(null); setAlcance(null); setAccion(null); };

  const enPasoAlcance = (accion === "asignar" && !!seleccionada) || accion === "pendiente" || accion === "quitar";

  // Las acciones de guardado van en el FOOTER del modal (siempre visible): antes
  // vivían dentro del cuerpo con scroll y en ventanas de poca altura quedaban
  // debajo del fold, así que el usuario elegía la cuenta y no veía cómo guardar.
  const footer = enPasoAlcance ? (
    <>
      <button type="button" disabled={pending} onClick={volver} className="mr-auto rounded-md px-2 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60">
        {accion === "asignar" ? "← Cambiar cuenta estándar" : "← Volver"}
      </button>
      <button
        type="button"
        disabled={pending || !alcance}
        onClick={accion === "asignar" ? confirmarAsignar : confirmarPendiente}
        title={alcance ? "Guardar con el alcance elegido" : "Elige primero el alcance del cambio"}
        className="rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <EstadoProcesando>{accion === "asignar" ? "Homologando" : accion === "quitar" ? "Quitando" : "Guardando"}</EstadoProcesando>
        ) : accion === "asignar" ? "Guardar homologación" : accion === "quitar" ? "Quitar pendiente" : "Dejar pendiente"}
      </button>
    </>
  ) : undefined;

  const titulo = accion === "asignar" && seleccionada
    ? "Confirmar alcance de la homologación"
    : accion === "pendiente"
      ? "Dejar pendiente por asignar"
      : accion === "quitar"
        ? "Quitar pendiente por asignar"
        : "Asignar cuenta estándar";

  return (
    <Modal open onClose={pending ? () => undefined : onClose} title={titulo} size="2xl" footer={footer}>
      {accion === "asignar" && seleccionada ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Homologación seleccionada</p>
            <p className="mt-1 text-[12.5px] text-ink-700">
              <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}
            </p>
            <p className="mt-1 inline-flex items-center gap-2 text-[12.5px] font-semibold text-blue-700">
              <span aria-hidden>→</span>
              <span className="font-mono">{seleccionada.code}</span>
              <span>{seleccionada.name}</span>
            </p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink-800">¿A cuáles cuentas deseas aplicar este cambio?</p>
            <p className="mt-1 text-[12px] text-ink-500">Elige el alcance antes de guardar. La homologación no se ejecutará hasta que confirmes una opción.</p>
            <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-700">
              Con cualquiera de las dos opciones el cambio queda <span className="font-semibold">memorizado para este cliente</span> y se aplica solo en las próximas cargas de balance (los balances ya cargados no se tocan). Puedes revisarlo o deshacerlo en <span className="font-semibold">Configuración › Mapeo plan estándar</span>.
            </p>
          </div>
          <SelectorAlcance nodo={nodo} cuenta6={cuenta6} alcance={alcance} setAlcance={setAlcance} pending={pending} accionLabel="Guardar homologación" />
        </div>
      ) : accion === "pendiente" || accion === "quitar" ? (
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-ink-600">
            Cuenta del cliente <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}.
          </p>
          <p className="rounded-md bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-700">
            {accion === "pendiente" ? (
              <>La dejas <span className="font-semibold">sin estándar a propósito</span> en vez de homologarla ahora. Sigue contando como sin homologar (bloquea congelar/aprobar/conciliar igual que hoy) pero queda marcada con un badge propio, y la próxima carga NO intentará auto-mapearla.</>
            ) : (
              <>Vuelve a estar <span className="font-semibold">sin mapeo normal</span>: la próxima carga podrá auto-homologarla con la cascada, o puedes asignarla a mano.</>
            )}
          </p>
          <div>
            <p className="text-[13px] font-semibold text-ink-800">¿A cuáles cuentas deseas aplicar este cambio?</p>
            <p className="mt-1 text-[12px] text-ink-500">Elige el alcance antes de guardar.</p>
          </div>
          <SelectorAlcance
            nodo={nodo}
            cuenta6={cuenta6}
            alcance={alcance}
            setAlcance={setAlcance}
            pending={pending}
            accionLabel={accion === "pendiente" ? "Dejar pendiente" : "Quitar pendiente"}
            variante={accion}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-600">
            Cuenta del cliente <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}.
            Elige la cuenta del <span className="font-semibold">plan estándar Russell</span> (nivel 6) a la que corresponde.
          </p>
          <p className="rounded-md bg-blue-50 px-3 py-2 text-[11.5px] text-blue-700">
            Después de elegir el destino podrás confirmar si el cambio se aplica <span className="font-semibold">solo a esta cuenta</span> o a <span className="font-semibold">todo el grupo {cuenta6}*</span>. En ambos casos queda memorizado para las próximas cargas de este cliente.
          </p>
          {nodo.pendiente ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <span className="text-[11.5px] text-blue-700">Esta cuenta está marcada <span className="font-semibold">Pendiente por Asignar</span>.</span>
              <button
                type="button"
                onClick={() => setAccion("quitar")}
                className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
              >
                Quitar pendiente
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
              <span className="text-[11.5px] text-ink-600">¿Todavía no sabes a qué cuenta corresponde?</span>
              <button
                type="button"
                onClick={() => setAccion("pendiente")}
                className="shrink-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-100"
              >
                Dejar pendiente por asignar
              </button>
            </div>
          )}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filtra por código o nombre… (por defecto, clase ${clase})`}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          />
          <div className="max-h-80 overflow-y-auto rounded-md border border-ink-150">
            {opciones.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-ink-400">Sin coincidencias.</div>
            ) : (
              opciones.map((o) => (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => { setCodigoSeleccionado(o.code); setAccion("asignar"); }}
                  className="flex w-full items-center gap-3 border-b border-ink-50 px-3 py-2 text-left last:border-0 hover:bg-ink-50"
                >
                  <span className="font-mono text-[11.5px] font-semibold text-ink-700">{o.code}</span>
                  <span className="text-[12.5px] text-ink-700">{o.name}</span>
                  {o.code === nodo.std && <span className="ml-auto"><Chip label="Actual" tone="ok" /></span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Selector solo/grupo compartido entre «asignar», «dejar pendiente» y «quitar pendiente». */
function SelectorAlcance({ nodo, cuenta6, alcance, setAlcance, pending, accionLabel, variante }: {
  nodo: NodoBalance; cuenta6: string; alcance: "solo" | "grupo" | null; setAlcance: (a: "solo" | "grupo") => void; pending: boolean; accionLabel: string;
  variante?: "pendiente" | "quitar";
}) {
  const detalleSolo = variante === "quitar"
    ? `Quita el marcador únicamente de ${nodo.code}. Las demás cuentas del grupo ${cuenta6}* conservan el suyo si lo tuvieran.`
    : variante === "pendiente"
      ? `Deja pendiente únicamente ${nodo.code}, memorizado como excepción de esa cuenta. Las demás cuentas del grupo ${cuenta6}* conservan su homologación actual.`
      : `Modifica únicamente ${nodo.code} y la memoriza como excepción de esa cuenta. Las demás cuentas del grupo ${cuenta6}* conservan su homologación actual.`;
  const detalleGrupo = variante === "quitar"
    ? `Quita el marcador de todas las cuentas ${cuenta6}* que lo tuvieran.`
    : variante === "pendiente"
      ? `Deja pendientes todas las cuentas ${cuenta6}* y memoriza la regla del grupo (reemplaza cualquier homologación previa del grupo).`
      : `Aplica a todas las cuentas ${cuenta6}* y memoriza la regla del grupo (reemplaza las excepciones que hubiera en él).`;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          { valor: "solo" as const, titulo: "Solo esta cuenta", detalle: detalleSolo },
          { valor: "grupo" as const, titulo: "Todas las cuentas del grupo", detalle: detalleGrupo },
        ]).map((opcion) => {
          const activa = alcance === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activa}
              disabled={pending}
              onClick={() => setAlcance(opcion.valor)}
              className={`group rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${activa ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white hover:border-blue-300 hover:bg-blue-50"}`}
            >
              <span className={`flex items-center gap-2 text-[12.5px] font-semibold ${activa ? "text-white" : "text-ink-800 group-hover:text-blue-700"}`}>
                <span aria-hidden className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border ${activa ? "border-white" : "border-ink-300"}`}>
                  {activa && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                {opcion.titulo}
              </span>
              <span className={`mt-1 block text-[11.5px] leading-relaxed ${activa ? "text-white/90" : "text-ink-500"}`}>{opcion.detalle}</span>
            </button>
          );
        })}
      </div>
      {!alcance && <p className="text-[11.5px] text-ink-500">Selecciona una de las dos opciones para habilitar <span className="font-semibold">{accionLabel}</span>.</p>}
    </div>
  );
}

/** Comentarios de una cuenta puntual del balance (anclados por su código). */
function ComentarModal({ nodo, balanceId, onClose }: { nodo: NodoBalance; balanceId: number; onClose: () => void }) {
  const router = useRouter();
  return (
    <Modal open onClose={onClose} title={`Comentarios · ${nodo.code} — ${nodo.name}`} size="2xl">
      {/* Al publicar, refresca la página para que el badge azul de comentarios del
          informe (conteo por cuenta, calculado server-side) se actualice. */}
      <Conversacion tipo="balance" entityId={balanceId} anchor={nodo.code} titulo={`${NIVEL_LABEL[nodo.nivel]} ${nodo.code} · ${nodo.name}`} onPublicado={() => router.refresh()} />
    </Modal>
  );
}

/** Validar (dar OK a) una alerta: exige un comentario justificativo. El comentario
 *  se publica en la conversación de la cuenta y la alerta se retira de la vista. */
function ValidarModal({ nodo, tipo, balanceId, onClose }: { nodo: NodoBalance; tipo: string; balanceId: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState("");
  const label = tipo === "naturaleza" ? "Naturaleza" : "Saldo contrario";
  const listo = texto.trim().length >= 3;
  const guardar = () => {
    if (!listo) { notifyError("Escribe un comentario para validar la alerta."); return; }
    start(async () => {
      const r = await validarAlerta({ balanceId, anchor: nodo.code, tipoAlerta: tipo, comentario: texto.trim() });
      if (r.ok) { notifySuccess(r.message ?? "Alerta validada."); router.refresh(); onClose(); }
      else notifyError(r.message ?? "No se pudo validar la alerta.");
    });
  };
  return (
    <Modal open onClose={onClose} title={`Validar alerta · ${label}`} size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          Cuenta <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}. Vas a dar <span className="font-semibold">OK</span> a la alerta de <span className="font-semibold">{label.toLowerCase()}</span>: la alerta se retira de la vista y queda registrada como validada.
        </p>
        <p className="rounded-md bg-blue-50 px-3 py-2 text-[11.5px] text-blue-700">
          El <span className="font-semibold">comentario es obligatorio</span> — justifica por qué el saldo es correcto pese a la alerta. Se publicará en la conversación de la cuenta.
        </p>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Comentario obligatorio: motivo por el que esta cuenta está correcta…"
          className="min-h-[96px] resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50 disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={guardar} disabled={pending || !listo} className="rounded-md bg-ok-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <EstadoProcesando>Validando</EstadoProcesando> : "Validar y dar OK"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Confirmación para eliminar una cuenta (línea de detalle) del balance oficial. */
function EliminarModal({ nodo, onClose }: { nodo: NodoBalance; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const eliminar = () => {
    if (nodo.detalleId == null) return;
    start(async () => {
      const r = await eliminarDetalleBalance(nodo.detalleId!);
      if (r.ok) { notifySuccess(r.message ?? "Cuenta eliminada."); router.refresh(); onClose(); }
      else notifyError(r.message ?? "No se pudo eliminar la cuenta.");
    });
  };
  return (
    <Modal open onClose={onClose} title="Eliminar registro del balance" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          Vas a eliminar del balance el registro <span className="font-semibold">{nodo.name}</span>
          {nodo.code ? <span className="font-mono text-ink-500"> ({nodo.code})</span> : null}
          {" "}— saldo {fmt(nodo.balance)}. Se quita del detalle y los totales/mapeo se recalculan.
        </p>
        <p className="rounded-md bg-err-100 px-3 py-2 text-[11.5px] text-err-700">
          Esta acción no se puede deshacer. Úsala para retirar filas que no son cuentas (p. ej. «Totales Prueba», totales del reporte).
        </p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50 disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={eliminar} disabled={pending} className="rounded-md bg-err-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar registro"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Saldos totales por clase contable (PUC) + indicador de cuadre. Chequeo rápido de completitud. */
function ClasesTab({ sums, balanced, diffCuadre }: { sums: Sums; balanced: boolean; diffCuadre: number }) {
  const fila = (label: string, valor: number, bold = false) => (
    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 last:border-0">
      <span className={`text-[12.5px] ${bold ? "font-semibold text-ink-800" : "text-ink-600"}`}>{label}</span>
      <span className={`whitespace-nowrap font-mono text-[13px] ${bold ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(valor)}</span>
    </div>
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11.5px] text-ink-500">Totales por clase contable (PUC). Sirve para confirmar que el balance subió completo y cuadrado.</span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="text-[11.5px] text-ink-500" title="Σ saldos firmados (débito − crédito) ≈ 0">Cuadre</span>
          {balanced ? <Chip label="Cuadrado" tone="ok" /> : <Chip label={`Descuadra · dif ${fmt(diffCuadre)}`} tone="err" />}
        </span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-ink-100">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Balance general</div>
          {fila("Activo", sums.activo)}
          {fila("Pasivo", sums.pasivo)}
          {fila("Patrimonio", sums.patrimonio)}
        </div>
        <div className="overflow-hidden rounded-lg border border-ink-100">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Estado de resultado</div>
          {fila("Ingresos", sums.ingresos)}
          {fila("Costos", sums.costos)}
          {fila("Gastos", sums.gastos)}
          {fila("Utilidad", sums.utilidad, true)}
        </div>
      </div>
    </Card>
  );
}

function ValidationsTab({ validations }: { validations: Validation[] }) {
  const { filaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="balance-detail-row-hover w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Regla</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {validations.map((v) => (
              <tr key={v.id} data-selection-key={v.id} data-selected={filaSeleccionada === v.id ? "true" : undefined} className="border-b border-ink-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink-800">{v.rule}</td>
                <td className="px-4 py-2.5">{v.status === "ok" ? <Chip label="OK" tone="ok" /> : <Chip label={`${v.count ?? ""} ${v.count === 1 ? "alerta" : "alertas"}`} tone="warn" />}</td>
                <td className="px-4 py-2.5 text-ink-500">{v.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Descarga de UNA versión concreta (misma ruta que el menú del encabezado, con
 *  el id de esa versión). El prevalidador se omite aquí a propósito: puede estar
 *  bloqueado y responder 409, y su sitio es la pantalla de la versión. */
function DescargaVersion({ id, version }: { id: number; version: string }) {
  const boton = (tipo: "homologado" | "comparativo", etiqueta: string, titulo: string) => (
    <a
      href={`/balance/${id}/export?tipo=${tipo}`}
      title={`${titulo} · versión ${version}`}
      aria-label={`${titulo} de la versión ${version}`}
      className="inline-flex items-center gap-1 rounded border border-ink-200 px-1.5 py-1 text-[10.5px] font-semibold text-ink-600 transition hover:border-ok-300 hover:bg-ok-100/40 hover:text-ok-700"
    >
      <Icon name="download" size={11} /> {etiqueta}
    </a>
  );
  return (
    <div className="flex items-center justify-end gap-1">
      {boton("homologado", "Homologado", "Balance homologado al plan estándar Russell")}
      {boton("comparativo", "Comparativo", "Comparativo homologado vs cuentas del cliente")}
    </div>
  );
}

function VersionsTab({ versions, balanceId }: { versions: Version[]; balanceId: number }) {
  const { filaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="balance-detail-row-hover w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 font-semibold">Tipo de balance</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Cuentas</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Activo</th>
              <th className="border-l border-ink-150 px-4 py-2 font-semibold">Cuadrado</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Cambios</th>
              <th className="px-4 py-2 font-semibold">Nota</th>
              <th className="border-l border-ink-150 px-4 py-2 text-right font-semibold">Descargar</th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {versions.map((v, i) => (
              <tr key={v.v} data-selection-key={v.v} data-selected={filaSeleccionada === v.v ? "true" : undefined} className="border-b border-ink-100 last:border-0 align-top">
                <td className="px-4 py-2.5">
                  {/* La versión que se está viendo no se enlaza a sí misma; las
                      demás abren su propia pantalla (antes solo se llegaba a
                      ellas escribiendo la URL a mano). */}
                  {v.id === balanceId ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Chip label={v.esOficial ? `${v.v} · oficial` : v.v} tone={v.esOficial ? "ok" : "ink"} />
                      <span className="text-[10.5px] text-ink-400">esta</span>
                    </span>
                  ) : (
                    <Link href={`/balance/${v.id}`} title={`Abrir la versión ${v.v}`} className="inline-flex">
                      <Chip label={v.esOficial ? `${v.v} · oficial` : v.v} tone={v.esOficial ? "ok" : "blue"} />
                    </Link>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-ink-500">{v.date}</td>
                <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{v.uploadedBy}</div><div className="text-[11px] text-ink-400">{v.role}</div></td>
                <td className="px-4 py-2.5 text-ink-600">{v.file}<div className="text-[11px] text-ink-400">{v.size}</div></td>
                <td className="px-4 py-2.5">
                  {/* Apertura DECLARADA por quien cargó cada versión (no una heurística). */}
                  {parsearApertura(v.apertura) ? (
                    <Chip
                      label={etiquetaApertura(v.apertura)}
                      tone={parsearApertura(v.apertura) === "tercero" ? "blue" : "ink"}
                    />
                  ) : (
                    <span className="text-ink-400" title="Versión cargada antes de registrar el tipo de balance.">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-700">{v.rows}</td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-700">{fmt(v.sumA)}</td>
                <td className="border-l border-ink-150 px-4 py-2.5">{v.balanced ? <Chip label="Sí" tone="ok" /> : <Chip label="Descuadra" tone="err" />}</td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-600">{i === versions.length - 1 ? "—" : `+${v.changes}`}</td>
                <td className="px-4 py-2.5 text-ink-500">
                  {v.note}
                  {v.approvalNote && (
                    // Las notas de revisión viven aparte de la nota automática: aquí
                    // se muestran además de ella, recortadas; el banner lleva el texto.
                    <div
                      title={v.approvalNote}
                      className="mt-1 line-clamp-2 max-w-xs border-l-2 border-blue-300 pl-2 text-[11px] text-blue-700"
                    >
                      {v.approvalNote}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right">
                  <DescargaVersion id={v.id} version={v.v} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      {count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>}
    </button>
  );
}

function FiltroBtn({ on, onClick, label, count, tone }: { on: boolean; onClick: () => void; label: string; count?: number; tone?: "warn" }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${on ? "bg-navy-700 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-ink-100 text-ink-500"}`}>{count}</span>
      )}
    </button>
  );
}
