"use client";

import { useCallback, useState, type MouseEvent } from "react";

const SELECTOR_CONTROL_INTERACTIVO = "button, a, input, select, textarea, label, [role='button']";

function claveFilaDesdeEvento(event: MouseEvent<HTMLTableSectionElement>): string | null {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(SELECTOR_CONTROL_INTERACTIVO)) return null;

  const row = target.closest("tr[data-selection-key]");
  if (!(row instanceof HTMLTableRowElement) || !event.currentTarget.contains(row)) return null;
  return row.dataset.selectionKey ?? null;
}

/** Selección visual local: clic fija una fila y doble clic libera la selección. */
export function useSeleccionFilaTabla() {
  const [filaSeleccionada, setFilaSeleccionada] = useState<string | null>(null);

  const onClickFila = useCallback((event: MouseEvent<HTMLTableSectionElement>) => {
    const clave = claveFilaDesdeEvento(event);
    if (clave != null) setFilaSeleccionada(clave);
  }, []);

  const onDoubleClickFila = useCallback((event: MouseEvent<HTMLTableSectionElement>) => {
    const clave = claveFilaDesdeEvento(event);
    if (clave == null) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    setFilaSeleccionada(null);
  }, []);

  return { filaSeleccionada, onClickFila, onDoubleClickFila };
}
