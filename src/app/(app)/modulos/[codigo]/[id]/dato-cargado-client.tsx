"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import ComentarioAncla from "@/components/comentario-ancla";
import { guardarConsolidacionModulo, guardarConsolidacionModuloLote } from "@/app/actions/modulos-datos";

export type FilaDetalleVm = { filaNum: number; clasificador: string | null; valor: number; datos: Record<string, string | number | null> };
export type ConsolidadoVm = { clasificador: string; total: number; filas: number; cuenta4: string; nombreCuenta: string | null };
export type NovedadesVm = {
  negativos: { filaNum: number; etiqueta: string; referencia: string | null; valor: number }[];
  descuadres: { filaNum: number; referencia: string | null; etiqueta: string; declarado: number; esperado: number }[];
  observaciones: string | null;
  verificaciones: { texto: string; respuesta: "si" | "no" | "na" | null; nota: string | null }[];
};
type Columna = { nombre: string; etiqueta: string; tipo: string };
type CuentaOpt = { codigo: string; nombre: string };

const etiquetaResp = (r: "si" | "no" | "na" | null) => (r === "si" ? "Sí" : r === "no" ? "No" : r === "na" ? "N/A" : "—");

export default function DatoCargadoClient({
  moduloCodigo,
  encabezadoId,
  comentarios,
  clienteId,
  total,
  columnas,
  clasificadorEtiqueta,
  detalle,
  consolidado,
  novedades,
  cuentas,
  puedeEditar,
}: {
  moduloCodigo: string;
  encabezadoId: number;
  comentarios: Record<string, number>;
  clienteId: number;
  total: number;
  columnas: Columna[];
  clasificadorEtiqueta: string;
  detalle: FilaDetalleVm[];
  consolidado: ConsolidadoVm[];
  novedades: NovedadesVm;
  cuentas: CuentaOpt[];
  puedeEditar: boolean;
}) {
  const [tab, setTab] = useState<"detalle" | "consolidado" | "novedades">("consolidado");
  const filasNovedad = new Set([...novedades.negativos, ...novedades.descuadres].map((n) => n.filaNum));
  const alertas = filasNovedad.size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-ink-150">
        {(["consolidado", "detalle", "novedades"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold ${tab === t ? "border-navy-700 text-navy-700" : "border-transparent text-ink-500 hover:text-ink-700"}`}
          >
            {t === "consolidado" ? "Consolidado" : t === "detalle" ? "Detalle" : "Novedades"}
            {t === "novedades" && alertas > 0 && <span className="ml-1.5 rounded-full bg-err-100 px-1.5 text-[10px] font-bold text-err-700">{alertas}</span>}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-ink-500">Total: <span className="font-semibold text-ink-800">{fmtContable(total)}</span></span>
      </div>

      {tab === "consolidado" ? (
        <ConsolidadoTab moduloCodigo={moduloCodigo} clienteId={clienteId} clasificadorEtiqueta={clasificadorEtiqueta} consolidado={consolidado} cuentas={cuentas} puedeEditar={puedeEditar} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : tab === "detalle" ? (
        <DetalleTab columnas={columnas} clasificadorEtiqueta={clasificadorEtiqueta} detalle={detalle} negativosFilas={filasNovedad} encabezadoId={encabezadoId} comentarios={comentarios} />
      ) : (
        <NovedadesTab novedades={novedades} />
      )}
    </div>
  );
}

const cuenta4Norm = (v: string) => v.replace(/\D/g, "").slice(0, 4);

function valoresInicialesConsolidado(consolidado: ConsolidadoVm[]): Record<string, string> {
  // Prefill: si no hay cuenta guardada y el clasificador ES un código de cuenta
  // (empieza con ≥4 dígitos, p. ej. "14059805"), se propone su prefijo de 4 díg.
  return Object.fromEntries(consolidado.map((c) => {
    const digitos = c.clasificador.replace(/\D/g, "");
    const sugerida = !c.cuenta4 && digitos.length >= 4 ? digitos.slice(0, 4) : c.cuenta4;
    return [c.clasificador, sugerida];
  }));
}

function ConsolidadoTab({
  moduloCodigo,
  clienteId,
  clasificadorEtiqueta,
  consolidado,
  cuentas,
  puedeEditar,
  encabezadoId,
  comentarios,
}: {
  moduloCodigo: string;
  clienteId: number;
  clasificadorEtiqueta: string;
  consolidado: ConsolidadoVm[];
  cuentas: CuentaOpt[];
  puedeEditar: boolean;
  encabezadoId: number;
  comentarios: Record<string, number>;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(() => valoresInicialesConsolidado(consolidado));
  // Último estado persistido (para marcar filas sucias y «Guardar todos»).
  const [guardados, setGuardados] = useState<Record<string, string>>(() =>
    Object.fromEntries(consolidado.map((c) => [c.clasificador, c.cuenta4 ?? ""])),
  );
  const [guardandoClave, setGuardandoClave] = useState<string | null>(null);
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  const [, startGuardar] = useTransition();
  const nombrePorCuenta = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c.nombre])), [cuentas]);

  const filasSucias = useMemo(() => {
    return consolidado.filter((c) => {
      const actual = cuenta4Norm(valores[c.clasificador] ?? "");
      const previo = cuenta4Norm(guardados[c.clasificador] ?? "");
      return actual !== previo;
    });
  }, [consolidado, valores, guardados]);

  const haySucias = filasSucias.length > 0;
  const ocupado = guardandoClave != null || guardandoTodo;

  const marcarGuardadas = (filas: { clasificador: string; cuenta4: string }[]) => {
    setGuardados((prev) => {
      const next = { ...prev };
      for (const f of filas) next[f.clasificador] = f.cuenta4;
      return next;
    });
    setValores((prev) => {
      const next = { ...prev };
      for (const f of filas) next[f.clasificador] = f.cuenta4;
      return next;
    });
  };

  const guardar = (clasificador: string) => {
    const cuenta4 = cuenta4Norm(valores[clasificador] ?? "");
    if (cuenta4.length !== 4) { notifyError("La cuenta debe ser de 4 dígitos."); return; }
    setGuardandoClave(clasificador);
    startGuardar(async () => {
      const r = await guardarConsolidacionModulo({ clienteId, moduloCodigo, clasificador, cuenta4 });
      setGuardandoClave(null);
      if (r.ok) {
        marcarGuardadas([{ clasificador, cuenta4 }]);
        notifySuccess(r.message ?? "Consolidación guardada.");
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo guardar.");
      }
    });
  };

  const guardarTodos = () => {
    if (filasSucias.length === 0) {
      notifyError("No hay cambios para guardar.");
      return;
    }
    const filas = filasSucias.map((c) => ({
      clasificador: c.clasificador,
      cuenta4: cuenta4Norm(valores[c.clasificador] ?? ""),
    }));
    const incompletas = filas.filter((f) => f.cuenta4.length !== 4);
    if (incompletas.length > 0) {
      notifyError(`${incompletas.length} fila(s) sin cuenta de 4 dígitos. Complétalas o revierte el cambio.`);
      return;
    }
    setGuardandoTodo(true);
    startGuardar(async () => {
      const r = await guardarConsolidacionModuloLote({ clienteId, moduloCodigo, filas });
      setGuardandoTodo(false);
      if (r.ok) {
        marcarGuardadas(filas);
        notifySuccess(r.message ?? "Consolidaciones guardadas.");
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudieron guardar los cambios.");
      }
    });
  };

  return (
    <Card className="p-0">
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
          <p className="text-[11.5px] text-ink-500">
            {haySucias
              ? `${filasSucias.length} cambio${filasSucias.length === 1 ? "" : "s"} sin guardar`
              : "Sin cambios pendientes"}
          </p>
          <button
            type="button"
            disabled={!haySucias || ocupado}
            onClick={guardarTodos}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardandoTodo ? "Guardando…" : `Guardar todos${haySucias ? ` (${filasSucias.length})` : ""}`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">{clasificadorEtiqueta}</th>
              <th className="px-3 py-2 text-right font-semibold">Filas</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Cuenta (4 díg)</th>
              <th className="px-3 py-2 text-center font-semibold">💬</th>
            </tr>
          </thead>
          <tbody>
            {consolidado.map((c) => {
              const cuentaActual = cuenta4Norm(valores[c.clasificador] ?? "");
              const nombre = cuentaActual.length === 4 ? nombrePorCuenta.get(cuentaActual) ?? c.nombreCuenta : null;
              const sinCuenta = cuentaActual.length !== 4;
              const sucia = cuentaActual !== cuenta4Norm(guardados[c.clasificador] ?? "");
              const guardandoEsta = guardandoClave === c.clasificador;
              return (
                <tr key={c.clasificador} className={`border-t border-ink-100 ${sucia ? "bg-warn-100/20" : ""}`}>
                  <td className="px-3 py-2 font-medium text-ink-800">{c.clasificador}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-500">{c.filas}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-800">{fmtContable(c.total)}</td>
                  <td className="px-3 py-2">
                    {puedeEditar ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <input
                          list="cuentas4-modulo"
                          value={valores[c.clasificador] ?? ""}
                          onChange={(e) => setValores((p) => ({ ...p, [c.clasificador]: e.target.value }))}
                          placeholder="1435"
                          inputMode="numeric"
                          className={`w-24 rounded-md border bg-white px-2 py-1 text-[12px] tabular-nums text-ink-700 outline-none focus:border-blue-400 ${
                            sucia ? "border-warn-500" : "border-ink-200"
                          }`}
                        />
                        <button
                          type="button"
                          disabled={ocupado || !sucia || sinCuenta}
                          onClick={() => guardar(c.clasificador)}
                          className="rounded-md border border-ok-500 bg-ok-100/40 px-2 py-1 text-[11px] font-semibold text-ok-700 hover:bg-ok-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {guardandoEsta ? "…" : "Guardar"}
                        </button>
                        {nombre ? (
                          <span className="text-[11.5px] text-ink-500">{nombre}</span>
                        ) : sinCuenta ? (
                          <span className="text-[11.5px] font-medium text-warn-700">sin cuenta</span>
                        ) : null}
                        {sucia && !sinCuenta && (
                          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-warn-700">sin guardar</span>
                        )}
                      </div>
                    ) : c.cuenta4 ? (
                      <span className="text-ink-700">{c.cuenta4}{c.nombreCuenta ? <span className="text-ink-500"> · {c.nombreCuenta}</span> : null}</span>
                    ) : (
                      <span className="text-[11.5px] font-medium text-warn-700">sin cuenta</span>
                    )}
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
      <datalist id="cuentas4-modulo">
        {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
      </datalist>
    </Card>
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
  const grupos = useMemo(() => {
    const orden: string[] = [];
    const m = new Map<string, { filas: FilaDetalleVm[]; subtotal: number }>();
    for (const f of detalle) {
      const k = f.clasificador?.trim() || "(sin clasificar)";
      let g = m.get(k);
      if (!g) { g = { filas: [], subtotal: 0 }; m.set(k, g); orden.push(k); }
      g.filas.push(f);
      g.subtotal += f.valor;
    }
    return orden.map((k) => ({ clasificador: k, ...m.get(k)! }));
  }, [detalle]);
  return (
    <Card className="p-0">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-2.5 py-2 font-semibold">#</th>
              {columnas.map((c) => (
                <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNum(c.tipo) ? "text-right" : ""}`}>{c.etiqueta}</th>
              ))}
              <th className="px-2.5 py-2 text-center font-semibold">💬</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.clasificador}>
                <tr className="border-t-2 border-ink-200 bg-blue-50/70">
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

function NovedadesTab({ novedades }: { novedades: NovedadesVm }) {
  return (
    <div className="flex flex-col gap-4">
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
