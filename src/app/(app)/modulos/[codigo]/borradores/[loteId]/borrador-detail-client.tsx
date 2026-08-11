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
import { aplicarCambiosBorradorModulo, cargarBorradorModulo, descartarBorradorModulo } from "@/app/actions/modulos-datos";

export type FilaBorradorModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
  tipoFila: string;
  omitida: boolean | null;
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
  version,
  hermanos,
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
  version: number | null;
  hermanos: VersionHermanaBorradorModulo[];
}) {
  const router = useRouter();
  const clasificadorEtiqueta = columnas.find((c) => c.nombre === clasificadorRol)?.etiqueta ?? "Tipo";
  const etiquetaCol = (nombre: string) => columnas.find((c) => c.nombre === nombre)?.etiqueta ?? nombre;
  const columnasNumericas = columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
  const [overrideTipo, setOverrideTipo] = useState<Record<number, "agrupadora" | "movimiento">>({});
  const [overrideOmit, setOverrideOmit] = useState<Record<number, boolean>>({});
  const [periodo, setPeriodo] = useState(periodoSugerido);
  const [respuestas, setRespuestas] = useState<Record<string, { respuesta: "si" | "no" | "na"; nota?: string }>>({});
  const [observaciones, setObservaciones] = useState("");
  const [filtro, setFiltro] = useState<string | null>(null); // null = todos · FILTRO_NOVEDADES · o un clasificador
  const [guardando, startGuardar] = useTransition();
  const [cargando, startCargar] = useTransition();
  const [descartando, startDescartar] = useTransition();

  const efectivas = useMemo(
    () =>
      filas.map((f) => ({
        ...f,
        tipoFila: overrideTipo[f.filaNum] ?? f.tipoFila,
        omitida: f.filaNum in overrideOmit ? overrideOmit[f.filaNum] : f.omitida,
      })),
    [filas, overrideTipo, overrideOmit],
  );

  const hayCambiosFilas = Object.keys(overrideTipo).length + Object.keys(overrideOmit).length > 0;
  const periodoCambiado = periodo !== periodoSugerido;
  const hayCambios = hayCambiosFilas || periodoCambiado;
  // Renglón "en cero": todas las columnas numéricas en 0 → NO se lleva al definitivo.
  const enCero = (f: FilaBorradorModulo) => filaEnCero(f.datos, columnasNumericas);
  const imputables = efectivas.filter((f) => f.tipoFila === "movimiento" && f.omitida !== true && !enCero(f));
  const total = imputables.reduce((s, f) => s + f.valor, 0);
  const consolidado = consolidarPorClasificador(imputables.map((f) => ({ clasificador: f.clasificador, valor: f.valor, tipoFila: f.tipoFila })));

  const toggleAgrupador = (f: (typeof efectivas)[number]) =>
    setOverrideTipo((p) => ({ ...p, [f.filaNum]: f.tipoFila === "agrupadora" ? "movimiento" : "agrupadora" }));
  const toggleOmit = (f: (typeof efectivas)[number]) => setOverrideOmit((p) => ({ ...p, [f.filaNum]: f.omitida !== true }));

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
  const filasConNovedad = new Set([...negativos, ...descuadres].map((n) => n.filaNum));
  const verifCompletas = verificaciones.every((v) => respuestas[v.id]);
  const setResp = (id: string, respuesta: "si" | "no" | "na") => setRespuestas((p) => ({ ...p, [id]: { ...p[id], respuesta } }));
  const setNota = (id: string, nota: string) => setRespuestas((p) => ({ ...p, [id]: { respuesta: p[id]?.respuesta ?? "na", nota } }));

  const guardar = () =>
    startGuardar(async () => {
      const m = new Map<number, { filaNum: number; tipoFila?: string; omitida?: boolean }>();
      for (const [fn, t] of Object.entries(overrideTipo)) m.set(+fn, { ...(m.get(+fn) ?? { filaNum: +fn }), filaNum: +fn, tipoFila: t });
      for (const [fn, o] of Object.entries(overrideOmit)) m.set(+fn, { ...(m.get(+fn) ?? { filaNum: +fn }), filaNum: +fn, omitida: o });
      const r = await aplicarCambiosBorradorModulo(loteId, [...m.values()], periodo);
      if (r.ok) {
        notifySuccess(r.message ?? "Cambios guardados.");
        setOverrideTipo({});
        setOverrideOmit({});
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
      if (r.ok) { notifySuccess("Borrador descartado."); router.push(`/modulos/${moduloCodigo.toLowerCase()}`); }
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

  // Agrupación por clasificador (tipo de inventario) preservando el orden de aparición,
  // con subtotal por grupo (solo movimientos no omitidos) para visualizar qué suma cada tipo.
  const grupos = (() => {
    const orden: string[] = [];
    const m = new Map<string, { filas: typeof efectivas; subtotal: number; items: number }>();
    for (const f of efectivas) {
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

      {/* Novedades: validación automática + checklist de verificación (arriba para que se vea siempre) */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Novedades de la carga</div>

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
        {negativos.length === 0 && descuadres.length === 0 && (noNegativos.length > 0 || productos.length > 0) && (
          <div className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700">✓ Sin negativos ni descuadres de valor.</div>
        )}

        {verificaciones.map((v) => {
          const r = respuestas[v.id]?.respuesta;
          return (
            <div key={v.id} className="flex flex-col gap-1.5 border-t border-ink-100 pt-2.5 first:border-0 first:pt-0">
              <span className="text-[12.5px] text-ink-700">{v.texto}</span>
              <div className="flex flex-wrap items-center gap-2">
                {(["si", "no", "na"] as const).map((op) => (
                  <button key={op} type="button" onClick={() => setResp(v.id, op)}
                    className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${r === op ? "border-navy-600 bg-blue-50 text-navy-800" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
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
        {!verifCompletas && verificaciones.length > 0 && <span className="text-[11.5px] font-medium text-warn-700">Responde todas las verificaciones para poder confirmar.</span>}
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

      {/* Tabla del borrador */}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-2.5 py-2 font-semibold">#</th>
                {columnas.map((c) => (
                  <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNum(c.tipo) ? "text-right" : ""}`}>{c.etiqueta}</th>
                ))}
                <th className="px-2.5 py-2 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gruposVista.map((g) => (
                <Fragment key={g.clasificador}>
                  <tr className="border-t-2 border-ink-200 bg-blue-50/70">
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
                    const omit = f.omitida === true;
                    const cero = !esAgr && enCero(f);
                    const neg = filasConNovedad.has(f.filaNum);
                    return (
                      <tr key={f.filaNum} title={cero ? "Renglón en cero: no se carga al definitivo" : undefined} className={`border-t border-ink-100 ${neg && !omit ? "bg-err-100" : esAgr ? "bg-blue-50/50 font-semibold" : ""} ${omit || cero ? "text-ink-300" : neg ? "text-err-700" : "text-ink-700"} ${omit ? "line-through" : ""}`}>
                        <td className="px-2.5 py-1.5 tabular-nums text-ink-400">{f.filaNum}</td>
                        {columnas.map((c) => (
                          <td key={c.nombre} className={`px-2.5 py-1.5 ${esNum(c.tipo) ? "text-right tabular-nums" : ""}`}>{celda(f, c)}</td>
                        ))}
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-center">
                          <ComentarioAncla tipo="modulos_borrador" entityId={loteRowId} anchor={`fila:${f.filaNum}`} titulo={`Fila ${f.filaNum}${f.datos.referencia ? ` · ${f.datos.referencia}` : ""}`} count={comentarios[`fila:${f.filaNum}`] ?? 0} />
                          {cero ? (
                            <span className="ml-1 text-[10.5px] italic text-ink-400">en cero · no se carga</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => toggleAgrupador(f)} className="ml-1 mr-1 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-blue-50 hover:text-blue-700" title="Marcar como agrupador (subtotal) o volver a movimiento">
                                {esAgr ? "→ Movimiento" : "→ Agrupador"}
                              </button>
                              <button type="button" onClick={() => toggleOmit(f)} className="rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600 hover:bg-err-100 hover:text-err-700" title="Omitir / incluir esta fila">
                                {omit ? "Incluir" : "Omitir"}
                              </button>
                            </>
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
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
          </label>
          <button type="button" disabled={cargando || hayCambios || !verifCompletas} onClick={confirmar} title={hayCambios ? "Guarda o descarta los cambios antes de confirmar" : !verifCompletas ? "Responde las verificaciones" : undefined} className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {cargando ? "Cargando…" : "Confirmar carga"}
          </button>
        </div>
      </Card>
    </div>
  );
}
