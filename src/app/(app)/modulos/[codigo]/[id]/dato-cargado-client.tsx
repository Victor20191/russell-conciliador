"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtContable } from "@/lib/format";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/client-notifications";
import ComentarioAncla from "@/components/comentario-ancla";
import {
  guardarConsolidacionModulo,
  guardarConsolidacionModuloLote,
  guardarClaseAgrupador,
  guardarRepartoCruce,
  aplicarRepartosSugeridos,
  guardarMarcaCruce,
  quitarMarcaCruce,
  cerrarConciliacionModulo,
  desbloquearConciliacion,
  consultarCuentasRussell,
} from "@/app/actions/modulos-datos";
import { aplicarAsignacionMasiva, contarConCuentas, type ModoAsignacionMasiva } from "@/lib/modulos/consolidacion-masiva";
import { resolverCuenta4, mensajeResolucion, type ResolucionCuenta4 } from "@/lib/modulos/resolver-cuenta4";
import type { NivelCruce } from "@/lib/modulos/cuentas-modulo";
import type { SugerenciaConsolidado } from "@/lib/modulos/nomina/consolidado-nomina";
import { CLASES_NOMINA, type ClaseNomina } from "@/lib/modulos/nomina/homologacion";
import { grupoConcepto } from "@/lib/modulos/nomina/grupos-concepto";
import type { RepartoAplicadoVm, RepartoPendienteVm, ResultadoCruceNomina } from "@/lib/modulos/nomina/cruce-nomina";
import type { ValidacionesNomina } from "@/lib/modulos/nomina/validaciones-nomina";
import { useAutoguardadoConsolidacion } from "@/lib/modulos/usar-autoguardado-consolidacion";
import { renglonesSinGuardar } from "@/lib/modulos/consolidado-sin-guardar";
import { ModalCuentasSinGuardar, useAvisoCierreNavegador, useInterceptarEnlaces } from "./aviso-salida-consolidado";
import { EstadoGuardado } from "@/components/estado-guardado";
import { filtrarFilasDetalleModulo, hayFiltrosDetalleModulo, type FiltrosDetalleModulo } from "@/lib/modulos/filtros-detalle-modulo";
import { columnasVisiblesDetalle, textoCeldaDetalle, tituloCeldaDetalle, valorColumnaDetalle } from "@/lib/modulos/celda-detalle-modulo";
import { esEncabezadoTercero, indiceColumnaValor } from "@/lib/modulos/renglones-archivo";
import { CLAVE_SIN_CUENTA, NOMBRE_SIN_CUENTA, type HijoContableCruce, type ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { ListaNoModulares, ListaSinCuentaNoModulares, ResumenClasificadoresNoModulares, ResumenNoModulares } from "../lista-no-modulares";
import { CruceTerceroTab, type CruceTerceroVm } from "./cruce-tercero-tab";
import { EditorSoportesMarca, InsigniaMarca, ListaSoportesMarca, ReferenciaMarca, type ReferenciaMarcaVm } from "./soportes-marca";
import { etiquetaTercero } from "./marca-tercero";
import { ValidacionesTerceroPanel } from "./validaciones-tercero-panel";
import type { ValidacionesTercero } from "@/lib/modulos/cartera/validaciones-tercero";
import type { ValidacionCargue } from "@/lib/modulos/validacion-cargue";
import { ValidacionArchivo } from "../validacion-archivo";
import {
  anclaCruce,
  anclaObservacionMarca,
  etiquetaMarca,
  MAX_NOTA_MARCA,
  MAX_REFERENCIA_ANEXO,
  observacionesDeMarcas,
  intercalarObservaciones,
  type MarcaPeriodo,
  type FilaCruceMarcada,
  type HijoModuloSinCuenta,
  type ResumenMarcas,
} from "@/lib/modulos/marcas-cruce";
import { MAX_JUSTIFICACION_DESBLOQUEO, MIN_JUSTIFICACION_DESBLOQUEO } from "@/lib/conciliacion/cuentas-bloqueo";

export type FilaDetalleVm = { filaNum: number; clasificador: string | null; valor: number; datos: Record<string, string | number | null> };
export type ConsolidadoVm = {
  /** Clave del renglón: el clasificador o, en Nómina con centro de costo, «1 ∥ GYA». */
  clasificador: string;
  descripcion?: string | null;
  total: number;
  filas: number;
  cuentas4: { codigo: string; nombre: string | null }[];
  // ----- Solo Nómina -----
  /** El código del concepto a secas y el centro de costo / clase del archivo. */
  codigo?: string;
  agrupador?: string;
  /** Homologación sugerida cuando no hay memoria exacta (o la misma memoria, ya guardada). */
  sugerencia?: SugerenciaConsolidado;
  /** Sus cuentas valen solo para el período del cargue (llevan una cuenta fuera de la cédula). */
  soloPeriodo?: boolean;
};
/** Nómina: centros de costo / clases del archivo con su clase contable (panel del consolidado). */
export type AgrupadorVm = { agrupador: string; filas: number; total: number; clase: ClaseNomina | null; sugerida: ClaseNomina | null };
// Cruce contable (balance vs. archivos del módulo): `resumen` es null cuando NO hay
// balance de comprobación oficial para el período del módulo (estado vacío en la UI).
export type CruceContableVm = {
  balanceEncontrado: boolean;
  periodo: string;
  nombreCliente: string;
  resumen: ResumenCruceContable | null;
  sinMapeoContable: { total: number; filas: number } | null;
  bloqueo: string | null;
  /** Cartera y CxP: por qué se cruza contra esta versión del balance (no es la oficial, o hay varias). */
  avisoBalance: string | null;
  balanceFuente: {
    id: number;
    version: string;
    periodoInicio: string;
    periodoFin: string;
    esOficial: boolean;
    estaCongelado: boolean;
    descripcion: string;
  } | null;
  /** Filas contables omitidas conservadoramente porque no resolvieron una regla activa. */
  sinReglaContableFilas: number;
  /** Las filas del cruce con su marca de auditoría pegada (vacío si no hay balance). */
  filasMarcadas: FilaCruceMarcada[];
  resumenMarcas: ResumenMarcas | null;
  /** Cuentas del cliente que componen cada fila: el desglose que se ve al expandirla. */
  detalleContablePorCuenta: Record<string, HijoContableCruce[]>;
  /** Clasificadores del renglón del saldo sin cuenta, con los marcados no modulares. */
  detalleSinCuenta?: HijoModuloSinCuenta[];
  /** Parte de «Contabilidad» que está en cuentas Russell de seis que el módulo no concilia. */
  fueraDelModulo: { total: number; filas: number; porCuenta: Record<string, number> } | null;
  /** Conciliación en firme del (cliente, módulo, período). */
  conciliacion: CierreConciliacionVm;
  /** Solo Nómina: rango, base contable, repartos, vista por subcuenta y control de deducciones. */
  nomina?: ResultadoCruceNomina | null;
  /** Cuentas fuera de la cédula que el Consolidado asignó solo para este período. */
  cuentasPeriodo?: string[];
};
export type CierreConciliacionVm = {
  cierre: {
    id: number;
    enFirme: boolean;
    balancePeriodo: string;
    balanceEncabezadoId: number;
    moduloDatoEncabezadoId: number;
    cuentasBloqueadas: number;
    cerradoPor: string;
    cerradoEn: string;
    desbloqueadoPor: string | null;
    desbloqueadoEn: string | null;
    justificacionDesbloqueo: string | null;
  } | null;
  puedeCerrar: boolean;
  puedeDesbloquear: boolean;
  /** Por qué NO se puede cerrar todavía (null = cerrable). */
  motivoNoCerrable: string | null;
};
export type { CruceTerceroVm } from "./cruce-tercero-tab";
export type NovedadesVm = {
  negativos: { filaNum: number; etiqueta: string; referencia: string | null; valor: number }[];
  descuadres: { filaNum: number; referencia: string | null; etiqueta: string; declarado: number; esperado: number }[];
  observaciones: string | null;
  verificaciones: { texto: string; respuesta: "si" | "no" | "na" | null; nota: string | null }[];
  /** Cartera y CxP: validaciones del auxiliar por tercero (reemplazan las de existencias). */
  tercero?: ValidacionesTercero | null;
  /** Nómina: netos, conceptos sin cuenta / con reparto, control, cédulas y meses. */
  nomina?: ValidacionesNomina | null;
  /** Total declarado por el archivo vs. Σ cargada, congelado al promover. `null` en los
   *  cargues anteriores a esta validación: ahí el panel no se muestra. */
  validacionArchivo: ValidacionCargue | null;
};
export type VersionModuloVm = {
  id: number;
  version: number;
  esOficial: boolean;
  filas: number;
  total: number;
  archivoNombre: string | null;
  archivoTam: string | null;
  origenExtraccion: string | null;
  observaciones: string | null;
  cargadoPor: string | null;
  ultimaCarga: string;
};
/**
 * Una columna de la tabla de detalle. Casi todas salen del descriptor, pero los módulos con
 * columnas dinámicas (los rangos de vencimiento de cartera: entre 4 y 9, con rótulos que
 * pone cada ERP) añaden las suyas leyendo el JSON de la fila, no un rol fijo.
 */
type Columna = {
  nombre: string;
  etiqueta: string;
  tipo: string;
  /** La columna del valor del descriptor: muestra el saldo con que suma la fila. */
  esValor?: boolean;
  /** Clave dentro del mapa de baldes de `datos`. Solo en las columnas por archivo. */
  familia?: { clave: string; etiqueta: string };
};
type CuentaOpt = { codigo: string; nombre: string };
/** Cuenta del plan estándar Russell hallada en el servidor; `deCedula` = ya es del módulo. */
type CuentaPlan = CuentaOpt & { deCedula: boolean };
type CuentaCliente = { codigo: string; nombre: string };
// Cuentas del cliente homologadas a cada subgrupo Russell (14XX → [{143505, "…"}]).
export type HomologacionCliente = Record<string, CuentaCliente[]>;
// Índice INVERSO: cuenta del cliente → su cuenta Russell de 4 díg. (y de 6, cuando la homologación
// llega a ese nivel) SIN filtrar por módulo, para poder avisar cuando la homologación cae fuera
// de él en vez de decir «no existe».
export type ResolucionCliente = Record<string, { cuenta4: string; cuenta6?: string | null; nombre: string }>;
// Etiqueta de una cuenta Russell: «R - 1435 · Mercancías no fabricadas».
const etiquetaRussell = (codigo: string, nombre?: string | null) => `R - ${codigo}${nombre ? ` · ${nombre}` : ""}`;

/** Etiqueta de una fila del cruce contable; la agrupada nombra sus cuentas y los clasificadores que la originan. */
const etiquetaFilaCruce = (fila: Pick<FilaCruceMarcada, "cuenta4" | "nombre" | "cuentas" | "clasificadores">) =>
  fila.cuenta4 === CLAVE_SIN_CUENTA
    ? NOMBRE_SIN_CUENTA
    : fila.cuentas && fila.cuentas.length > 1
    ? `${fila.cuentas.map((c) => `R - ${c}`).join(" + ")}${fila.clasificadores?.length ? ` · ${fila.clasificadores.join(", ")}` : ""}`
    : etiquetaRussell(fila.cuenta4, fila.nombre);

/** Distintivo de una cuenta que no es de la cédula y vale solo para el período del cargue. */
function ChipSoloPeriodo({ periodo }: { periodo: string }) {
  return (
    <span title={`Cuenta fuera de la cédula del módulo: vale solo para ${periodo}; los demás meses no la usan.`}>
      <Chip label={`Solo ${periodo}`} tone="warn" />
    </span>
  );
}

const etiquetaResp = (r: "si" | "no" | "na" | null) => (r === "si" ? "Sí" : r === "no" ? "No" : r === "na" ? "N/A" : "—");

export default function DatoCargadoClient({
  moduloCodigo,
  moduloLabel,
  encabezadoId,
  comentarios,
  clienteId,
  total,
  columnas,
  clasificadorEtiqueta,
  detalle,
  consolidado,
  cruceContable,
  cruceTercero,
  marcasPeriodo = [],
  novedades,
  cuentas,
  cuentasPeriodo = [],
  nivelCruce,
  homologacionCliente,
  resolucionCliente,
  agrupadores = [],
  puedeEditar,
  versiones,
  versionActualId,
  tabInicial,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  encabezadoId: number;
  comentarios: Record<string, number>;
  clienteId: number;
  total: number;
  columnas: Columna[];
  clasificadorEtiqueta: string;
  detalle: FilaDetalleVm[];
  consolidado: ConsolidadoVm[];
  cruceContable: CruceContableVm;
  cruceTercero: CruceTerceroVm;
  /** Todas las marcas del período: cuenta y tercero comparten la numeración. */
  marcasPeriodo?: MarcaPeriodo[];
  novedades: NovedadesVm;
  cuentas: CuentaOpt[];
  /** Cuentas del plan Russell fuera de la cédula asignadas solo para este período, con su nombre. */
  cuentasPeriodo?: CuentaOpt[];
  /** Nivel de la cuenta Russell de la cédula: subgrupo (4) o cuenta completa (6, Nómina). */
  nivelCruce: NivelCruce;
  homologacionCliente: HomologacionCliente;
  resolucionCliente: ResolucionCliente;
  /** Nómina: centros de costo del archivo y su clase contable. Vacío en los demás módulos. */
  agrupadores?: AgrupadorVm[];
  puedeEditar: boolean;
  versiones: VersionModuloVm[];
  versionActualId: number;
  tabInicial: "versiones" | null;
}) {
  type TabId = "detalle" | "consolidado" | "cruce" | "cruceTercero" | "novedades" | "versiones";
  const [tab, setTab] = useState<TabId>(tabInicial ?? "consolidado");
  const router = useRouter();
  // El Consolidado decide cuándo se puede salir: con cuentas propuestas sin grabar abre su modal
  // y llama a `continuar` cuando el usuario elige guardar o salir sin guardar.
  const comprobarSalidaConsolidado = useRef<((continuar: () => void) => void) | null>(null);
  // Algo se grabó en el Consolidado: al salir de él, UNA recarga para que los cruces lo usen.
  const consolidadoGuardo = useRef(false);
  const tabActual = useRef(tab);
  useEffect(() => { tabActual.current = tab; }, [tab]);
  // Una edición que el autoguardado termina de enviar DESPUÉS de salir del Consolidado (se vacía
  // la cola al desmontar) también tiene que verse en el cruce: se recarga en ese momento.
  const alGuardarConsolidado = () => {
    if (tabActual.current === "consolidado") consolidadoGuardo.current = true;
    else router.refresh();
  };
  const filasNovedad = new Set([...novedades.negativos, ...novedades.descuadres].map((n) => n.filaNum));
  const alertas = filasNovedad.size + (novedades.tercero?.total ?? 0);
  const tabs: TabId[] = [
    "consolidado",
    "detalle",
    "cruce",
    ...(cruceTercero.aplica ? (["cruceTercero"] as const) : []),
    "novedades",
    "versiones",
  ];
  // La pestaña se llama siempre «Novedades»; el nombre largo del análisis de
  // inventarios vive como título dentro del panel.
  const tituloPanelNovedades = moduloCodigo === "INV" ? "Evaluación del inventario teórico" : null;
  const etiquetaTab = (t: TabId) =>
    t === "consolidado" ? "Consolidado"
    : t === "detalle" ? "Detalle"
    : t === "cruce" ? "Cruce contable"
    : t === "cruceTercero" ? "Cruce por tercero"
    : t === "novedades" ? "Novedades"
    : "Versiones";
  const cambiarTab = (t: TabId) => {
    const saleDelConsolidado = tab === "consolidado" && t !== "consolidado";
    setTab(t);
    if (saleDelConsolidado && consolidadoGuardo.current) {
      consolidadoGuardo.current = false;
      router.refresh();
    }
  };
  const irATab = (t: TabId) => {
    if (t === tab) return;
    const comprobar = comprobarSalidaConsolidado.current;
    if (comprobar) comprobar(() => cambiarTab(t));
    else cambiarTab(t);
  };

  // Las marcas del período con el nombre de su renglón y la pestaña donde viven: cada pestaña del
  // cruce cita las de la otra para que la numeración compartida se lea sin huecos.
  const filasCuentaMarcadas = new Map(cruceContable.filasMarcadas.map((f) => [f.cuenta4, f]));
  const filasTerceroMarcadas = new Map((cruceTercero.resumen?.filas ?? []).map((f) => [f.clave, f]));
  const referenciasMarcas: ReferenciaMarcaVm[] = marcasPeriodo.map((m) => {
    if (m.dimension === "tercero") {
      const fila = filasTerceroMarcadas.get(m.llave);
      return {
        ...m,
        etiqueta: fila ? etiquetaTercero(fila) : m.llave.startsWith("~") ? `${m.llave.slice(1)} (sin NIT)` : m.llave,
        // Sin cruce por tercero disponible, la pestaña explica por qué; con cruce, solo si el tercero sigue en él.
        destino: cruceTercero.aplica && (fila || !cruceTercero.resumen) ? { etiqueta: "Cruce por tercero", ir: () => irATab("cruceTercero") } : null,
      };
    }
    const fila = filasCuentaMarcadas.get(m.llave);
    return {
      ...m,
      etiqueta: fila ? etiquetaFilaCruce(fila) : m.llave === CLAVE_SIN_CUENTA ? NOMBRE_SIN_CUENTA : m.llave.split("+").map((c) => `R - ${c}`).join(" + "),
      destino: fila || !cruceContable.resumen ? { etiqueta: "Cruce contable", ir: () => irATab("cruce") } : null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-ink-150">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => irATab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold ${tab === t ? "border-navy-700 text-navy-700" : "border-transparent text-ink-500 hover:text-ink-700"}`}
          >
            {etiquetaTab(t)}
            {t === "novedades" && alertas > 0 && <span className="ml-1.5 rounded-full bg-err-100 px-1.5 text-[10px] font-bold text-err-700">{alertas}</span>}
            {t === "versiones" && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 text-[10px] font-bold text-ink-600">{versiones.length}</span>}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-ink-500">Total: <span className="font-semibold text-ink-800">{fmtContable(total)}</span></span>
        <a
          href={`/modulos/${moduloCodigo.toLowerCase()}/${encabezadoId}/export`}
          data-sin-aviso-salida
          className="mb-1 ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100"
          title="Exporta a Excel el detalle y el consolidado de este cargue"
        >
          <Icon name="download" size={13} /> Exportar a Excel
        </a>
      </div>

      {tab === "consolidado" ? (
        <ConsolidadoTab key={moduloCodigo === "INV" ? encabezadoId : undefined} comprobarSalidaRef={comprobarSalidaConsolidado} onGuardado={alGuardarConsolidado} moduloCodigo={moduloCodigo} clienteId={clienteId} clasificadorEtiqueta={clasificadorEtiqueta} consolidado={consolidado} cuentas={cuentas} cuentasPeriodo={cuentasPeriodo} periodo={cruceContable.periodo} nivelCruce={nivelCruce} homologacionCliente={homologacionCliente} resolucionCliente={resolucionCliente} agrupadores={agrupadores} moduloLabel={moduloLabel} puedeEditar={puedeEditar} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : tab === "detalle" ? (
        <DetalleTab columnas={columnas} clasificadorEtiqueta={clasificadorEtiqueta} detalle={detalle} negativosFilas={filasNovedad} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : tab === "cruce" ? (
        <CruceContableTab onIrConsolidado={() => irATab("consolidado")} moduloLabel={moduloLabel} nivelCruce={nivelCruce} cruceContable={cruceContable} referenciasMarcas={referenciasMarcas} encabezadoId={encabezadoId} comentarios={comentarios} puedeEditar={puedeEditar} />
      ) : tab === "cruceTercero" ? (
        <div className="flex flex-col gap-4">
          {cruceContable.balanceEncontrado && (
            <ConciliacionEnFirmePanel conciliacion={cruceContable.conciliacion} encabezadoId={encabezadoId} moduloLabel={moduloLabel} />
          )}
          <CruceTerceroTab cruceTercero={cruceTercero} cuentasPeriodo={cruceContable.cuentasPeriodo ?? []} referenciasMarcas={referenciasMarcas} encabezadoId={encabezadoId} comentarios={comentarios} puedeEditar={puedeEditar} />
        </div>
      ) : tab === "novedades" ? (
        <NovedadesTab novedades={novedades} titulo={tituloPanelNovedades} />
      ) : (
        <VersionesTab moduloCodigo={moduloCodigo} versiones={versiones} versionActualId={versionActualId} />
      )}
    </div>
  );
}

const claveSet = (arr: string[]) => [...new Set(arr)].sort().join(",");

// Etiqueta del clasificador en plural y minúscula, para los textos de la asignación
// masiva: «Tipo de inventario» → «tipos de inventario», «Concepto» → «conceptos».
function pluralClasificador(etiqueta: string): string {
  const [cabeza, ...resto] = etiqueta.toLowerCase().split(" ");
  if (!cabeza) return etiqueta.toLowerCase();
  const plural = /[aeiouáéíóú]$/.test(cabeza) ? `${cabeza}s` : `${cabeza}es`;
  return [plural, ...resto].join(" ");
}

// Conjunto INICIAL de cuentas por clasificador. Prefill: si no hay cuentas guardadas y el
// clasificador ES un código de cuenta (≥ los dígitos del nivel), se propone su prefijo del
// nivel de la cédula (queda «sin guardar»). Solo se propone una cuenta que el módulo ofrece: en
// una cédula mixta primero la de 6 (422005) y luego el subgrupo; la 1592 de Activos fijos no.
function cuentasInicialesConsolidado(consolidado: ConsolidadoVm[], nivel: NivelCruce, validas: ReadonlySet<string>): Record<string, string[]> {
  return Object.fromEntries(consolidado.map((c) => {
    const guardadas = c.cuentas4.map((x) => x.codigo);
    if (guardadas.length) return [c.clasificador, guardadas];
    // Nómina: la homologación sugerida (cuenta del archivo, memoria + clase, grupo por nombre)
    // se propone cuando es UNA cuenta de gasto; «multi» y control no se proponen. Lo asignado en
    // los centros (un cargue sin centro) se propone entero, con una o varias cuentas.
    if (c.sugerencia) {
      const s = c.sugerencia;
      if (s.destino === "gasto" && s.via === "memoria_centros") return [c.clasificador, [...s.cuentas]];
      return [c.clasificador, s.destino === "gasto" && s.via !== "multi" && s.cuentas.length === 1 ? [...s.cuentas] : []];
    }
    const digitos = c.clasificador.replace(/\D/g, "");
    const candidatas = [digitos.length >= 6 ? digitos.slice(0, 6) : "", digitos.length >= nivel ? digitos.slice(0, nivel) : ""]
      .filter((cuenta) => cuenta.length === nivel || (cuenta.length === 6 && validas.has(cuenta)));
    const propuesta = validas.size > 0 ? candidatas.find((cuenta) => validas.has(cuenta)) : candidatas.find((cuenta) => cuenta.length === nivel);
    return [c.clasificador, propuesta ? [propuesta] : []];
  }));
}

const ETIQUETA_VIA: Record<SugerenciaConsolidado["via"], string> = {
  archivo: "cuenta del archivo",
  memoria_exacta: "memoria del cliente",
  memoria_clase: "memoria + clase del centro",
  memoria_centros: "lo asignado en los centros",
  multi: "varias cuentas",
  sugerido_nombre: "sugerida por el nombre",
  sin_cuenta: "sin cuenta",
};

/** Nómina: pie de cada renglón con la sugerencia de homologación y su origen. */
function SugerenciaConcepto({ s, asignadas, onUsar }: { s: SugerenciaConsolidado; asignadas: string[]; onUsar: ((cuentas: string[]) => void) | null }) {
  const grupo = s.grupo ? grupoConcepto(s.grupo)?.etiqueta ?? s.grupo : null;
  const meta = [grupo ? `Grupo: ${grupo}` : null, s.subcuentaPuc ? `Subcuenta PUC ${s.subcuentaPuc}` : null, s.cuentaCliente ? `Cuenta del cliente ${s.cuentaCliente}` : null].filter(Boolean).join(" · ");
  if (s.destino === "control" || s.destino === "fuera") {
    return (
      <div className="text-[10.5px] leading-snug text-ink-500">
        <span className="rounded border border-ink-200 bg-ink-50 px-1 py-0.5 font-semibold text-ink-600">{s.destino === "control" ? "Control de deducciones" : "Fuera del módulo"}</span>{" "}
        {s.motivo}{meta ? ` · ${meta}` : ""}
      </div>
    );
  }
  const distinta = s.cuentas.length > 0 && [...s.cuentas].sort().join(",") !== [...asignadas].sort().join(",");
  return (
    <div className="text-[10.5px] leading-snug text-ink-500">
      <span className={`font-semibold ${s.via === "sin_cuenta" ? "text-warn-700" : "text-ink-600"}`}>{ETIQUETA_VIA[s.via]}</span>
      {s.cuentas.length > 0 && (
        <>
          {": "}
          {s.cuentas.map((c) => <span key={c} className="mr-1 rounded border border-ink-200 bg-white px-1 font-mono text-ink-700">{c}</span>)}
        </>
      )}
      {s.via === "multi" && <span className="text-ink-500"> — la porción de cada una la define el auditor en el cruce.</span>}
      {" "}<span title={s.motivo}>{s.motivo}</span>
      {meta && <span className="text-ink-400"> · {meta}</span>}
      {onUsar && distinta && s.via !== "multi" && (
        <button type="button" onClick={() => onUsar(s.cuentas)} className="ml-1 font-semibold text-blue-700 hover:underline">Usar</button>
      )}
    </div>
  );
}

/** Nómina: clase contable de cada centro de costo / clase del archivo (GYA → 51, MOD → 72). */
function PanelClasesAgrupador({ agrupadores, clienteId, moduloCodigo, puedeEditar }: { agrupadores: AgrupadorVm[]; clienteId: number; moduloCodigo: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(agrupadores.some((a) => a.clase == null));
  const [guardando, setGuardando] = useState<string | null>(null);
  const [, start] = useTransition();
  const sinClase = agrupadores.filter((a) => a.clase == null).length;
  const cambiar = (agrupador: string, clase: string) => {
    setGuardando(agrupador);
    start(async () => {
      const r = await guardarClaseAgrupador({ clienteId, moduloCodigo, agrupador, clase: clase || null });
      setGuardando(null);
      if (r.ok) { notifySuccess(r.message ?? "Clase guardada."); router.refresh(); } else notifyError(r.message ?? "No se pudo guardar la clase.");
    });
  };
  return (
    <div className="border-b border-ink-100 bg-ink-50/40">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11.5px]">
        <span>
          <span className="font-semibold text-ink-700">Clases por centro de costo</span>{" "}
          <span className="text-ink-500">· {agrupadores.length} centro{agrupadores.length === 1 ? "" : "s"} en el archivo</span>
          {sinClase > 0 && <span className="ml-2 rounded-full border border-warn-500 bg-warn-100 px-2 py-0.5 text-[10.5px] font-semibold text-warn-700">{sinClase} sin clase</span>}
        </span>
        <span className="text-ink-400">{abierto ? "▾" : "▸"}</span>
      </button>
      {abierto && (
        <div className="px-3 pb-3">
          <p className="mb-2 text-[11px] text-ink-500">
            El centro decide la CLASE del gasto (51 administración, 52 ventas, 72 mano de obra directa, 73 indirecta) y el concepto pone la subcuenta:
            con la clase, la memoria de cada concepto se lleva al centro sin volver a homologar. Sin clase, la porción por clase se define en el cruce.
          </p>
          <table className="w-full text-[11.5px]">
            <thead className="text-left text-ink-500">
              <tr><th className="py-1 pr-3 font-semibold">Centro / clase del archivo</th><th className="py-1 pr-3 text-right font-semibold">Filas</th><th className="py-1 pr-3 text-right font-semibold">Total</th><th className="py-1 font-semibold">Clase contable</th></tr>
            </thead>
            <tbody>
              {agrupadores.map((a) => (
                <tr key={a.agrupador} className="border-t border-ink-100">
                  <td className="py-1 pr-3 font-medium text-ink-800">{a.agrupador}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-ink-500">{a.filas}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-ink-700">{fmtContable(a.total)}</td>
                  <td className="py-1">
                    {puedeEditar ? (
                      <span className="inline-flex items-center gap-2">
                        <select
                          value={a.clase ?? ""}
                          disabled={guardando === a.agrupador}
                          onChange={(e) => cambiar(a.agrupador, e.target.value)}
                          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] text-ink-700"
                          aria-label={`Clase contable de ${a.agrupador}`}
                        >
                          <option value="">— sin clase —</option>
                          {CLASES_NOMINA.map((c) => <option key={c} value={c}>{c} · {c === "51" ? "Administración" : c === "52" ? "Ventas" : c === "72" ? "Mano de obra directa" : "Mano de obra indirecta"}</option>)}
                        </select>
                        {a.clase == null && a.sugerida && (
                          <button type="button" onClick={() => cambiar(a.agrupador, a.sugerida!)} className="text-[11px] font-semibold text-blue-700 hover:underline">Sugerida: {a.sugerida}</button>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-700">{a.clase ?? <span className="text-warn-700">sin clase</span>}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConsolidadoTab({
  comprobarSalidaRef,
  onGuardado,
  moduloCodigo,
  clienteId,
  clasificadorEtiqueta,
  consolidado,
  cuentas,
  cuentasPeriodo,
  periodo,
  nivelCruce,
  homologacionCliente,
  resolucionCliente,
  agrupadores,
  moduloLabel,
  puedeEditar,
  encabezadoId,
  comentarios,
}: {
  comprobarSalidaRef: RefObject<((continuar: () => void) => void) | null>;
  /** Se grabó algo: la página se recarga al salir del Consolidado para que los cruces lo usen. */
  onGuardado?: () => void;
  moduloCodigo: string;
  clienteId: number;
  clasificadorEtiqueta: string;
  consolidado: ConsolidadoVm[];
  /** Cuentas de la cédula: lo que el selector ofrece. */
  cuentas: CuentaOpt[];
  /** Cuentas del plan Russell fuera de la cédula ya asignadas solo para este período. */
  cuentasPeriodo: CuentaOpt[];
  /** Período del cargue: el único en que valen las cuentas de fuera de la cédula. */
  periodo: string;
  nivelCruce: NivelCruce;
  homologacionCliente: HomologacionCliente;
  resolucionCliente: ResolucionCliente;
  agrupadores: AgrupadorVm[];
  moduloLabel: string;
  puedeEditar: boolean;
  encabezadoId: number;
  comentarios: Record<string, number>;
}) {
  const router = useRouter();
  // Lo que el usuario EDITA se autoguarda en todos los módulos (pausa corta + LOTE). Las
  // PROPUESTAS del sistema al abrir nunca se graban solas: se confirman con «Guardar» y, si
  // quedan, se recuerdan al salir. Inventarios además tiene el filtro «Sin cuenta asignada».
  const esInventarios = moduloCodigo === "INV";
  const [buscando, setBuscando] = useState<string | null>(null); // clasificador cuyo selector de cuenta está abierto
  // Cuentas del plan Russell fuera de la cédula que valen solo para este período: las ya
  // guardadas (servidor) y las que el usuario agrega aquí antes de guardarlas.
  const [extrasNuevas, setExtrasNuevas] = useState<CuentaOpt[]>([]);
  const cuentasExtra = useMemo(() => {
    const porCodigo = new Map(cuentasPeriodo.map((c) => [c.codigo, c]));
    for (const c of extrasNuevas) if (!porCodigo.has(c.codigo)) porCodigo.set(c.codigo, c);
    return [...porCodigo.values()];
  }, [cuentasPeriodo, extrasNuevas]);
  const codigosExtra = useMemo(() => new Set(cuentasExtra.map((c) => c.codigo)), [cuentasExtra]);
  const codigosConocidos = useMemo(() => new Set([...cuentas, ...cuentasPeriodo].map((c) => c.codigo)), [cuentas, cuentasPeriodo]);
  const [consultando, setConsultando] = useState<string | null>(null); // clasificador cuya cuenta se busca en el plan
  // Entorno para resolver lo que el usuario escribe: las cuentas válidas del módulo (cédula +
  // las del período) y la homologación del cliente (sin filtrar, para avisar cuando cae fuera).
  const entornoResolucion = useMemo(() => ({
    nivel: nivelCruce,
    subgruposModulo: new Set([...cuentas, ...cuentasExtra].map((c) => c.codigo)),
    homologacionCliente: new Map(Object.entries(resolucionCliente)),
  }), [cuentas, cuentasExtra, nivelCruce, resolucionCliente]);
  // Cédula MIXTA: un módulo a 4 que además concilia cuentas de 6 (Ingresos 422005).
  const cedulaMixta = nivelCruce === 4 && cuentas.some((c) => c.codigo.length === 6);
  const etiquetaNivel = cedulaMixta ? "4 o 6" : String(nivelCruce);
  // Cuentas del CLIENTE que el desplegable ofrece: solo las que resuelven DENTRO del
  // módulo (las de fuera se rechazan al aceptarlas, no tiene sentido sugerirlas). A 6
  // dígitos la clave es la cuenta completa: una homologación solo al subgrupo no se ofrece.
  const opcionesCliente = useMemo(
    () => Object.entries(resolucionCliente)
      .map(([codigo, d]) => ({
        codigo,
        nombre: d.nombre,
        clave: d.cuenta6 && entornoResolucion.subgruposModulo.has(d.cuenta6) ? d.cuenta6 : nivelCruce === 6 ? d.cuenta6 ?? null : d.cuenta4,
      }))
      .filter((d): d is { codigo: string; nombre: string; clave: string } => d.clave != null && entornoResolucion.subgruposModulo.has(d.clave))
      .map((d) => ({ codigo: d.codigo, etiqueta: `${d.codigo}${d.nombre ? ` · ${d.nombre}` : ""} → R-${d.clave}` }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [resolucionCliente, entornoResolucion, nivelCruce],
  );
  // Cuentas (1..N) por clasificador — conjunto EDITABLE y el último persistido (para «sucias»).
  const [valores, setValores] = useState<Record<string, string[]>>(() => cuentasInicialesConsolidado(consolidado, nivelCruce, new Set(cuentas.map((c) => c.codigo))));
  const [guardados, setGuardados] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(consolidado.map((c) => [c.clasificador, c.cuentas4.map((x) => x.codigo)])),
  );
  const [nuevos, setNuevos] = useState<Record<string, string>>({}); // input «agregar cuenta» por fila
  const [guardandoClave, setGuardandoClave] = useState<string | null>(null);
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  // Selección de filas para la asignación MASIVA (una o varias cuentas a N clasificadores).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [masivoAbierto, setMasivoAbierto] = useState(false);
  const [, startGuardar] = useTransition();
  // Renglones que el usuario tocó: lo que difiere de lo grabado y NO se tocó es una propuesta.
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  // Salida pendiente de confirmar en el modal (cambio de pestaña o enlace del menú).
  const [salidaPendiente, setSalidaPendiente] = useState<(() => void) | null>(null);
  const [guardandoSalida, setGuardandoSalida] = useState(false);
  const nombrePorCuenta = useMemo(() => new Map([...cuentas, ...cuentasExtra].map((c) => [c.codigo, c.nombre])), [cuentas, cuentasExtra]);
  // Lo último que se ve de las asignaciones, para lo que se agrega tras consultar el servidor.
  const valoresRef = useRef(valores);
  useEffect(() => { valoresRef.current = valores; }, [valores]);

  // Filtro de VISTA «Todas / Sin cuenta asignada» (solo Inventarios): se basa en la
  // asignación GUARDADA (`guardados`), nunca en la sugerencia de prefill sin confirmar
  // que trae `valores` — de lo contrario un clasificador con solo la propuesta automática
  // (aún sin persistir) se vería como «con cuenta» y no aparecería en el filtro.
  const [filtroVista, setFiltroVista] = useState<"todas" | "sinCuenta">("todas");
  const sinCuentaGuardada = useMemo(
    () => consolidado.filter((c) => (guardados[c.clasificador] ?? []).length === 0).length,
    [consolidado, guardados],
  );
  const consolidadoVisible = useMemo(
    () => (esInventarios && filtroVista === "sinCuenta"
      ? consolidado.filter((c) => (guardados[c.clasificador] ?? []).length === 0)
      : consolidado),
    [consolidado, guardados, filtroVista, esInventarios],
  );

  const marcarGuardadas = (filas: { clasificador: string; cuentas4: string[] }[]) => {
    const aplicar = (prev: Record<string, string[]>) => {
      const next = { ...prev };
      for (const f of filas) next[f.clasificador] = [...f.cuentas4].sort();
      return next;
    };
    // Solo lo GRABADO: `valores` pudo cambiar mientras el lote viajaba y no se pisa.
    setGuardados(aplicar);
    onGuardado?.();
  };

  // Autoguardado (todos los módulos): cada edición explícita se «programa»; el controlador
  // decide cuándo y qué enviar (pausa corta + LOTE + una sola solicitud en vuelo). NUNCA se
  // programa nada al montar (las propuestas de `cuentasInicialesConsolidado` quedan «sin
  // guardar» hasta que el usuario las confirme o las toque). La salida la vigila el modal de
  // abajo, no el hook.
  const autosave = useAutoguardadoConsolidacion(
    async (filas) => {
      const r = await guardarConsolidacionModuloLote({ clienteId, moduloCodigo, filas, encabezadoId });
      if (r.ok) {
        marcarGuardadas(filas);
        // Una cuenta del período recién guardada entra al cruce y trae su homologación al recargar.
        if (filas.some((f) => f.cuentas4.some((c) => !codigosConocidos.has(c)))) router.refresh();
      } else notifyError(r.message ?? "No se pudieron guardar los cambios del Consolidado.");
      return { ok: r.ok === true, message: r.message };
    },
    puedeEditar,
    { interceptarSalida: false },
  );
  const anotarAutoguardado = (clasificador: string, cuentas4: string[]) => {
    setTocados((p) => (p.has(clasificador) ? p : new Set(p).add(clasificador)));
    autosave.programar(clasificador, cuentas4);
  };

  // Lo que se ve y no está grabado: propuestas (sin tocar) y ediciones en camino o con error.
  const pendientes = useMemo(
    () => renglonesSinGuardar({ clasificadores: consolidado.map((c) => c.clasificador), valores, guardados, tocados }),
    [consolidado, valores, guardados, tocados],
  );
  const propuestas = useMemo(() => pendientes.filter((p) => p.origen === "propuesta"), [pendientes]);
  // El modal hace falta cuando algo NO se va a grabar solo: una propuesta o un autoguardado que
  // falló. Una edición en camino se envía igual al salir (el desmontaje vacía la cola).
  const requiereAviso = puedeEditar && (propuestas.length > 0 || autosave.snapshot.estado === "error");
  useEffect(() => {
    comprobarSalidaRef.current = (continuar) => {
      if (!requiereAviso) { continuar(); return; }
      setSalidaPendiente(() => continuar);
    };
    return () => { comprobarSalidaRef.current = null; };
  }, [comprobarSalidaRef, requiereAviso]);
  // El menú lateral, las migas y «Volver a …» pasan por el mismo modal.
  const alSalirPorEnlace = useCallback((href: string) => setSalidaPendiente(() => () => router.push(href)), [router]);
  useInterceptarEnlaces(requiereAviso, alSalirPorEnlace);
  // Cerrar o recargar el navegador con algo sin grabar: el diálogo nativo.
  useAvisoCierreNavegador(puedeEditar && pendientes.length > 0);
  const ocupado = guardandoClave != null || guardandoTodo;

  const clasificadores = useMemo(() => consolidadoVisible.map((c) => c.clasificador), [consolidadoVisible]);
  // Intersección con la tabla actual: tras un refresh puede haber cambiado el consolidado.
  const seleccionados = useMemo(() => clasificadores.filter((k) => seleccion.has(k)), [clasificadores, seleccion]);
  const nSel = seleccionados.length;
  const etiquetaPlural = useMemo(() => pluralClasificador(clasificadorEtiqueta), [clasificadorEtiqueta]);

  const alternarSeleccion = (clasificador: string) =>
    setSeleccion((p) => {
      const s = new Set(p);
      if (s.has(clasificador)) s.delete(clasificador);
      else s.add(clasificador);
      return s;
    });
  const seleccionarTodos = (activar: boolean) => setSeleccion(activar ? new Set(clasificadores) : new Set());
  const seleccionarSinCuenta = () => setSeleccion(new Set(clasificadores.filter((k) => (valores[k] ?? []).length === 0)));

  // La asignación masiva es una edición explícita: el autoguardado la persiste sola.
  const aplicarMasivo = (cuentas4: string[], modo: ModoAsignacionMasiva) => {
    const siguiente = aplicarAsignacionMasiva(valores, seleccionados, cuentas4, modo);
    setValores(siguiente);
    for (const clasificador of seleccionados) anotarAutoguardado(clasificador, siguiente[clasificador] ?? []);
    setMasivoAbierto(false);
    notifyInfo(
      `${cuentas4.length} cuenta${cuentas4.length === 1 ? "" : "s"} ${modo === "reemplazar" ? "reemplazan las de" : "aplicadas a"} ${nSel} ${etiquetaPlural}. Se guardan solas en un momento.`,
    );
  };

  // El campo acepta la cuenta Russell (1435) o la del cliente (143505), que se resuelve
  // por su homologación — NUNCA truncando, que es lo que hacía antes y daba otra cuenta
  // en el 25,9% de las homologadas de inventario.
  //
  // Un código Russell que no es de la cédula ya no se rechaza aquí: se busca en el plan estándar
  // y, si existe, se asigna solo para el período de este cargue (la cédula no cambia).
  const sumarCuenta = (clasificador: string, cuenta: string) => {
    const nuevasCuentas = [...new Set([...(valoresRef.current[clasificador] ?? []), cuenta])].sort();
    setValores((p) => ({ ...p, [clasificador]: nuevasCuentas }));
    anotarAutoguardado(clasificador, nuevasCuentas);
  };
  const registrarCuentaDelPlan = (cuenta: CuentaPlan) => {
    if (cuenta.deCedula) return;
    setExtrasNuevas((p) => (p.some((c) => c.codigo === cuenta.codigo) ? p : [...p, { codigo: cuenta.codigo, nombre: cuenta.nombre }]));
  };
  const avisoSoloPeriodo = (cuenta: CuentaOpt) =>
    notifyInfo(
      `${etiquetaRussell(cuenta.codigo, cuenta.nombre)} no es de la cédula de ${moduloLabel}: vale solo para ${periodo}.`,
    );
  const agregarCuenta = (clasificador: string) => {
    const r = resolverCuenta4(nuevos[clasificador] ?? "", entornoResolucion);
    if (r.ok) {
      sumarCuenta(clasificador, r.cuenta4);
      setNuevos((p) => ({ ...p, [clasificador]: "" }));
      if (r.via === "cliente") notifyInfo(`${r.cuentaCliente}${r.nombreCliente ? ` ${r.nombreCliente}` : ""} → R-${r.cuenta4}`);
      return;
    }
    const codigo = codigoDelPlanPorConsultar(r, nivelCruce);
    if (!codigo) {
      const pista = r.motivo !== "vacia" && r.entrada.length === nivelCruce
        ? ` Si es la cuenta Russell ${r.entrada}, elígela en «Buscar…» › «Otras cuentas del plan Russell».`
        : "";
      notifyError(mensajeResolucion(r, moduloLabel, nivelCruce) + pista);
      return;
    }
    setConsultando(clasificador);
    void consultarCuentasRussell({ encabezadoId, texto: codigo }).then((res) => {
      setConsultando(null);
      if (!res.ok) { notifyError(res.message); return; }
      const hallada = res.cuentas.find((c) => c.codigo === codigo);
      if (!hallada) {
        notifyError(`La cuenta ${codigo} no está en el plan estándar Russell o no se puede asignar en ${moduloLabel}.`);
        return;
      }
      registrarCuentaDelPlan(hallada);
      sumarCuenta(clasificador, hallada.codigo);
      setNuevos((p) => ({ ...p, [clasificador]: "" }));
      if (!hallada.deCedula) avisoSoloPeriodo(hallada);
    }, () => {
      setConsultando(null);
      notifyError("No se pudo consultar el plan estándar Russell. Intenta de nuevo.");
    });
  };
  const quitarCuenta = (clasificador: string, cod: string) => {
    const nuevasCuentas = (valores[clasificador] ?? []).filter((x) => x !== cod);
    setValores((p) => ({ ...p, [clasificador]: nuevasCuentas }));
    anotarAutoguardado(clasificador, nuevasCuentas);
  };

  const guardar = (clasificador: string) => {
    const cuentas4 = valores[clasificador] ?? [];
    setGuardandoClave(clasificador);
    startGuardar(async () => {
      const r = await guardarConsolidacionModulo({ clienteId, moduloCodigo, clasificador, cuentas4, encabezadoId });
      setGuardandoClave(null);
      if (r.ok) {
        marcarGuardadas([{ clasificador, cuentas4 }]);
        notifySuccess(r.message ?? "Consolidación guardada.");
      } else notifyError(r.message ?? "No se pudo guardar.");
    });
  };

  // Confirma de una vez las cuentas que el sistema propuso al abrir.
  const guardarPropuestas = () => {
    if (propuestas.length === 0) return;
    const filas = propuestas.map((p) => ({ clasificador: p.clasificador, cuentas4: p.cuentas }));
    setGuardandoTodo(true);
    startGuardar(async () => {
      const r = await guardarConsolidacionModuloLote({ clienteId, moduloCodigo, filas, encabezadoId });
      setGuardandoTodo(false);
      if (r.ok) {
        marcarGuardadas(filas);
        notifySuccess(r.message ?? "Propuestas guardadas.");
      } else notifyError(r.message ?? "No se pudieron guardar las propuestas.");
    });
  };

  // Modal de salida: graba TODO lo pendiente en un lote y sigue a donde iba; si falla, se queda.
  const guardarYContinuar = () => {
    const continuar = salidaPendiente;
    if (!continuar || guardandoSalida) return;
    const filas = pendientes.map((p) => ({ clasificador: p.clasificador, cuentas4: p.cuentas }));
    setGuardandoSalida(true);
    void guardarConsolidacionModuloLote({ clienteId, moduloCodigo, filas, encabezadoId }).then(
      (r) => {
        setGuardandoSalida(false);
        if (!r.ok) { notifyError(r.message ?? "No se pudieron guardar las cuentas."); return; }
        marcarGuardadas(filas);
        notifySuccess(r.message ?? "Cuentas guardadas.");
        setSalidaPendiente(null);
        continuar();
      },
      () => {
        setGuardandoSalida(false);
        notifyError("No se pudieron guardar las cuentas. Intenta de nuevo.");
      },
    );
  };
  const salirSinGuardar = () => {
    const continuar = salidaPendiente;
    setSalidaPendiente(null);
    continuar?.();
  };

  return (
    <Card className="p-0">
      {agrupadores.length > 0 && (
        <PanelClasesAgrupador agrupadores={agrupadores} clienteId={clienteId} moduloCodigo={moduloCodigo} puedeEditar={puedeEditar} />
      )}
      {esInventarios && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-3 py-2 text-[11.5px]">
          <span className="text-ink-500">Mostrar:</span>
          <button
            type="button"
            onClick={() => setFiltroVista("todas")}
            className={`rounded-full border px-2.5 py-1 font-semibold ${filtroVista === "todas" ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
          >
            Todas ({consolidado.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroVista("sinCuenta")}
            className={`rounded-full border px-2.5 py-1 font-semibold ${filtroVista === "sinCuenta" ? "border-warn-500 bg-warn-100 text-warn-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
          >
            Sin cuenta asignada ({sinCuentaGuardada})
          </button>
        </div>
      )}
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-500">
            <span className={nSel > 0 ? "font-semibold text-navy-700" : ""}>Selección: {nSel} de {clasificadores.length}</span>
            <span className="text-ink-300">·</span>
            <button type="button" onClick={() => seleccionarTodos(true)} className="font-medium text-blue-700 hover:underline">Todas</button>
            <button type="button" onClick={seleccionarSinCuenta} className="font-medium text-blue-700 hover:underline">Sin cuenta</button>
            {nSel > 0 && (
              <button type="button" onClick={() => seleccionarTodos(false)} className="font-medium text-ink-500 hover:underline">Limpiar</button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EstadoGuardado estado={autosave.snapshot.estado} mensaje={autosave.snapshot.mensaje ?? undefined} onReintentar={autosave.reintentar} />
            {propuestas.length > 0 && (
              <p className="text-[11.5px] text-warn-700" title="Cuentas que el sistema propuso al abrir (por el código del renglón). Se graban cuando las confirmas.">
                {propuestas.length === 1 ? "1 propuesta sin guardar" : `${propuestas.length} propuestas sin guardar`}
              </p>
            )}
            <button
              type="button"
              disabled={nSel === 0 || ocupado}
              onClick={() => setMasivoAbierto(true)}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={nSel === 0 ? `Marca ${etiquetaPlural} en la tabla para asignarles cuentas en bloque` : undefined}
            >
              Asignar cuentas{nSel > 0 ? ` (${nSel})` : ""}…
            </button>
            {propuestas.length > 0 && (
              <button
                type="button"
                disabled={ocupado}
                onClick={guardarPropuestas}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardandoTodo ? "Guardando…" : `Guardar propuestas (${propuestas.length})`}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto">
        <table className="tabla-encabezado-fijo w-full text-[12.5px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              {puedeEditar && (
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Seleccionar todas las filas (${clasificadores.length})`}
                    checked={clasificadores.length > 0 && nSel === clasificadores.length}
                    ref={(el) => { if (el) el.indeterminate = nSel > 0 && nSel < clasificadores.length; }}
                    onChange={(e) => seleccionarTodos(e.target.checked)}
                  />
                </th>
              )}
              <th className="px-3 py-2 font-semibold">{clasificadorEtiqueta}</th>
              <th className="px-3 py-2 text-right font-semibold">Filas</th>
              <th className="min-w-[140px] whitespace-nowrap px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Cuentas ({etiquetaNivel} díg) — una o varias</th>
              <th className="px-3 py-2 text-center font-semibold">💬</th>
            </tr>
          </thead>
          <tbody>
            {esInventarios && filtroVista === "sinCuenta" && consolidadoVisible.length === 0 && (
              <tr>
                <td colSpan={puedeEditar ? 6 : 5} className="px-3 py-6 text-center text-ink-400">
                  Ningún grupo coincide con el filtro «Sin cuenta asignada».
                </td>
              </tr>
            )}
            {consolidadoVisible.map((c) => {
              const asignadas = valores[c.clasificador] ?? [];
              const sucia = claveSet(asignadas) !== claveSet(guardados[c.clasificador] ?? []);
              const guardandoEsta = guardandoClave === c.clasificador;
              const marcada = seleccion.has(c.clasificador);
              const conCuentaDelPeriodo = asignadas.some((cod) => codigosExtra.has(cod));
              return (
                <tr key={c.clasificador} className={`border-t border-ink-100 align-top ${sucia ? "bg-warn-100/20" : marcada ? "bg-blue-50/50" : ""}`}>
                  {puedeEditar && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={`Seleccionar ${c.clasificador}`}
                        checked={marcada}
                        onChange={() => alternarSeleccion(c.clasificador)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-ink-800">
                    {c.codigo ?? c.clasificador}
                    {/* Nómina: centro de costo / clase del archivo al que pertenece el renglón. */}
                    {c.agrupador && (
                      <span className="ml-1.5 rounded border border-ink-200 bg-ink-50 px-1 py-0.5 text-[10.5px] font-semibold text-ink-600" title="Centro de costo / clase del archivo">{c.agrupador}</span>
                    )}
                    {/* Nombre del concepto cuando el clasificador es un código (Nómina). */}
                    {c.descripcion && (
                      <div className="text-[11px] font-normal text-ink-500">{c.descripcion}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-500">{c.filas}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-ink-800">{fmtContable(c.total)}</td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {asignadas.length === 0 && <span className="text-[11.5px] font-medium text-warn-700">sin cuenta</span>}
                        {asignadas.map((cod) => {
                          const ctas = homologacionCliente[cod] ?? [];
                          const delPeriodo = codigosExtra.has(cod);
                          return (
                            <span
                              key={cod}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] ${delPeriodo ? "border-warn-500 bg-warn-100/40 text-warn-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}
                              title={`${etiquetaRussell(cod, nombrePorCuenta.get(cod))}${delPeriodo ? ` · solo ${periodo}` : ""}`}
                            >
                              <span className="font-semibold">R - {cod}</span>
                              {nombrePorCuenta.get(cod) && <span className={`max-w-[120px] truncate ${delPeriodo ? "" : "text-blue-600"}`}>{nombrePorCuenta.get(cod)}</span>}
                              {delPeriodo && <span className="text-[10px] font-semibold uppercase tracking-wide">solo {periodo}</span>}
                              {ctas.length === 0 && codigosConocidos.has(cod) && <span className="font-bold text-warn-700" title="El cliente no tiene cuentas homologadas a este subgrupo">⚠</span>}
                              {puedeEditar && <button type="button" onClick={() => quitarCuenta(c.clasificador, cod)} className={`${delPeriodo ? "text-warn-700/60" : "text-blue-400"} hover:text-err-700`} title="Quitar">×</button>}
                            </span>
                          );
                        })}
                      </div>
                      {conCuentaDelPeriodo ? (
                        <div className="text-[10.5px] leading-snug text-warn-700">
                          Esta asignación vale solo para {periodo}; los demás meses siguen con la memoria del cliente.
                        </div>
                      ) : c.soloPeriodo ? (
                        <div className="text-[10.5px] leading-snug text-warn-700">
                          {sucia
                            ? "Sin cuentas de fuera de la cédula, al guardar esta asignación pasa a la memoria del cliente y vale para todos los meses."
                            : `Asignación guardada solo para ${periodo}.`}
                        </div>
                      ) : null}
                      {c.sugerencia && (
                        <SugerenciaConcepto
                          s={c.sugerencia}
                          asignadas={asignadas}
                          onUsar={puedeEditar ? (cuentasSug) => {
                            const nuevasCuentas = [...new Set(cuentasSug)].sort();
                            setValores((p) => ({ ...p, [c.clasificador]: nuevasCuentas }));
                            anotarAutoguardado(c.clasificador, nuevasCuentas);
                          } : null}
                        />
                      )}
                      {/* Detalle: cuentas del CLIENTE homologadas a cada cuenta Russell asignada. */}
                      {asignadas.map((cod) => {
                        const ctas = homologacionCliente[cod] ?? [];
                        return (
                          <div key={cod} className="text-[10.5px] leading-snug text-ink-500">
                            <span className="font-semibold text-ink-600">R-{cod} →</span>{" "}
                            {ctas.length
                              ? ctas.map((x) => `${x.codigo} ${x.nombre}`).join("  ·  ")
                              : codigosConocidos.has(cod)
                                ? <span className="font-medium text-warn-700">el cliente no tiene cuentas homologadas a esta cuenta Russell</span>
                                : <span className="italic">las cuentas del cliente se ven al guardar</span>}
                          </div>
                        );
                      })}
                      {puedeEditar && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            list="cuentas4-modulo"
                            value={nuevos[c.clasificador] ?? ""}
                            onChange={(e) => setNuevos((p) => ({ ...p, [c.clasificador]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarCuenta(c.clasificador); } }}
                            placeholder={nivelCruce === 6 ? `${cuentas[0]?.codigo ?? "510506"} o ${cuentas[0]?.codigo ?? "510506"}01` : cedulaMixta ? `${cuentas.find((x) => x.codigo.length === 4)?.codigo ?? "4135"} o ${cuentas.find((x) => x.codigo.length === 6)?.codigo ?? "422005"}` : "1435 o 143505"}
                            inputMode="numeric"
                            title={`Escribe la cuenta Russell de ${etiquetaNivel} dígitos o la cuenta del cliente: se resuelve por su homologación. Una cuenta Russell de fuera de la cédula vale solo para ${periodo}.`}
                            className="w-24 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
                          />
                          <button type="button" disabled={consultando === c.clasificador} onClick={() => agregarCuenta(c.clasificador)} className="rounded-md border border-ink-300 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60">
                            {consultando === c.clasificador ? "Buscando…" : "+ cuenta"}
                          </button>
                          <button type="button" onClick={() => setBuscando(c.clasificador)} className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50">Buscar…</button>
                          {sucia && tocados.has(c.clasificador) ? (
                            // Edición del usuario: se autoguarda; el estado global (Guardando /
                            // Guardado / Error) vive en la barra superior.
                            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">pendiente…</span>
                          ) : (
                            <>
                              <button type="button" disabled={ocupado || !sucia} onClick={() => guardar(c.clasificador)} className="rounded-md border border-ok-500 bg-ok-100/40 px-2 py-1 text-[11px] font-semibold text-ok-700 hover:bg-ok-100 disabled:cursor-not-allowed disabled:opacity-50">
                                {/* Gris sin cambios pendientes: si la fila tiene cuentas, dice que YA están
                                    guardadas (TKT-75: «Guardar» apagado se leía como «no se guardó»). */}
                                {guardandoEsta ? "…" : !sucia && asignadas.length > 0 ? "✓ Guardado" : "Guardar"}
                              </button>
                              {sucia && (
                                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-warn-700" title="La propuso el sistema al abrir, por el código del renglón. Se graba cuando la confirmas con «Guardar».">
                                  propuesta · sin guardar
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ComentarioAncla tipo="modulos_datos" entityId={encabezadoId} anchor={`tipo:${c.clasificador}`} titulo={`${clasificadorEtiqueta}: ${c.clasificador}`} count={comentarios[`tipo:${c.clasificador}`] ?? 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Ofrece las DOS entradas: la cuenta Russell y la del cliente, esta última con su
          destino a la vista para que se vea a dónde va antes de aceptarla. */}
      <datalist id="cuentas4-modulo">
        {cuentas.map((c) => <option key={`r-${c.codigo}`} value={c.codigo}>{etiquetaRussell(c.codigo, c.nombre)}</option>)}
        {opcionesCliente.map((o) => <option key={`c-${o.codigo}`} value={o.codigo}>{o.etiqueta}</option>)}
      </datalist>
      {buscando != null && (
        <ModalCuentas
          clasificador={buscando}
          // El atajo «Todas las cuentas» nació para el renglón «GLOBAL»; como ese agrupador se puede
          // renombrar en el borrador, se ofrece en cualquier renglón de Inventarios.
          esGlobal={buscando === "GLOBAL" || esInventarios}
          autoguardado
          cuentas={cuentas}
          homologacionCliente={homologacionCliente}
          asignadas={new Set(valores[buscando] ?? [])}
          delPlan={{
            encabezadoId,
            periodo,
            cuentasExtra,
            onRegistrar: (cuenta) => {
              registrarCuentaDelPlan(cuenta);
              if (!cuenta.deCedula) avisoSoloPeriodo(cuenta);
            },
          }}
          onToggle={(cod) => {
            const set = new Set(valores[buscando] ?? []);
            const agrega = !set.has(cod);
            if (agrega) set.add(cod); else set.delete(cod);
            const nuevasCuentas = [...set].sort();
            setValores((p) => ({ ...p, [buscando]: nuevasCuentas }));
            anotarAutoguardado(buscando, nuevasCuentas);
            // Elegir una cuenta la asigna y cierra el buscador (TKT-56): lo común es una cuenta
            // por renglón. Otra cuenta se agrega volviendo a «Buscar…»; quitar una deja la
            // ventana abierta para seguir ajustando.
            if (agrega) setBuscando(null);
          }}
          onTodas={(on) => {
            const nuevasCuentas = on ? cuentas.map((cc) => cc.codigo).sort() : [];
            setValores((p) => ({ ...p, [buscando]: nuevasCuentas }));
            anotarAutoguardado(buscando, nuevasCuentas);
          }}
          onClose={() => setBuscando(null)}
        />
      )}
      {masivoAbierto && nSel > 0 && (
        <ModalAsignacionMasiva
          seleccionados={seleccionados}
          etiquetaPlural={etiquetaPlural}
          conCuentas={contarConCuentas(valores, seleccionados)}
          cuentas={cuentas}
          homologacionCliente={homologacionCliente}
          onAplicar={aplicarMasivo}
          onClose={() => setMasivoAbierto(false)}
        />
      )}
      {salidaPendiente && (
        <ModalCuentasSinGuardar
          renglones={pendientes}
          clasificadorEtiqueta={clasificadorEtiqueta}
          guardando={guardandoSalida}
          onGuardarYContinuar={guardarYContinuar}
          onSalirSinGuardar={salirSinGuardar}
          onClose={() => setSalidaPendiente(null)}
        />
      )}
    </Card>
  );
}

// Buscador + lista de cuentas Russell del módulo con checkbox, mostrando bajo cada
// una las cuentas del CLIENTE homologadas. Lo comparten el selector por fila y el
// de asignación masiva; cada uno decide contra qué conjunto se marca.
function ListaCuentasRussell({
  cuentas,
  homologacionCliente,
  asignadas,
  onToggle,
}: {
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  asignadas: Set<string>;
  onToggle: (codigo: string) => void;
}) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLowerCase();
  const filtradas = cuentas.filter((c) => {
    if (!q.trim()) return true;
    const ctas = homologacionCliente[c.codigo] ?? [];
    return norm(`${c.codigo} ${c.nombre} ${ctas.map((x) => `${x.codigo} ${x.nombre}`).join(" ")}`).includes(norm(q));
  });
  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cuenta Russell o cuenta del cliente…"
        className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
      />
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-ink-150">
        {filtradas.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-ink-400">Sin coincidencias.</div>
        ) : (
          filtradas.map((c) => {
            const ctas = homologacionCliente[c.codigo] ?? [];
            const on = asignadas.has(c.codigo);
            return (
              <label key={c.codigo} className={`flex cursor-pointer items-start gap-2.5 border-b border-ink-50 px-3 py-2 last:border-0 ${on ? "bg-blue-50" : "hover:bg-ink-50"}`}>
                <input type="checkbox" checked={on} onChange={() => onToggle(c.codigo)} className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink-800">R - {c.codigo} · {c.nombre}</div>
                  <div className="text-[11px] leading-snug text-ink-500">
                    {ctas.length ? (
                      <><span className="font-medium text-ink-600">Cliente:</span> {ctas.map((x) => `${x.codigo} ${x.nombre}`).join("  ·  ")}</>
                    ) : (
                      <span className="font-medium text-warn-700">El cliente no tiene cuentas homologadas a este subgrupo.</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </>
  );
}

// Casilla «Todas las cuentas 14xx» (marca/desmarca el conjunto completo del módulo).
function TodasLasCuentas({ cuentas, marcadas, onTodas }: { cuentas: CuentaOpt[]; marcadas: boolean; onTodas: (activar: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
      <input type="checkbox" checked={marcadas} onChange={(e) => onTodas(e.target.checked)} className="h-4 w-4" />
      <span><b>Todas las cuentas {cuentas[0]?.codigo?.slice(0, 2) ?? "14"}xx</b> ({cuentas.length}) — o marca solo las necesarias abajo.</span>
    </label>
  );
}

/**
 * Qué hace falta para ofrecer, además de la cédula, cualquier cuenta del plan estándar Russell
 * (solo para el período del cargue).
 */
type DelPlanRussell = {
  encabezadoId: number;
  periodo: string;
  /** Cuentas de fuera de la cédula ya en uso este período (guardadas o recién agregadas). */
  cuentasExtra: CuentaOpt[];
  /** Registra una cuenta hallada en el plan antes de marcarla. */
  onRegistrar: (cuenta: CuentaPlan) => void;
};

// Código que vale la pena buscar en el plan estándar Russell cuando el resolutor no lo halló en la
// cédula: solo lo que el usuario escribió como cuenta Russell del nivel del módulo. Una cuenta del
// cliente homologada a otra cuenta NO se convierte sola en cuenta del período (así se evita cruzar
// contra otra clase contable en silencio); esa se elige a mano en «Buscar…».
function codigoDelPlanPorConsultar(r: Extract<ResolucionCuenta4, { ok: false }>, nivel: NivelCruce): string | null {
  if (r.motivo === "no-encontrada") return r.entrada.length === nivel ? r.entrada : null;
  if (r.motivo === "fuera-del-modulo") return r.entrada.length === nivel && r.cuenta4Real === r.entrada ? r.entrada : null;
  return null;
}

// Búsqueda en el plan estándar Russell, fuera de la cédula: lo elegido vale solo para el período.
function OtrasCuentasPlan({
  delPlan,
  homologacionCliente,
  asignadas,
  onToggle,
}: {
  delPlan: DelPlanRussell;
  homologacionCliente: HomologacionCliente;
  asignadas: Set<string>;
  onToggle: (codigo: string) => void;
}) {
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<{ texto: string; cuentas: CuentaPlan[] } | null>(null);
  const [buscando, startBuscar] = useTransition();
  const buscar = () => {
    const texto = q.trim();
    const soloDigitos = /^\d+$/.test(texto.replace(/\s/g, ""));
    if (soloDigitos ? texto.replace(/\D/g, "").length < 2 : texto.length < 3) {
      notifyError("Escribe al menos 2 dígitos del código o 3 letras del nombre.");
      return;
    }
    startBuscar(async () => {
      const r = await consultarCuentasRussell({ encabezadoId: delPlan.encabezadoId, texto });
      if (!r.ok) { notifyError(r.message); return; }
      setResultado({ texto, cuentas: r.cuentas });
    });
  };
  const codigosExtra = new Set(delPlan.cuentasExtra.map((c) => c.codigo));
  // Primero las de fuera de la cédula que ya usa este renglón; luego lo hallado (sin repetir).
  const enUso = delPlan.cuentasExtra.filter((c) => asignadas.has(c.codigo));
  const halladas = (resultado?.cuentas ?? []).filter((c) => !c.deCedula && !(asignadas.has(c.codigo) && codigosExtra.has(c.codigo)));
  const deCedula = (resultado?.cuentas ?? []).filter((c) => c.deCedula).length;
  const fila = (c: CuentaOpt, alMarcar: () => void) => {
    const on = asignadas.has(c.codigo);
    const ctas = homologacionCliente[c.codigo] ?? [];
    return (
      <label key={c.codigo} className={`flex cursor-pointer items-start gap-2.5 border-b border-ink-50 px-3 py-2 last:border-0 ${on ? "bg-warn-100/30" : "hover:bg-ink-50"}`}>
        <input type="checkbox" checked={on} onChange={alMarcar} className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink-800">
            R - {c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}
            <ChipSoloPeriodo periodo={delPlan.periodo} />
          </div>
          {ctas.length > 0 && (
            <div className="text-[11px] leading-snug text-ink-500">
              <span className="font-medium text-ink-600">Cliente:</span> {ctas.map((x) => `${x.codigo} ${x.nombre}`).join("  ·  ")}
            </div>
          )}
        </div>
      </label>
    );
  };
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-ink-100 pt-3">
      <div>
        <div className="text-[12.5px] font-semibold text-ink-800">Otras cuentas del plan Russell (solo {delPlan.periodo})</div>
        <p className="text-[11px] leading-snug text-ink-500">
          Una cuenta que no está en la cédula del módulo se asigna solo para este cliente y este período: entra al cruce
          contable y al cruce por tercero de {delPlan.periodo}. La cédula y los demás meses no cambian.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="Código o nombre de la cuenta Russell…"
          className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando}
          className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
        >
          {buscando ? "Buscando…" : "Buscar en el plan"}
        </button>
      </div>
      {(enUso.length > 0 || resultado) && (
        <div className="max-h-[40vh] overflow-y-auto rounded-md border border-ink-150">
          {enUso.map((c) => fila(c, () => onToggle(c.codigo)))}
          {halladas.map((c) => fila(c, () => {
            if (!asignadas.has(c.codigo)) delPlan.onRegistrar(c);
            onToggle(c.codigo);
          }))}
          {resultado && halladas.length === 0 && (
            <div className="px-3 py-3 text-center text-[12px] text-ink-400">
              {deCedula > 0
                ? `Lo hallado para «${resultado.texto}» ya es de la cédula: márcalo en la lista de arriba.`
                : `Sin cuentas del plan Russell para «${resultado.texto}».`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Selector de cuenta Russell del módulo para UNA fila (edita el conjunto en vivo).
function ModalCuentas({
  clasificador,
  esGlobal,
  cuentas,
  homologacionCliente,
  asignadas,
  delPlan,
  onToggle,
  onTodas,
  onClose,
  autoguardado,
}: {
  clasificador: string;
  esGlobal: boolean;
  /** El Consolidado se guarda solo (todos los módulos): no hay que pulsar «Guardar» en la fila. */
  autoguardado: boolean;
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  asignadas: Set<string>;
  /** Búsqueda en el plan Russell fuera de la cédula (solo para el período). */
  delPlan: DelPlanRussell;
  onToggle: (codigo: string) => void;
  onTodas: (activar: boolean) => void;
  onClose: () => void;
}) {
  const todasMarcadas = cuentas.length > 0 && cuentas.every((c) => asignadas.has(c.codigo));
  return (
    <Modal open onClose={onClose} title={`Cuenta Russell · ${clasificador}`} size="lg">
      <div className="flex flex-col gap-2">
        {esGlobal && (
          // Inventario GLOBAL: puede cruzar contra TODAS las 14xx, o seleccionar/deseleccionar.
          <TodasLasCuentas cuentas={cuentas} marcadas={todasMarcadas} onTodas={onTodas} />
        )}
        <ListaCuentasRussell cuentas={cuentas} homologacionCliente={homologacionCliente} asignadas={asignadas} onToggle={onToggle} />
        <OtrasCuentasPlan delPlan={delPlan} homologacionCliente={homologacionCliente} asignadas={asignadas} onToggle={onToggle} />
        <p className="text-[11px] text-ink-400">
          Al elegir una cuenta queda asignada y esta ventana se cierra; para agregar otra, vuelve a pulsar «Buscar…».
          {autoguardado ? " Los cambios se guardan solos." : " Luego pulsa «Guardar» en la fila para conservar los cambios."}
        </p>
      </div>
    </Modal>
  );
}

// Asignación MASIVA: elige 1..N cuentas y las aplica a todos los clasificadores
// seleccionados. Dos pasos, para que el alcance (agregar vs reemplazar) sea una
// decisión explícita — mismo patrón que la homologación del balance.
const MAX_LISTADOS = 10;

function ModalAsignacionMasiva({
  seleccionados,
  etiquetaPlural,
  conCuentas,
  cuentas,
  homologacionCliente,
  onAplicar,
  onClose,
}: {
  seleccionados: string[];
  etiquetaPlural: string;
  conCuentas: number;
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  onAplicar: (cuentas4: string[], modo: ModoAsignacionMasiva) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [paso, setPaso] = useState<"elegir" | "confirmar">("elegir");
  const elegidas = useMemo(() => [...sel].sort(), [sel]);
  const nombrePorCuenta = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c.nombre])), [cuentas]);
  const todasMarcadas = cuentas.length > 0 && cuentas.every((c) => sel.has(c.codigo));
  const alternar = (codigo: string) =>
    setSel((p) => {
      const s = new Set(p);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });

  const footer =
    paso === "elegir" ? (
      <button
        type="button"
        disabled={elegidas.length === 0}
        onClick={() => setPaso("confirmar")}
        className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continuar{elegidas.length > 0 ? ` (${elegidas.length} cuenta${elegidas.length === 1 ? "" : "s"})` : ""}
      </button>
    ) : (
      <>
        <button
          type="button"
          onClick={() => onAplicar(elegidas, "reemplazar")}
          className="rounded-md border border-err-500 bg-white px-3 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-100/50"
        >
          Reemplazar las existentes
        </button>
        <button
          type="button"
          onClick={() => onAplicar(elegidas, "agregar")}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"
        >
          Agregar a las existentes
        </button>
      </>
    );

  return (
    <Modal open onClose={onClose} title={`Asignar cuentas · ${seleccionados.length} ${etiquetaPlural}`} size="lg" footer={footer}>
      {paso === "elegir" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-ink-600">
            Las cuentas que marques se aplicarán a <b>{seleccionados.length}</b> {etiquetaPlural} seleccionados en la tabla.
          </p>
          <TodasLasCuentas cuentas={cuentas} marcadas={todasMarcadas} onTodas={(on) => setSel(on ? new Set(cuentas.map((c) => c.codigo)) : new Set())} />
          <ListaCuentasRussell cuentas={cuentas} homologacionCliente={homologacionCliente} asignadas={sel} onToggle={alternar} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-ink-150 bg-ink-50/60 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Se aplicarán</div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {elegidas.map((cod) => (
                <li key={cod} className="text-[12.5px] text-ink-800"><b>R - {cod}</b>{nombrePorCuenta.get(cod) ? ` · ${nombrePorCuenta.get(cod)}` : ""}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-ink-150 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">A estos {seleccionados.length} {etiquetaPlural}</div>
            <p className="mt-1 text-[12px] leading-snug text-ink-700">
              {seleccionados.slice(0, MAX_LISTADOS).join("  ·  ")}
              {seleccionados.length > MAX_LISTADOS && <span className="text-ink-500"> … y {seleccionados.length - MAX_LISTADOS} más</span>}
            </p>
            {conCuentas > 0 && (
              <p className="mt-1.5 text-[12px] font-medium text-warn-700">
                ⚠ {conCuentas} de ellos ya {conCuentas === 1 ? "tiene cuentas asignadas" : "tienen cuentas asignadas"}: «Agregar» las conserva, «Reemplazar» las descarta.
              </p>
            )}
          </div>
          <p className="text-[11px] text-ink-400">
            Los cambios quedan marcados como «sin guardar»: confírmalos con «Guardar todos» en la tabla.
          </p>
          <button type="button" onClick={() => setPaso("elegir")} className="self-start text-[12px] font-medium text-blue-700 hover:underline">
            ← Cambiar cuentas
          </button>
        </div>
      )}
    </Modal>
  );
}

function DetalleTab({ columnas: columnasDelCargue, clasificadorEtiqueta, detalle, negativosFilas, encabezadoId, comentarios }: { columnas: Columna[]; clasificadorEtiqueta: string; detalle: FilaDetalleVm[]; negativosFilas: Set<number>; encabezadoId: number; comentarios: Record<string, number> }) {
  const esNum = (t: string) => t === "moneda" || t === "numero";
  // Saldo efectivo, rangos de vencimiento y fechas: ver `celda-detalle-modulo.ts`.
  const celda = (f: FilaDetalleVm, col: Columna) => textoCeldaDetalle(valorColumnaDetalle(f, col), col);
  // Columnas vacías en todo el cargue y rangos que no suman: ocultas hasta que se pidan.
  const [verTodasColumnas, setVerTodasColumnas] = useState(false);
  const visibilidadColumnas = useMemo(() => columnasVisiblesDetalle(columnasDelCargue, detalle), [columnasDelCargue, detalle]);
  const columnas = verTodasColumnas ? columnasDelCargue : visibilidadColumnas.visibles;
  const idxValor = indiceColumnaValor(columnas);
  const [filtros, setFiltros] = useState<FiltrosDetalleModulo>({});
  const hayFiltros = hayFiltrosDetalleModulo(filtros);
  const detalleFiltrado = useMemo(
    () => filtrarFilasDetalleModulo(detalle, columnas, filtros, valorColumnaDetalle),
    [detalle, columnas, filtros],
  );
  const grupos = useMemo(() => {
    const orden: string[] = [];
    const m = new Map<string, { filas: FilaDetalleVm[]; subtotal: number }>();
    for (const f of detalleFiltrado) {
      const k = f.clasificador?.trim() || "(sin clasificar)";
      let g = m.get(k);
      if (!g) { g = { filas: [], subtotal: 0 }; m.set(k, g); orden.push(k); }
      g.filas.push(f);
      g.subtotal += f.valor;
    }
    return orden.map((k) => ({ clasificador: k, ...m.get(k)! }));
  }, [detalleFiltrado]);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-3 py-2 text-[12px] text-ink-500">
        <span>
          {hayFiltros
            ? <><span className="font-semibold text-ink-700">{detalleFiltrado.length.toLocaleString("es-CO")}</span> de {detalle.length.toLocaleString("es-CO")} filas</>
            : <><span className="font-semibold text-ink-700">{detalle.length.toLocaleString("es-CO")}</span> filas</>}
        </span>
        <div className="flex items-center gap-2">
          {visibilidadColumnas.ocultas.length > 0 && (
            <button
              type="button"
              onClick={() => setVerTodasColumnas((v) => !v)}
              title={verTodasColumnas ? "Oculta las columnas sin datos y los rangos que no suman al saldo" : `Ocultas: ${visibilidadColumnas.ocultas.map((c) => c.etiqueta).join(", ")}`}
              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
            >
              {verTodasColumnas ? "Ocultar columnas sin datos" : `Mostrar todas las columnas (${visibilidadColumnas.ocultas.length} ocultas)`}
            </button>
          )}
          {hayFiltros && (
            <button type="button" onClick={() => setFiltros({})} className="rounded-md border border-ink-200 px-2 py-1 font-medium text-ink-600 hover:bg-ink-50">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="tabla-encabezado-fijo tabla-encabezado-doble w-full text-[12px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-2.5 py-2 font-semibold">#</th>
              {columnas.map((c) => (
                <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNum(c.tipo) ? "text-right" : ""}`}>{c.etiqueta}</th>
              ))}
              <th className="px-2.5 py-2 text-center font-semibold">💬</th>
            </tr>
            <tr className="bg-ink-50">
              <th className="px-2.5 pb-2" />
              {columnas.map((c) => (
                <th key={c.nombre} className="px-1.5 pb-2 font-normal">
                  <input
                    type="text"
                    value={filtros[c.nombre] ?? ""}
                    onChange={(e) => setFiltros((prev) => ({ ...prev, [c.nombre]: e.target.value }))}
                    placeholder={esNum(c.tipo) ? "> < = …" : "Filtrar…"}
                    className={`w-full min-w-[80px] rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 placeholder:text-ink-300 focus:border-blue-400 focus:outline-none ${esNum(c.tipo) ? "text-right" : ""}`}
                  />
                </th>
              ))}
              <th className="px-2.5 pb-2" />
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 2} className="px-2.5 py-6 text-center text-ink-400">
                  Ninguna fila coincide con los filtros.
                </td>
              </tr>
            )}
            {grupos.map((g) => (
              <Fragment key={g.clasificador}>
                <tr className="border-t-2 border-ink-200 bg-blue-50">
                  <td className="px-2.5 py-1.5" />
                  <td className="px-2.5 py-1.5 font-semibold text-navy-800" colSpan={Math.max(1, idxValor >= 1 ? idxValor : columnas.length - 1)}>
                    {clasificadorEtiqueta}: {g.clasificador}
                    <span className="ml-2 font-normal text-ink-500">· {g.filas.filter((f) => !esEncabezadoTercero(f)).length} ítems</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy-800">{fmtContable(g.subtotal)}</td>
                  <td className="px-2.5 py-1.5" colSpan={idxValor >= 1 ? columnas.length - idxValor : 1} />
                </tr>
                {g.filas.map((f) => (
                  <tr key={f.filaNum} title={esEncabezadoTercero(f) ? "Encabezado del tercero en el archivo: muestra el saldo que declara el reporte y no suma al total" : undefined} className={`border-t border-ink-100 ${negativosFilas.has(f.filaNum) ? "bg-err-100 text-err-700" : esEncabezadoTercero(f) ? "bg-ink-50 italic text-ink-500" : "text-ink-700"}`}>
                    <td className="px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                    {columnas.map((c) => (
                      <td key={c.nombre} title={tituloCeldaDetalle(f, c)} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "text-right tabular-nums" : ""}`}>{celda(f, c)}</td>
                    ))}
                    <td className="px-2.5 py-1.5 text-center">
                      <ComentarioAncla tipo="modulos_datos" entityId={encabezadoId} anchor={`fila:${f.filaNum}`} titulo={`Fila ${f.filaNum}${f.datos.referencia ? ` · ${f.datos.referencia}` : ""}`} count={comentarios[`fila:${f.filaNum}`] ?? 0} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Cruce contable: saldo del balance de comprobación vs. valor cargado en los archivos
// del módulo, cuenta Russell por cuenta Russell (subgrupo de 4 díg., o la cuenta completa de 6
// en Nómina). Estado vacío si no hay balance
// oficial para el período; avisos aparte para clasificadores ambiguos y saldos contables
// de inventario sin homologar.
//
// La cédula se lee como un papel de trabajo: la fila con diferencia lleva una MARCA
// numerada —①②③— y la explicación entera (detalle, anexo y soportes) vive al pie, en
// observaciones. La marca de la tabla es un enlace a su observación.
function CruceContableTab({
  onIrConsolidado,
  moduloLabel,
  nivelCruce,
  cruceContable,
  referenciasMarcas,
  encabezadoId,
  comentarios,
  puedeEditar,
}: {
  /** Lleva a la pestaña Consolidado (para asignar cuenta al saldo sin cuenta). */
  onIrConsolidado?: () => void;
  moduloLabel: string;
  nivelCruce: NivelCruce;
  cruceContable: CruceContableVm;
  referenciasMarcas: ReferenciaMarcaVm[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Fila que se está marcando en el modal (null = modal cerrado).
  const [marcando, setMarcando] = useState<FilaCruceMarcada | null>(null);
  // Filas con el desglose de cuentas del cliente desplegado.
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  const alternarFila = (cuenta4: string) =>
    setExpandidas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(cuenta4)) siguiente.delete(cuenta4);
      else siguiente.add(cuenta4);
      return siguiente;
    });
  const [quitando, startQuitar] = useTransition();
  const moduloEnMinuscula = moduloLabel.toLocaleLowerCase("es");
  // Cuentas fuera de la cédula que el Consolidado asignó solo para este período.
  const cuentasPeriodo = new Set(cruceContable.cuentasPeriodo ?? []);

  const panelFirme = cruceContable.conciliacion.cierre?.enFirme
    ? <ConciliacionEnFirmePanel conciliacion={cruceContable.conciliacion} encabezadoId={encabezadoId} moduloLabel={moduloLabel} />
    : null;

  if (cruceContable.bloqueo) {
    return (
      <div className="flex flex-col gap-4">
      {panelFirme}
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="text-[13px] font-semibold text-ink-800">Cruce contable no habilitado</div>
        <p className="max-w-2xl text-[12.5px] text-warn-700">{cruceContable.bloqueo}</p>
        {cruceContable.avisoBalance && <p className="max-w-2xl text-[12px] text-ink-600">{cruceContable.avisoBalance}</p>}
        {cruceContable.balanceFuente && (
          <Link
            href={`/balance/${cruceContable.balanceFuente.id}`}
            className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline"
          >
            Revisar balance {cruceContable.balanceFuente.descripcion} →
          </Link>
        )}
      </Card>
      </div>
    );
  }

  if (!cruceContable.balanceEncontrado || !cruceContable.resumen) {
    return (
      <div className="flex flex-col gap-4">
      {panelFirme}
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="text-[13px] font-semibold text-ink-800">No hay balance de comprobación confirmado para este período</div>
        <p className="max-w-md text-[12.5px] text-ink-500">
          No hay un balance de comprobación confirmado (fuera de borrador) para <b className="text-ink-700">{cruceContable.nombreCliente}</b> en el período <b className="text-ink-700">{cruceContable.periodo}</b>. Carga y confirma un balance de ese período para ver el cruce.
        </p>
        <Link href="/balance" className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline">
          Ir a Balance de comprobación →
        </Link>
      </Card>
      </div>
    );
  }

  const { resumen, sinMapeoContable, sinReglaContableFilas, filasMarcadas, resumenMarcas, detalleContablePorCuenta, fueraDelModulo } = cruceContable;
  const observaciones = observacionesDeMarcas(filasMarcadas);
  const hijosDe = (cuenta4: string) => detalleContablePorCuenta[cuenta4] ?? [];
  // Renglón del saldo del módulo sin cuenta: sus hijos son clasificadores, no cuentas del cliente.
  const hijosSinCuenta = cruceContable.detalleSinCuenta ?? [];
  const excluidosSinCuenta = new Set(hijosSinCuenta.filter((h) => h.noModular).map((h) => h.clasificador));

  const quitar = (fila: FilaCruceMarcada) => {
    startQuitar(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, cuenta4: fila.cuenta4 });
      if (r.ok) notifySuccess(r.message ?? "Marca retirada.");
      else notifyError(r.message ?? "No se pudo retirar la marca.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {cruceContable.balanceFuente && (
        <p className="text-[11.5px] text-ink-500">
          Fuente contable: {" "}
          <Link
            href={`/balance/${cruceContable.balanceFuente.id}`}
            className="font-semibold text-blue-600 hover:underline"
          >
            balance {cruceContable.balanceFuente.descripcion}
          </Link>
          {cruceContable.balanceFuente.esOficial && cruceContable.balanceFuente.estaCongelado
            ? " · oficial y congelado"
            : cruceContable.balanceFuente.esOficial ? " · oficial" : " · sin congelar"}
          {cruceContable.bloqueo ? "" : " · prevalidador aprobado"}
          .
        </p>
      )}
      {cruceContable.avisoBalance && (
        <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] leading-snug text-warn-700">{cruceContable.avisoBalance}</div>
      )}
      {cruceContable.nomina && cruceContable.nomina.repartidos > 0 && (
        <p className="text-[11.5px] text-ink-500">{cruceContable.nomina.repartidos} concepto(s) cruzan por reparto.</p>
      )}
      {resumenMarcas && resumenMarcas.conDiferencia > 0 && <ResumenMarcasBanner resumen={resumenMarcas} />}

      <ConciliacionEnFirmePanel conciliacion={cruceContable.conciliacion} encabezadoId={encabezadoId} moduloLabel={moduloLabel} />
      {cruceContable.nomina && (cruceContable.nomina.repartosAplicados.length > 0 || cruceContable.nomina.repartosIgnorados > 0) && (
        <RepartosAplicadosNomina aplicados={cruceContable.nomina.repartosAplicados} ignorados={cruceContable.nomina.repartosIgnorados} encabezadoId={encabezadoId} puedeEditar={puedeEditar} />
      )}
      {cruceContable.nomina && cruceContable.nomina.repartosPendientes.length > 0 && (
        <RepartosPendientesNomina pendientes={cruceContable.nomina.repartosPendientes} encabezadoId={encabezadoId} puedeEditar={puedeEditar} />
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Cuenta</th>
                <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
                <th className="px-3 py-2 text-right font-semibold">{moduloLabel} (archivos)</th>
                <th className="px-3 py-2 text-right font-semibold" title="Diferencia sin descontar las cuentas no modulares.">Diferencia</th>
                <th className="px-3 py-2 text-right font-semibold" title="Lo que no hace parte de la conciliación del módulo: cuentas del cliente (se restan de Contabilidad) o saldos sin cuenta (se restan del módulo). Muestra su efecto en la diferencia.">No modular</th>
                <th className="px-3 py-2 text-right font-semibold" title="Diferencia después de restar las cuentas no modulares: es la que se concilia.">Dif. ajustada</th>
                <th className="w-px px-3 py-2 text-center font-semibold" title="Marca de auditoría: el detalle está al pie, en observaciones.">Marca</th>
              </tr>
            </thead>
            <tbody>
              {filasMarcadas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-400">Sin cuentas para cruzar en este período.</td>
                </tr>
              )}
              {filasMarcadas.map((f) => {
                const sinCuenta = f.cuenta4 === CLAVE_SIN_CUENTA;
                const hijos = sinCuenta ? [] : hijosDe(f.cuenta4);
                const tieneDetalle = sinCuenta ? hijosSinCuenta.length > 0 : hijos.length > 0;
                const abierta = expandidas.has(f.cuenta4);
                const excluidas = new Set(hijos.filter((h) => h.noModular).map((h) => h.cuenta8));
                return (
                  <Fragment key={f.cuenta4}>
                    {/* Una fila agrupada se pinta con un renglón por cuenta (su propio saldo contable y
                        no modular); archivos, diferencias y marca son del grupo y ocupan todos sus renglones. */}
                    {(f.desglose && f.desglose.length > 1
                      ? f.desglose
                      : [{ cuenta: f.cuenta4, nombre: f.nombre, contable: f.contable, noModular: f.noModular }]
                    ).map((renglon, i, renglones) => {
                      const agrupada = renglones.length > 1;
                      const primero = i === 0;
                      const alto = renglones.length;
                      return (
                        <tr
                          key={renglon.cuenta}
                          className={`${primero ? "border-t border-ink-100" : ""} ${f.estado === "descuadre" ? "bg-err-100/30" : ""}`}
                        >
                          <td className={`px-3 py-2 font-medium text-ink-800 ${agrupada ? "border-l-2 border-l-blue-300" : ""}`}>
                            <div className="flex items-center gap-1.5">
                              {primero && tieneDetalle ? (
                                <button
                                  type="button"
                                  onClick={() => alternarFila(f.cuenta4)}
                                  aria-expanded={abierta}
                                  title={sinCuenta
                                    ? (abierta ? "Contraer los saldos sin cuenta" : "Ver qué saldos del módulo no tienen cuenta")
                                    : (abierta ? "Contraer las cuentas del cliente" : "Ver las cuentas del cliente de esta fila")}
                                  className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                                >
                                  <Icon name={chevronDivulgacion(abierta)} size={13} />
                                </button>
                              ) : (
                                <span className="inline-block w-[18px]" />
                              )}
                              {sinCuenta ? (
                                <span title="Lo del módulo que no tiene cuenta asignada en el Consolidado: suma en la columna del módulo contra un contable en cero.">
                                  {NOMBRE_SIN_CUENTA}
                                </span>
                              ) : etiquetaRussell(renglon.cuenta, renglon.nombre)}
                              {sinCuenta && <Chip label="Sin cuenta" tone="warn" />}
                              {cuentasPeriodo.has(renglon.cuenta) && <ChipSoloPeriodo periodo={cruceContable.periodo} />}
                              {agrupada && (
                                <span title={`Agrupada: ${f.clasificadores?.join(", ") ?? "el clasificador"} está asignado a varias cuentas y se concilia contra la suma de ellas.`}>
                                  <Chip label={f.clasificadores?.length ? `Agrupada · ${f.clasificadores.join(", ")}` : "Agrupada"} tone="blue" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(renglon.contable)}</td>
                          {primero && (
                            <td rowSpan={alto} className={`px-3 py-2 text-right align-middle tabular-nums text-ink-700 ${agrupada ? "border-x border-ink-100 font-semibold" : ""}`}>
                              {fmtContable(f.inventario)}
                            </td>
                          )}
                          {primero && <td rowSpan={alto} className="px-3 py-2 text-right align-middle tabular-nums text-ink-500">{fmtContable(f.diferenciaBruta)}</td>}
                          {/* Efecto en la diferencia: el contable excluido la baja; el módulo excluido la sube. */}
                          {(() => {
                            const efecto = sinCuenta ? f.noModularModulo : -renglon.noModular;
                            return (
                              <td className="px-3 py-2 text-right tabular-nums text-warn-700">
                                {efecto === 0 ? <span className="text-ink-300">—</span> : fmtContable(efecto)}
                              </td>
                            );
                          })()}
                          {primero && (
                            <td rowSpan={alto} className="px-3 py-2 text-right align-middle">
                              <div className="flex items-center justify-end gap-1.5">
                                {f.estado === "solo_contable" && <Chip label={`Sin ${moduloEnMinuscula}`} tone="warn" />}
                                {f.estado === "solo_inventario" && !sinCuenta && <Chip label="Sin contabilidad" tone="warn" />}
                                <span className={`tabular-nums font-semibold ${f.cuadra ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</span>
                              </div>
                            </td>
                          )}
                          {primero && (
                            <td rowSpan={alto} className="whitespace-nowrap px-3 py-2 text-center align-middle">
                              <CeldaMarca
                                fila={f}
                                encabezadoId={encabezadoId}
                                comentarios={comentarios[anclaCruce(f.cuenta4)] ?? 0}
                                puedeEditar={puedeEditar}
                                onMarcar={() => setMarcando(f)}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {abierta && sinCuenta && (
                      <tr className="border-t border-ink-100 bg-ink-50/60">
                        <td colSpan={7} className="px-3 py-2.5">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11.5px] font-semibold text-ink-600">
                                Saldos del módulo sin cuenta asignada en el Consolidado
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {onIrConsolidado && (
                                  <button type="button" onClick={onIrConsolidado} className="text-[11.5px] font-semibold text-blue-700 hover:underline">
                                    Asignar en Consolidado →
                                  </button>
                                )}
                                {puedeEditar && (
                                  <button
                                    type="button"
                                    onClick={() => setMarcando(f)}
                                    className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-600 transition hover:border-navy-700 hover:text-navy-700"
                                  >
                                    <Icon name="edit" size={11} />
                                    {excluidosSinCuenta.size > 0 ? "Editar saldos no modulares" : "Marcar saldos no modulares"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <ListaSinCuentaNoModulares hijos={hijosSinCuenta} seleccion={excluidosSinCuenta} />
                            <p className="text-[11px] text-ink-500">
                              Asígnales cuenta en el Consolidado para cruzarlos contra la contabilidad.
                              {excluidosSinCuenta.size > 0 && " Lo tachado no hace parte de la conciliación: se resta del lado del módulo para calcular la diferencia ajustada. El detalle está en la marca, al pie."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {abierta && !sinCuenta && (
                      <tr className="border-t border-ink-100 bg-ink-50/60">
                        <td colSpan={7} className="px-3 py-2.5">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11.5px] font-semibold text-ink-600">
                                Cuentas del cliente en {etiquetaFilaCruce(f)}
                              </span>
                              {puedeEditar && (
                                <button
                                  type="button"
                                  onClick={() => setMarcando(f)}
                                  className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-600 transition hover:border-navy-700 hover:text-navy-700"
                                >
                                  <Icon name="edit" size={11} />
                                  {excluidas.size > 0 ? "Editar cuentas no modulares" : "Marcar cuentas no modulares"}
                                </button>
                              )}
                            </div>
                            <ListaNoModulares hijos={hijos} seleccion={excluidas} />
                            {excluidas.size > 0 && (
                              <p className="text-[11px] text-ink-500">
                                Lo tachado no hace parte de la conciliación: se resta de «Contabilidad» para calcular la diferencia ajustada. El detalle está en la marca, al pie.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {filasMarcadas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                  <td className="px-3 py-2">Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.inventario)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-500">{fmtContable(resumen.totales.diferenciaBruta)}</td>
                  {(() => {
                    const efecto = -resumen.totales.noModular + (resumen.totales.noModularModulo ?? 0);
                    return (
                      <td className="px-3 py-2 text-right tabular-nums text-warn-700">
                        {efecto === 0 ? <span className="text-ink-300">—</span> : fmtContable(efecto)}
                      </td>
                    );
                  })()}
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(resumen.totales.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(resumen.totales.diferencia)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <ObservacionesMarcas
        observaciones={observaciones}
        referencias={referenciasMarcas}
        encabezadoId={encabezadoId}
        comentarios={comentarios}
        puedeEditar={puedeEditar}
        ocupado={quitando}
        onEditar={(fila) => setMarcando(fila)}
        onQuitar={quitar}
      />

      {cruceContable.nomina?.vistaSubcuenta && <VistaSubcuentaNominaCard vista={cruceContable.nomina.vistaSubcuenta} moduloLabel={moduloLabel} />}
      {cruceContable.nomina?.control && cruceContable.nomina.control.filas.length > 0 && <ControlDeduccionesCard control={cruceContable.nomina.control} moduloLabel={moduloLabel} />}

      {((resumen.sinCuentaRelacionado?.length ?? 0) > 0 || resumen.multiAsignado.length > 0 || sinMapeoContable || sinReglaContableFilas > 0 || fueraDelModulo) && (
        <div className="flex flex-col gap-2">
          {/* Lo sin cuenta del archivo es el renglón «Saldo del módulo sin cuenta»; aquí solo queda
              el valor relacionado (la depreciación del terreno), que no se suma con el costo. */}
          {(resumen.sinCuentaRelacionado?.length ?? 0) > 0 && (
            <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
              <b>{resumen.sinCuentaRelacionado.length}</b> {resumen.sinCuentaRelacionado.length === 1 ? "valor relacionado" : "valores relacionados"} sin cuenta (no entran al cruce): {resumen.sinCuentaRelacionado.map((s) => `${s.clasificador} (${fmtContable(s.total)})`).join("  ·  ")}.
            </div>
          )}
          {resumen.multiAsignado.length > 0 && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              <b>{resumen.multiAsignado.length}</b> {resumen.multiAsignado.length === 1 ? "clasificador está" : "clasificadores están"} asignado{resumen.multiAsignado.length === 1 ? "" : "s"} a varias cuentas, excluido{resumen.multiAsignado.length === 1 ? "" : "s"} del cruce por cuenta (ambiguo): {resumen.multiAsignado.map((s) => `${s.clasificador} → ${s.cuentas4.join(", ")} (${fmtContable(s.total)})`).join("  ·  ")}.
            </div>
          )}
          {sinMapeoContable && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              El balance tiene <b>{fmtContable(sinMapeoContable.total)}</b> en {sinMapeoContable.filas} {sinMapeoContable.filas === 1 ? "cuenta" : "cuentas"} asociada{sinMapeoContable.filas === 1 ? "" : "s"} a {moduloEnMinuscula} sin homologar a una cuenta Russell — no está incluido en «Contabilidad». Homológalas en la memoria de mapeo del cliente para que entren al cruce.
            </div>
          )}
          {fueraDelModulo && (
            <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
              «Contabilidad» incluye <b>{fmtContable(fueraDelModulo.total)}</b> de {fueraDelModulo.filas} {fueraDelModulo.filas === 1 ? "cuenta" : "cuentas"} que no hacen parte de {moduloEnMinuscula} ({Object.keys(fueraDelModulo.porCuenta).join(", ")}){nivelCruce === 6 ? ": no entran a esta cédula, que compara por cuenta Russell de 6 dígitos; se informan aquí." : ": esta cédula compara por cuenta de 4 dígitos, pero el cruce por tercero no las concilia."}
            </div>
          )}
          {sinReglaContableFilas > 0 && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              Se omitieron <b>{sinReglaContableFilas}</b> {sinReglaContableFilas === 1 ? "fila contable" : "filas contables"} porque no tienen una regla activa del prevalidador para {moduloEnMinuscula}: sin ella no se sabe si la cuenta es del módulo.
            </div>
          )}
        </div>
      )}

      {marcando && (
        <ModalMarca
          moduloLabel={moduloLabel}
          fila={marcando}
          hijos={hijosDe(marcando.cuenta4)}
          hijosSinCuenta={marcando.cuenta4 === CLAVE_SIN_CUENTA ? hijosSinCuenta : undefined}
          encabezadoId={encabezadoId}
          onClose={() => setMarcando(null)}
          onGuardado={() => {
            setMarcando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ===== Nómina: reparto (RF-NOM-12), vista por subcuenta PUC (D6) y control de deducciones (D1) =====

const ETIQUETA_ESTADO_SUB: Record<string, string> = { cuadra: "Cuadra", descuadre: "Diferencia", solo_contable: "Solo contabilidad", solo_modulo: "Solo nómina" };

/**
 * Editor en línea del reparto de UN concepto entre sus cuentas candidatas (pendientes y aplicados):
 * la Σ tiene que cerrar con el total del concepto para poder guardar.
 */
function EditorRepartoNomina({
  encabezadoId,
  clasificador,
  cuentas,
  total,
  contablePorCuenta,
  inicial,
  onGuardado,
}: {
  encabezadoId: number;
  clasificador: string;
  cuentas: string[];
  total: number;
  contablePorCuenta: Record<string, number>;
  inicial: Record<string, number>;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(cuentas.map((c) => [c, String(inicial[c] ?? 0)])));
  const [pending, start] = useTransition();
  const suma = cuentas.reduce((s, c) => s + (Number(valores[c]) || 0), 0);
  const cierra = Math.abs(suma - total) <= 0.01;
  const guardar = () => {
    start(async () => {
      const r = await guardarRepartoCruce({ encabezadoId, clasificador, valores: Object.fromEntries(cuentas.map((c) => [c, Number(valores[c]) || 0])) });
      if (r.ok) { notifySuccess(r.message ?? "Reparto guardado."); onGuardado(); router.refresh(); } else notifyError(r.message ?? "No se pudo guardar el reparto.");
    });
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      {cuentas.map((c) => (
        <label key={c} className="flex flex-col gap-1 text-[11px] text-ink-600">
          <span className="font-semibold">{c} <span className="font-normal text-ink-400">(balance {fmtContable(contablePorCuenta[c] ?? 0)})</span></span>
          <input
            type="number"
            step="0.01"
            value={valores[c] ?? ""}
            onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
            className="w-40 rounded-md border border-ink-200 bg-white px-2 py-1 text-right text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
          />
        </label>
      ))}
      <div className={`text-[11.5px] font-semibold ${cierra ? "text-ok-700" : "text-err-700"}`}>
        Σ {fmtContable(suma)} {cierra ? "= total" : `≠ total ${fmtContable(total)} (falta ${fmtContable(total - suma)})`}
      </div>
      <button type="button" disabled={pending || !cierra} onClick={guardar} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar reparto"}
      </button>
    </div>
  );
}

/** Concepto (código, centro y nombre) en las tablas de reparto. */
function ConceptoReparto({ codigo, agrupador, descripcion }: { codigo: string; agrupador: string; descripcion: string | null }) {
  return (
    <>
      <span className="font-medium">{codigo}</span>
      {agrupador && <span className="ml-1.5 rounded border border-ink-200 bg-ink-50 px-1 py-0.5 text-[10.5px] font-semibold text-ink-600">{agrupador}</span>}
      {descripcion && <div className="text-[11px] text-ink-500">{descripcion}</div>}
    </>
  );
}

/**
 * Cómo quedó cada reparto que rige (RF-NOM-12): el concepto, su total y lo que se llevó cada cuenta.
 * Se edita con el mismo editor de los pendientes; «Quitar» lo retira y el concepto vuelve a pendientes.
 */
function RepartosAplicadosNomina({ aplicados, ignorados, encabezadoId, puedeEditar }: { aplicados: RepartoAplicadoVm[]; ignorados: number; encabezadoId: number; puedeEditar: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = aplicados.reduce((s, p) => s + Math.abs(p.total), 0);
  const quitar = (p: RepartoAplicadoVm) => {
    start(async () => {
      const r = await guardarRepartoCruce({ encabezadoId, clasificador: p.clasificador, valores: {} });
      if (r.ok) { notifySuccess(`Reparto de ${p.codigo}${p.agrupador ? ` · ${p.agrupador}` : ""} retirado: el concepto vuelve a pendientes.`); router.refresh(); } else notifyError(r.message ?? "No se pudo quitar el reparto.");
    });
  };
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-3 py-2 text-[12px]">
        <div className="text-ink-700">
          <b>Repartos aplicados</b> · {aplicados.length} concepto{aplicados.length === 1 ? "" : "s"} ({fmtContable(total)}) cruzan por la porción que se le definió a cada cuenta.
          {ignorados > 0 && (
            <span className="ml-1 text-ink-500">
              {ignorados === 1 ? "1 reparto guardado ya no aplica" : `${ignorados} repartos guardados ya no aplican`} porque el concepto cambió de cuentas.
            </span>
          )}
        </div>
        {aplicados.length > 0 && (
          <button type="button" onClick={() => setVisible((v) => !v)} aria-expanded={visible} className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-navy-700 hover:text-navy-700">
            <Icon name={chevronDivulgacion(visible)} size={12} />
            {visible ? "Ocultar reparto" : "Ver reparto"}
          </button>
        )}
      </div>
      {visible && aplicados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Concepto</th>
                <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                <th className="px-3 py-1.5 font-semibold">Reparto por cuenta</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {aplicados.map((p) => (
                <Fragment key={p.clasificador}>
                  <tr className="border-t border-ink-100">
                    <td className="px-3 py-1.5 text-ink-800"><ConceptoReparto codigo={p.codigo} agrupador={p.agrupador} descripcion={p.descripcion} /></td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-ink-800">{fmtContable(p.total)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {p.cuentas.map((c) => (
                          <span key={c} className={`rounded border px-1.5 py-0.5 text-[11px] ${(p.valores[c] ?? 0) === 0 ? "border-ink-150 bg-ink-50 text-ink-400" : "border-blue-200 bg-blue-50 text-blue-800"}`} title={`Saldo contable: ${fmtContable(p.contablePorCuenta[c] ?? 0)}`}>
                            <span className="font-semibold">{c}</span> · {fmtContable(p.valores[c] ?? 0)}
                            {p.total !== 0 && <span className="ml-1 text-[10.5px] text-ink-500">({Math.round(((p.valores[c] ?? 0) / p.total) * 100)} %)</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {puedeEditar && (
                        <div className="flex justify-end gap-1.5">
                          <button type="button" disabled={pending} onClick={() => setAbierto((a) => (a === p.clasificador ? null : p.clasificador))} className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-navy-700 hover:text-navy-700">
                            {abierto === p.clasificador ? "Cerrar" : "Editar…"}
                          </button>
                          <button type="button" disabled={pending} onClick={() => quitar(p)} className="rounded-md border border-err-100 bg-white px-2 py-1 text-[11px] font-semibold text-err-700 hover:bg-err-50 disabled:opacity-50">
                            Quitar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {abierto === p.clasificador && (
                    <tr className="border-t border-ink-100 bg-ink-50/60">
                      <td colSpan={4} className="px-3 py-2.5">
                        <EditorRepartoNomina
                          encabezadoId={encabezadoId}
                          clasificador={p.clasificador}
                          cuentas={p.cuentas}
                          total={p.total}
                          contablePorCuenta={p.contablePorCuenta}
                          inicial={p.valores}
                          onGuardado={() => setAbierto(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Conceptos homologados a varias cuentas Russell sin porción definida: editor de reparto. */
function RepartosPendientesNomina({ pendientes, encabezadoId, puedeEditar }: { pendientes: RepartoPendienteVm[]; encabezadoId: number; puedeEditar: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = pendientes.reduce((s, p) => s + Math.abs(p.total), 0);
  const editando = pendientes.find((p) => p.clasificador === abierto) ?? null;
  const aplicarTodos = () => {
    start(async () => {
      const r = await aplicarRepartosSugeridos({ encabezadoId });
      if (r.ok) { notifySuccess(r.message ?? "Repartos aplicados."); router.refresh(); } else notifyError(r.message ?? "No se pudieron aplicar los repartos.");
    });
  };
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-warn-100/30 px-3 py-2 text-[12px]">
        <div className="text-warn-700">
          <b>{pendientes.length}</b> concepto{pendientes.length === 1 ? "" : "s"} ({fmtContable(total)}) {pendientes.length === 1 ? "cruza" : "cruzan"} contra varias cuentas Russell y la porción de cada una la define el auditor (RF-NOM-12). Mientras tanto quedan fuera de la cédula por cuenta.{" "}
          {pendientes.some((p) => p.origenSugerido === "centros")
            ? "La sugerencia repite lo que repartiste por centro en este período (marcada «como por centro»; se ajusta en proporción si el total cambió) y, donde no hay, reparte proporcionalmente al saldo final del balance."
            : "La sugerencia reparte proporcionalmente al saldo final del balance en las cuentas candidatas."}
        </div>
        {puedeEditar && (
          <button type="button" disabled={pending} onClick={aplicarTodos} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {pending ? "Aplicando…" : "Aplicar el reparto sugerido a todos"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-1.5 font-semibold">Concepto</th>
              <th className="px-3 py-1.5 text-right font-semibold">Total</th>
              <th className="px-3 py-1.5 font-semibold">Cuentas candidatas · sugerido</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => (
              <Fragment key={p.clasificador}>
                <tr className="border-t border-ink-100">
                  <td className="px-3 py-1.5 text-ink-800"><ConceptoReparto codigo={p.codigo} agrupador={p.agrupador} descripcion={p.descripcion} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-ink-800">{fmtContable(p.total)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.origenSugerido === "centros" && (
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600" title="El sugerido suma lo que repartiste en los centros de este concepto en el período.">como por centro</span>
                      )}
                      {p.cuentas.map((c) => (
                        <span key={c} className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800" title={`Saldo contable: ${fmtContable(p.contablePorCuenta[c] ?? 0)}`}>
                          <span className="font-semibold">{c}</span> · {fmtContable(p.sugerido[c] ?? 0)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {puedeEditar && (
                      <button type="button" onClick={() => setAbierto((a) => (a === p.clasificador ? null : p.clasificador))} className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-navy-700 hover:text-navy-700">
                        {abierto === p.clasificador ? "Cerrar" : "Repartir…"}
                      </button>
                    )}
                  </td>
                </tr>
                {abierto === p.clasificador && editando && (
                  <tr className="border-t border-ink-100 bg-ink-50/60">
                    <td colSpan={4} className="px-3 py-2.5">
                      <EditorRepartoNomina
                        encabezadoId={encabezadoId}
                        clasificador={editando.clasificador}
                        cuentas={editando.cuentas}
                        total={editando.total}
                        contablePorCuenta={editando.contablePorCuenta}
                        inicial={editando.sugerido}
                        onGuardado={() => setAbierto(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Vista por subcuenta PUC del gasto de personal sumando clases: el papel del auditor. */
function VistaSubcuentaNominaCard({ vista, moduloLabel }: { vista: NonNullable<ResultadoCruceNomina["vistaSubcuenta"]>; moduloLabel: string }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const alternar = (sub: string) => setAbiertas((p) => { const n = new Set(p); if (n.has(sub)) n.delete(sub); else n.add(sub); return n; });
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-3 py-2">
        <div className="text-[12.5px] font-semibold text-ink-800">Cruce por subcuenta PUC sumando clases</div>
        <p className="text-[11px] text-ink-500">
          Un renglón por subcuenta del gasto de personal (06 sueldos, 15 horas extras, 27 auxilio de transporte…): contabilidad = Σ de las cuentas del cliente con esa subcuenta en administración, ventas y producción; {moduloLabel.toLocaleLowerCase("es")} = Σ de los conceptos con esa subcuenta. Cuadra sin regla de clase ni reparto; no decide el cierre.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Subcuenta</th>
              <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
              <th className="px-3 py-2 text-right font-semibold">{moduloLabel}</th>
              <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {vista.filas.map((f) => {
              const abierta = abiertas.has(f.subcuenta);
              return (
                <Fragment key={f.subcuenta}>
                  <tr className={`border-t border-ink-100 ${f.estado === "descuadre" ? "bg-err-100/30" : ""}`}>
                    <td className="px-3 py-2 font-medium text-ink-800">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => alternar(f.subcuenta)} aria-expanded={abierta} className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" title="Ver cuentas y conceptos">
                          <Icon name={chevronDivulgacion(abierta)} size={13} />
                        </button>
                        <span className="font-mono">{f.subcuenta}</span> {f.etiqueta}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.contable)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.modulo)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${f.cuadra ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</td>
                    <td className="px-3 py-2"><Chip label={ETIQUETA_ESTADO_SUB[f.estado] ?? f.estado} tone={f.estado === "cuadra" ? "ok" : f.estado === "descuadre" ? "err" : "warn"} /></td>
                  </tr>
                  {abierta && (
                    <tr className="border-t border-ink-100 bg-ink-50/60">
                      <td colSpan={5} className="px-3 py-2.5">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[11px] font-semibold text-ink-600">Cuentas del cliente</div>
                            {f.cuentas.length === 0 ? <div className="text-[11px] text-ink-400">Ninguna en el balance.</div> : f.cuentas.map((c) => (
                              <div key={c.cuenta8} className="flex justify-between gap-2 text-[11.5px] text-ink-700"><span><span className="font-mono">{c.cuenta8}</span> {c.nombre} <span className="text-ink-400">· clase {c.clase}</span></span><span className="tabular-nums">{fmtContable(c.valor)}</span></div>
                            ))}
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-semibold text-ink-600">Conceptos del módulo</div>
                            {f.conceptos.length === 0 ? <div className="text-[11px] text-ink-400">Ningún concepto con esta subcuenta.</div> : f.conceptos.map((c) => (
                              <div key={c.clasificador} className="flex justify-between gap-2 text-[11.5px] text-ink-700"><span><span className="font-mono">{c.codigo}</span>{c.agrupador ? <span className="text-ink-400"> · {c.agrupador}</span> : null} {c.descripcion ?? ""}</span><span className="tabular-nums">{fmtContable(c.total)}</span></div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
              <td className="px-3 py-2">Totales</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtContable(vista.totales.contable)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtContable(vista.totales.modulo)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(vista.totales.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(vista.totales.diferencia)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {vista.sinSubcuenta.length > 0 && (
        <div className="border-t border-ink-100 px-3 py-2 text-[11.5px] text-warn-700">
          Sin subcuenta conocida (no entran a esta vista): {vista.sinSubcuenta.map((c) => `${c.codigo}${c.agrupador ? ` · ${c.agrupador}` : ""} (${fmtContable(c.total)})`).join("  ·  ")}.
        </div>
      )}
    </Card>
  );
}

/** Deducciones a pasivo/activo/ingreso: por cuenta del cliente contra el balance. Solo informa. */
function ControlDeduccionesCard({ control, moduloLabel }: { control: NonNullable<ResultadoCruceNomina["control"]>; moduloLabel: string }) {
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-3 py-2">
        <div className="text-[12.5px] font-semibold text-ink-800">Control de deducciones</div>
        <p className="text-[11px] text-ink-500">
          Conceptos cuya cuenta del cliente es de pasivo, activo o ingreso (libranzas, retención, embargos, préstamos, intereses): la Σ de {moduloLabel.toLocaleLowerCase("es")} contra el saldo final de esa cuenta en el balance. No suma al gasto ni bloquea el cierre.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Cuenta del cliente</th>
              <th className="px-3 py-2 font-semibold">Conceptos</th>
              <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
              <th className="px-3 py-2 text-right font-semibold">{moduloLabel}</th>
              <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {control.filas.map((f) => (
              <tr key={f.cuentaCliente} className="border-t border-ink-100">
                <td className="px-3 py-2 text-ink-800">
                  <span className="font-mono">{f.cuentaCliente}</span> {f.nombre ?? <span className="text-warn-700">sin cuenta en el balance</span>}
                  {f.cuentasBalance.length > 1 && <div className="text-[10.5px] text-ink-400">{f.cuentasBalance.join(", ")}</div>}
                </td>
                <td className="px-3 py-2 text-[11.5px] text-ink-600">{f.conceptos.map((c) => `${c.codigo}${c.descripcion ? ` ${c.descripcion}` : ""}`).join(" · ")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{f.contable == null ? <span className="text-ink-300">—</span> : fmtContable(f.contable)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.modulo)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${f.cuadra ? "text-ok-700" : f.diferencia == null ? "text-ink-400" : "text-err-700"}`}>{f.diferencia == null ? "—" : fmtContable(f.diferencia)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
              <td className="px-3 py-2" colSpan={2}>Totales</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtContable(control.totales.contable)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtContable(control.totales.modulo)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtContable(control.totales.diferencia)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Nómina · Novedades: validaciones propias del archivo y de la homologación. */
function NovedadesNominaPanel({ v }: { v: ValidacionesNomina }) {
  const ok = "rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700";
  return (
    <>
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Homologación de conceptos</div>
        <div className="flex flex-col gap-2 text-[12px]">
          {v.sinCuenta.length === 0 ? <div className={ok}>✓ Todos los conceptos de gasto tienen cuenta Russell resuelta.</div> : (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-warn-700">
              <b>{v.sinCuenta.length}</b> concepto(s) sin cuenta confirmada (suman en el renglón «Saldo del módulo sin cuenta» del cruce contable): {v.sinCuenta.slice(0, 12).map((c) => `${c.clasificador}${c.descripcion ? ` ${c.descripcion}` : ""} (${fmtContable(c.total)})`).join("  ·  ")}{v.sinCuenta.length > 12 ? " …" : ""}. Confírmalos en la pestaña Consolidado.
            </div>
          )}
          {v.multi.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
              <b>{v.multi.length}</b> concepto(s) cruzan contra varias cuentas y necesitan reparto (pestaña Cruce contable): {v.multi.slice(0, 12).map((c) => `${c.clasificador} → ${c.cuentas.join("/")}`).join("  ·  ")}{v.multi.length > 12 ? " …" : ""}.
            </div>
          )}
          {v.control.conceptos > 0 && (
            <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
              <b>{v.control.conceptos}</b> concepto(s) de deducciones a pasivo/activo por <b>{fmtContable(v.control.total)}</b>: van al control de deducciones, no al gasto.
            </div>
          )}
          {v.meses.length > 0 && <div className="text-[11.5px] text-ink-500">Meses en el detalle: {v.meses.join(", ")}.</div>}
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Neto por fila (devengo − deducción)</div>
        {v.netos.length === 0 ? <div className={ok}>✓ En las filas que traen devengo, deducción y neto, el neto cuadra.</div> : (
          <div className="overflow-x-auto rounded-md border border-ink-150">
            <table className="w-full text-[12px]">
              <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="px-2.5 py-1.5 font-semibold">Fila</th><th className="px-2.5 py-1.5 font-semibold">Cédula</th><th className="px-2.5 py-1.5 text-right font-semibold">Devengo</th><th className="px-2.5 py-1.5 text-right font-semibold">Deducción</th><th className="px-2.5 py-1.5 text-right font-semibold">Neto</th><th className="px-2.5 py-1.5 text-right font-semibold">Esperado</th></tr></thead>
              <tbody>
                {v.netos.slice(0, 200).map((n) => (
                  <tr key={n.filaNum} className="border-t border-ink-100">
                    <td className="px-2.5 py-1.5 tabular-nums text-ink-500">{n.filaNum}</td>
                    <td className="px-2.5 py-1.5 text-ink-700">{n.cedula ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtContable(n.devengo)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtContable(n.deduccion)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-err-700">{fmtContable(n.neto)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-600">{fmtContable(n.esperado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cédulas con varios nombres</div>
        {v.cedulas.length === 0 ? <div className={ok}>✓ Cada cédula aparece con un solo nombre.</div> : (
          <ul className="flex flex-col gap-1 text-[12px] text-ink-700">
            {v.cedulas.slice(0, 50).map((c) => <li key={c.cedula}><span className="font-mono">{c.cedula}</span>: {c.nombres.join(" / ")} <span className="text-ink-400">({c.filas} filas)</span></li>)}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Cuánto del descuadre está explicado por marcas y cuánto sigue pendiente. */
/**
 * Conciliación EN FIRME: botón «Cerrar conciliación» (senior/gerente asignado) cuando el
 * cruce cuadra o todas sus diferencias tienen marca; una vez cerrada, el banner con
 * quién y cuándo, y la acción «Desbloquear» con justificación obligatoria.
 */
function ConciliacionEnFirmePanel({
  conciliacion,
  encabezadoId,
  moduloLabel,
}: {
  conciliacion: CierreConciliacionVm;
  encabezadoId: number;
  moduloLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const { cierre, puedeCerrar, puedeDesbloquear, motivoNoCerrable } = conciliacion;
  const enFirme = cierre?.enFirme === true;

  const cerrar = () => {
    start(async () => {
      const r = await cerrarConciliacionModulo({ encabezadoId });
      if (r.ok) {
        notifySuccess(r.message ?? "Conciliación en firme.");
        setConfirmarCierre(false);
      } else notifyError(r.message ?? "No se pudo cerrar la conciliación.");
      router.refresh();
    });
  };
  const desbloquear = () => {
    if (!cierre) return;
    start(async () => {
      const r = await desbloquearConciliacion({ cierreId: cierre.id, justificacion });
      if (r.ok) {
        notifySuccess(r.message ?? "Conciliación desbloqueada.");
        setDesbloqueando(false);
        setJustificacion("");
      } else notifyError(r.message ?? "No se pudo desbloquear la conciliación.");
      router.refresh();
    });
  };

  if (enFirme && cierre) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-navy-700/30 bg-navy-700/5 px-3 py-2 text-[12px] text-ink-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 font-semibold text-navy-700"><Icon name="check" size={13} /> Conciliación en firme</span>
          <span>cerró <b>{cierre.cerradoPor}</b> · {cierre.cerradoEn}</span>
          <span className="text-ink-500">
            {cierre.cuentasBloqueadas} cuenta(s) del balance <b className="text-ink-700">{cierre.balancePeriodo}</b> bloqueada(s) · cargue #{cierre.moduloDatoEncabezadoId}
          </span>
          <Link href={`/balance/${cierre.balanceEncabezadoId}`} className="font-semibold text-blue-600 hover:underline">Ver balance →</Link>
        </div>
        {puedeDesbloquear && (
          <button
            type="button"
            onClick={() => setDesbloqueando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-warn-500 bg-white px-2.5 py-1 text-[12px] font-semibold text-warn-700 hover:bg-warn-100"
          >
            Desbloquear
          </button>
        )}
        <Modal
          open={desbloqueando}
          onClose={() => setDesbloqueando(false)}
          title={`Desbloquear conciliación · ${moduloLabel} · ${cierre.balancePeriodo}`}
          footer={
            <button
              type="button"
              onClick={desbloquear}
              disabled={pending || justificacion.trim().length < MIN_JUSTIFICACION_DESBLOQUEO}
              className="inline-flex items-center gap-1.5 rounded-md bg-warn-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-warn-500 disabled:opacity-60"
            >
              {pending ? "Desbloqueando…" : "Desbloquear conciliación"}
            </button>
          }
        >
          <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
            <p>
              Al desbloquear, las <b>{cierre.cuentasBloqueadas}</b> cuenta(s) del balance <b>{cierre.balancePeriodo}</b> vuelven a ser editables: se podrá cargar una versión nueva, congelar otra versión y cambiar su homologación. La justificación queda en la bitácora de auditoría.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-600">Justificación (obligatoria, mínimo {MIN_JUSTIFICACION_DESBLOQUEO} caracteres)</span>
              <textarea
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value.slice(0, MAX_JUSTIFICACION_DESBLOQUEO))}
                rows={4}
                autoFocus
                placeholder="Por qué se reabre la conciliación (p. ej. el cliente envió un balance corregido)…"
                className="w-full rounded-md border border-ink-200 px-2.5 py-2 text-[12.5px] outline-none focus:border-blue-400"
              />
              <span className="text-right text-[10.5px] text-ink-400">{justificacion.length}/{MAX_JUSTIFICACION_DESBLOQUEO}</span>
            </label>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-ink-150 bg-white px-3 py-2 text-[12px] text-ink-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-ink-800">Conciliación abierta</span>
        {cierre && !cierre.enFirme && (
          <span className="text-ink-500" title={cierre.justificacionDesbloqueo ?? undefined}>
            desbloqueó <b>{cierre.desbloqueadoPor ?? "—"}</b> · {cierre.desbloqueadoEn ?? "—"} (antes cerró {cierre.cerradoPor} · {cierre.cerradoEn})
          </span>
        )}
        {motivoNoCerrable ? (
          <span className="text-warn-700">{motivoNoCerrable}</span>
        ) : (
          <span className="text-ink-500">El cruce está listo para cerrarse en firme.</span>
        )}
      </div>
      {puedeCerrar && (
        <button
          type="button"
          onClick={() => setConfirmarCierre(true)}
          disabled={!!motivoNoCerrable}
          title={motivoNoCerrable ?? "Cerrar la conciliación y bloquear las cuentas del módulo en el balance"}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" size={13} /> Cerrar conciliación
        </button>
      )}
      <Modal
        open={confirmarCierre}
        onClose={() => setConfirmarCierre(false)}
        title={`Cerrar conciliación · ${moduloLabel}`}
        footer={
          <button
            type="button"
            onClick={cerrar}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Cerrando…" : "Cerrar en firme"}
          </button>
        }
      >
        <div className="flex flex-col gap-2 text-[12.5px] text-ink-700">
          <p>
            Las cuentas del balance homologadas a las cuentas de <b>{moduloLabel}</b> quedarán <b>en firme</b> para este período: no se podrá cargar una versión del balance que las modifique, congelar otra versión ni cambiar su homologación.
          </p>
          <p className="text-ink-500">Solo el senior o gerente asignado al cliente podrá desbloquearla, con una justificación que queda en la bitácora.</p>
        </div>
      </Modal>
    </div>
  );
}

function ResumenMarcasBanner({ resumen }: { resumen: ResumenMarcas }) {
  const todo = resumen.pendientes === 0 && resumen.desactualizadas === 0;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-[12px] ${
        todo ? "border-ok-500 bg-ok-100/30 text-ok-700" : "border-warn-500 bg-warn-100/30 text-warn-700"
      }`}
    >
      <span className="font-semibold">
        {resumen.marcadas} de {resumen.conDiferencia} {resumen.conDiferencia === 1 ? "diferencia marcada" : "diferencias marcadas"}
      </span>
      {resumen.pendientes > 0 && (
        <span>
          Sin marcar: <b>{resumen.pendientes}</b> ({fmtContable(resumen.montoPendiente)})
        </span>
      )}
      {resumen.desactualizadas > 0 && (
        <span title="La diferencia cambió después de escribir la marca.">
          Por revisar: <b>{resumen.desactualizadas}</b>
        </span>
      )}
      {todo && <span>Todas las diferencias del período están marcadas.</span>}
    </div>
  );
}

/** La marca de una fila de la cédula: número (enlace a su observación) o botón para crearla. */
function CeldaMarca({
  fila,
  encabezadoId,
  comentarios,
  puedeEditar,
  onMarcar,
}: {
  fila: FilaCruceMarcada;
  encabezadoId: number;
  comentarios: number;
  puedeEditar: boolean;
  onMarcar: () => void;
}) {
  const hilo = (
    <ComentarioAncla
      tipo="modulos_datos"
      entityId={encabezadoId}
      anchor={anclaCruce(fila.cuenta4)}
      titulo={etiquetaFilaCruce(fila)}
      count={comentarios}
    />
  );

  // Cuenta que cuadra y nunca se marcó: nada que explicar.
  if (!fila.admiteMarca && !fila.marca) {
    return <div className="flex items-center justify-center gap-1">{hilo}</div>;
  }

  if (!fila.marca) {
    return (
      <div className="flex items-center justify-center gap-1">
        {puedeEditar ? (
          <button
            type="button"
            onClick={onMarcar}
            title="Poner una marca a esta diferencia"
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed border-ink-300 px-1 text-ink-400 transition hover:border-navy-700 hover:text-navy-700"
          >
            <Icon name="plus" size={12} />
          </button>
        ) : (
          <span title="Diferencia sin marca" className="text-[11.5px] font-semibold text-warn-700">
            —
          </span>
        )}
        {hilo}
      </div>
    );
  }

  const { marca } = fila;
  const titulo = fila.desactualizada
    ? `Marca ${marca.numero} · la diferencia era ${fmtContable(marca.diferencia)} cuando se escribió y hoy es ${fmtContable(fila.diferencia)}. Ver observación al pie.`
    : `Marca ${marca.numero} · ver la observación al pie`;

  return (
    <div className="flex items-center justify-center gap-1">
      <a href={`#${anclaObservacionMarca(marca.numero)}`} className="inline-flex">
        <InsigniaMarca numero={marca.numero} tono={fila.desactualizada ? "warn" : "ok"} titulo={titulo} />
      </a>
      {hilo}
    </div>
  );
}

/**
 * La zona de observaciones: el detalle numerado de cada marca, como las notas al pie de
 * una cédula. Aquí —y no en la tabla— viven la explicación, la referencia al anexo del
 * papel de trabajo y los soportes adjuntos.
 */
function ObservacionesMarcas({
  observaciones,
  referencias,
  encabezadoId,
  comentarios,
  puedeEditar,
  ocupado,
  onEditar,
  onQuitar,
}: {
  observaciones: FilaCruceMarcada[];
  /** Las demás marcas del período (cruce por tercero, o sin renglón), citadas en su lugar. */
  referencias: ReferenciaMarcaVm[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
  ocupado: boolean;
  onEditar: (fila: FilaCruceMarcada) => void;
  onQuitar: (fila: FilaCruceMarcada) => void;
}) {
  const entradas = intercalarObservaciones(observaciones, (f) => f.marca!.numero, referencias);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Observaciones · marcas de auditoría</h3>
        {entradas.length > 0 && (
          <span className="text-[11px] text-ink-400">
            {entradas.length} {entradas.length === 1 ? "marca" : "marcas"} en este período
            {entradas.length > observaciones.length ? ` · ${observaciones.length} de este cruce` : ""}
          </span>
        )}
      </div>

      {entradas.length === 0 ? (
        <p className="px-3 py-5 text-center text-[12px] text-ink-400">
          Sin marcas todavía. Pon una marca a una diferencia de la tabla y su detalle aparecerá aquí.
        </p>
      ) : (
        <ol className="divide-y divide-ink-100">
          {entradas.map((entrada) => entrada.tipo === "referencia" ? (
            <ReferenciaMarca key={`ref-${entrada.numero}`} referencia={entrada.marca} />
          ) : (
            <ObservacionMarca
              key={entrada.item.cuenta4}
              fila={entrada.item}
              encabezadoId={encabezadoId}
              comentarios={comentarios[anclaCruce(entrada.item.cuenta4)] ?? 0}
              puedeEditar={puedeEditar}
              ocupado={ocupado}
              onEditar={() => onEditar(entrada.item)}
              onQuitar={() => onQuitar(entrada.item)}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Una nota al pie: marca, cuenta, detalle, anexo, soportes y quién la escribió. */
function ObservacionMarca({
  fila,
  encabezadoId,
  comentarios,
  puedeEditar,
  ocupado,
  onEditar,
  onQuitar,
}: {
  fila: FilaCruceMarcada;
  encabezadoId: number;
  comentarios: number;
  puedeEditar: boolean;
  ocupado: boolean;
  onEditar: () => void;
  onQuitar: () => void;
}) {
  const marca = fila.marca!;
  return (
    <li id={anclaObservacionMarca(marca.numero)} className="flex gap-3 px-3 py-3 scroll-mt-24">
      <div className="pt-0.5">
        <InsigniaMarca
          numero={marca.numero}
          tono={fila.desactualizada ? "warn" : "ok"}
          titulo={`Marca ${marca.numero}`}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12.5px] font-semibold text-ink-800">{etiquetaFilaCruce(fila)}</span>
          <span className={`text-[12px] font-semibold tabular-nums ${fila.cuadra ? "text-ok-700" : "text-err-700"}`}>
            {fmtContable(fila.diferencia)}
          </span>
          {fila.desactualizada && (
            <span title={`La diferencia era ${fmtContable(marca.diferencia)} cuando se escribió esta marca.`}>
              <Chip label="Revisar" tone="warn" />
            </span>
          )}
          {!fila.admiteMarca && <Chip label="Ya cuadra" tone="ok" />}
        </div>

        <p className="whitespace-pre-wrap break-words text-[12px] text-ink-700">{marca.nota}</p>

        <ResumenNoModulares cuentas={marca.noModulares} />
        <ResumenClasificadoresNoModulares clasificadores={marca.clasificadoresNoModulares ?? []} />

        {marca.referenciaAnexo && (
          <p className="text-[11.5px] text-ink-600">
            <span className="font-semibold text-ink-500">Anexo:</span> {marca.referenciaAnexo}
          </p>
        )}

        <ListaSoportesMarca adjuntos={marca.adjuntos} />

        <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-ink-400">
          <span>
            {marca.marcadoPor ? `${marca.marcadoPor} · ` : ""}
            {marca.marcadoEn}
          </span>
          <ComentarioAncla
            tipo="modulos_datos"
            entityId={encabezadoId}
            anchor={anclaCruce(fila.cuenta4)}
            titulo={etiquetaFilaCruce(fila)}
            count={comentarios}
          />
        </div>
      </div>

      {puedeEditar && (
        <div className="flex shrink-0 items-start gap-1">
          <button
            type="button"
            onClick={onEditar}
            title="Editar la marca"
            aria-label="Editar la marca"
            className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="edit" size={13} />
          </button>
          <button
            type="button"
            onClick={onQuitar}
            disabled={ocupado}
            title="Retirar la marca (se lleva sus soportes)"
            aria-label="Retirar la marca"
            className="rounded p-1 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      )}
    </li>
  );
}

/** Modal para poner (o reescribir) la marca de una diferencia y adjuntarle soportes. */
function ModalMarca({
  moduloLabel,
  fila,
  hijos,
  hijosSinCuenta,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  moduloLabel: string;
  fila: FilaCruceMarcada;
  hijos: HijoContableCruce[];
  /** Solo el renglón del saldo sin cuenta: lo que se excluye son clasificadores del lado módulo. */
  hijosSinCuenta?: HijoModuloSinCuenta[];
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const ladoModulo = hijosSinCuenta != null;
  const [nota, setNota] = useState(fila.marca?.nota ?? "");
  const [anexo, setAnexo] = useState(fila.marca?.referenciaAnexo ?? "");
  const [nuevos, setNuevos] = useState<File[]>([]);
  // Cuentas marcadas como no modulares: se parte de las que ya están excluidas.
  const [noModulares, setNoModulares] = useState<Set<string>>(
    () => new Set(hijosSinCuenta
      ? hijosSinCuenta.filter((h) => h.noModular).map((h) => h.clasificador)
      : hijos.filter((h) => h.noModular).map((h) => h.cuenta8)),
  );
  const alternarNoModular = (cuenta8: string) =>
    setNoModulares((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(cuenta8)) siguiente.delete(cuenta8);
      else siguiente.add(cuenta8);
      return siguiente;
    });
  // Vista previa en vivo: lo que el servidor recalculará al guardar.
  // Del lado módulo (saldo sin cuenta) lo excluido se resta del módulo: la diferencia SUBE.
  const totalNoModular = hijosSinCuenta
    ? hijosSinCuenta.reduce((suma, h) => (noModulares.has(h.clasificador) ? suma + h.total : suma), 0)
    : hijos.reduce((suma, h) => (noModulares.has(h.cuenta8) ? suma + h.valor : suma), 0);
  const efectoNoModular = ladoModulo ? totalNoModular : -totalNoModular;
  const difAjustada = ladoModulo
    ? fila.contable - fila.noModular - (fila.inventario - totalNoModular)
    : fila.contable - totalNoModular - fila.inventario;
  const [guardando, startGuardar] = useTransition();
  const guardar = () => {
    const texto = nota.trim();
    if (!texto || guardando) return;
    startGuardar(async () => {
      const datos = new FormData();
      datos.set("encabezadoId", String(encabezadoId));
      datos.set("cuenta4", fila.cuenta4);
      datos.set("nota", texto);
      datos.set("referenciaAnexo", anexo.trim());
      // La diferencia la recalcula el servidor sobre el cruce vigente; esto solo declara
      // qué cuentas quedan fuera de la conciliación.
      datos.set("noModulares", JSON.stringify([...noModulares]));
      for (const archivo of nuevos) datos.append("soportes", archivo);

      const r = await guardarMarcaCruce(datos);
      if (r.ok) {
        notifySuccess(r.message ?? "Marca guardada.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudo guardar la marca.");
      }
    });
  };

  const titulo = fila.marca
    ? `${etiquetaMarca(fila.marca.numero)} · ${etiquetaFilaCruce(fila)}`
    : `Nueva marca · ${etiquetaFilaCruce(fila)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      size="lg"
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={!nota.trim() || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Guardando…" : fila.marca ? "Guardar cambios" : "Poner marca"}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px]">
          <div>
            <div className="text-ink-500">Contabilidad</div>
            <div className="tabular-nums font-semibold text-ink-800">{fmtContable(fila.contable)}</div>
          </div>
          <div>
            <div className="text-ink-500">Archivos de {moduloLabel.toLocaleLowerCase("es")}</div>
            <div className="tabular-nums font-semibold text-ink-800">{fmtContable(fila.inventario)}</div>
          </div>
          <div>
            <div className="text-ink-500">No modular</div>
            <div className="tabular-nums font-semibold text-warn-700">
              {totalNoModular === 0 ? "—" : fmtContable(efectoNoModular)}
            </div>
          </div>
          <div>
            <div className="text-ink-500">Dif. ajustada</div>
            <div className={`tabular-nums font-semibold ${Math.abs(difAjustada) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>
              {fmtContable(difAjustada)}
            </div>
          </div>
        </div>

        {hijosSinCuenta ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-700">
              Saldos no modulares <span className="font-normal text-ink-400">(no hacen parte de la conciliación: se restan del lado del módulo)</span>
            </span>
            <ListaSinCuentaNoModulares hijos={hijosSinCuenta} seleccion={noModulares} onAlternar={alternarNoModular} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-700">
              Cuentas no modulares <span className="font-normal text-ink-400">(no hacen parte de la conciliación: su saldo se resta)</span>
            </span>
            <ListaNoModulares hijos={hijos} seleccion={noModulares} onAlternar={alternarNoModular} />
          </div>
        )}

        {fila.desactualizada && fila.marca && (
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            La diferencia era <b>{fmtContable(fila.marca.diferencia)}</b> cuando se escribió esta marca. Actualízala para dejar constancia del monto de hoy.
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">Detalle de la marca</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={5}
            autoFocus
            placeholder="Explica a qué corresponde la diferencia y cómo se soporta al corte."
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <span className="self-end text-[10.5px] text-ink-400">{nota.length}/{MAX_NOTA_MARCA}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">
            Referencia al anexo <span className="font-normal text-ink-400">(opcional)</span>
          </span>
          <input
            type="text"
            value={anexo}
            onChange={(e) => setAnexo(e.target.value.slice(0, MAX_REFERENCIA_ANEXO))}
            placeholder="P. ej. Anexo A-3 · papel de trabajo 04"
            className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <span className="text-[10.5px] text-ink-400">Dónde queda el soporte en el archivo del papel de trabajo.</span>
        </label>

        <EditorSoportesMarca encabezadoId={encabezadoId} yaGuardados={fila.marca?.adjuntos ?? []} nuevos={nuevos} onCambiarNuevos={setNuevos} />

        <p className="text-[11.5px] text-ink-500">
          La marca queda numerada en la cédula y su detalle en observaciones. La numeración es la misma del cruce por tercero. Se conserva al cargar versiones nuevas de este período.
        </p>
      </div>
    </Modal>
  );
}

function NovedadesTab({ novedades, titulo }: { novedades: NovedadesVm; titulo?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {titulo && <h2 className="text-[15px] font-semibold text-ink-800">{titulo}</h2>}
      {novedades.validacionArchivo && (
        <Card className="p-4">
          <ValidacionArchivo
            control={novedades.validacionArchivo.control}
            resumen={novedades.validacionArchivo.resumen}
            origen={novedades.validacionArchivo.origen}
            modo="cargado"
          />
        </Card>
      )}
      {novedades.nomina ? (
        <NovedadesNominaPanel v={novedades.nomina} />
      ) : novedades.tercero ? (
        <ValidacionesTerceroPanel validaciones={novedades.tercero} />
      ) : (
        <>
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validación automática</div>
        {novedades.negativos.length === 0 ? (
          <div className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700">✓ Sin existencias ni costos negativos.</div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] font-semibold text-err-700">⚠ {novedades.negativos.length} {novedades.negativos.length === 1 ? "ítem" : "ítems"} con existencias o costos negativos</div>
            <div className="overflow-x-auto rounded-md border border-ink-150">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="px-2.5 py-1.5 font-semibold">Fila</th><th className="px-2.5 py-1.5 font-semibold">Referencia</th><th className="px-2.5 py-1.5 font-semibold">Campo</th><th className="px-2.5 py-1.5 text-right font-semibold">Valor</th></tr></thead>
                <tbody>
                  {novedades.negativos.map((n, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-2.5 py-1.5 tabular-nums text-ink-500">{n.filaNum}</td>
                      <td className="px-2.5 py-1.5 text-ink-700">{n.referencia ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-ink-700">{n.etiqueta}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-err-700">{fmtContable(n.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Descuadre valor total vs cantidad × unitario</div>
        {novedades.descuadres.length === 0 ? (
          <div className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700">✓ El valor total cuadra con cantidad × valor unitario.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ink-150">
            <table className="w-full text-[12px]">
              <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="px-2.5 py-1.5 font-semibold">Fila</th><th className="px-2.5 py-1.5 font-semibold">Referencia</th><th className="px-2.5 py-1.5 text-right font-semibold">Esperado</th><th className="px-2.5 py-1.5 text-right font-semibold">Declarado</th></tr></thead>
              <tbody>
                {novedades.descuadres.map((d, i) => (
                  <tr key={i} className="border-t border-ink-100">
                    <td className="px-2.5 py-1.5 tabular-nums text-ink-500">{d.filaNum}</td>
                    <td className="px-2.5 py-1.5 text-ink-700">{d.referencia ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-600">{fmtContable(d.esperado)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-err-700">{fmtContable(d.declarado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}

      {/* Módulos sin verificaciones (Cartera, Nómina): la tarjeta solo aparece con observaciones. */}
      {(novedades.verificaciones.length > 0 || novedades.observaciones) && (
      <Card className="p-4">
        {novedades.verificaciones.length > 0 && (
        <>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Verificaciones</div>
        <div className="flex flex-col divide-y divide-ink-100">
          {novedades.verificaciones.map((v, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-2 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[12.5px] text-ink-700">{v.texto}</span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${v.respuesta === "si" ? "bg-ok-100 text-ok-700" : v.respuesta === "no" ? "bg-err-100 text-err-700" : "bg-ink-100 text-ink-600"}`}>{etiquetaResp(v.respuesta)}</span>
              </div>
              {v.nota && <span className="text-[11.5px] text-ink-500">{v.nota}</span>}
            </div>
          ))}
        </div>
        </>
        )}
        {novedades.observaciones && (
          <div className={novedades.verificaciones.length > 0 ? "mt-3 border-t border-ink-100 pt-2.5" : ""}>
            <div className="text-[11px] font-medium text-ink-600">Observaciones generales</div>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-700">{novedades.observaciones}</p>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}

const origenVersion = (origen: string | null): string => {
  if (origen === "patron") return "Patrón de archivo";
  if (origen === "perfil") return "Perfil guardado";
  if (origen === "manual") return "Mapeo manual";
  if (origen === "ia") return "Sugerencia automática";
  return "No registrado";
};

function VersionesTab({
  moduloCodigo,
  versiones,
  versionActualId,
}: {
  moduloCodigo: string;
  versiones: VersionModuloVm[];
  versionActualId: number;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-4 py-3">
        <div className="text-[13px] font-semibold text-ink-800">Historial del período</div>
        <p className="mt-0.5 text-[11.5px] text-ink-500">Cada carga es una fotografía independiente; puedes abrir cualquier versión sin alterar la vigente.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 font-semibold">Mapeo</th>
              <th className="px-4 py-2 text-right font-semibold">Filas</th>
              <th className="px-4 py-2 text-right font-semibold">Total</th>
              <th className="px-4 py-2 font-semibold">Cargada</th>
              <th className="px-4 py-2 font-semibold">Usuario</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {versiones.map((version) => {
              const actual = version.id === versionActualId;
              return (
                <tr key={version.id} className={`border-t border-ink-100 ${actual ? "bg-blue-50/50" : "hover:bg-ink-50"}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Chip label={`v${version.version}`} tone={version.esOficial ? "ok" : "ink"} />
                      {version.esOficial && <span className="text-[10.5px] font-medium text-ok-700">vigente</span>}
                    </div>
                  </td>
                  <td className="max-w-[240px] px-4 py-2.5">
                    <div className="truncate text-ink-700" title={version.archivoNombre ?? "Archivo histórico sin metadata"}>{version.archivoNombre ?? "—"}</div>
                    <div className="text-[10.5px] text-ink-400">{version.archivoTam ?? "Tamaño no registrado"}</div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{origenVersion(version.origenExtraccion)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-600">{version.filas}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-800">{fmtContable(version.total)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{version.ultimaCarga}</td>
                  <td className="px-4 py-2.5 text-ink-500">{version.cargadoPor ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {actual ? (
                      <span className="text-[11px] font-medium text-ink-400">Estás aquí</span>
                    ) : (
                      <Link href={`/modulos/${moduloCodigo.toLowerCase()}/${version.id}?tab=versiones`} className="text-[12px] font-semibold text-blue-600 hover:underline">
                        Abrir
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
