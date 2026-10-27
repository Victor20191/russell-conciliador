"use client";

import { hayReporteConErrores, motivoReporteConErrores, type ReporteConErrores } from "@/lib/modulos/cartera/reporte-con-errores";
import { motivoCedulasVariosNombres, type CedulaConVariosNombres } from "@/lib/modulos/nomina/validaciones-nomina";
import { Fragment, useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon, IconoEnTexto } from "@/components/icons";
import { fmtContable } from "@/lib/format";
import type { FormatoManualBorrador } from "@/lib/modulos/formatos-manuales";
import { CasillaPatronManual } from "./casilla-patron-manual";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { useAvisoSalidaSinGuardar } from "@/lib/usar-aviso-salida";
import ComentarioAncla from "@/components/comentario-ancla";
import { BotonPantallaCompleta, CLASE_TARJETA, claseScrollTabla, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import { esImputable } from "@/lib/modulos/promocion";
import { coincideGrupoDetalle, hayFiltrosDetalleModulo, type FiltrosDetalleModulo } from "@/lib/modulos/filtros-detalle-modulo";
import { alternarOrden, ordenarFilas, type OrdenTabla } from "@/lib/modulos/orden-tabla";
import { AYUDA_COMODIN } from "@/lib/filtro-comodin";
import { EncabezadoOrdenable } from "@/components/encabezado-ordenable";
import { textoCeldaDetalle, tituloCeldaDetalle, valorColumnaDetalle } from "@/lib/modulos/celda-detalle-modulo";
import { controlSeccion, etiquetaRenglonNoSuma, etiquetaSinItems, explicacionSinItems, indiceColumnaValor } from "@/lib/modulos/renglones-archivo";
import { grupoDeFila, type ResumenBorrador } from "@/lib/modulos/borrador-resumen";
import { rolDeAgruparPor, type AgruparPorNomina } from "@/lib/modulos/nomina/agrupar-por";
import type { ReconciliacionModulo } from "@/lib/modulos/extraccion/transformar";
import { aplicarCambiosBorradorModulo, cambiarAgruparPorBorrador, cargarBorradorModulo, descartarBorradorModulo, filasBorradorModulo } from "@/app/actions/modulos-datos";
import { NotasCargaModulo } from "../../notas-carga-modulo";
import { ValidacionArchivo } from "../../validacion-archivo";
import type { OpcionNombreClasificador } from "@/lib/modulos/nombre-clasificador";
import { NombreAgrupador, type GrupoSinNombreVm } from "./nombre-agrupador";
import { avisosContenido, INFO_CONTENIDO_ARCHIVO, type SignoContenido } from "@/lib/modulos/ingresos/contenido-archivo";
import type { ContenidoActivos } from "@/lib/modulos/activos/contenido-archivo";
import { CorregirLecturaInventario } from "../../corregir-lectura-inventario";
import type { RolModulo } from "../../editor-mapeo-modulo";
import type { EstadoAsistenciaInventario } from "@/lib/modulos/asistencia-inventario-estado";
import { mesActualColombia, motivoPeriodoFuturo, nombrePeriodo, rangoDelPeriodo } from "@/lib/fecha-cargue";
import { ConfirmacionFecha } from "@/components/confirmacion-fecha";

export type FilaBorradorModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
  tipoFila: string;
  omitida: boolean | null;
  /** Por qué el motor marcó la fila como subtotal (`total`), si aplica. */
  motivo?: string | null;
  /** Nómina agrupada por nombre o por cuenta: el grupo de la fila (no cambia al editar el código). */
  grupo?: string | null;
};
type Columna = { nombre: string; etiqueta: string; tipo: string; esValor?: boolean; familia?: { clave: string; etiqueta: string } };

/** Nómina: «Agrupar por» del borrador (código, nombre o cuenta del cliente). */
export type AgruparPorBorradorVm = {
  actual: AgruparPorNomina;
  etiqueta: string;
  /** Un anexo se agrupa como el cargue al que se suma: el selector no se cambia. */
  fija: boolean;
  opciones: { id: AgruparPorNomina; etiqueta: string; disponible: boolean; motivo: string | null }[];
};

type VersionHermanaBorradorModulo = { loteId: string; version: number; archivoNombre: string; fecha: string };
const FILTRO_NOVEDADES = "__novedades__";

function MenuVersionesBorradorModulo({
  moduloCodigo,
  loteId,
  hermanos,
}: {
  moduloCodigo: string;
  loteId: string;
  hermanos: VersionHermanaBorradorModulo[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        title="Versiones en borrador de este cliente y período"
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
      >
        <Icon name="log" size={12} />
        Versiones
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">{hermanos.length}</span>
        <Icon name="chev-d" size={11} />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-1 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Borradores de este cliente y período
            </div>
            <div className="max-h-72 overflow-y-auto">
              {hermanos.map((hermano) => {
                const actual = hermano.loteId === loteId;
                return (
                  <div key={hermano.loteId} className={`flex items-center gap-2 border-b border-ink-50 px-3 py-2 last:border-0 ${actual ? "bg-blue-100" : "hover:bg-ink-50"}`}>
                    <span className="w-12 shrink-0">
                      {actual ? (
                        <Chip label={`v${hermano.version}`} tone="blue" />
                      ) : (
                        <Link href={`/modulos/${moduloCodigo.toLowerCase()}/borradores/${hermano.loteId}`} className="text-[12px] font-semibold text-blue-600 hover:underline">
                          v{hermano.version}
                        </Link>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-ink-700" title={hermano.archivoNombre}>{hermano.archivoNombre}</span>
                      <span className="block text-[10.5px] text-ink-400">{hermano.fecha}{actual ? " · estás aquí" : ""}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Las alertas de Inventarios no bloquean la carga, pero el comentario se exige al cerrar. */
const AVISO_COMENTARIO_CIERRE = "Al cerrar la conciliación se pedirá un comentario sobre esta alerta (en Novedades del cargue).";

export default function BorradorModuloClient({
  moduloCodigo,
  loteId,
  loteRowId,
  comentarios,
  cliente,
  periodoSugerido,
  columnas: columnasDelCargue,
  clasificadorRol,
  descripcionRol = null,
  noNegativos,
  productos,
  verificaciones,
  alertasConComentario = [],
  reporteConErrores = null,
  cedulasVariosNombres = [],
  resumen,
  agruparPor = null,
  reconciliacion,
  anexo,
  contenidoActivos,
  contenido = null,
  sinNombre = [],
  opcionesNombre = [],
  version,
  hermanos,
  notasCliente = null,
  rolesAsistenciaInventario,
  asistenciaInventario,
  propuestaPatron = null,
  formatoManual = null,
}: {
  moduloCodigo: string;
  loteId: string;
  loteRowId: number;
  comentarios: Record<string, number>;
  cliente: string;
  periodoSugerido: string;
  columnas: Columna[];
  clasificadorRol: string;
  /** Columna con el NOMBRE del grupo cuando el clasificador es un código (Nómina). */
  descripcionRol?: string | null;
  noNegativos: string[];
  productos: { resultado: string; cantidad: string; unitario: string }[];
  verificaciones: { id: string; texto: string }[];
  /** Alertas que, ya cargado, exigirán un comentario por tipo para cerrar la conciliación (Inventarios). */
  alertasConComentario?: string[];
  /** Cartera y CxP: documento repetido entre terceros o vencimiento imposible; bloquean aprobar. */
  reporteConErrores?: ReporteConErrores | null;
  /** Nómina: cédulas con más de un nombre de empleado; bloquean aprobar. */
  cedulasVariosNombres?: CedulaConVariosNombres[];
  /** Agregados del archivo COMPLETO, calculados en el servidor: las filas se piden por grupo. */
  resumen: ResumenBorrador;
  /**
   * Nómina: por qué se agrupan las filas («Agrupar por»: código, nombre o cuenta del cliente), las
   * opciones que el archivo trae y si se puede cambiar (un anexo se agrupa como su cargue).
   */
  agruparPor?: AgruparPorBorradorVm | null;
  reconciliacion: ReconciliacionModulo | null;
  /** Anexo declarado con «Agregar archivo»: a qué cargue se suma, su total y qué ítems repite. */
  anexo: { version: number; periodo: string; repetidos: string[]; vigente: boolean; totalActual: number } | null;
  /** Activos fijos: qué declaró el analista que trae este archivo (costo, depreciación o ambos). */
  contenidoActivos?: ContenidoActivos | null;
  /** Ingresos: qué declaró el analista que trae el archivo y qué se hizo con el signo. */
  contenido?: SignoContenido | null;
  /** Filas «(sin clasificar)» y «GLOBAL» (nombradas por el sistema), a las que se les puede poner nombre. */
  sinNombre?: GrupoSinNombreVm[];
  /** Nombres que se ofrecen: los del cargue destino del anexo y los de la memoria del cliente. */
  opcionesNombre?: OpcionNombreClasificador[];
  version: number | null;
  hermanos: VersionHermanaBorradorModulo[];
  /** Notas de carga del cliente para este módulo (Administración › Perfiles de carga). */
  notasCliente?: string | null;
  /** Sólo se ofrece para un original INV de aplicativo; Archivo manual conserva su flujo. */
  rolesAsistenciaInventario?: RolModulo[];
  asistenciaInventario?: { revision: number; estado: EstadoAsistenciaInventario };
  /**
   * El aplicativo no tenía patrón para este archivo: al confirmar se puede guardar el formato como
   * patrón (`aplicativo`) o se explica por qué no (`motivo`). `null` = no aplica.
   */
  propuestaPatron?: { aplicativo: string | null; motivo: string | null } | null;
  /** «Archivo manual»: qué pasa con el patrón manual del cliente al confirmar. `null` = no aplica. */
  formatoManual?: FormatoManualBorrador | null;
}) {
  const router = useRouter();
  // «Guardar este formato como patrón del aplicativo», marcada por defecto.
  const [guardarComoPatron, setGuardarComoPatron] = useState(true);
  // «Guardar este patrón manual para {cliente}», marcada por defecto (21/Oct/2026).
  const [guardarFormatoManual, setGuardarFormatoManual] = useState(true);
  const clasificadorEtiqueta = columnasDelCargue.find((c) => c.nombre === clasificadorRol)?.etiqueta ?? "Tipo";
  // Nómina, «Agrupar por»: los grupos se nombran por la dimensión elegida. Por nombre o por cuenta,
  // la columna que identifica al grupo es la de esa dimensión (y no la del código).
  const etiquetaGrupo = agruparPor?.etiqueta ?? clasificadorEtiqueta;
  const otraDimension = agruparPor != null && agruparPor.actual !== "codigo";
  const rolesGrupo = useMemo(
    () => (otraDimension && agruparPor
      ? { clasificador: rolDeAgruparPor(agruparPor.actual), descripcion: null }
      : { clasificador: clasificadorRol, descripcion: descripcionRol }),
    [agruparPor, clasificadorRol, descripcionRol, otraDimension],
  );
  const [cambiandoAgrupar, startCambioAgrupar] = useTransition();
  const columnasNumericas = columnasDelCargue.filter((c) => !c.familia && (c.tipo === "numero" || c.tipo === "moneda")).map((c) => c.nombre);
  // Columnas vacías en todo el cargue y rangos que no suman: ocultas hasta que se pidan (las
  // decide el servidor, que es quien ve el archivo entero).
  const [verTodasColumnas, setVerTodasColumnas] = useState(false);
  const columnas = verTodasColumnas ? columnasDelCargue : resumen.columnasVisibles;
  const idxValor = indiceColumnaValor(columnas);
  const [overrideOmit, setOverrideOmit] = useState<Record<number, boolean>>({});
  // Subtotal del archivo ↔ movimiento: rescatar un falso positivo («Incluir» en una fila
  // `total`) o marcar a mano uno que el motor no detectó («Marcar subtotal»).
  const [overrideTipo, setOverrideTipo] = useState<Record<number, "movimiento" | "total">>({});
  const [overrideClasif, setOverrideClasif] = useState<Record<number, string>>({});
  const [agrupadorManual, setAgrupadorManual] = useState("");
  const [periodo, setPeriodo] = useState(periodoSugerido);
  // Un período distinto del que se eligió al cargar se confirma antes de guardarlo (se guarda
  // QUÉ valor se confirmó: cambiarlo otra vez vuelve a preguntar) y nunca puede ser futuro.
  const [periodoConfirmado, setPeriodoConfirmado] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>>({});
  const [observaciones, setObservaciones] = useState("");
  const [filtro, setFiltro] = useState<string | null>(null); // null = todos · FILTRO_NOVEDADES · o un clasificador
  const [filtrosColumnas, setFiltrosColumnas] = useState<FiltrosDetalleModulo>({});
  // Orden por columna: ordena los GRUPOS por su clasificador o su nombre (aquí, que la lista ya
  // está) y las filas de cada grupo (en el servidor: la página es una porción del grupo).
  const [orden, setOrden] = useState<OrdenTabla>(null);
  const [guardando, startGuardar] = useTransition();
  const [cargando, startCargar] = useTransition();
  const [descartando, startDescartar] = useTransition();
  // Descartar el BORRADOR lo borra entero: se confirma en el mismo lugar, como en el de balance.
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  const tablaRef = useRef<HTMLDivElement>(null);
  // DETALLE BAJO DEMANDA: el archivo puede traer cientos de miles de filas, así que la tabla
  // abre agrupada y solo pide al servidor las filas del grupo que el usuario despliega.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [filasPorGrupo, setFilasPorGrupo] = useState<Record<string, FilaBorradorModulo[]>>({});
  const [totalPorGrupo, setTotalPorGrupo] = useState<Record<string, number>>({});
  const [cargandoGrupos, setCargandoGrupos] = useState<Set<string>>(new Set());
  // Toda fila que llegó del servidor, aunque un filtro, el orden o el chip de un grupo hayan soltado
  // después su grupo. Los cambios sin guardar se calculan sobre ellas: si se tomaran solo de las
  // filas cargadas, el total de un grupo cerrado (y el general) volvería a la cifra guardada y no
  // descontaría lo que el usuario omitió (IGB, Activos fijos: 15240505 mostraba 646 M cerrado y
  // 217,9 M abierto). Se vacía al guardar o al descartar.
  const [filasVistas, setFilasVistas] = useState<Record<number, FilaBorradorModulo>>({});

  const filas = useMemo(() => Object.values(filasPorGrupo).flat(), [filasPorGrupo]);

  /** La fila con los cambios sin guardar aplicados. */
  const efectivaDe = useCallback(
    (f: FilaBorradorModulo) => {
      const clasificador = f.filaNum in overrideClasif ? (overrideClasif[f.filaNum] || null) : f.clasificador;
      const tipoFila = f.filaNum in overrideTipo ? overrideTipo[f.filaNum] : f.tipoFila;
      return {
        ...f,
        tipoFila,
        // Un total nunca está «omitido»: al cambiar de tipo el tri-estado se limpia.
        omitida: f.filaNum in overrideTipo ? null : f.filaNum in overrideOmit ? overrideOmit[f.filaNum] : f.omitida,
        clasificador,
      };
    },
    [overrideOmit, overrideClasif, overrideTipo],
  );
  const efectivas = useMemo(() => filas.map(efectivaDe), [filas, efectivaDe]);

  // Tipo/omisión ORIGINAL por fila: al aplicar en bloque, si el destino coincide con
  // el original se borra el override (no marca «cambios sin guardar» falsos).
  const vistas = useMemo(() => Object.values(filasVistas), [filasVistas]);
  const omitOriginal = useMemo(() => new Map(vistas.map((f) => [f.filaNum, f.omitida === true])), [vistas]);
  const tipoOriginal = useMemo(() => new Map(vistas.map((f) => [f.filaNum, f.tipoFila])), [vistas]);
  const clasifOriginal = useMemo(() => new Map(vistas.map((f) => [f.filaNum, f.clasificador ?? ""])), [vistas]);
  // Agrupadores ya presentes en el archivo (para el datalist de entrada manual).
  const agrupadoresExistentes = resumen.agrupadores;

  // Los controles del tipo de formato (Cartera y CxP) y el de subtotales se calculan en el
  // servidor sobre el archivo completo; con cambios sin guardar la pantalla avisa que se
  // recalculan al guardar, en vez de calcularlos sobre las pocas filas cargadas.
  const controlesFormato = resumen.controlesFormato;
  const control = resumen.control;

  const hayCambiosFilas = Object.keys(overrideOmit).length + Object.keys(overrideClasif).length + Object.keys(overrideTipo).length > 0;
  const periodoCambiado = periodo !== periodoSugerido;
  const periodoValido = /^\d{4}-\d{2}$/.test(periodo);
  const errorPeriodo = periodoValido && anexo?.vigente !== true ? motivoPeriodoFuturo(periodo) : null;
  const periodoSinConfirmar = periodoCambiado && periodoValido && !errorPeriodo && periodoConfirmado !== periodo;
  const hayCambios = hayCambiosFilas || periodoCambiado;
  const asistenciaSinResolver = asistenciaInventario != null && asistenciaInventario.estado !== "borrador_preparado";
  useAvisoSalidaSinGuardar(hayCambios, "Tienes cambios sin guardar en el borrador: pulsa «Guardar cambios» o «Descartar cambios» antes de salir.");
  // MISMA regla que la promoción, llamando a la misma función: lo que el usuario aprueba
  // aquí tiene que ser exactamente lo que se carga. Duplicar el criterio ya se pagó una vez
  // —una fila cuyo importe vive en un balde de vencimiento cuenta para la carga pero no
  // contaba aquí, así que el borrador mostraba un total y se promovía otro.
  const esImputableFila = useCallback(
    (f: FilaBorradorModulo) => esImputable({ tipoFila: f.tipoFila, omitida: f.omitida ?? null, valor: f.valor, datos: f.datos } as Parameters<typeof esImputable>[0], columnasNumericas),
    [columnasNumericas],
  );
  const enCero = (f: FilaBorradorModulo) => f.tipoFila === "movimiento" && f.omitida !== true && !esImputableFila(f);

  // Los totales salen del resumen del servidor (todo el archivo) y se corrigen con el EFECTO de
  // lo que el usuario cambió y aún no guardó, esté o no cargado hoy el grupo de la fila.
  const delta = useMemo(() => {
    const porGrupo = new Map<string, { items: number; subtotal: number }>();
    let items = 0;
    let subtotal = 0;
    const cambiadas = new Set([...Object.keys(overrideOmit), ...Object.keys(overrideClasif), ...Object.keys(overrideTipo)].map(Number));
    for (const filaNum of cambiadas) {
      const f = filasVistas[filaNum];
      if (!f) continue;
      const efectiva = efectivaDe(f);
      const antes = esImputableFila(f);
      const ahora = esImputableFila(efectiva);
      // Agrupando por nombre o por cuenta («Agrupar por»), cambiar el código no mueve la fila de grupo.
      const grupoAntes = grupoDeFila(f);
      const grupoAhora = grupoDeFila(efectiva);
      if (antes === ahora && grupoAntes === grupoAhora) continue;
      const ajustar = (g: string, di: number, ds: number) => {
        const previo = porGrupo.get(g) ?? { items: 0, subtotal: 0 };
        porGrupo.set(g, { items: previo.items + di, subtotal: previo.subtotal + ds });
      };
      if (antes) { items -= 1; subtotal -= f.valor; ajustar(grupoAntes, -1, -f.valor); }
      if (ahora) { items += 1; subtotal += efectiva.valor; ajustar(grupoAhora, 1, efectiva.valor); }
    }
    return { items, subtotal, porGrupo };
  }, [efectivaDe, esImputableFila, filasVistas, overrideClasif, overrideOmit, overrideTipo]);

  const totalItems = resumen.imputables + delta.items;
  const total = Math.round((resumen.total + delta.subtotal) * 100) / 100;
  const consolidado = resumen.grupos
    .map((g) => {
      const d = delta.porGrupo.get(g.clasificador) ?? { items: 0, subtotal: 0 };
      return { clasificador: g.clasificador, total: Math.round((g.subtotal + d.subtotal) * 100) / 100, filas: g.items + d.items };
    })
    .filter((g) => g.filas > 0);

  const toggleOmit = (f: (typeof efectivas)[number]) => setOverrideOmit((p) => ({ ...p, [f.filaNum]: f.omitida !== true }));
  const setTipo = (filaNum: number, tipo: "movimiento" | "total") =>
    setOverrideTipo((p) => {
      const next = { ...p };
      if ((tipoOriginal.get(filaNum) ?? "movimiento") === tipo) delete next[filaNum]; else next[filaNum] = tipo;
      return next;
    });

  // Selección múltiple + acciones EN BLOQUE (asignar agrupador u omitir/incluir varias filas
  // a la vez). Escribe los mismos overrides que las acciones por fila.
  const toggleSel = (filaNum: number) =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(filaNum)) n.delete(filaNum); else n.add(filaNum);
      return n;
    });
  const limpiarSeleccion = () => setSeleccion(new Set());
  // Asigna a mano un agrupador (clasificador) a todas las filas seleccionadas.
  const asignarAgrupadorSeleccion = () => {
    const valor = agrupadorManual.trim();
    if (!valor || seleccion.size === 0) return;
    setOverrideClasif((p) => {
      const next = { ...p };
      for (const fn of seleccion) { if ((clasifOriginal.get(fn) ?? "") === valor) delete next[fn]; else next[fn] = valor; }
      return next;
    });
    setAgrupadorManual("");
    limpiarSeleccion();
  };
  const omitirSeleccion = (omitida: boolean) =>
    setOverrideOmit((p) => {
      const next = { ...p };
      for (const fn of seleccion) { if ((omitOriginal.get(fn) ?? false) === omitida) delete next[fn]; else next[fn] = omitida; }
      return next;
    });
  // Marca como SUBTOTAL del archivo (control) las filas seleccionadas que sean movimiento.
  const marcarSubtotalSeleccion = () => {
    for (const fn of seleccion) if ((tipoOriginal.get(fn) ?? "movimiento") !== "agrupadora") setTipo(fn, "total");
    limpiarSeleccion();
  };

  // Novedades del archivo COMPLETO (negativos, descuadres de cantidad × unitario, alertas de
  // costo, filas que parecen el gran total y subtotales que no cuadran): las calcula el servidor
  // al abrir. `alertasCosto` es null en los módulos que no las calculan.
  const { negativos, descuadres, totalizadoras } = resumen;
  const alertasCosto = (resumen.alertasCosto ?? []).filter((a) => a.referencias > 0);
  const resumenValidacion = { items: totalItems, sumaMovimientos: total };
  const filasConNovedad = useMemo(() => new Set(resumen.novedades), [resumen.novedades]);
  const verifCompletas = verificaciones.every((v) => respuestas[v.id]);
  const setResp = (id: string, respuesta: "si" | "no" | "na") => setRespuestas((p) => ({ ...p, [id]: { ...p[id], respuesta } }));
  const setNota = (id: string, nota: string) => setRespuestas((p) => ({ ...p, [id]: { respuesta: p[id]?.respuesta ?? "na", nota } }));

  const guardar = () => {
    if (periodoCambiado && errorPeriodo) { notifyError(errorPeriodo); return; }
    if (periodoSinConfirmar) { notifyError("Confirma el período antes de guardar."); return; }
    startGuardar(async () => {
      const m = new Map<number, { filaNum: number; omitida?: boolean; clasificador?: string; tipoFila?: string }>();
      for (const [fn, o] of Object.entries(overrideOmit)) m.set(+fn, { ...(m.get(+fn) ?? { filaNum: +fn }), filaNum: +fn, omitida: o });
      for (const [fn, c] of Object.entries(overrideClasif)) m.set(+fn, { ...(m.get(+fn) ?? { filaNum: +fn }), filaNum: +fn, clasificador: c });
      for (const [fn, t] of Object.entries(overrideTipo)) m.set(+fn, { ...(m.get(+fn) ?? { filaNum: +fn }), filaNum: +fn, tipoFila: t });
      const r = await aplicarCambiosBorradorModulo(loteId, [...m.values()], periodo);
      if (r.ok) {
        notifySuccess(r.message ?? "Cambios guardados.");
        setOverrideOmit({});
        setOverrideClasif({});
        setOverrideTipo({});
        // Las filas cargadas traen el estado de ANTES de guardar: se sueltan y los grupos abiertos se
        // vuelven a pedir. Si no, una fila omitida y guardada se veía otra vez incluida y omitirla de
        // nuevo la descontaba dos veces del total.
        setFilasVistas({});
        setFilasPorGrupo({});
        setTotalPorGrupo({});
        for (const g of abiertos) void cargarGrupo(g);
        router.refresh();
      } else notifyError(r.message ?? "No se pudieron guardar los cambios.");
    });
  };

  // Nómina: cambiar «Agrupar por» reagrupa el borrador y es lo que tendrá el cargue al confirmarse.
  // Con cambios sin guardar no se cambia: la página se vuelve a armar y se perderían.
  const cambiarAgrupacion = (destino: AgruparPorNomina) => {
    if (!agruparPor || destino === agruparPor.actual) return;
    if (hayCambios) { notifyError("Guarda o descarta los cambios antes de cambiar la agrupación."); return; }
    startCambioAgrupar(async () => {
      const r = await cambiarAgruparPorBorrador({ loteId, agruparPor: destino });
      if (!r.ok) { notifyError(r.message ?? "No se pudo cambiar la agrupación."); return; }
      notifySuccess(r.message ?? "Agrupación cambiada.");
      setFiltro(null);
      router.refresh();
    });
  };

  // Reporte con errores (Cartera y CxP): no se aprueba; se corrige el archivo y se vuelve a cargar.
  const motivoReporte = motivoReporteConErrores(reporteConErrores) ?? motivoCedulasVariosNombres(cedulasVariosNombres);
  const confirmar = () => {
    if (asistenciaSinResolver) { notifyError("Hay una lectura pendiente de resolver. Abre «Corregir lectura», revisa su resultado y aplica la propuesta antes de confirmar."); return; }
    if (hayCambios) { notifyError("Guarda o descarta los cambios antes de confirmar."); return; }
    if (!periodoValido) { notifyError("Indica el período (AAAA-MM)."); return; }
    if (errorPeriodo) { notifyError(errorPeriodo); return; }
    if (!verifCompletas) { notifyError("Responde todas las verificaciones antes de cargar."); return; }
    if (motivoReporte) { notifyError(motivoReporte); return; }
    startCargar(async () => {
      const fd = new FormData();
      fd.set("loteId", loteId);
      fd.set("periodo", periodo);
      fd.set("observaciones", observaciones);
      fd.set("verificaciones", JSON.stringify(respuestas));
      if (moduloCodigo === "INV" && asistenciaInventario && asistenciaInventario.revision > 0) fd.set("revisionAsistenciaEsperada", String(asistenciaInventario.revision));
      if (propuestaPatron?.aplicativo) fd.set("guardarComoPatron", guardarComoPatron ? "1" : "0");
      if (formatoManual && (formatoManual.estado === "nuevo" || formatoManual.estado === "reemplaza")) {
        fd.set("guardarFormatoManual", guardarFormatoManual ? "1" : "0");
      }
      const r = await cargarBorradorModulo(undefined, fd);
      if (r.ok) { notifySuccess(r.message ?? "Cargado."); router.push(`/modulos/${moduloCodigo.toLowerCase()}`); }
      else notifyError(r.message ?? "No se pudo cargar.");
    });
  };

  const descartar = () =>
    startDescartar(async () => {
      const r = await descartarBorradorModulo(loteId);
      if (r.ok) { notifySuccess("Borrador descartado."); router.push(`/modulos/${moduloCodigo.toLowerCase()}/borradores`); }
      else notifyError(r.message ?? "No se pudo descartar.");
    });
  // Deshace lo que no se ha guardado (filas y período), sin tocar el borrador.
  const descartarCambios = () => {
    setOverrideOmit({});
    setOverrideTipo({});
    setOverrideClasif({});
    setPeriodo(periodoSugerido);
    setPeriodoConfirmado(null);
  };

  // Saldo efectivo, rangos de vencimiento y fechas: ver `celda-detalle-modulo.ts`.
  const celda = (f: FilaBorradorModulo, col: Columna) => textoCeldaDetalle(valorColumnaDetalle(f, col), col);
  const esNum = (t: string) => t === "moneda" || t === "numero";
  const hayFiltrosColumnas = hayFiltrosDetalleModulo(filtrosColumnas);
  const [verEstructura, setVerEstructura] = useState(false);
  const renglonesEstructura = resumen.renglonesEstructura;

  // Filtrar es cosa del servidor: al cambiar un filtro se suelta lo cargado y los grupos se
  // vuelven a abrir a demanda, ya filtrados.
  const reiniciarDetalle = () => {
    setFilasPorGrupo({});
    setTotalPorGrupo({});
    setAbiertos(new Set());
    setSeleccion(new Set());
    tablaRef.current?.scrollTo({ top: 0 });
  };

  /** Trae del servidor una página de filas del grupo (la primera al abrirlo). */
  const cargarGrupo = useCallback(
    async (clasificador: string, desde = 0) => {
      setCargandoGrupos((prev) => new Set(prev).add(clasificador));
      try {
        const r = await filasBorradorModulo({
          loteId,
          clasificador,
          desde,
          verEstructura,
          filtros: hayFiltrosDetalleModulo(filtrosColumnas) ? filtrosColumnas : undefined,
          soloNovedades: filtro === FILTRO_NOVEDADES ? resumen.novedades : undefined,
          orden,
        });
        if (!r.ok) { notifyError(r.message ?? "No se pudo traer el detalle."); return; }
        setFilasPorGrupo((prev) => ({ ...prev, [clasificador]: desde > 0 ? [...(prev[clasificador] ?? []), ...r.filas] : r.filas }));
        setTotalPorGrupo((prev) => ({ ...prev, [clasificador]: r.total }));
        setFilasVistas((prev) => {
          const n = { ...prev };
          for (const f of r.filas) n[f.filaNum] = f;
          return n;
        });
      } finally {
        setCargandoGrupos((prev) => { const n = new Set(prev); n.delete(clasificador); return n; });
      }
    },
    [filtro, filtrosColumnas, loteId, orden, resumen.novedades, verEstructura],
  );

  /** Un clic en el encabezado reordena: las filas ya traídas se piden de nuevo, ya ordenadas. */
  const ordenarPor = (columna: string) => {
    setOrden((actual) => alternarOrden(actual, columna));
    reiniciarDetalle();
  };

  const alternarGrupo = (clasificador: string) => {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(clasificador)) n.delete(clasificador);
      else {
        n.add(clasificador);
        if (!filasPorGrupo[clasificador]) void cargarGrupo(clasificador);
      }
      return n;
    });
  };

  // La tabla muestra SIEMPRE los grupos; las filas de cada uno llegan al abrirlo.
  const gruposVista = useMemo(() => {
    const base = resumen.grupos
      .filter((g) => (filtro === FILTRO_NOVEDADES ? g.novedades > 0 : filtro === null || g.clasificador === filtro))
      .filter((g) => (verEstructura ? g.filas + g.estructura : g.filas) > 0)
      // Los filtros del clasificador y de su nombre recortan la LISTA de grupos; los de las demás
      // columnas solo recortan las filas de cada grupo, que llegan al abrirlo.
      .filter((g) => coincideGrupoDetalle(g, rolesGrupo, filtrosColumnas));
    // La LISTA de grupos se ordena por las dos columnas que la identifican: el clasificador y su
    // nombre. Por las demás columnas se ordenan las filas dentro de cada grupo, no los grupos.
    const ordenados = ordenarFilas(
      base,
      orden && (orden.columna === rolesGrupo.clasificador || orden.columna === rolesGrupo.descripcion) ? orden : null,
      (g, columna) => (columna === rolesGrupo.descripcion ? g.descripcion ?? g.clasificador : g.clasificador),
      () => false,
    );
    return ordenados.map((g) => {
      const d = delta.porGrupo.get(g.clasificador) ?? { items: 0, subtotal: 0 };
      return {
        clasificador: g.clasificador,
        descripcion: g.descripcion,
        // Con ítems rescatados a mano el grupo deja de estar en cero: el aviso desaparece solo.
        motivoSinItems: g.items + d.items === 0 ? g.motivoSinItems : null,
        items: g.items + d.items,
        subtotal: Math.round((g.subtotal + d.subtotal) * 100) / 100,
        declarado: g.declarado,
        filasDelArchivo: verEstructura ? g.filas + g.estructura : g.filas,
        novedades: g.novedades,
        cargadas: filasPorGrupo[g.clasificador] ?? null,
        totalFiltrado: totalPorGrupo[g.clasificador] ?? null,
        abierto: abiertos.has(g.clasificador),
        cargando: cargandoGrupos.has(g.clasificador),
      };
    });
  }, [abiertos, cargandoGrupos, rolesGrupo, delta.porGrupo, filasPorGrupo, filtro, filtrosColumnas, orden, resumen.grupos, totalPorGrupo, verEstructura]);

  const filasVisibles = gruposVista.reduce((n, g) => n + (g.cargadas?.length ?? 0), 0);
  const filasDelArchivoVisibles = gruposVista.reduce((n, g) => n + (g.totalFiltrado ?? g.filasDelArchivo), 0);

  // Seleccionables = filas CARGADAS que NO están «en cero» (esas no se pueden reclasificar).
  const idsSeleccionablesVista = gruposVista
    .flatMap((g) => (g.cargadas ?? []).map((f) => efectivas.find((e) => e.filaNum === f.filaNum) ?? f))
    .filter((f) => !(f.tipoFila !== "agrupadora" && enCero(f)))
    .map((f) => f.filaNum);
  const todasVistaSeleccionadas = idsSeleccionablesVista.length > 0 && idsSeleccionablesVista.every((id) => seleccion.has(id));
  const alternarTodasVista = () =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (todasVistaSeleccionadas) for (const id of idsSeleccionablesVista) n.delete(id);
      else for (const id of idsSeleccionablesVista) n.add(id);
      return n;
    });

  // Acciones en bloque sobre las filas seleccionadas. Se arma una vez y se pinta arriba de la
  // tabla o, en pantalla completa, dentro de la vista (si no, quedaría detrás de ella).
  const barraSeleccion = seleccion.size > 0 ? (
    <div className={`flex flex-wrap items-center gap-2 bg-navy-700 px-3 py-2 text-[12px] text-white ${pantallaCompleta ? "shrink-0 border-b border-navy-600" : "rounded-md border border-navy-600 shadow-lg"}`}>
      <span className="font-semibold">{seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}</span>
      <span className="text-navy-500">·</span>
      <span className="text-navy-100">Agrupador:</span>
      <input
        list="agrupadores-borrador"
        value={agrupadorManual}
        onChange={(e) => setAgrupadorManual(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") asignarAgrupadorSeleccion(); }}
        placeholder={`Escribe el ${clasificadorEtiqueta.toLowerCase()}…`}
        className="w-full min-w-0 rounded border border-navy-500 sm:w-auto sm:min-w-[12rem] bg-white px-2 py-1 text-[12px] text-ink-800 placeholder:text-ink-400 outline-none"
      />
      <datalist id="agrupadores-borrador">
        {agrupadoresExistentes.map((a) => <option key={a} value={a} />)}
      </datalist>
      <button type="button" disabled={!agrupadorManual.trim()} onClick={asignarAgrupadorSeleccion} className="rounded border border-navy-500 bg-navy-600 px-2 py-1 font-semibold hover:bg-navy-500 disabled:opacity-60">Asignar</button>
      <span className="ml-1 text-navy-500">·</span>
      <button type="button" onClick={() => omitirSeleccion(true)} className="rounded border border-navy-500 bg-navy-600 px-2 py-1 font-semibold hover:bg-navy-500">Omitir</button>
      <button type="button" onClick={() => omitirSeleccion(false)} className="rounded border border-navy-500 bg-navy-600 px-2 py-1 font-semibold hover:bg-navy-500">Incluir</button>
      <button type="button" onClick={marcarSubtotalSeleccion} title="Tratar las filas seleccionadas como totales del archivo: no se cargan y se usan como control" className="rounded border border-navy-500 bg-navy-600 px-2 py-1 font-semibold hover:bg-navy-500">Marcar total</button>
      <button type="button" onClick={limpiarSeleccion} className="ml-auto rounded border border-navy-500 px-2 py-1 font-medium hover:bg-navy-600">Limpiar selección</button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="min-w-0 break-words text-ink-600">Cliente: <span className="font-semibold text-ink-800">{cliente}</span> · {totalItems.toLocaleString("es-CO")} filas imputables de {resumen.totalFilas.toLocaleString("es-CO")} · total <span className="font-semibold">{fmtContable(total)}</span></span>
        <span className="flex flex-wrap items-center gap-2">
          {hayCambios && <span className="text-[11.5px] font-medium text-warn-700">Tienes cambios sin guardar.</span>}
          {rolesAsistenciaInventario && <CorregirLecturaInventario loteId={loteId} periodo={periodo} roles={rolesAsistenciaInventario} bloqueado={hayCambios || cargando || guardando || descartando} />}
          {version && <Chip label={`Borrador v${version}`} tone="blue" />}
          {hermanos.length > 1 && <MenuVersionesBorradorModulo moduloCodigo={moduloCodigo} loteId={loteId} hermanos={hermanos} />}
        </span>
      </div>

      {notasCliente && <NotasCargaModulo notas={notasCliente} />}
      {asistenciaSinResolver && <p role="status" className="rounded-md border border-warn-300 bg-warn-100 px-3 py-2.5 text-[12px] leading-relaxed text-warn-700">Hay una lectura pendiente de resolver. El borrador actual se conserva; abre «Corregir lectura» para revisar y aplicar la propuesta antes de confirmar la carga.</p>}

      {/* Novedades: validación automática + checklist de verificación (arriba para que se vea siempre) */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Novedades de la carga</div>

        {reconciliacion && reconciliacion.filasOmitidasArriba > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold"><IconoEnTexto name="warn" />{reconciliacion.filasOmitidasArriba} fila(s) con valor se excluyeron al leer (posible fila de datos por encima del inicio detectado).</span>
            {reconciliacion.muestra.length > 0 && (
              <span className="ml-1">Filas: {reconciliacion.muestra.map((f) => `${f.filaNum} (${fmtContable(f.valor)})`).join(", ")}{reconciliacion.filasOmitidasArriba > reconciliacion.muestra.length ? "…" : ""}.</span>
            )}
            <span className="ml-1">Revisa el archivo o el perfil de carga en Administración › Perfiles de carga.</span>
          </div>
        )}

        {anexo && (
          <div className={`rounded-md border px-3 py-2 text-[12px] ${anexo.repetidos.length > 0 ? "border-err-500 bg-err-100 text-err-700" : "border-navy-600 bg-blue-50 text-navy-800"}`}>
            <span className="font-semibold">
              {anexo.vigente
                ? `→ Este archivo se AGREGARÁ a la v${anexo.version} de ${anexo.periodo}.`
                : `→ El cargue al que ibas a agregarlo (v${anexo.version} de ${anexo.periodo}) ya no es el vigente.`}
            </span>
            {!anexo.vigente ? (
              <span className="ml-1">Al confirmar se creará una versión nueva en vez de agregarse.</span>
            ) : anexo.repetidos.length > 0 && (contenidoActivos === "costo" || contenidoActivos === "depreciacion") ? (
              /* Activos fijos: el reporte de depreciación lista los MISMOS bienes que el de activos.
                 Repetir las placas es lo esperado, no una re-subida: no se pinta como duplicado. */
              <span className="ml-1">
                {anexo.repetidos.length} ítem(s) ya están en esa versión, que es lo esperado: el reporte de
                {contenidoActivos === "depreciacion" ? " depreciación " : " activos "}
                lista los mismos bienes. Se suma como el otro lado del cargue.
              </span>
            ) : anexo.repetidos.length > 0 ? (
              <span className="ml-1">
                <IconoEnTexto name="warn" />{anexo.repetidos.length} ítem(s) del archivo YA están en esa versión y quedarían duplicados:{" "}
                {anexo.repetidos.slice(0, 6).map((k) => k.trim() || "(sin referencia)").join(", ")}
                {anexo.repetidos.length > 6 ? "…" : ""}. Si el archivo es una re-subida y no una adición, descarta este
                borrador y cárgalo con «Cargar {moduloCodigo === "INV" ? "inventarios" : "el módulo"}», que crea una versión nueva.
              </span>
            ) : (
              <span className="ml-1">No repite ningún ítem ya cargado: se suma limpio a lo que existe.</span>
            )}
            {anexo.vigente && (
              <span className="mt-1 block tabular-nums">
                Total del cargue al confirmar: v{anexo.version} {fmtContable(anexo.totalActual)} + este archivo {fmtContable(total)} ={" "}
                <span className="font-semibold">{fmtContable(Math.round((anexo.totalActual + total) * 100) / 100)}</span>
              </span>
            )}
          </div>
        )}
        {contenido && (
          <div className="flex flex-col gap-1 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            <span>
              <span className="font-semibold">Contenido declarado:</span> {INFO_CONTENIDO_ARCHIVO[contenido.contenido].rotulo}
              {contenido.ventas ? ` · ventas en ${contenido.ventas}` : ""}
              {contenido.declarado ? ` · notas crédito en ${contenido.declarado}` : ""}.
            </span>
            {avisosContenido(contenido).map((a) => (
              <span key={a.texto} className={a.tono === "aviso" ? "font-medium text-warn-700" : undefined}>{a.texto}</span>
            ))}
          </div>
        )}
        {totalizadoras.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">
              <IconoEnTexto name="warn" />{totalizadoras.length === 1 ? "Hay 1 fila que parece el TOTAL del archivo" : `Hay ${totalizadoras.length} filas que parecen el TOTAL del archivo`}, no un ítem.
            </span>
            <span className="ml-1">
              {totalizadoras.slice(0, 4).map((t) => `${t.filaNum} (${fmtContable(t.valor)} ≈ suma de las demás, ${fmtContable(t.resto)})`).join(", ")}
              {totalizadoras.length > 4 ? "…" : ""}.
            </span>
            <span className="ml-1">Se está sumando al total: si es el gran total del ERP, omítela con «Omitir» o el módulo quedará al doble.</span>
          </div>
        )}
        <ValidacionArchivo control={control} resumen={resumenValidacion} controlesFormato={controlesFormato} />
        {hayCambiosFilas && (
          <div className="rounded-md border border-warn-500 bg-warn-100 px-3 py-1.5 text-[11.5px] text-warn-700">
            Los controles del archivo y las novedades se calcularon sobre lo guardado: guarda los cambios para recalcularlos.
          </div>
        )}
        {negativos.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold"><IconoEnTexto name="warn" />{resumen.negativosFilas} ítem(s) con existencias o costos negativos.</span>
            <span className="ml-1">Filas: {[...new Set(negativos.slice(0, 8).map((n) => `${n.filaNum} (${n.etiqueta})`))].join(", ")}{resumen.negativosFilas > 8 ? "…" : ""}.</span>
            {alertasConComentario.includes("valores_negativos") && <span className="ml-1">{AVISO_COMENTARIO_CIERRE}</span>}
          </div>
        )}
        {descuadres.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold"><IconoEnTexto name="warn" />{resumen.descuadresFilas} ítem(s) donde el valor total no cuadra con cantidad × valor unitario.</span>
            <span className="ml-1">Filas: {descuadres.slice(0, 8).map((d) => `${d.filaNum} (esperado ${fmtContable(d.esperado)} vs ${fmtContable(d.declarado)})`).join(", ")}{resumen.descuadresFilas > 8 ? "…" : ""}.</span>
          </div>
        )}
        {alertasCosto.map((a) => (
          <div key={a.tipo} className="rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
            <span className="font-semibold">
              <IconoEnTexto name="warn" />{a.referencias} {a.referencias === 1 ? "referencia" : "referencias"} · {a.etiqueta.toLowerCase()}
              {a.valorTotal !== 0 ? ` (valor total ${fmtContable(a.valorTotal)})` : ""}.
            </span>
            <span className="ml-1">Filas: {a.filas.join(", ")}{a.referencias > a.filas.length ? "…" : ""}.</span>
            {alertasConComentario.includes(a.tipo) && <span className="ml-1">{AVISO_COMENTARIO_CIERRE}</span>}
          </div>
        ))}
        {negativos.length === 0 && descuadres.length === 0 && alertasCosto.length === 0 && totalizadoras.length === 0 && (noNegativos.length > 0 || productos.length > 0) && (
          <div className="rounded-md border border-ok-500 bg-ok-100 px-3 py-1.5 text-[12px] text-ok-700">
            <IconoEnTexto name="check" />{resumen.alertasCosto ? "Sin negativos, descuadres de valor ni alertas de costo en los movimientos." : "Sin negativos ni descuadres de valor en los movimientos."}
          </div>
        )}

        {reporteConErrores && hayReporteConErrores(reporteConErrores) && <ReporteConErroresAviso reporte={reporteConErrores} />}
        {cedulasVariosNombres.length > 0 && <CedulasVariosNombresAviso cedulas={cedulasVariosNombres} />}

        {verificaciones.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">
              Verificaciones obligatorias
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${verifCompletas ? "border-ok-500 bg-ok-100 text-ok-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>
              {verificaciones.filter((v) => respuestas[v.id]).length}/{verificaciones.length} respondidas
            </span>
          </div>
        )}
        {verificaciones.map((v) => {
          const r = respuestas[v.id]?.respuesta;
          const pendiente = !r;
          return (
            <div
              key={v.id}
              className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 ${pendiente ? "border-warn-500 bg-warn-100" : "border-ok-300 bg-ok-100"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[12.5px] ${pendiente ? "font-medium text-ink-800" : "text-ink-700"}`}>{v.texto}</span>
                {pendiente ? (
                  <span className="rounded-full border border-warn-500 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn-700">
                    Pendiente · requerido
                  </span>
                ) : (
                  <span className="rounded-full border border-ok-500 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok-700">
                    <IconoEnTexto name="check" />Respondida
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["si", "no", "na"] as const).map((op) => (
                  <button key={op} type="button" onClick={() => setResp(v.id, op)}
                    className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${
                      r === op
                        ? "border-navy-600 bg-navy-700 text-white"
                        : pendiente
                          ? "border-warn-500 bg-white text-warn-800 hover:bg-warn-100"
                          : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                    }`}>
                    {op === "si" ? "Sí" : op === "no" ? "No" : "No aplica"}
                  </button>
                ))}
                <input value={respuestas[v.id]?.nota ?? ""} onChange={(e) => setNota(v.id, e.target.value)} placeholder="Observación (opcional)"
                  className="min-w-[10rem] flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] text-ink-700 outline-none focus:border-blue-400" />
              </div>
            </div>
          );
        })}

        <label className="flex flex-col gap-1 border-t border-ink-100 pt-2.5">
          <span className="text-[11px] font-medium text-ink-600">Observaciones generales (opcional)</span>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
        </label>
        {!verifCompletas && verificaciones.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[11.5px] font-medium text-warn-700 sm:items-center">
            <span className="shrink-0"><Icon name="warn" size={14} /></span>
            Responde todas las verificaciones (Sí / No / No aplica) para poder confirmar la carga.
          </div>
        )}
      </Card>

      {/* Consolidado por clasificador (previsualización) — también filtra la tabla */}
      <Card className="p-4">
        {agruparPor && (
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-ink-100 pb-3 text-[11.5px]">
            <span className="font-medium text-ink-600">Agrupar por:</span>
            <div role="radiogroup" aria-label="Agrupar los conceptos del borrador por" className="flex flex-wrap gap-1.5">
              {agruparPor.opciones.map((o) => {
                const activa = o.id === agruparPor.actual;
                const bloqueo = agruparPor.fija
                  ? "Este archivo se suma a un cargue existente: se agrupa como ese cargue."
                  : !o.disponible ? o.motivo : null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    disabled={!activa && (bloqueo != null || cambiandoAgrupar)}
                    onClick={() => cambiarAgrupacion(o.id)}
                    title={activa ? "Agrupación de este borrador" : bloqueo ?? undefined}
                    className={`rounded-full border px-2.5 py-1 font-semibold ${activa ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {o.etiqueta}
                  </button>
                );
              })}
            </div>
            <span className="text-ink-400">
              {cambiandoAgrupar ? "Reagrupando…" : "Así quedará el Consolidado al confirmar la carga; después también se puede cambiar."}
            </span>
          </div>
        )}
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {agruparPor ? `Consolidado por ${etiquetaGrupo.toLocaleLowerCase("es")}` : "Consolidado por clasificador"} · toca para filtrar
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setFiltro(null); reiniciarDetalle(); }}
            className={`rounded-md border px-3 py-1.5 text-[12px] ${filtro === null ? "border-navy-600 bg-blue-50 font-semibold text-navy-800" : "border-ink-150 bg-ink-50 text-ink-700 hover:bg-ink-100"}`}>
            Todos <span className="text-ink-400">({totalItems.toLocaleString("es-CO")})</span>
          </button>
          {filasConNovedad.size > 0 && (
            <button type="button" onClick={() => { setFiltro((f) => (f === FILTRO_NOVEDADES ? null : FILTRO_NOVEDADES)); reiniciarDetalle(); }}
              className={`rounded-md border border-err-500 px-3 py-1.5 text-[12px] font-medium text-err-700 ${filtro === FILTRO_NOVEDADES ? "bg-err-100 font-semibold" : "bg-err-100 hover:bg-err-100"}`}>
              <IconoEnTexto name="warn" />Novedades <span>({filasConNovedad.size})</span>
            </button>
          )}
          {consolidado.map((c) => {
            const activo = filtro === c.clasificador;
            return (
              <button key={c.clasificador} type="button" onClick={() => { setFiltro((f) => (f === c.clasificador ? null : c.clasificador)); reiniciarDetalle(); }}
                className={`max-w-full break-words rounded-md border px-3 py-1.5 text-left text-[12px] ${activo ? "border-navy-600 bg-blue-50 font-semibold" : "border-ink-150 bg-ink-50 hover:bg-ink-100"}`}>
                <span className="font-medium text-ink-700">{c.clasificador}</span>{" "}
                <span className="font-semibold text-ink-900">{fmtContable(c.total)}</span>{" "}
                <span className="text-ink-400">({c.filas})</span>
              </button>
            );
          })}
        </div>
        <NombreAgrupador
          loteId={loteId}
          grupos={sinNombre}
          opciones={opcionesNombre}
          clasificadorEtiqueta={clasificadorEtiqueta}
          anexo={anexo}
          bloqueado={hayCambios}
        />
      </Card>

      {/* Barra de acciones EN BLOQUE (visible al seleccionar filas); en pantalla completa va dentro de la vista. */}
      {!pantallaCompleta && barraSeleccion}

      {/* Tabla del borrador: región propia (no `<Card>`) para poder ocupar el viewport en pantalla completa. */}
      <div role="region" aria-label="Detalle en borrador" {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
            <span className="font-semibold uppercase tracking-wider">Detalle en borrador (crudo del archivo)</span>
            <span>
              <span className="font-semibold text-ink-700">{filasVisibles.toLocaleString("es-CO")}</span>
              {` de ${filasDelArchivoVisibles.toLocaleString("es-CO")} filas`}
              {gruposVista.length > 0 ? " · abre un grupo para ver su detalle" : ""}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {hayFiltrosColumnas && (
              <button
                type="button"
                onClick={() => { setFiltrosColumnas({}); reiniciarDetalle(); }}
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
              >
                Limpiar filtros
              </button>
            )}
            {renglonesEstructura > 0 && (
              <button
                type="button"
                onClick={() => { setVerEstructura((v) => !v); reiniciarDetalle(); }}
                title="Renglones de cuenta, filas de porcentajes y pies del reporte: no suman al total"
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
              >
                {verEstructura ? "Ocultar renglones de cuenta" : `Mostrar renglones de cuenta del archivo (${renglonesEstructura})`}
              </button>
            )}
            {resumen.columnasOcultas.length > 0 && (
              <button
                type="button"
                onClick={() => setVerTodasColumnas((v) => !v)}
                title={verTodasColumnas ? "Oculta las columnas sin datos y los rangos que no suman al saldo" : `Ocultas: ${resumen.columnasOcultas.map((c) => c.etiqueta).join(", ")}`}
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
              >
                {verTodasColumnas ? "Ocultar columnas sin datos" : `Mostrar todas las columnas (${resumen.columnasOcultas.length} ocultas)`}
              </button>
            )}
            {hayCambios && <span className="text-[11px] font-medium text-warn-700">Guarda para incluir tus cambios</span>}
            <a
              href={`/modulos/${moduloCodigo.toLowerCase()}/borradores/${loteId}/export`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-200"
              title={hayCambios ? "El Excel exporta lo GUARDADO. Guarda tus cambios para que salgan reflejados." : "Exporta a Excel el detalle y el consolidado del borrador"}
            >
              <Icon name="download" size={13} /> Exportar a Excel
            </a>
            <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
          </div>
        </div>
        {/* En pantalla completa los filtros de «Consolidado por clasificador» quedan detrás: aquí se
            ven el de novedades y el grupo filtrado, para no leer una tabla recortada sin saberlo. */}
        {pantallaCompleta && (filasConNovedad.size > 0 || filtro !== null) && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-2 text-[11px]">
            <button
              type="button"
              aria-pressed={filtro === null}
              onClick={() => { setFiltro(null); reiniciarDetalle(); }}
              className={`rounded-md border px-2 py-1 font-semibold ${filtro === null ? "border-navy-700 bg-blue-50 text-navy-800" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"}`}
            >
              Todos <span className="font-normal text-ink-400">({totalItems.toLocaleString("es-CO")})</span>
            </button>
            {filasConNovedad.size > 0 && (
              <button
                type="button"
                aria-pressed={filtro === FILTRO_NOVEDADES}
                onClick={() => { setFiltro((f) => (f === FILTRO_NOVEDADES ? null : FILTRO_NOVEDADES)); reiniciarDetalle(); }}
                className={`rounded-md border border-err-500 px-2 py-1 font-semibold text-err-700 ${filtro === FILTRO_NOVEDADES ? "bg-err-100" : "bg-err-100 hover:bg-err-100"}`}
              >
                <IconoEnTexto name="warn" />Novedades ({filasConNovedad.size.toLocaleString("es-CO")})
              </button>
            )}
            {filtro !== null && filtro !== FILTRO_NOVEDADES && (
              <span className="inline-flex items-center gap-1 rounded-md border border-navy-700 bg-blue-50 px-2 py-1 font-semibold text-navy-800">
                {etiquetaGrupo}: {filtro}
                <button type="button" onClick={() => { setFiltro(null); reiniciarDetalle(); }} aria-label="Quitar el filtro por grupo" title="Quitar el filtro por grupo" className="text-navy-500 hover:text-err-700">×</button>
              </span>
            )}
          </div>
        )}
        {pantallaCompleta && barraSeleccion}
        <div ref={tablaRef} className={claseScrollTabla(pantallaCompleta, "max-h-[70vh]")}>
          <table className="tabla-encabezado-fijo tabla-encabezado-doble w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="w-8 px-2.5 py-2 text-center">
                  <input type="checkbox" checked={todasVistaSeleccionadas} onChange={alternarTodasVista} title="Seleccionar todo lo visible" className="cursor-pointer align-middle" />
                </th>
                <th className="px-2.5 py-2 font-semibold">#</th>
                {columnas.map((c) => (
                  <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNum(c.tipo) ? "text-right" : ""}`}>
                    <EncabezadoOrdenable etiqueta={c.etiqueta} columna={c.nombre} orden={orden} onOrdenar={ordenarPor} numerica={esNum(c.tipo)} />
                  </th>
                ))}
                <th className="px-2.5 py-2 text-center font-semibold">Acciones</th>
              </tr>
              <tr className="bg-ink-50">
                <th className="px-2.5 pb-2" />
                <th className="px-2.5 pb-2" />
                {columnas.map((c) => (
                  <th key={c.nombre} className="px-1.5 pb-2 font-normal">
                    <input
                      type="text"
                      value={filtrosColumnas[c.nombre] ?? ""}
                      onChange={(e) => { setFiltrosColumnas((actuales) => ({ ...actuales, [c.nombre]: e.target.value })); reiniciarDetalle(); }}
                      aria-label={`Filtrar la columna ${c.etiqueta}`}
                      placeholder={esNum(c.tipo) ? "> < = …" : "Filtrar…"}
                      title={esNum(c.tipo) ? undefined : AYUDA_COMODIN}
                      className={`w-full min-w-[80px] rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 placeholder:text-ink-300 focus:border-blue-400 focus:outline-none ${esNum(c.tipo) ? "text-right" : ""}`}
                    />
                  </th>
                ))}
                <th className="px-2.5 pb-2" />
              </tr>
            </thead>
            <tbody>
              {gruposVista.length === 0 && (
                <tr>
                  <td colSpan={columnas.length + 3} className="px-2.5 py-6 text-center text-ink-400">
                    Ninguna fila coincide con los filtros activos.
                  </td>
                </tr>
              )}
              {gruposVista.map((g) => (
                <Fragment key={g.clasificador}>
                  <tr className="border-t-2 border-ink-200 bg-blue-100">
                    <td className="px-2.5 py-1.5" />
                    <td className="px-2.5 py-1.5" />
                    <td className="px-2.5 py-1.5 font-semibold text-navy-800" colSpan={Math.max(1, idxValor >= 1 ? idxValor : columnas.length - 1)}>
                      <button
                        type="button"
                        onClick={() => alternarGrupo(g.clasificador)}
                        aria-expanded={g.abierto}
                        title={g.abierto ? "Ocultar el detalle de este grupo" : "Ver las filas de este grupo"}
                        className="inline-flex items-center gap-1.5 font-semibold text-navy-800 hover:underline"
                      >
                        <Icon name={g.abierto ? "chev-d" : "chev-r"} size={12} />
                        {etiquetaGrupo}: {g.clasificador}
                        {g.descripcion && <span className="ml-1.5 font-normal text-navy-700">· {g.descripcion}</span>}
                      </button>
                      <span className="ml-2 font-normal text-ink-500">· {g.items.toLocaleString("es-CO")} ítems · {(g.totalFiltrado ?? g.filasDelArchivo).toLocaleString("es-CO")} filas</span>
                      {g.motivoSinItems && (
                        <span
                          className="ml-2 rounded border border-warn-300 bg-warn-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-warn-700"
                          title={`Ninguna fila de este grupo suma al total. ${explicacionSinItems(g.motivoSinItems)} Ábrelo y usa «Incluir» en una fila si debe contar.`}
                        >
                          {etiquetaSinItems(g.motivoSinItems)}
                        </span>
                      )}
                      {g.novedades > 0 && <span className="ml-2 font-semibold text-err-700">· {g.novedades.toLocaleString("es-CO")} con novedad</span>}
                      {g.cargando && <span className="ml-2 font-normal text-ink-400">· trayendo el detalle…</span>}
                      {(() => {
                        const declarado = g.declarado;
                        // Un grupo sin ítems (el pie del reporte con su «cuenta» 1) no tiene qué comparar.
                        if (declarado == null || g.items === 0) return null;
                        const ctl = controlSeccion(declarado, g.subtotal);
                        // Solo con la cuenta completa a la vista tiene sentido decir si cuadra.
                        const completa = !hayFiltrosColumnas && filtro === null;
                        return (
                          <span className="ml-2 font-normal text-ink-500" title="Total que el archivo imprime en el renglón de la cuenta">
                            · el archivo declara {fmtContable(declarado)}
                            {completa && (ctl.cuadra
                              ? <span className="ml-1 font-semibold text-ok-700">· cuadra</span>
                              : <span className="ml-1 font-semibold text-err-700">· difiere {fmtContable(ctl.diferencia)}</span>)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy-800">{fmtContable(g.subtotal)}</td>
                    <td className="px-2.5 py-1.5" colSpan={idxValor >= 1 ? columnas.length - idxValor : 1} />
                  </tr>
                  {g.abierto && (g.cargadas ?? []).map((cargada) => {
                    const f = efectivas.find((e) => e.filaNum === cargada.filaNum) ?? cargada;
                    const esAgr = f.tipoFila === "agrupadora";
                    const esTot = f.tipoFila === "total";
                    const omit = f.omitida === true;
                    const cero = !esAgr && !esTot && enCero(f);
                    // Resto del cuadro de cierre del archivo (cifras de referencia del cliente
                    // y sus diferencias): fuera del cálculo y sin validar, porque no son
                    // subtotales del detalle. Se muestran para que quede claro que se vieron.
                    const esCierre = esAgr && (f.motivo ?? "").startsWith("cola_control");
                    const neg = filasConNovedad.has(f.filaNum);
                    const tituloFila = cero
                      ? "Renglón en cero: no se carga al definitivo"
                      : esTot
                        ? `Fila de total del archivo — excluida, usada como control${f.motivo ? ` (${f.motivo})` : ""}`
                        : esCierre
                          ? "Cifra del cuadro de cierre del archivo — excluida del consolidado"
                          : esAgr
                            ? "Renglón del archivo que no es un ítem: no suma al total"
                            : undefined;
                    return (
                      <tr key={f.filaNum} title={tituloFila} className={`border-t border-ink-100 ${seleccion.has(f.filaNum) ? "bg-blue-100" : neg && !omit ? "bg-err-100" : esTot ? "bg-blue-100 font-semibold" : esAgr ? "bg-ink-50 italic" : ""} ${omit || cero ? "text-ink-300" : neg ? "text-err-700" : esTot || esAgr ? "text-ink-500" : "text-ink-700"} ${omit ? "line-through" : ""}`}>
                        <td className="px-2.5 py-1.5 text-center">
                          {!cero && <input type="checkbox" checked={seleccion.has(f.filaNum)} onChange={() => toggleSel(f.filaNum)} className="cursor-pointer align-middle" />}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                        {columnas.map((c) => (
                          <td key={c.nombre} title={c.nombre === clasificadorRol ? undefined : tituloCeldaDetalle(f, c)} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                            {c.nombre === clasificadorRol ? (f.clasificador ?? "—") : celda(f, c)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-center">
                          <ComentarioAncla tipo="modulos_borrador" entityId={loteRowId} anchor={`fila:${f.filaNum}`} titulo={`Fila ${f.filaNum}${f.datos.referencia ? ` · ${f.datos.referencia}` : ""}`} count={comentarios[`fila:${f.filaNum}`] ?? 0} />
                          {cero ? (
                            <span className="ml-1 text-[10.5px] italic text-ink-400">en cero · no se carga</span>
                          ) : esCierre ? (
                            <>
                              <span className="ml-1 text-[10.5px] italic text-ink-500">cierre del archivo · no se carga</span>
                              <button type="button" onClick={() => setTipo(f.filaNum, "movimiento")} className="ml-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-ok-100 hover:text-ok-700" title="No es parte del cierre: incluirla como ítem">
                                Incluir
                              </button>
                            </>
                          ) : esTot ? (
                            <>
                              <span className="ml-1 text-[10.5px] italic text-ink-500">total del archivo · control</span>
                              <button type="button" onClick={() => setTipo(f.filaNum, "movimiento")} className="ml-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-ok-100 hover:text-ok-700" title="No es una fila de total: incluirla como ítem">
                                Incluir
                              </button>
                            </>
                          ) : esAgr ? (
                            <>
                              <span className="ml-1 text-[10.5px] italic text-ink-500">{etiquetaRenglonNoSuma(f.motivo)}</span>
                              <button type="button" onClick={() => setTipo(f.filaNum, "movimiento")} className="ml-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-ok-100 hover:text-ok-700" title="Es un ítem: incluirlo en el total">
                                Incluir
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => toggleOmit(f)} className="ml-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-err-100 hover:text-err-700" title="Omitir / incluir esta fila">
                              {omit ? "Incluir" : "Omitir"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {g.abierto && g.cargadas != null && g.totalFiltrado != null && g.cargadas.length < g.totalFiltrado && (
                    <tr className="border-t border-ink-100 bg-ink-50">
                      <td colSpan={columnas.length + 3} className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          disabled={g.cargando}
                          onClick={() => void cargarGrupo(g.clasificador, g.cargadas!.length)}
                          className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60"
                        >
                          {g.cargando ? "Trayendo…" : `Ver más filas (${g.cargadas.length.toLocaleString("es-CO")} de ${g.totalFiltrado.toLocaleString("es-CO")})`}
                        </button>
                      </td>
                    </tr>
                  )}
                  {g.abierto && g.cargadas != null && g.cargadas.length === 0 && !g.cargando && (
                    <tr className="border-t border-ink-100">
                      <td colSpan={columnas.length + 3} className="px-2.5 py-3 text-center text-[12px] text-ink-400">
                        Ninguna fila de este grupo coincide con los filtros activos.
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barra de acciones */}
      <Card className="flex flex-col gap-3 p-4">
      {propuestaPatron && (
        propuestaPatron.aplicativo ? (
          <label className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
            <input
              type="checkbox"
              checked={guardarComoPatron}
              onChange={(e) => setGuardarComoPatron(e.target.checked)}
              className="mt-0.5"
            />
            <span className="leading-snug">
              <b>Guardar este formato como patrón de {propuestaPatron.aplicativo}</b>
              <span className="block text-[11.5px] text-blue-800">
                Se usará en las próximas cargas de {cliente}. Un administrador puede aprobarlo para todos los clientes de {propuestaPatron.aplicativo}.
              </span>
            </span>
          </label>
        ) : propuestaPatron.motivo ? (
          <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[11.5px] leading-snug text-ink-600">
            Este formato no se podrá guardar como patrón del aplicativo: {propuestaPatron.motivo}
          </p>
        ) : null
      )}
      {formatoManual && <CasillaPatronManual formato={formatoManual} marcada={guardarFormatoManual} onCambiar={setGuardarFormatoManual} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" disabled={!hayCambios || guardando || (periodoCambiado && (!!errorPeriodo || periodoSinConfirmar))} onClick={guardar} title={periodoSinConfirmar ? "Confirma el período nuevo antes de guardar" : undefined} className="rounded-md border border-ok-500 bg-ok-100 px-3 py-1.5 text-[12.5px] font-semibold text-ok-700 hover:bg-ok-200 disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
          {hayCambios && (
            <button type="button" onClick={descartarCambios} disabled={guardando} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60">
              Descartar cambios
            </button>
          )}
          {descartando ? (
            <span className="text-[12px] text-err-700">Descartando…</span>
          ) : confirmarDescarte ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-[12px] text-err-700">Se elimina el borrador completo.</span>
              <button type="button" onClick={descartar} className="rounded-md bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-200">Confirmar descarte</button>
              <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmarDescarte(true)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-err-100 hover:text-err-700">Descartar borrador</button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período (AAAA-MM)</span>
            {/* En un anexo el período es el del cargue destino: cambiarlo aquí haría que la
                confirmación dejara de encontrarlo y se convirtiera en versión nueva sin avisar. */}
            <input
              type="month"
              value={periodo}
              max={mesActualColombia()}
              onChange={(e) => setPeriodo(e.target.value)}
              disabled={anexo?.vigente === true}
              title={anexo?.vigente ? `Fijo: este archivo se agrega al cargue de ${anexo.periodo}` : undefined}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:bg-ink-50 disabled:font-semibold"
            />
          </label>
          {periodoValido && (errorPeriodo || periodoCambiado) && (
            <div className="w-full max-w-xs sm:w-auto">
              <ConfirmacionFecha
                error={errorPeriodo}
                pregunta={<>Cambiaste el período a <b>{nombrePeriodo(periodo)}</b> ({rangoDelPeriodo(periodo)}).</>}
                confirmada={periodoConfirmado === periodo}
                confirmadaTexto={<>Período confirmado: {nombrePeriodo(periodo)}. Pulsa «Guardar cambios».</>}
                onConfirmar={() => setPeriodoConfirmado(periodo)}
              />
            </div>
          )}
          <button type="button" disabled={cargando || hayCambios || !verifCompletas || asistenciaSinResolver || !!errorPeriodo || !!motivoReporte} onClick={confirmar} title={motivoReporte ? "El reporte tiene errores: corrige el archivo y vuelve a cargarlo" : asistenciaSinResolver ? "Resuelve la lectura pendiente desde «Corregir lectura»" : hayCambios ? "Guarda o descarta los cambios antes de confirmar" : !verifCompletas ? "Responde las verificaciones" : undefined} className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {cargando ? "Cargando…" : "Confirmar carga"}
          </button>
        </div>
      </div>
      </Card>
    </div>
  );
}

/** Nómina: cédulas con más de un nombre de empleado; el borrador no se puede aprobar. */
function CedulasVariosNombresAviso({ cedulas }: { cedulas: CedulaConVariosNombres[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
      <span className="font-semibold"><IconoEnTexto name="warn" />El reporte tiene errores: {cedulas.length} cédula(s) con más de un nombre de empleado. Este borrador no se puede aprobar; corrige el archivo en el ERP y vuelve a cargarlo.</span>
      <ul className="ml-4 list-disc">
        {cedulas.slice(0, 8).map((c) => (
          <li key={c.cedula}>{c.cedula}: {c.nombres.join(" / ")} ({c.filas.toLocaleString("es-CO")} filas)</li>
        ))}
      </ul>
      {cedulas.length > 8 && <span>… y {cedulas.length - 8} más.</span>}
      <span className="text-[11.5px]">No cuentan las diferencias de tildes, puntuación u orden de palabras. Omitir las filas no quita el bloqueo.</span>
    </div>
  );
}

/** Cartera y CxP: el reporte del ERP salió con errores; el borrador no se puede aprobar. */
function ReporteConErroresAviso({ reporte }: { reporte: ReporteConErrores }) {
  const { documentosRepetidos: d, vencimientosImposibles: v } = reporte;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
      <span className="font-semibold"><IconoEnTexto name="warn" />El reporte tiene errores: este borrador no se puede aprobar. Corrige el archivo en el ERP y vuelve a cargarlo.</span>
      {d.cantidad > 0 && (
        <div>
          <span className="font-semibold">{d.cantidad} documento(s) repetido(s) entre terceros</span> (el mismo documento por el mismo valor):
          <ul className="ml-4 mt-0.5 list-disc">
            {d.grupos.slice(0, 5).map((g) => (
              <li key={`${g.documento}|${g.valor}`}>
                {g.documento} · {fmtContable(g.valor)} en {g.terceros.map((t) => `${t.nombre ?? t.clave} (fila ${t.filas.join(", ")})`).join("; ")}
              </li>
            ))}
          </ul>
          {d.cantidad > 5 && <span>… y {d.cantidad - 5} más.</span>}
        </div>
      )}
      {v.cantidad > 0 && (
        <div>
          <span className="font-semibold">{v.cantidad} vencimiento(s) imposible(s)</span> (antes de 1990 o más de 30 años después del corte):{" "}
          {v.filas.slice(0, 8).map((f) => `fila ${f.filaNum} (${f.vencimiento})`).join(", ")}{v.cantidad > 8 ? "…" : ""}.
        </div>
      )}
      <span className="text-[11.5px]">Omitir las filas no quita el bloqueo: el reporte tiene que salir bien del ERP.</span>
    </div>
  );
}
