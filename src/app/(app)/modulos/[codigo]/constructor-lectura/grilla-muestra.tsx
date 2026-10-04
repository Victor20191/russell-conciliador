"use client";

// Grilla del archivo original para la lectura por ejemplo: filas con su número real y columnas con
// su letra de Excel. Cada celda se arrastra a un campo o se selecciona (clic o flechas) para
// asignarla desde el panel; la letra de una columna arrastra la columna entera.
import { useMemo, type KeyboardEvent } from "react";
import { marcasEnCelda, type DatoArrastrado } from "@/lib/modulos/asistencia/constructor-estado";
import { INICIAL_ROL, type ModeloUsuarioInventario } from "@/lib/modulos/asistencia/modelo-usuario";
import type { VentanaMuestra } from "@/lib/modulos/asistencia/ventana-muestra";
import { COLOR_ROL, letraColumna, MIME_DATO } from "./estilos";

export type SeleccionGrilla = { tipo: "celda"; fila: number; columna: number } | { tipo: "columna"; columna: number } | { tipo: "fila"; fila: number };

const clave = (fila: number, columna: number) => `${fila}:${columna}`;

export function GrillaMuestra({ ventana, modelo, seleccion, onSeleccion, llena = false }: {
  ventana: VentanaMuestra;
  modelo: ModeloUsuarioInventario;
  seleccion: SeleccionGrilla | null;
  onSeleccion: (s: SeleccionGrilla) => void;
  /** En pantalla completa la grilla toma todo el alto disponible en vez del tope de la vista normal. */
  llena?: boolean;
}) {
  const columnas = useMemo(() => Array.from({ length: ventana.columnas }, (_, i) => i + 1 + ventana.columnaInicial), [ventana.columnas, ventana.columnaInicial]);
  // Lo que la lectura en curso reconoce en este tramo: filas de producto/total, celdas leídas y problemas.
  const lectura = useMemo(() => {
    const filas = new Map<number, "registro" | "total" | "subtotal">();
    const celdas = new Set<string>();
    const problemasCelda = new Map<string, string>();
    const problemasFila = new Map<number, string>();
    for (const t of ventana.lectura?.trazas ?? []) {
      for (const f of t.filasOrigen) if (!filas.has(f) || t.tipo !== "registro") filas.set(f, t.tipo);
      for (const c of t.campos) for (const f of c.fuentes) celdas.add(clave(f.fila, f.columna));
    }
    for (const i of ventana.lectura?.incidencias ?? []) {
      if (i.columna != null) { if (!problemasCelda.has(clave(i.fila, i.columna))) problemasCelda.set(clave(i.fila, i.columna), i.mensaje); }
      else if (!problemasFila.has(i.fila)) problemasFila.set(i.fila, i.mensaje);
    }
    return { filas, celdas, problemasCelda, problemasFila };
  }, [ventana.lectura]);
  const ignoradas = useMemo(() => new Set(modelo.ignorarFilas.map((f) => f.fila)), [modelo.ignorarFilas]);
  const columnasIgnoradas = useMemo(() => new Set(modelo.ignorarColumnas.map((c) => c.columna)), [modelo.ignorarColumnas]);
  const inicios = useMemo(() => new Map(modelo.productos.flatMap((p, i) => p.filaInicio ? [[p.filaInicio, i] as const] : [])), [modelo.productos]);

  const arrastrar = (e: React.DragEvent, dato: DatoArrastrado) => {
    e.dataTransfer.setData(MIME_DATO, JSON.stringify(dato));
    e.dataTransfer.setData("text/plain", dato.tipo === "celda" ? dato.texto : letraColumna(dato.columna));
    e.dataTransfer.effectAllowed = "copy";
  };

  // Flechas mueven la celda seleccionada dentro del tramo visible.
  const mover = (e: KeyboardEvent<HTMLTableElement>) => {
    if (seleccion?.tipo !== "celda" || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const filas = ventana.filas.map((f) => f.fila);
    const fi = filas.indexOf(seleccion.fila);
    const ci = columnas.indexOf(seleccion.columna);
    const fila = filas[Math.min(filas.length - 1, Math.max(0, fi + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0)))];
    const columna = columnas[Math.min(columnas.length - 1, Math.max(0, ci + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)))];
    if (fila != null && columna != null) {
      // En el borde la flecha no cambia de celda: no se reenvía (un clic sobre lo elegido deselecciona).
      if (fila !== seleccion.fila || columna !== seleccion.columna) onSeleccion({ tipo: "celda", fila, columna });
      requestAnimationFrame(() => document.getElementById(`celda-muestra-${fila}-${columna}`)?.focus());
    }
  };

  return (
    <div className={`overflow-auto rounded-md border border-ink-150 bg-white ${llena ? "max-h-[60vh] @5xl:max-h-none @5xl:min-h-0 @5xl:flex-1" : "max-h-[24rem] @5xl:max-h-[32rem]"}`}>
      <table role="grid" aria-label={`Hoja ${ventana.hoja} del archivo`} onKeyDown={mover} className="min-w-full border-separate border-spacing-0 text-[11.5px]">
        <thead className="sticky top-0 z-20 bg-ink-50">
          <tr>
            <th scope="col" className="sticky left-0 z-30 min-w-[3rem] border-b border-r border-ink-150 bg-ink-50 px-2 py-1 text-right font-medium text-ink-500">Fila</th>
            {columnas.map((columna) => {
              const elegida = seleccion?.tipo === "columna" && seleccion.columna === columna;
              const mapeada = modelo.columnas.find((c) => c.columna === columna);
              return (
                <th key={columna} scope="col" className={`border-b border-r border-ink-150 p-0 font-medium ${columnasIgnoradas.has(columna) ? "bg-ink-100 text-ink-400" : ""}`}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => arrastrar(e, { tipo: "columna", columna })}
                    onClick={() => onSeleccion({ tipo: "columna", columna })}
                    aria-pressed={elegida}
                    title={`Columna ${letraColumna(columna)}: arrástrala a un campo para leerla entera, o selecciónala.`}
                    className={`flex w-full min-w-[4rem] items-center justify-center gap-1 px-2 py-1 hover:bg-blue-50 ${elegida ? "bg-blue-100 text-navy-800" : "text-ink-600"}`}
                  >
                    {letraColumna(columna)}
                    {mapeada && <span className={`rounded border px-1 text-[10px] ${COLOR_ROL[mapeada.rol]}`}>{INICIAL_ROL[mapeada.rol]}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ventana.filas.map(({ fila, celdas }) => {
            const tipoLeido = lectura.filas.get(fila);
            const problemaFila = lectura.problemasFila.get(fila);
            const ignorada = ignoradas.has(fila);
            const fondo = ignorada ? "bg-ink-50 text-ink-400 line-through" : tipoLeido === "registro" ? "bg-blue-100/70" : tipoLeido ? "bg-ok-100" : "";
            const filaElegida = seleccion?.tipo === "fila" && seleccion.fila === fila;
            return (
              <tr key={fila} className={fondo}>
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-ink-150 bg-inherit p-0 text-right font-normal">
                  <button
                    type="button"
                    onClick={() => onSeleccion({ tipo: "fila", fila })}
                    aria-pressed={filaElegida}
                    title={problemaFila ?? "Selecciona la fila para marcar el inicio de un producto o ignorarla."}
                    className={`flex w-full items-center justify-end gap-1 bg-ink-50 px-2 py-1 tabular-nums hover:bg-blue-50 ${filaElegida ? "bg-blue-100 text-navy-800" : problemaFila ? "text-err-700" : "text-ink-500"}`}
                  >
                    {inicios.has(fila) && <span className="rounded bg-navy-700 px-1 text-[9.5px] font-semibold text-white" title={`Inicio del producto ${inicios.get(fila)! + 1}`}>P{inicios.get(fila)! + 1}</span>}
                    {problemaFila && <span aria-hidden className="text-err-600">●</span>}
                    {fila}
                  </button>
                </th>
                {columnas.map((columna, i) => {
                  const celda = celdas[i] ?? { t: "" };
                  const marcas = celda.t ? marcasEnCelda(modelo, fila, columna) : [];
                  const problema = lectura.problemasCelda.get(clave(fila, columna));
                  const elegida = seleccion?.tipo === "celda" && seleccion.fila === fila && seleccion.columna === columna;
                  const leida = lectura.celdas.has(clave(fila, columna));
                  return (
                    <td
                      key={columna}
                      id={`celda-muestra-${fila}-${columna}`}
                      role="gridcell"
                      tabIndex={elegida || (!seleccion && fila === ventana.filas[0]?.fila && i === 0) ? 0 : -1}
                      aria-selected={elegida}
                      draggable={!!celda.t}
                      onDragStart={(e) => arrastrar(e, { tipo: "celda", fila, columna, texto: celda.t })}
                      onClick={() => onSeleccion({ tipo: "celda", fila, columna })}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeleccion({ tipo: "celda", fila, columna }); } }}
                      title={problema ?? (celda.t || undefined)}
                      className={`max-w-[16rem] cursor-pointer border-b border-r border-ink-100 px-2 py-1 align-top outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 ${elegida ? "bg-blue-100 ring-2 ring-inset ring-navy-600" : ""} ${problema && !elegida ? "bg-err-100/60 shadow-[inset_0_0_0_2px_var(--color-err-500)]" : ""} ${leida && !elegida ? "text-ink-900" : "text-ink-700"} ${celda.negrita ? "font-semibold" : ""}`}
                    >
                      <div className="flex min-w-0 items-start gap-1">
                        {marcas.length > 0 && (
                          <span className="flex shrink-0 gap-0.5 pt-px">
                            {marcas.map((m, n) => m.tipo === "rol" || m.tipo === "columna"
                              ? <span key={n} className={`rounded border px-1 text-[9.5px] font-semibold ${COLOR_ROL[m.rol]}`} title={m.tipo === "rol" ? `Producto ${m.producto + 1}` : "Columna entera"}>{INICIAL_ROL[m.rol]}{m.tipo === "rol" && modelo.productos.length > 1 ? m.producto + 1 : ""}</span>
                              : <span key={n} className="rounded border border-navy-500 bg-white px-1 text-[9.5px] font-semibold text-navy-700">{m.tipo === "seccion" ? "Sec." : "Σ"}</span>)}
                          </span>
                        )}
                        <span className="line-clamp-2 whitespace-pre-wrap break-words">{celda.t}{celda.truncada ? "…" : ""}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
