"use client";

import { flechaOrden, tituloOrden, type DireccionOrden, type OrdenTabla } from "@/lib/modulos/orden-tabla";

/**
 * Encabezado de columna que ordena al pulsarlo (ascendente → descendente → sin orden). La flecha
 * solo aparece en la columna ordenada; el `title` dice qué hará el clic siguiente. Lo comparten
 * las tablas de módulos (borrador, detalle del cargue y Consolidado) para que ordenar se vea y se
 * comporte igual en todas.
 */
export function EncabezadoOrdenable({ etiqueta, columna, orden, onOrdenar, numerica = false, primera = "asc", className = "" }: {
  etiqueta: string;
  /** Clave de la columna, la misma con la que se pide el valor de cada fila. */
  columna: string;
  orden: OrdenTabla;
  onOrdenar: (columna: string) => void;
  numerica?: boolean;
  /** Hacia dónde ordena el primer clic (debe coincidir con el `alternarOrden` de quien ordena). */
  primera?: DireccionOrden;
  className?: string;
}) {
  const flecha = flechaOrden(orden, columna);
  const activa = flecha != null;
  const titulo = tituloOrden(orden, columna, numerica, primera);
  return (
    <button
      type="button"
      onClick={() => onOrdenar(columna)}
      title={titulo}
      aria-label={`${etiqueta}: ${titulo.toLocaleLowerCase("es")}`}
      className={`inline-flex max-w-full items-center gap-1 font-semibold hover:text-blue-700 ${activa ? "text-blue-700" : ""} ${numerica ? "justify-end" : ""} ${className}`}
    >
      <span className="truncate">{etiqueta}</span>
      <span aria-hidden className={`text-[10px] ${activa ? "" : "text-ink-300"}`}>{flecha ?? "↕"}</span>
    </button>
  );
}
