"use client";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { useAvisoSalidaSinGuardar } from "@/lib/usar-aviso-salida";
import ComentarioAncla from "@/components/comentario-ancla";
import { esImputable } from "@/lib/modulos/promocion";
import { hayFiltrosDetalleModulo, type FiltrosDetalleModulo } from "@/lib/modulos/filtros-detalle-modulo";
import { textoCeldaDetalle, tituloCeldaDetalle, valorColumnaDetalle } from "@/lib/modulos/celda-detalle-modulo";
import { controlSeccion, etiquetaRenglonNoSuma, indiceColumnaValor } from "@/lib/modulos/renglones-archivo";
import { GRUPO_SIN_CLASIFICAR, type ResumenBorrador } from "@/lib/modulos/borrador-resumen";
import type { ReconciliacionModulo } from "@/lib/modulos/extraccion/transformar";
import { aplicarCambiosBorradorModulo, cargarBorradorModulo, descartarBorradorModulo, filasBorradorModulo } from "@/app/actions/modulos-datos";
import { NotasCargaModulo } from "../../notas-carga-modulo";
import { ValidacionArchivo } from "../../validacion-archivo";
import type { OpcionNombreClasificador } from "@/lib/modulos/nombre-clasificador";
import { NombreAgrupador, type GrupoSinNombreVm } from "./nombre-agrupador";

export type FilaBorradorModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
  tipoFila: string;
  omitida: boolean | null;
  /** Por qué el motor marcó la fila como subtotal (`total`), si aplica. */
  motivo?: string | null;
};
type Columna = { nombre: string; etiqueta: string; tipo: string; esValor?: boolean; familia?: { clave: string; etiqueta: string } };

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
          <div className="absolute right-0 z-40 mt-1 w-[24rem] overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Borradores de este cliente y período
            </div>
            <div className="max-h-72 overflow-y-auto">
              {hermanos.map((hermano) => {
                const actual = hermano.loteId === loteId;
                return (
                  <div key={hermano.loteId} className={`flex items-center gap-2 border-b border-ink-50 px-3 py-2 last:border-0 ${actual ? "bg-blue-50/60" : "hover:bg-ink-50"}`}>
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

export default function BorradorModuloClient({
  moduloCodigo,
  loteId,
  loteRowId,
  comentarios,
  cliente,
  periodoSugerido,
  columnas: columnasDelCargue,
  clasificadorRol,
  noNegativos,
  productos,
  verificaciones,
  resumen,
  reconciliacion,
  anexo,
  sinNombre = [],
  opcionesNombre = [],
  version,
  hermanos,
  notasCliente = null,
}: {
  moduloCodigo: string;
  loteId: string;
  loteRowId: number;
  comentarios: Record<string, number>;
  cliente: string;
  periodoSugerido: string;
  columnas: Columna[];
  clasificadorRol: string;
  noNegativos: string[];
  productos: { resultado: string; cantidad: string; unitario: string }[];
  verificaciones: { id: string; texto: string }[];
  /** Agregados del archivo COMPLETO, calculados en el servidor: las filas se piden por grupo. */
  resumen: ResumenBorrador;
  reconciliacion: ReconciliacionModulo | null;
  /** Anexo declarado con «Agregar archivo»: a qué cargue se suma y qué ítems repite. */
  anexo: { version: number; periodo: string; repetidos: string[]; vigente: boolean } | null;
  /** Filas «(sin clasificar)» y «GLOBAL» (nombradas por el sistema), a las que se les puede poner nombre. */
  sinNombre?: GrupoSinNombreVm[];
  /** Nombres que se ofrecen: los del cargue destino del anexo y los de la memoria del cliente. */
  opcionesNombre?: OpcionNombreClasificador[];
  version: number | null;
  hermanos: VersionHermanaBorradorModulo[];
  /** Notas de carga del cliente para este módulo (Configuración › Perfiles de carga). */
  notasCliente?: string | null;
}) {
  const router = useRouter();
  const clasificadorEtiqueta = columnasDelCargue.find((c) => c.nombre === clasificadorRol)?.etiqueta ?? "Tipo";
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
  const [respuestas, setRespuestas] = useState<Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>>({});
  const [observaciones, setObservaciones] = useState("");
  const [filtro, setFiltro] = useState<string | null>(null); // null = todos · FILTRO_NOVEDADES · o un clasificador
  const [filtrosColumnas, setFiltrosColumnas] = useState<FiltrosDetalleModulo>({});
  const [guardando, startGuardar] = useTransition();
  const [cargando, startCargar] = useTransition();
  const [descartando, startDescartar] = useTransition();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  // DETALLE BAJO DEMANDA: el archivo puede traer cientos de miles de filas, así que la tabla
  // abre agrupada y solo pide al servidor las filas del grupo que el usuario despliega.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [filasPorGrupo, setFilasPorGrupo] = useState<Record<string, FilaBorradorModulo[]>>({});
  const [totalPorGrupo, setTotalPorGrupo] = useState<Record<string, number>>({});
  const [cargandoGrupos, setCargandoGrupos] = useState<Set<string>>(new Set());

  const filas = useMemo(() => Object.values(filasPorGrupo).flat(), [filasPorGrupo]);

  const efectivas = useMemo(
    () =>
      filas.map((f) => {
        const clasificador = f.filaNum in overrideClasif ? (overrideClasif[f.filaNum] || null) : f.clasificador;
        const tipoFila = f.filaNum in overrideTipo ? overrideTipo[f.filaNum] : f.tipoFila;
        return {
          ...f,
          tipoFila,
          // Un total nunca está «omitido»: al cambiar de tipo el tri-estado se limpia.
          omitida: f.filaNum in overrideTipo ? null : f.filaNum in overrideOmit ? overrideOmit[f.filaNum] : f.omitida,
          clasificador,
        };
      }),
    [filas, overrideOmit, overrideClasif, overrideTipo],
  );

  // Tipo/omisión ORIGINAL por fila: al aplicar en bloque, si el destino coincide con
  // el original se borra el override (no marca «cambios sin guardar» falsos).
  const omitOriginal = useMemo(() => new Map(filas.map((f) => [f.filaNum, f.omitida === true])), [filas]);
  const tipoOriginal = useMemo(() => new Map(filas.map((f) => [f.filaNum, f.tipoFila])), [filas]);
  const clasifOriginal = useMemo(() => new Map(filas.map((f) => [f.filaNum, f.clasificador ?? ""])), [filas]);
  // Agrupadores ya presentes en el archivo (para el datalist de entrada manual).
  const agrupadoresExistentes = resumen.agrupadores;

  // Los controles del tipo de formato (Cartera y CxP) y el de subtotales se calculan en el
  // servidor sobre el archivo completo; con cambios sin guardar la pantalla avisa que se
  // recalculan al guardar, en vez de calcularlos sobre las pocas filas cargadas.
  const controlesFormato = resumen.controlesFormato;
  const control = resumen.control;

  const hayCambiosFilas = Object.keys(overrideOmit).length + Object.keys(overrideClasif).length + Object.keys(overrideTipo).length > 0;
  const periodoCambiado = periodo !== periodoSugerido;
  const hayCambios = hayCambiosFilas || periodoCambiado;
  useAvisoSalidaSinGuardar(hayCambios, "Tienes cambios sin guardar en el borrador: pulsa «Guardar cambios» o «Descartar» antes de salir.");
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
  // lo que el usuario acaba de cambiar en las filas que tiene cargadas.
  const delta = useMemo(() => {
    const porGrupo = new Map<string, { items: number; subtotal: number }>();
    let items = 0;
    let subtotal = 0;
    for (const f of filas) {
      const efectiva = efectivas.find((e) => e.filaNum === f.filaNum);
      if (!efectiva) continue;
      const antes = esImputableFila(f);
      const ahora = esImputableFila(efectiva);
      const grupoAntes = f.clasificador?.trim() || GRUPO_SIN_CLASIFICAR;
      const grupoAhora = efectiva.clasificador?.trim() || GRUPO_SIN_CLASIFICAR;
      if (antes === ahora && grupoAntes === grupoAhora) continue;
      const ajustar = (g: string, di: number, ds: number) => {
        const previo = porGrupo.get(g) ?? { items: 0, subtotal: 0 };
        porGrupo.set(g, { items: previo.items + di, subtotal: previo.subtotal + ds });
      };
      if (antes) { items -= 1; subtotal -= f.valor; ajustar(grupoAntes, -1, -f.valor); }
      if (ahora) { items += 1; subtotal += efectiva.valor; ajustar(grupoAhora, 1, efectiva.valor); }
    }
    return { items, subtotal, porGrupo };
  }, [efectivas, esImputableFila, filas]);

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

  // Novedades del archivo COMPLETO (negativos, descuadres de cantidad × unitario, filas que
  // parecen el gran total y subtotales que no cuadran): las calcula el servidor al abrir.
  const { negativos, descuadres, totalizadoras } = resumen;
  const resumenValidacion = { items: totalItems, sumaMovimientos: total };
  const filasConNovedad = useMemo(() => new Set(resumen.novedades), [resumen.novedades]);
  const verifCompletas = verificaciones.every((v) => respuestas[v.id]);
  const setResp = (id: string, respuesta: "si" | "no" | "na") => setRespuestas((p) => ({ ...p, [id]: { ...p[id], respuesta } }));
  const setNota = (id: string, nota: string) => setRespuestas((p) => ({ ...p, [id]: { respuesta: p[id]?.respuesta ?? "na", nota } }));

  const guardar = () =>
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
        router.refresh();
      } else notifyError(r.message ?? "No se pudieron guardar los cambios.");
    });

  const confirmar = () => {
    if (hayCambios) { notifyError("Guarda o descarta los cambios antes de confirmar."); return; }
    if (!/^\d{4}-\d{2}$/.test(periodo)) { notifyError("Indica el período (AAAA-MM)."); return; }
    if (!verifCompletas) { notifyError("Responde todas las verificaciones antes de cargar."); return; }
    startCargar(async () => {
      const fd = new FormData();
      fd.set("loteId", loteId);
      fd.set("periodo", periodo);
      fd.set("observaciones", observaciones);
      fd.set("verificaciones", JSON.stringify(respuestas));
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
        });
        if (!r.ok) { notifyError(r.message ?? "No se pudo traer el detalle."); return; }
        setFilasPorGrupo((prev) => ({ ...prev, [clasificador]: desde > 0 ? [...(prev[clasificador] ?? []), ...r.filas] : r.filas }));
        setTotalPorGrupo((prev) => ({ ...prev, [clasificador]: r.total }));
      } finally {
        setCargandoGrupos((prev) => { const n = new Set(prev); n.delete(clasificador); return n; });
      }
    },
    [filtro, filtrosColumnas, loteId, resumen.novedades, verEstructura],
  );

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
      .filter((g) => (verEstructura ? g.filas + g.estructura : g.filas) > 0);
    return base.map((g) => {
      const d = delta.porGrupo.get(g.clasificador) ?? { items: 0, subtotal: 0 };
      return {
        clasificador: g.clasificador,
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
  }, [abiertos, cargandoGrupos, delta.porGrupo, filasPorGrupo, filtro, resumen.grupos, totalPorGrupo, verEstructura]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="text-ink-600">Cliente: <span className="font-semibold text-ink-800">{cliente}</span> · {totalItems.toLocaleString("es-CO")} filas imputables de {resumen.totalFilas.toLocaleString("es-CO")} · total <span className="font-semibold">{fmtContable(total)}</span></span>
        <span className="flex items-center gap-2">
          {hayCambios && <span className="text-[11.5px] font-medium text-warn-700">Tienes cambios sin guardar.</span>}
          {version && <Chip label={`Borrador v${version}`} tone="blue" />}
          {hermanos.length > 1 && <MenuVersionesBorradorModulo moduloCodigo={moduloCodigo} loteId={loteId} hermanos={hermanos} />}
        </span>
      </div>

      {notasCliente && <NotasCargaModulo notas={notasCliente} />}

      {/* Novedades: validación automática + checklist de verificación (arriba para que se vea siempre) */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Novedades de la carga</div>

        {reconciliacion && reconciliacion.filasOmitidasArriba > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">⚠ {reconciliacion.filasOmitidasArriba} fila(s) con valor se excluyeron al leer (posible fila de datos por encima del inicio detectado).</span>
            {reconciliacion.muestra.length > 0 && (
              <span className="ml-1">Filas: {reconciliacion.muestra.map((f) => `${f.filaNum} (${fmtContable(f.valor)})`).join(", ")}{reconciliacion.filasOmitidasArriba > reconciliacion.muestra.length ? "…" : ""}.</span>
            )}
            <span className="ml-1">Revisa el archivo o el perfil de carga en Configuración › Perfiles de carga.</span>
          </div>
        )}

        {anexo && (
          <div className={`rounded-md border px-3 py-2 text-[12px] ${anexo.repetidos.length > 0 ? "border-err-500 bg-err-100 text-err-700" : "border-navy-600 bg-blue-50 text-navy-800"}`}>
            <span className="font-semibold">
              {anexo.vigente
                ? `↳ Este archivo se AGREGARÁ a la v${anexo.version} de ${anexo.periodo}.`
                : `↳ El cargue al que ibas a agregarlo (v${anexo.version} de ${anexo.periodo}) ya no es el vigente.`}
            </span>
            {!anexo.vigente ? (
              <span className="ml-1">Al confirmar se creará una versión nueva en vez de agregarse.</span>
            ) : anexo.repetidos.length > 0 ? (
              <span className="ml-1">
                ⚠ {anexo.repetidos.length} ítem(s) del archivo YA están en esa versión y quedarían duplicados:{" "}
                {anexo.repetidos.slice(0, 6).map((k) => k.trim() || "(sin referencia)").join(", ")}
                {anexo.repetidos.length > 6 ? "…" : ""}. Si el archivo es una re-subida y no una adición, descarta este
                borrador y cárgalo con «Cargar {moduloCodigo === "INV" ? "inventarios" : "el módulo"}», que crea una versión nueva.
              </span>
            ) : (
              <span className="ml-1">No repite ningún ítem ya cargado: se suma limpio a lo que existe.</span>
            )}
          </div>
        )}
        {totalizadoras.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">
              ⚠ {totalizadoras.length === 1 ? "Hay 1 fila que parece el TOTAL del archivo" : `Hay ${totalizadoras.length} filas que parecen el TOTAL del archivo`}, no un ítem.
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
          <div className="rounded-md border border-warn-500 bg-warn-100/40 px-3 py-1.5 text-[11.5px] text-warn-700">
            Los controles del archivo y las novedades se calcularon sobre lo guardado: guarda los cambios para recalcularlos.
          </div>
        )}
        {negativos.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">⚠ {resumen.negativosFilas} ítem(s) con existencias o costos negativos.</span>
            <span className="ml-1">Filas: {[...new Set(negativos.slice(0, 8).map((n) => `${n.filaNum} (${n.etiqueta})`))].join(", ")}{resumen.negativosFilas > 8 ? "…" : ""}.</span>
          </div>
        )}
        {descuadres.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">⚠ {resumen.descuadresFilas} ítem(s) donde el valor total no cuadra con cantidad × valor unitario.</span>
            <span className="ml-1">Filas: {descuadres.slice(0, 8).map((d) => `${d.filaNum} (esperado ${fmtContable(d.esperado)} vs ${fmtContable(d.declarado)})`).join(", ")}{resumen.descuadresFilas > 8 ? "…" : ""}.</span>
          </div>
        )}
        {negativos.length === 0 && descuadres.length === 0 && totalizadoras.length === 0 && (noNegativos.length > 0 || productos.length > 0) && (
          <div className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700">✓ Sin negativos ni descuadres de valor en los movimientos.</div>
        )}

        {verificaciones.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">
              Verificaciones obligatorias
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${verifCompletas ? "border-ok-500 bg-ok-100/40 text-ok-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>
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
              className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 ${pendiente ? "border-warn-500 bg-warn-100/40" : "border-ok-500/60 bg-ok-100/20"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[12.5px] ${pendiente ? "font-medium text-ink-800" : "text-ink-700"}`}>{v.texto}</span>
                {pendiente ? (
                  <span className="rounded-full border border-warn-500 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn-700">
                    Pendiente · requerido
                  </span>
                ) : (
                  <span className="rounded-full border border-ok-500 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok-700">
                    ✓ Respondida
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
                    {op === "si" ? "Sí" : op === "no" ? "No" : "N/A"}
                  </button>
                ))}
                <input value={respuestas[v.id]?.nota ?? ""} onChange={(e) => setNota(v.id, e.target.value)} placeholder="Observación (opcional)"
                  className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] text-ink-700 outline-none focus:border-blue-400" />
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
          <div className="flex items-center gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[11.5px] font-medium text-warn-700">
            <Icon name="warn" size={14} />
            Responde todas las verificaciones (Sí / No / N/A) para poder confirmar la carga.
          </div>
        )}
      </Card>

      {/* Consolidado por clasificador (previsualización) — también filtra la tabla */}
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Consolidado por clasificador · toca para filtrar</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setFiltro(null); reiniciarDetalle(); }}
            className={`rounded-md border px-3 py-1.5 text-[12px] ${filtro === null ? "border-navy-600 bg-blue-50 font-semibold text-navy-800" : "border-ink-150 bg-ink-50 text-ink-700 hover:bg-ink-100"}`}>
            Todos <span className="text-ink-400">({totalItems.toLocaleString("es-CO")})</span>
          </button>
          {filasConNovedad.size > 0 && (
            <button type="button" onClick={() => { setFiltro((f) => (f === FILTRO_NOVEDADES ? null : FILTRO_NOVEDADES)); reiniciarDetalle(); }}
              className={`rounded-md border border-err-500 px-3 py-1.5 text-[12px] font-medium text-err-700 ${filtro === FILTRO_NOVEDADES ? "bg-err-100 font-semibold" : "bg-err-100/40 hover:bg-err-100"}`}>
              ⚠ Novedades <span>({filasConNovedad.size})</span>
            </button>
          )}
          {consolidado.map((c) => {
            const activo = filtro === c.clasificador;
            return (
              <button key={c.clasificador} type="button" onClick={() => { setFiltro((f) => (f === c.clasificador ? null : c.clasificador)); reiniciarDetalle(); }}
                className={`rounded-md border px-3 py-1.5 text-[12px] ${activo ? "border-navy-600 bg-blue-50 font-semibold" : "border-ink-150 bg-ink-50 hover:bg-ink-100"}`}>
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

      {/* Barra de acciones EN BLOQUE (visible al seleccionar filas) */}
      {seleccion.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-600 bg-navy-700 px-3 py-2 text-[12px] text-white shadow-lg">
          <span className="font-semibold">{seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}</span>
          <span className="text-white/40">·</span>
          <span className="text-white/70">Agrupador:</span>
          <input
            list="agrupadores-borrador"
            value={agrupadorManual}
            onChange={(e) => setAgrupadorManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") asignarAgrupadorSeleccion(); }}
            placeholder={`Escribe el ${clasificadorEtiqueta.toLowerCase()}…`}
            className="min-w-[12rem] rounded border border-white/30 bg-white px-2 py-1 text-[12px] text-ink-800 placeholder:text-ink-400 outline-none"
          />
          <datalist id="agrupadores-borrador">
            {agrupadoresExistentes.map((a) => <option key={a} value={a} />)}
          </datalist>
          <button type="button" disabled={!agrupadorManual.trim()} onClick={asignarAgrupadorSeleccion} className="rounded border border-white/30 bg-white/15 px-2 py-1 font-semibold hover:bg-white/25 disabled:opacity-50">Asignar</button>
          <span className="ml-1 text-white/40">·</span>
          <button type="button" onClick={() => omitirSeleccion(true)} className="rounded border border-white/30 bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">Omitir</button>
          <button type="button" onClick={() => omitirSeleccion(false)} className="rounded border border-white/30 bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">Incluir</button>
          <button type="button" onClick={marcarSubtotalSeleccion} title="Tratar las filas seleccionadas como totales del archivo: no se cargan y se usan como control" className="rounded border border-white/30 bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">Marcar total</button>
          <button type="button" onClick={limpiarSeleccion} className="ml-auto rounded border border-white/30 px-2 py-1 font-medium hover:bg-white/20">Limpiar selección</button>
        </div>
      )}

      {/* Tabla del borrador */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
            <span className="font-semibold uppercase tracking-wider">Detalle en borrador (crudo del archivo)</span>
            <span>
              <span className="font-semibold text-ink-700">{filasVisibles.toLocaleString("es-CO")}</span>
              {` de ${filasDelArchivoVisibles.toLocaleString("es-CO")} filas`}
              {gruposVista.length > 0 ? " · abre un grupo para ver su detalle" : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100"
              title={hayCambios ? "El Excel exporta lo GUARDADO. Guarda tus cambios para que salgan reflejados." : "Exporta a Excel el detalle y el consolidado del borrador"}
            >
              <Icon name="download" size={13} /> Exportar a Excel
            </a>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="tabla-encabezado-fijo tabla-encabezado-doble w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="w-8 px-2.5 py-2 text-center">
                  <input type="checkbox" checked={todasVistaSeleccionadas} onChange={alternarTodasVista} title="Seleccionar todo lo visible" className="cursor-pointer align-middle" />
                </th>
                <th className="px-2.5 py-2 font-semibold">#</th>
                {columnas.map((c) => (
                  <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNum(c.tipo) ? "text-right" : ""}`}>{c.etiqueta}</th>
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
                  <tr className="border-t-2 border-ink-200 bg-blue-50/70">
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
                        {clasificadorEtiqueta}: {g.clasificador}
                      </button>
                      <span className="ml-2 font-normal text-ink-500">· {g.items.toLocaleString("es-CO")} ítems · {(g.totalFiltrado ?? g.filasDelArchivo).toLocaleString("es-CO")} filas</span>
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
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy-800">{fmtContable(g.subtotal)}</td>
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
                      <tr key={f.filaNum} title={tituloFila} className={`border-t border-ink-100 ${seleccion.has(f.filaNum) ? "bg-blue-100/60" : neg && !omit ? "bg-err-100" : esTot ? "bg-blue-50/50 font-semibold" : esAgr ? "bg-ink-50 italic" : ""} ${omit || cero ? "text-ink-300" : neg ? "text-err-700" : esTot || esAgr ? "text-ink-500" : "text-ink-700"} ${omit ? "line-through" : ""}`}>
                        <td className="px-2.5 py-1.5 text-center">
                          {!cero && <input type="checkbox" checked={seleccion.has(f.filaNum)} onChange={() => toggleSel(f.filaNum)} className="cursor-pointer align-middle" />}
                        </td>
                        <td className="px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                        {columnas.map((c) => (
                          <td key={c.nombre} title={c.nombre === clasificadorRol ? undefined : tituloCeldaDetalle(f, c)} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "text-right tabular-nums" : ""}`}>
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
      </Card>

      {/* Barra de acciones */}
      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="flex items-end gap-3">
          <button type="button" disabled={!hayCambios || guardando} onClick={guardar} className="rounded-md border border-ok-500 bg-ok-100/40 px-3 py-1.5 text-[12.5px] font-semibold text-ok-700 hover:bg-ok-100 disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
          {descartando ? (
            <span className="text-[12px] text-err-700">Descartando…</span>
          ) : (
            <button type="button" onClick={descartar} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-err-100 hover:text-err-700">Descartar</button>
          )}
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período (AAAA-MM)</span>
            {/* En un anexo el período es el del cargue destino: cambiarlo aquí haría que la
                confirmación dejara de encontrarlo y se convirtiera en versión nueva sin avisar. */}
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              disabled={anexo?.vigente === true}
              title={anexo?.vigente ? `Fijo: este archivo se agrega al cargue de ${anexo.periodo}` : undefined}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:bg-ink-50 disabled:font-semibold"
            />
          </label>
          <button type="button" disabled={cargando || hayCambios || !verifCompletas} onClick={confirmar} title={hayCambios ? "Guarda o descarta los cambios antes de confirmar" : !verifCompletas ? "Responde las verificaciones" : undefined} className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {cargando ? "Cargando…" : "Confirmar carga"}
          </button>
        </div>
      </Card>
    </div>
  );
}
