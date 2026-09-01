"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import ComentarioAncla from "@/components/comentario-ancla";
import { consolidarPorClasificador, filaEnCero } from "@/lib/modulos/promocion";
import { esDescuadreProducto } from "@/lib/modulos/validaciones";
import { detectarFilasTotalizadoras } from "@/lib/modulos/fila-totalizadora";
import { controlSubtotales } from "@/lib/modulos/subtotales";
import { filtrarFilasDetalleModulo, hayFiltrosDetalleModulo, type FiltrosDetalleModulo } from "@/lib/modulos/filtros-detalle-modulo";
import type { ReconciliacionModulo } from "@/lib/modulos/extraccion/transformar";
import { aplicarCambiosBorradorModulo, cargarBorradorModulo, descartarBorradorModulo } from "@/app/actions/modulos-datos";
import { NotasCargaModulo } from "../../notas-carga-modulo";
import { ValidacionArchivo } from "../../validacion-archivo";

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
type Columna = { nombre: string; etiqueta: string; tipo: string };
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
  columnas,
  clasificadorRol,
  noNegativos,
  productos,
  verificaciones,
  filas,
  reconciliacion,
  anexo,
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
  valorRol: string;
  noNegativos: string[];
  productos: { resultado: string; cantidad: string; unitario: string }[];
  verificaciones: { id: string; texto: string }[];
  filas: FilaBorradorModulo[];
  reconciliacion: ReconciliacionModulo | null;
  /** Anexo declarado con «Agregar archivo»: a qué cargue se suma y qué ítems repite. */
  anexo: { version: number; periodo: string; repetidos: string[]; vigente: boolean } | null;
  version: number | null;
  hermanos: VersionHermanaBorradorModulo[];
  /** Notas de carga del cliente para este módulo (Configuración › Perfiles de carga). */
  notasCliente?: string | null;
}) {
  const router = useRouter();
  const clasificadorEtiqueta = columnas.find((c) => c.nombre === clasificadorRol)?.etiqueta ?? "Tipo";
  const etiquetaCol = (nombre: string) => columnas.find((c) => c.nombre === nombre)?.etiqueta ?? nombre;
  const columnasNumericas = columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
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
  const agrupadoresExistentes = useMemo(
    () => [...new Set(filas.map((f) => f.clasificador?.trim()).filter((c): c is string => !!c))].sort(),
    [filas],
  );

  const hayCambiosFilas = Object.keys(overrideOmit).length + Object.keys(overrideClasif).length + Object.keys(overrideTipo).length > 0;
  const periodoCambiado = periodo !== periodoSugerido;
  const hayCambios = hayCambiosFilas || periodoCambiado;
  // Renglón "en cero": todas las columnas numéricas en 0 → NO se lleva al definitivo.
  const enCero = (f: FilaBorradorModulo) => filaEnCero(f.datos, columnasNumericas);
  const imputables = efectivas.filter((f) => f.tipoFila === "movimiento" && f.omitida !== true && !enCero(f));
  const total = imputables.reduce((s, f) => s + f.valor, 0);
  const consolidado = consolidarPorClasificador(imputables.map((f) => ({ clasificador: f.clasificador, valor: f.valor, tipoFila: f.tipoFila })));

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

  // Novedades automáticas sobre lo que SÍ se cargará (imputables):
  //  (1) existencias/costos negativos · (2) descuadre total ≠ cantidad×unitario (si el archivo trae el unitario).
  const negativos: { filaNum: number; etiqueta: string; valor: number }[] = [];
  for (const f of imputables) for (const campo of noNegativos) {
    const v = Number(f.datos[campo]);
    if (Number.isFinite(v) && v < 0) negativos.push({ filaNum: f.filaNum, etiqueta: etiquetaCol(campo), valor: v });
  }
  const descuadres: { filaNum: number; etiqueta: string; declarado: number; esperado: number }[] = [];
  for (const f of imputables) for (const p of productos) {
    const tot = Number(f.datos[p.resultado]), a = Number(f.datos[p.cantidad]), b = Number(f.datos[p.unitario]);
    if ([tot, a, b].every(Number.isFinite) && a !== 0 && b !== 0 && esDescuadreProducto(tot, a, b))
      descuadres.push({ filaNum: f.filaNum, etiqueta: etiquetaCol(p.resultado), declarado: tot, esperado: Math.round(a * b * 100) / 100 });
  }
  // (3) Fila TOTALIZADORA imputada: su valor equivale a la suma de todas las demás, así que
  //     casi con certeza es el gran total del archivo colado como ítem (duplicaría el módulo).
  const totalizadoras = detectarFilasTotalizadoras(imputables.map((f) => ({ filaNum: f.filaNum, valor: f.valor })));
  // (4) CONTROL DE SUBTOTALES: cada subtotal que trae el archivo (fila `total`) contra la Σ de
  //     los movimientos de su bloque tal como quedan ahora (omitir/rescatar lo recalcula).
  //     Solo informa: no bloquea la carga; el consolidado sale siempre de los movimientos.
  const control = useMemo(
    () => controlSubtotales(efectivas, (f) => f.tipoFila === "movimiento" && f.omitida !== true && !enCero(f as FilaBorradorModulo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [efectivas],
  );
  // Contadores que acompañan al cuadre en el panel: se leen de lo MISMO que se cargará,
  // así que omitir o rescatar filas los mueve junto con la Σ de movimientos.
  const resumenValidacion = { items: imputables.length, sumaMovimientos: total };
  const filasControlDescuadradas = [
    ...control.grupos.filter((g) => g.estado === "descuadre").map((g) => g.filaSubtotal),
    ...(control.granTotal?.estado === "descuadre" ? [control.granTotal.filaNum] : []),
  ];
  const filasConNovedad = new Set([...negativos, ...descuadres, ...totalizadoras].map((n) => n.filaNum).concat(filasControlDescuadradas));
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

  const celda = (f: FilaBorradorModulo, col: Columna) => {
    const v = f.datos[col.nombre];
    if (v == null || v === "") return "—";
    if (col.tipo === "moneda") return fmtContable(Number(v));
    if (col.tipo === "numero") return fmtNum(Number(v));
    return String(v);
  };
  const esNum = (t: string) => t === "moneda" || t === "numero";
  const hayFiltrosColumnas = hayFiltrosDetalleModulo(filtrosColumnas);
  const filasPorColumnas = useMemo(
    () => filtrarFilasDetalleModulo(
      efectivas,
      columnas,
      filtrosColumnas,
      // La celda del clasificador pinta el valor EFECTIVO, no el crudo. El
      // filtro debe consultar exactamente el mismo valor tras reclasificar.
      (fila, columna) => columna.nombre === clasificadorRol
        ? fila.clasificador
        : fila.datos[columna.nombre],
    ),
    [clasificadorRol, columnas, efectivas, filtrosColumnas],
  );

  // Agrupación por clasificador (tipo de inventario) preservando el orden de aparición,
  // con subtotal por grupo (solo movimientos no omitidos) para visualizar qué suma cada tipo.
  const grupos = (() => {
    const orden: string[] = [];
    const m = new Map<string, { filas: typeof efectivas; subtotal: number; items: number }>();
    for (const f of filasPorColumnas) {
      const k = f.clasificador?.trim() || "(sin clasificar)";
      let g = m.get(k);
      if (!g) { g = { filas: [], subtotal: 0, items: 0 }; m.set(k, g); orden.push(k); }
      g.filas.push(f);
      if (f.tipoFila === "movimiento" && f.omitida !== true && !enCero(f)) { g.subtotal += f.valor; g.items += 1; }
    }
    return orden.map((k) => ({ clasificador: k, ...m.get(k)! }));
  })();

  // Vista filtrada de la tabla: por clasificador (chip) o solo novedades (negativos),
  // recalculando el subtotal/ítems de cada grupo con las filas que quedan visibles.
  const recomputeGrupo = (fs: typeof efectivas) => {
    let subtotal = 0, items = 0;
    for (const f of fs) if (f.tipoFila === "movimiento" && f.omitida !== true && !enCero(f)) { subtotal += f.valor; items += 1; }
    return { subtotal, items };
  };
  let baseVista = grupos.map((g) => ({ clasificador: g.clasificador, filas: g.filas }));
  if (filtro === FILTRO_NOVEDADES) baseVista = baseVista.map((g) => ({ ...g, filas: g.filas.filter((f) => filasConNovedad.has(f.filaNum)) }));
  else if (filtro !== null) baseVista = baseVista.filter((g) => g.clasificador === filtro);
  const gruposVista = baseVista.filter((g) => g.filas.length > 0).map((g) => ({ ...g, ...recomputeGrupo(g.filas) }));
  const totalFilasVisibles = gruposVista.reduce((totalVisible, grupo) => totalVisible + grupo.filas.length, 0);

  // Seleccionables = filas visibles que NO están «en cero» (esas no se pueden reclasificar).
  const idsSeleccionablesVista = gruposVista.flatMap((g) => g.filas).filter((f) => !(f.tipoFila !== "agrupadora" && enCero(f))).map((f) => f.filaNum);
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
        <span className="text-ink-600">Cliente: <span className="font-semibold text-ink-800">{cliente}</span> · {imputables.length} filas imputables · total <span className="font-semibold">{fmtContable(total)}</span></span>
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
        <ValidacionArchivo control={control} resumen={resumenValidacion} />
        {negativos.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">⚠ {new Set(negativos.map((n) => n.filaNum)).size} ítem(s) con existencias o costos negativos.</span>
            <span className="ml-1">Filas: {[...new Set(negativos.slice(0, 8).map((n) => `${n.filaNum} (${n.etiqueta})`))].join(", ")}{negativos.length > 8 ? "…" : ""}.</span>
          </div>
        )}
        {descuadres.length > 0 && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            <span className="font-semibold">⚠ {descuadres.length} ítem(s) donde el valor total no cuadra con cantidad × valor unitario.</span>
            <span className="ml-1">Filas: {descuadres.slice(0, 8).map((d) => `${d.filaNum} (esperado ${fmtContable(d.esperado)} vs ${fmtContable(d.declarado)})`).join(", ")}{descuadres.length > 8 ? "…" : ""}.</span>
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
          <button type="button" onClick={() => setFiltro(null)}
            className={`rounded-md border px-3 py-1.5 text-[12px] ${filtro === null ? "border-navy-600 bg-blue-50 font-semibold text-navy-800" : "border-ink-150 bg-ink-50 text-ink-700 hover:bg-ink-100"}`}>
            Todos <span className="text-ink-400">({imputables.length})</span>
          </button>
          {filasConNovedad.size > 0 && (
            <button type="button" onClick={() => setFiltro((f) => (f === FILTRO_NOVEDADES ? null : FILTRO_NOVEDADES))}
              className={`rounded-md border border-err-500 px-3 py-1.5 text-[12px] font-medium text-err-700 ${filtro === FILTRO_NOVEDADES ? "bg-err-100 font-semibold" : "bg-err-100/40 hover:bg-err-100"}`}>
              ⚠ Novedades <span>({filasConNovedad.size})</span>
            </button>
          )}
          {consolidado.map((c) => {
            const activo = filtro === c.clasificador;
            return (
              <button key={c.clasificador} type="button" onClick={() => setFiltro((f) => (f === c.clasificador ? null : c.clasificador))}
                className={`rounded-md border px-3 py-1.5 text-[12px] ${activo ? "border-navy-600 bg-blue-50 font-semibold" : "border-ink-150 bg-ink-50 hover:bg-ink-100"}`}>
                <span className="font-medium text-ink-700">{c.clasificador}</span>{" "}
                <span className="font-semibold text-ink-900">{fmtContable(c.total)}</span>{" "}
                <span className="text-ink-400">({c.filas})</span>
              </button>
            );
          })}
        </div>
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
              <span className="font-semibold text-ink-700">{totalFilasVisibles.toLocaleString("es-CO")}</span>
              {totalFilasVisibles !== efectivas.length ? ` de ${efectivas.length.toLocaleString("es-CO")}` : ""} filas visibles
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hayFiltrosColumnas && (
              <button
                type="button"
                onClick={() => setFiltrosColumnas({})}
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
              >
                Limpiar filtros
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
                      onChange={(e) => setFiltrosColumnas((actuales) => ({ ...actuales, [c.nombre]: e.target.value }))}
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
                    <td className="px-2.5 py-1.5 font-semibold text-navy-800" colSpan={Math.max(1, columnas.length - 1)}>
                      {clasificadorEtiqueta}: {g.clasificador}
                      <span className="ml-2 font-normal text-ink-500">· {g.items} ítems</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-navy-800">{fmtContable(g.subtotal)}</td>
                    <td className="px-2.5 py-1.5" />
                  </tr>
                  {g.filas.map((f) => {
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
                          : undefined;
                    return (
                      <tr key={f.filaNum} title={tituloFila} className={`border-t border-ink-100 ${seleccion.has(f.filaNum) ? "bg-blue-100/60" : neg && !omit ? "bg-err-100" : esAgr || esTot ? "bg-blue-50/50 font-semibold" : ""} ${omit || cero ? "text-ink-300" : neg ? "text-err-700" : esTot ? "text-ink-500" : "text-ink-700"} ${omit ? "line-through" : ""}`}>
                        <td className="px-2.5 py-1.5 text-center">
                          {!cero && <input type="checkbox" checked={seleccion.has(f.filaNum)} onChange={() => toggleSel(f.filaNum)} className="cursor-pointer align-middle" />}
                        </td>
                        <td className="px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                        {columnas.map((c) => (
                          <td key={c.nombre} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "text-right tabular-nums" : ""}`}>
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
                          ) : (
                            <button type="button" onClick={() => toggleOmit(f)} className="ml-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-err-100 hover:text-err-700" title="Omitir / incluir esta fila">
                              {omit ? "Incluir" : "Omitir"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
