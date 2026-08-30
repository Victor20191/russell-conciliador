"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import ComentarioAncla from "@/components/comentario-ancla";
import {
  eliminarSoporteMarca,
  guardarConsolidacionModulo,
  guardarConsolidacionModuloLote,
  guardarMarcaCruce,
  quitarMarcaCruce,
} from "@/app/actions/modulos-datos";
import { aplicarAsignacionMasiva, contarConCuentas, type ModoAsignacionMasiva } from "@/lib/modulos/consolidacion-masiva";
import { resolverCuenta4, mensajeResolucion } from "@/lib/modulos/resolver-cuenta4";
import { filtrarFilasDetalleModulo, hayFiltrosDetalleModulo, type FiltrosDetalleModulo } from "@/lib/modulos/filtros-detalle-modulo";
import type { ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import type { ResumenCruceTercero } from "@/lib/modulos/cruce-tercero";
import {
  anclaCruce,
  anclaObservacionMarca,
  etiquetaMarca,
  MAX_NOTA_MARCA,
  MAX_REFERENCIA_ANEXO,
  observacionesDeMarcas,
  type FilaCruceMarcada,
  type ResumenMarcas,
} from "@/lib/modulos/marcas-cruce";
import { SOPORTES_MARCA_MAX, tamanoLegible, urlSoporteMarca } from "@/lib/modulos/marcas-adjuntos";

export type FilaDetalleVm = { filaNum: number; clasificador: string | null; valor: number; datos: Record<string, string | number | null> };
export type ConsolidadoVm = { clasificador: string; descripcion?: string | null; total: number; filas: number; cuentas4: { codigo: string; nombre: string | null }[] };
// Cruce contable (balance vs. archivos del módulo): `resumen` es null cuando NO hay
// balance de comprobación oficial para el período del módulo (estado vacío en la UI).
export type CruceContableVm = {
  balanceEncontrado: boolean;
  periodo: string;
  nombreCliente: string;
  resumen: ResumenCruceContable | null;
  sinMapeoContable: { total: number; filas: number } | null;
  bloqueo: string | null;
  balanceFuente: {
    id: number;
    version: string;
    periodoInicio: string;
    periodoFin: string;
    esOficial: boolean;
    estaCongelado: boolean;
  } | null;
  /** Filas contables omitidas conservadoramente porque no resolvieron una regla activa. */
  sinReglaContableFilas: number;
  /** Las filas del cruce con su marca de auditoría pegada (vacío si no hay balance). */
  filasMarcadas: FilaCruceMarcada[];
  resumenMarcas: ResumenMarcas | null;
};
// Cruce por tercero (NIT): balance abierto por tercero vs. auxiliar del módulo
// (CAR/CXP). `aplica` es false para módulos sin columna "tercero" (p. ej. INV) — la
// pestaña ni se muestra. `resumen` es null cuando no hay balance por tercero
// confirmado para el período (estado vacío en la UI).
export type CruceTerceroVm = {
  aplica: boolean;
  balanceEncontrado: boolean;
  /** Cargue por tercero contra el que se cruzó, para poder abrirlo desde aquí. */
  balanceTerceroId: number | null;
  balanceTerceroVersion: string | null;
  periodo: string;
  nombreCliente: string;
  resumen: ResumenCruceTercero | null;
  contableSinNit: { total: number; filas: number } | null;
  moduloSinNit: { total: number; filas: number } | null;
  /** Filas contables del módulo excluidas por falta de homologación o regla activa. */
  contableExcluidoFilas: number;
};
export type NovedadesVm = {
  negativos: { filaNum: number; etiqueta: string; referencia: string | null; valor: number }[];
  descuadres: { filaNum: number; referencia: string | null; etiqueta: string; declarado: number; esperado: number }[];
  observaciones: string | null;
  verificaciones: { texto: string; respuesta: "si" | "no" | "na" | null; nota: string | null }[];
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
type Columna = { nombre: string; etiqueta: string; tipo: string };
type CuentaOpt = { codigo: string; nombre: string };
type CuentaCliente = { codigo: string; nombre: string };
// Cuentas del cliente homologadas a cada subgrupo Russell (14XX → [{143505, "…"}]).
export type HomologacionCliente = Record<string, CuentaCliente[]>;
// Índice INVERSO: cuenta del cliente → su cuenta Russell de 4 díg. SIN filtrar por módulo,
// para poder avisar cuando la homologación cae fuera de él en vez de decir «no existe».
export type ResolucionCliente = Record<string, { cuenta4: string; nombre: string }>;
// Etiqueta de una cuenta Russell: «R - 1435 · Mercancías no fabricadas».
const etiquetaRussell = (codigo: string, nombre?: string | null) => `R - ${codigo}${nombre ? ` · ${nombre}` : ""}`;

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
  novedades,
  cuentas,
  homologacionCliente,
  resolucionCliente,
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
  novedades: NovedadesVm;
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  resolucionCliente: ResolucionCliente;
  puedeEditar: boolean;
  versiones: VersionModuloVm[];
  versionActualId: number;
  tabInicial: "versiones" | null;
}) {
  type TabId = "detalle" | "consolidado" | "cruce" | "cruceTercero" | "novedades" | "versiones";
  const [tab, setTab] = useState<TabId>(tabInicial ?? "consolidado");
  const filasNovedad = new Set([...novedades.negativos, ...novedades.descuadres].map((n) => n.filaNum));
  const alertas = filasNovedad.size;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-ink-150">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
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
          className="mb-1 ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100"
          title="Exporta a Excel el detalle y el consolidado de este cargue"
        >
          <Icon name="download" size={13} /> Exportar a Excel
        </a>
      </div>

      {tab === "consolidado" ? (
        <ConsolidadoTab moduloCodigo={moduloCodigo} clienteId={clienteId} clasificadorEtiqueta={clasificadorEtiqueta} consolidado={consolidado} cuentas={cuentas} homologacionCliente={homologacionCliente} resolucionCliente={resolucionCliente} moduloLabel={moduloLabel} puedeEditar={puedeEditar} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : tab === "detalle" ? (
        <DetalleTab columnas={columnas} clasificadorEtiqueta={clasificadorEtiqueta} detalle={detalle} negativosFilas={filasNovedad} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : tab === "cruce" ? (
        <CruceContableTab moduloLabel={moduloLabel} cruceContable={cruceContable} encabezadoId={encabezadoId} comentarios={comentarios} puedeEditar={puedeEditar} />
      ) : tab === "cruceTercero" ? (
        <CruceTerceroTab cruceTercero={cruceTercero} />
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
// clasificador ES un código de cuenta (≥4 díg), se propone su prefijo de 4 díg (queda «sin guardar»).
function cuentasInicialesConsolidado(consolidado: ConsolidadoVm[]): Record<string, string[]> {
  return Object.fromEntries(consolidado.map((c) => {
    const guardadas = c.cuentas4.map((x) => x.codigo);
    if (guardadas.length) return [c.clasificador, guardadas];
    const digitos = c.clasificador.replace(/\D/g, "");
    return [c.clasificador, digitos.length >= 4 ? [digitos.slice(0, 4)] : []];
  }));
}

function ConsolidadoTab({
  moduloCodigo,
  clienteId,
  clasificadorEtiqueta,
  consolidado,
  cuentas,
  homologacionCliente,
  resolucionCliente,
  moduloLabel,
  puedeEditar,
  encabezadoId,
  comentarios,
}: {
  moduloCodigo: string;
  clienteId: number;
  clasificadorEtiqueta: string;
  consolidado: ConsolidadoVm[];
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  resolucionCliente: ResolucionCliente;
  moduloLabel: string;
  puedeEditar: boolean;
  encabezadoId: number;
  comentarios: Record<string, number>;
}) {
  const router = useRouter();
  const [buscando, setBuscando] = useState<string | null>(null); // clasificador cuyo selector de cuenta está abierto
  // Entorno para resolver lo que el usuario escribe: los subgrupos válidos del módulo y la
  // homologación del cliente (sin filtrar, para poder avisar cuando cae fuera del módulo).
  const entornoResolucion = useMemo(() => ({
    subgruposModulo: new Set(cuentas.map((c) => c.codigo)),
    homologacionCliente: new Map(Object.entries(resolucionCliente)),
  }), [cuentas, resolucionCliente]);
  // Cuentas del CLIENTE que el desplegable ofrece: solo las que resuelven DENTRO del
  // módulo (las de fuera se rechazan al aceptarlas, no tiene sentido sugerirlas).
  const opcionesCliente = useMemo(
    () => Object.entries(resolucionCliente)
      .filter(([, d]) => entornoResolucion.subgruposModulo.has(d.cuenta4))
      .map(([codigo, d]) => ({ codigo, etiqueta: `${codigo}${d.nombre ? ` · ${d.nombre}` : ""} → R-${d.cuenta4}` }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [resolucionCliente, entornoResolucion],
  );
  // Cuentas (1..N) por clasificador — conjunto EDITABLE y el último persistido (para «sucias»).
  const [valores, setValores] = useState<Record<string, string[]>>(() => cuentasInicialesConsolidado(consolidado));
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
  const nombrePorCuenta = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c.nombre])), [cuentas]);

  const filasSucias = useMemo(
    () => consolidado.filter((c) => claveSet(valores[c.clasificador] ?? []) !== claveSet(guardados[c.clasificador] ?? [])),
    [consolidado, valores, guardados],
  );
  const haySucias = filasSucias.length > 0;
  const ocupado = guardandoClave != null || guardandoTodo;

  const clasificadores = useMemo(() => consolidado.map((c) => c.clasificador), [consolidado]);
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

  // La asignación masiva SOLO toca el estado local: las filas quedan «sucias» y se
  // persisten por el único camino existente, «Guardar todos» (reversible antes de confirmar).
  const aplicarMasivo = (cuentas4: string[], modo: ModoAsignacionMasiva) => {
    setValores((p) => aplicarAsignacionMasiva(p, seleccionados, cuentas4, modo));
    setMasivoAbierto(false);
    notifySuccess(
      `${cuentas4.length} cuenta${cuentas4.length === 1 ? "" : "s"} ${modo === "reemplazar" ? "reemplazan las de" : "aplicadas a"} ${nSel} ${etiquetaPlural}. Pulsa «Guardar todos» para persistir.`,
    );
  };

  // El campo acepta la cuenta Russell (1435) o la del cliente (143505), que se resuelve
  // por su homologación — NUNCA truncando, que es lo que hacía antes y daba otra cuenta
  // en el 25,9% de las homologadas de inventario.
  const agregarCuenta = (clasificador: string) => {
    const r = resolverCuenta4(nuevos[clasificador] ?? "", entornoResolucion);
    if (!r.ok) { notifyError(mensajeResolucion(r, moduloLabel)); return; }
    setValores((p) => ({ ...p, [clasificador]: [...new Set([...(p[clasificador] ?? []), r.cuenta4])].sort() }));
    setNuevos((p) => ({ ...p, [clasificador]: "" }));
    if (r.via === "cliente") notifySuccess(`${r.cuentaCliente}${r.nombreCliente ? ` ${r.nombreCliente}` : ""} → R-${r.cuenta4}`);
  };
  const quitarCuenta = (clasificador: string, cod: string) =>
    setValores((p) => ({ ...p, [clasificador]: (p[clasificador] ?? []).filter((x) => x !== cod) }));

  const marcarGuardadas = (filas: { clasificador: string; cuentas4: string[] }[]) => {
    const aplicar = (prev: Record<string, string[]>) => {
      const next = { ...prev };
      for (const f of filas) next[f.clasificador] = [...f.cuentas4].sort();
      return next;
    };
    setGuardados(aplicar);
    setValores(aplicar);
  };

  const guardar = (clasificador: string) => {
    const cuentas4 = valores[clasificador] ?? [];
    setGuardandoClave(clasificador);
    startGuardar(async () => {
      const r = await guardarConsolidacionModulo({ clienteId, moduloCodigo, clasificador, cuentas4 });
      setGuardandoClave(null);
      if (r.ok) {
        marcarGuardadas([{ clasificador, cuentas4 }]);
        notifySuccess(r.message ?? "Consolidación guardada.");
        router.refresh();
      } else notifyError(r.message ?? "No se pudo guardar.");
    });
  };

  const guardarTodos = () => {
    if (filasSucias.length === 0) { notifyError("No hay cambios para guardar."); return; }
    const filas = filasSucias.map((c) => ({ clasificador: c.clasificador, cuentas4: valores[c.clasificador] ?? [] }));
    setGuardandoTodo(true);
    startGuardar(async () => {
      const r = await guardarConsolidacionModuloLote({ clienteId, moduloCodigo, filas });
      setGuardandoTodo(false);
      if (r.ok) {
        marcarGuardadas(filas);
        setSeleccion(new Set());
        notifySuccess(r.message ?? "Consolidaciones guardadas.");
        router.refresh();
      } else notifyError(r.message ?? "No se pudieron guardar los cambios.");
    });
  };

  return (
    <Card className="p-0">
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
            <p className="text-[11.5px] text-ink-500">
              {haySucias
                ? `${filasSucias.length} cambio${filasSucias.length === 1 ? "" : "s"} sin guardar`
                : "Sin cambios pendientes"}
            </p>
            <button
              type="button"
              disabled={nSel === 0 || ocupado}
              onClick={() => setMasivoAbierto(true)}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={nSel === 0 ? `Marca ${etiquetaPlural} en la tabla para asignarles cuentas en bloque` : undefined}
            >
              Asignar cuentas{nSel > 0 ? ` (${nSel})` : ""}…
            </button>
            <button
              type="button"
              disabled={!haySucias || ocupado}
              onClick={guardarTodos}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardandoTodo ? "Guardando…" : `Guardar todos${haySucias ? ` (${filasSucias.length})` : ""}`}
            </button>
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
              <th className="px-3 py-2 font-semibold">Cuentas (4 díg) — una o varias</th>
              <th className="px-3 py-2 text-center font-semibold">💬</th>
            </tr>
          </thead>
          <tbody>
            {consolidado.map((c) => {
              const asignadas = valores[c.clasificador] ?? [];
              const sucia = claveSet(asignadas) !== claveSet(guardados[c.clasificador] ?? []);
              const guardandoEsta = guardandoClave === c.clasificador;
              const marcada = seleccion.has(c.clasificador);
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
                    {c.clasificador}
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
                          return (
                            <span key={cod} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11.5px] text-blue-800" title={etiquetaRussell(cod, nombrePorCuenta.get(cod))}>
                              <span className="font-semibold">R - {cod}</span>
                              {nombrePorCuenta.get(cod) && <span className="max-w-[120px] truncate text-blue-600">{nombrePorCuenta.get(cod)}</span>}
                              {ctas.length === 0 && <span className="font-bold text-warn-700" title="El cliente no tiene cuentas homologadas a este subgrupo">⚠</span>}
                              {puedeEditar && <button type="button" onClick={() => quitarCuenta(c.clasificador, cod)} className="text-blue-400 hover:text-err-700" title="Quitar">×</button>}
                            </span>
                          );
                        })}
                      </div>
                      {/* Detalle: cuentas del CLIENTE homologadas a cada cuenta Russell asignada. */}
                      {asignadas.map((cod) => {
                        const ctas = homologacionCliente[cod] ?? [];
                        return (
                          <div key={cod} className="text-[10.5px] leading-snug text-ink-500">
                            <span className="font-semibold text-ink-600">R-{cod} →</span>{" "}
                            {ctas.length
                              ? ctas.map((x) => `${x.codigo} ${x.nombre}`).join("  ·  ")
                              : <span className="font-medium text-warn-700">el cliente no tiene cuentas homologadas a este subgrupo</span>}
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
                            placeholder="1435 o 143505"
                            inputMode="numeric"
                            title="Escribe la cuenta Russell de 4 dígitos o la cuenta del cliente: se resuelve por su homologación"
                            className="w-24 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400"
                          />
                          <button type="button" onClick={() => agregarCuenta(c.clasificador)} className="rounded-md border border-ink-300 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-blue-50 hover:text-blue-700">+ cuenta</button>
                          <button type="button" onClick={() => setBuscando(c.clasificador)} className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50">Buscar…</button>
                          <button type="button" disabled={ocupado || !sucia} onClick={() => guardar(c.clasificador)} className="rounded-md border border-ok-500 bg-ok-100/40 px-2 py-1 text-[11px] font-semibold text-ok-700 hover:bg-ok-100 disabled:cursor-not-allowed disabled:opacity-50">
                            {guardandoEsta ? "…" : "Guardar"}
                          </button>
                          {sucia && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-warn-700">sin guardar</span>}
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
          esGlobal={buscando === "GLOBAL"}
          cuentas={cuentas}
          homologacionCliente={homologacionCliente}
          asignadas={new Set(valores[buscando] ?? [])}
          onToggle={(cod) =>
            setValores((p) => {
              const set = new Set(p[buscando] ?? []);
              if (set.has(cod)) set.delete(cod); else set.add(cod);
              return { ...p, [buscando]: [...set].sort() };
            })
          }
          onTodas={(on) => setValores((p) => ({ ...p, [buscando]: on ? cuentas.map((cc) => cc.codigo).sort() : [] }))}
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

// Selector de cuenta Russell del módulo para UNA fila (edita el conjunto en vivo).
function ModalCuentas({
  clasificador,
  esGlobal,
  cuentas,
  homologacionCliente,
  asignadas,
  onToggle,
  onTodas,
  onClose,
}: {
  clasificador: string;
  esGlobal: boolean;
  cuentas: CuentaOpt[];
  homologacionCliente: HomologacionCliente;
  asignadas: Set<string>;
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
        <p className="text-[11px] text-ink-400">Al cerrar, recuerda pulsar «Guardar» en la fila para persistir los cambios.</p>
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

function DetalleTab({ columnas, clasificadorEtiqueta, detalle, negativosFilas, encabezadoId, comentarios }: { columnas: Columna[]; clasificadorEtiqueta: string; detalle: FilaDetalleVm[]; negativosFilas: Set<number>; encabezadoId: number; comentarios: Record<string, number> }) {
  const esNum = (t: string) => t === "moneda" || t === "numero";
  const celda = (f: FilaDetalleVm, col: Columna) => {
    const v = f.datos[col.nombre];
    if (v == null || v === "") return "—";
    if (col.tipo === "moneda") return fmtContable(Number(v));
    if (col.tipo === "numero") return fmtNum(Number(v));
    return String(v);
  };
  const [filtros, setFiltros] = useState<FiltrosDetalleModulo>({});
  const hayFiltros = hayFiltrosDetalleModulo(filtros);
  const detalleFiltrado = useMemo(
    () => filtrarFilasDetalleModulo(detalle, columnas, filtros),
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
        {hayFiltros && (
          <button type="button" onClick={() => setFiltros({})} className="rounded-md border border-ink-200 px-2 py-1 font-medium text-ink-600 hover:bg-ink-50">
            Limpiar filtros
          </button>
        )}
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
                  <td className="px-2.5 py-1.5 font-semibold text-navy-800" colSpan={Math.max(1, columnas.length - 1)}>
                    {clasificadorEtiqueta}: {g.clasificador}
                    <span className="ml-2 font-normal text-ink-500">· {g.filas.length} ítems</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy-800">{fmtContable(g.subtotal)}</td>
                  <td className="px-2.5 py-1.5" />
                </tr>
                {g.filas.map((f) => (
                  <tr key={f.filaNum} className={`border-t border-ink-100 ${negativosFilas.has(f.filaNum) ? "bg-err-100 text-err-700" : "text-ink-700"}`}>
                    <td className="px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                    {columnas.map((c) => (
                      <td key={c.nombre} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "text-right tabular-nums" : ""}`}>{celda(f, c)}</td>
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
// del módulo, cuenta Russell (4 díg.) por cuenta Russell. Estado vacío si no hay balance
// oficial para el período; avisos aparte para clasificadores ambiguos y saldos contables
// de inventario sin homologar.
//
// La cédula se lee como un papel de trabajo: la fila con diferencia lleva una MARCA
// numerada —①②③— y la explicación entera (detalle, anexo y soportes) vive al pie, en
// observaciones. La marca de la tabla es un enlace a su observación.
function CruceContableTab({
  moduloLabel,
  cruceContable,
  encabezadoId,
  comentarios,
  puedeEditar,
}: {
  moduloLabel: string;
  cruceContable: CruceContableVm;
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Fila que se está marcando en el modal (null = modal cerrado).
  const [marcando, setMarcando] = useState<FilaCruceMarcada | null>(null);
  const [quitando, startQuitar] = useTransition();
  const moduloEnMinuscula = moduloLabel.toLocaleLowerCase("es");

  if (cruceContable.bloqueo) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="text-[13px] font-semibold text-ink-800">Cruce contable no habilitado</div>
        <p className="max-w-2xl text-[12.5px] text-warn-700">{cruceContable.bloqueo}</p>
        {cruceContable.balanceFuente && (
          <Link
            href={`/balance/${cruceContable.balanceFuente.id}`}
            className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline"
          >
            Revisar balance {cruceContable.balanceFuente.version} ({cruceContable.balanceFuente.periodoInicio} a {cruceContable.balanceFuente.periodoFin}) →
          </Link>
        )}
      </Card>
    );
  }

  if (!cruceContable.balanceEncontrado || !cruceContable.resumen) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="text-[13px] font-semibold text-ink-800">No hay balance de comprobación confirmado para este período</div>
        <p className="max-w-md text-[12.5px] text-ink-500">
          No hay un balance de comprobación confirmado (fuera de borrador) para <b className="text-ink-700">{cruceContable.nombreCliente}</b> en el período <b className="text-ink-700">{cruceContable.periodo}</b>. Carga y confirma un balance de ese período para ver el cruce.
        </p>
        <Link href="/balance" className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline">
          Ir a Balance de comprobación →
        </Link>
      </Card>
    );
  }

  const { resumen, sinMapeoContable, sinReglaContableFilas, filasMarcadas, resumenMarcas } = cruceContable;
  const observaciones = observacionesDeMarcas(filasMarcadas);

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
            balance {cruceContable.balanceFuente.version} · {cruceContable.balanceFuente.periodoInicio} a {cruceContable.balanceFuente.periodoFin}
          </Link>
          {cruceContable.balanceFuente.esOficial && cruceContable.balanceFuente.estaCongelado
            ? " · oficial y congelado · prevalidador aprobado"
            : ""}
          .
        </p>
      )}
      {resumenMarcas && resumenMarcas.conDiferencia > 0 && <ResumenMarcasBanner resumen={resumenMarcas} />}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Cuenta</th>
                <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
                <th className="px-3 py-2 text-right font-semibold">{moduloLabel} (archivos)</th>
                <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
                <th className="w-px px-3 py-2 text-center font-semibold" title="Marca de auditoría: el detalle está al pie, en observaciones.">Marca</th>
              </tr>
            </thead>
            <tbody>
              {filasMarcadas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-400">Sin cuentas para cruzar en este período.</td>
                </tr>
              )}
              {filasMarcadas.map((f) => (
                <tr key={f.cuenta4} className={`border-t border-ink-100 ${f.estado === "descuadre" ? "bg-err-100/30" : ""}`}>
                  <td className="px-3 py-2 font-medium text-ink-800">{etiquetaRussell(f.cuenta4, f.nombre)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.inventario)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {f.estado === "solo_contable" && <Chip label={`Sin ${moduloEnMinuscula}`} tone="warn" />}
                      {f.estado === "solo_inventario" && <Chip label="Sin contabilidad" tone="warn" />}
                      <span className={`tabular-nums font-semibold ${f.cuadra ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-middle">
                    <CeldaMarca
                      fila={f}
                      encabezadoId={encabezadoId}
                      comentarios={comentarios[anclaCruce(f.cuenta4)] ?? 0}
                      puedeEditar={puedeEditar}
                      onMarcar={() => setMarcando(f)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {filasMarcadas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                  <td className="px-3 py-2">Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.inventario)}</td>
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
        encabezadoId={encabezadoId}
        comentarios={comentarios}
        puedeEditar={puedeEditar}
        ocupado={quitando}
        onEditar={(fila) => setMarcando(fila)}
        onQuitar={quitar}
      />

      {(resumen.sinCuenta.length > 0 || resumen.multiAsignado.length > 0 || sinMapeoContable || sinReglaContableFilas > 0) && (
        <div className="flex flex-col gap-2">
          {resumen.sinCuenta.length > 0 && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              <b>{resumen.sinCuenta.length}</b> {resumen.sinCuenta.length === 1 ? "clasificador" : "clasificadores"} sin cuenta Russell asignada, excluido{resumen.sinCuenta.length === 1 ? "" : "s"} del cruce: {resumen.sinCuenta.map((s) => `${s.clasificador} (${fmtContable(s.total)})`).join("  ·  ")}.
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
          {sinReglaContableFilas > 0 && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              Se omitieron <b>{sinReglaContableFilas}</b> {sinReglaContableFilas === 1 ? "fila contable" : "filas contables"} porque no fue posible resolver una regla activa de base de cálculo y presentación para {moduloEnMinuscula}. No se usó el saldo final como sustituto.
            </div>
          )}
        </div>
      )}

      {marcando && (
        <ModalMarca
          moduloLabel={moduloLabel}
          fila={marcando}
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

// Cruce por tercero: saldo del balance abierto POR TERCERO vs. el auxiliar del módulo
// (CAR/CXP), NIT por NIT. Calcado de `CruceContableTab`: estado vacío si no hay balance
// por tercero confirmado para el período; avisos aparte para los montos que no se
// pudieron cruzar por falta de NIT en cada lado.
function CruceTerceroTab({ cruceTercero }: { cruceTercero: CruceTerceroVm }) {
  if (!cruceTercero.balanceEncontrado || !cruceTercero.resumen) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="text-[13px] font-semibold text-ink-800">No hay balance por tercero confirmado para este período</div>
        <p className="max-w-md text-[12.5px] text-ink-500">
          No hay balance por tercero confirmado para <b className="text-ink-700">{cruceTercero.nombreCliente}</b> en el período <b className="text-ink-700">{cruceTercero.periodo}</b>. Cárgalo desde Balance › Abrir por tercero.
        </p>
        <Link href="/balance" className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline">
          Ir a Balance de comprobación →
        </Link>
      </Card>
    );
  }

  const { resumen, contableSinNit, moduloSinNit, contableExcluidoFilas } = cruceTercero;

  return (
    <div className="flex flex-col gap-4">
      {/* De dónde salió el lado contable de este cruce: se abre el cargue por
          tercero exacto (cuentas, terceros y saldos) sin salir a buscarlo. */}
      {cruceTercero.balanceTerceroId != null && (
        <p className="text-[11.5px] text-ink-500">
          Lado contable:{" "}
          <Link
            href={`/balance/terceros/${cruceTercero.balanceTerceroId}`}
            className="font-semibold text-blue-600 hover:underline"
          >
            balance por tercero {cruceTercero.balanceTerceroVersion ?? ""} de {cruceTercero.nombreCliente}
          </Link>
          .
        </p>
      )}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">NIT</th>
                <th className="px-3 py-2 font-semibold">Nombre</th>
                <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
                <th className="px-3 py-2 text-right font-semibold">Auxiliar (módulo)</th>
                <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {resumen.filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-400">Sin terceros para cruzar en este período.</td>
                </tr>
              )}
              {resumen.filas.map((f) => (
                <tr key={f.nit} className={`border-t border-ink-100 ${f.estado === "descuadre" ? "bg-err-100/30" : ""}`}>
                  <td className="px-3 py-2 font-medium text-ink-800">{f.nit}</td>
                  <td className="px-3 py-2 text-ink-700">{f.nombre ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.modulo)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {f.estado === "solo_contable" && <Chip label="Solo en contabilidad" tone="warn" />}
                      {f.estado === "solo_modulo" && <Chip label="Solo en módulo" tone="warn" />}
                      <span className={`tabular-nums font-semibold ${f.cuadra ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {resumen.filas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                  <td className="px-3 py-2" colSpan={2}>Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(resumen.totales.modulo)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(resumen.totales.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(resumen.totales.diferencia)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {(contableSinNit || moduloSinNit || contableExcluidoFilas > 0) && (
        <div className="flex flex-col gap-2">
          {contableSinNit && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              El balance por tercero tiene <b>{fmtContable(contableSinNit.total)}</b> en {contableSinNit.filas} {contableSinNit.filas === 1 ? "fila" : "filas"} sin NIT identificado — no {contableSinNit.filas === 1 ? "entró" : "entraron"} al cruce por tercero.
            </div>
          )}
          {moduloSinNit && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              El auxiliar del módulo tiene <b>{fmtContable(moduloSinNit.total)}</b> en {moduloSinNit.filas} {moduloSinNit.filas === 1 ? "fila" : "filas"} sin NIT identificado — no {moduloSinNit.filas === 1 ? "entró" : "entraron"} al cruce por tercero.
            </div>
          )}
          {contableExcluidoFilas > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              Se excluyeron <b>{contableExcluidoFilas}</b> {contableExcluidoFilas === 1 ? "fila contable" : "filas contables"} del cruce por tercero por falta de homologación Russell o de una regla activa de base de cálculo. No se usó el saldo final como sustituto.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuánto del descuadre está explicado por marcas y cuánto sigue pendiente. */
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

/** El número de la marca tal como se pinta en la cédula. */
function InsigniaMarca({
  numero,
  tono,
  titulo,
}: {
  numero: number;
  tono: "ok" | "warn";
  titulo: string;
}) {
  const colores = tono === "warn" ? "border-warn-500 bg-warn-100 text-warn-700" : "border-navy-700 bg-white text-navy-700";
  return (
    <span
      title={titulo}
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${colores}`}
    >
      {numero}
    </span>
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
      titulo={etiquetaRussell(fila.cuenta4, fila.nombre)}
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
  encabezadoId,
  comentarios,
  puedeEditar,
  ocupado,
  onEditar,
  onQuitar,
}: {
  observaciones: FilaCruceMarcada[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
  ocupado: boolean;
  onEditar: (fila: FilaCruceMarcada) => void;
  onQuitar: (fila: FilaCruceMarcada) => void;
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Observaciones · marcas de auditoría</h3>
        {observaciones.length > 0 && (
          <span className="text-[11px] text-ink-400">
            {observaciones.length} {observaciones.length === 1 ? "marca" : "marcas"} en este período
          </span>
        )}
      </div>

      {observaciones.length === 0 ? (
        <p className="px-3 py-5 text-center text-[12px] text-ink-400">
          Sin marcas todavía. Pon una marca a una diferencia de la tabla y su detalle aparecerá aquí.
        </p>
      ) : (
        <ol className="divide-y divide-ink-100">
          {observaciones.map((fila) => (
            <ObservacionMarca
              key={fila.cuenta4}
              fila={fila}
              encabezadoId={encabezadoId}
              comentarios={comentarios[anclaCruce(fila.cuenta4)] ?? 0}
              puedeEditar={puedeEditar}
              ocupado={ocupado}
              onEditar={() => onEditar(fila)}
              onQuitar={() => onQuitar(fila)}
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
          <span className="text-[12.5px] font-semibold text-ink-800">{etiquetaRussell(fila.cuenta4, fila.nombre)}</span>
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

        {marca.referenciaAnexo && (
          <p className="text-[11.5px] text-ink-600">
            <span className="font-semibold text-ink-500">Anexo:</span> {marca.referenciaAnexo}
          </p>
        )}

        {marca.adjuntos.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {marca.adjuntos.map((a) => (
              <li key={a.id}>
                <a
                  href={`${urlSoporteMarca(a.id)}?descargar=1`}
                  className="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 transition hover:border-blue-400 hover:text-blue-700"
                  title={`${a.nombreArchivo} · ${tamanoLegible(a.tamanoBytes)}`}
                >
                  <Icon name="doc" size={11} />
                  <span className="truncate">{a.nombreArchivo}</span>
                  <span className="shrink-0 text-ink-400">{tamanoLegible(a.tamanoBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-ink-400">
          <span>
            {marca.marcadoPor ? `${marca.marcadoPor} · ` : ""}
            {marca.marcadoEn}
          </span>
          <ComentarioAncla
            tipo="modulos_datos"
            entityId={encabezadoId}
            anchor={anclaCruce(fila.cuenta4)}
            titulo={etiquetaRussell(fila.cuenta4, fila.nombre)}
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
  encabezadoId,
  onClose,
  onGuardado,
}: {
  moduloLabel: string;
  fila: FilaCruceMarcada;
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [nota, setNota] = useState(fila.marca?.nota ?? "");
  const [anexo, setAnexo] = useState(fila.marca?.referenciaAnexo ?? "");
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [guardando, startGuardar] = useTransition();
  const [borrandoSoporte, startBorrarSoporte] = useTransition();

  const yaGuardados = fila.marca?.adjuntos ?? [];
  const cupo = SOPORTES_MARCA_MAX - yaGuardados.length - nuevos.length;

  const agregar = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const elegidos = Array.from(lista);
    if (elegidos.length > cupo) {
      notifyError(`Una marca admite hasta ${SOPORTES_MARCA_MAX} soportes.`);
      return;
    }
    setNuevos((previos) => [...previos, ...elegidos]);
  };

  const quitarSoporte = (soporteId: number) => {
    startBorrarSoporte(async () => {
      const r = await eliminarSoporteMarca({ encabezadoId, soporteId });
      if (r.ok) {
        notifySuccess(r.message ?? "Soporte eliminado.");
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo eliminar el soporte.");
      }
    });
  };

  const guardar = () => {
    const texto = nota.trim();
    if (!texto || guardando) return;
    startGuardar(async () => {
      const datos = new FormData();
      datos.set("encabezadoId", String(encabezadoId));
      datos.set("cuenta4", fila.cuenta4);
      datos.set("nota", texto);
      datos.set("referenciaAnexo", anexo.trim());
      datos.set("diferencia", String(fila.diferencia));
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
    ? `${etiquetaMarca(fila.marca.numero)} · ${etiquetaRussell(fila.cuenta4, fila.nombre)}`
    : `Nueva marca · ${etiquetaRussell(fila.cuenta4, fila.nombre)}`;

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
        <div className="grid grid-cols-3 gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px]">
          <div>
            <div className="text-ink-500">Contabilidad</div>
            <div className="tabular-nums font-semibold text-ink-800">{fmtContable(fila.contable)}</div>
          </div>
          <div>
            <div className="text-ink-500">Archivos de {moduloLabel.toLocaleLowerCase("es")}</div>
            <div className="tabular-nums font-semibold text-ink-800">{fmtContable(fila.inventario)}</div>
          </div>
          <div>
            <div className="text-ink-500">Diferencia</div>
            <div className="tabular-nums font-semibold text-err-700">{fmtContable(fila.diferencia)}</div>
          </div>
        </div>

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

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-700">
            Soportes <span className="font-normal text-ink-400">(PDF, Excel, CSV o imagen · hasta {SOPORTES_MARCA_MAX})</span>
          </span>

          {yaGuardados.length > 0 && (
            <ul className="flex flex-col gap-1">
              {yaGuardados.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-md border border-ink-150 bg-white px-2 py-1.5 text-[11.5px]">
                  <Icon name="doc" size={12} />
                  <a
                    href={`${urlSoporteMarca(a.id)}?descargar=1`}
                    className="min-w-0 flex-1 truncate text-ink-700 hover:text-blue-700 hover:underline"
                    title={a.nombreArchivo}
                  >
                    {a.nombreArchivo}
                  </a>
                  <span className="shrink-0 text-ink-400">{tamanoLegible(a.tamanoBytes)}</span>
                  <button
                    type="button"
                    onClick={() => quitarSoporte(a.id)}
                    disabled={borrandoSoporte}
                    title="Eliminar este soporte"
                    aria-label="Eliminar este soporte"
                    className="shrink-0 rounded p-0.5 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {nuevos.length > 0 && (
            <ul className="flex flex-col gap-1">
              {nuevos.map((archivo, i) => (
                <li key={`${archivo.name}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50 px-2 py-1.5 text-[11.5px]">
                  <Icon name="upload" size={12} />
                  <span className="min-w-0 flex-1 truncate text-ink-700" title={archivo.name}>{archivo.name}</span>
                  <span className="shrink-0 text-ink-400">{tamanoLegible(archivo.size)}</span>
                  <button
                    type="button"
                    onClick={() => setNuevos((previos) => previos.filter((_, j) => j !== i))}
                    title="Quitar de la lista"
                    aria-label="Quitar de la lista"
                    className="shrink-0 rounded p-0.5 text-err-500 transition hover:bg-err-50 hover:text-err-700"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {cupo > 0 ? (
            <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-900">
              <Icon name="plus" size={12} /> Adjuntar soporte
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xlsm,.xls,.csv,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  agregar(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <span className="text-[11px] text-ink-400">Alcanzaste el máximo de {SOPORTES_MARCA_MAX} soportes.</span>
          )}
        </div>

        <p className="text-[11.5px] text-ink-500">
          La marca queda numerada en la cédula, su detalle en observaciones y el texto en el hilo de la cuenta. Se conserva al cargar versiones nuevas de este período.
        </p>
      </div>
    </Modal>
  );
}

function NovedadesTab({ novedades, titulo }: { novedades: NovedadesVm; titulo?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {titulo && <h2 className="text-[15px] font-semibold text-ink-800">{titulo}</h2>}
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

      <Card className="p-4">
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
        {novedades.observaciones && (
          <div className="mt-3 border-t border-ink-100 pt-2.5">
            <div className="text-[11px] font-medium text-ink-600">Observaciones generales</div>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-700">{novedades.observaciones}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

const origenVersion = (origen: string | null): string => {
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
