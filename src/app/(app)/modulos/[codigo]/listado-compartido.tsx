"use client";

// Piezas compartidas por los listados de un módulo: la tabla de borradores
// (`borradores/borradores-modulo-client.tsx`) y los datos cargados
// (`modulos-datos-client.tsx`). Son puramente de presentación: buscador,
// encabezados ordenables, celdas y el hook que filtra/ordena/pagina.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  usePagination,
  type PageSize,
} from "@/components/pagination-controls";
import { Chip } from "@/components/ui";
import {
  coincideBusquedaModulo,
  direccionInicialColumnaModulo,
  ordenarFilasModulo,
  type ColumnaOrdenModulo,
  type DireccionOrden,
  type FilaListadoModulo,
} from "@/lib/modulos/listado";

export type OnConversar = (c: { tipo: string; entityId: number; titulo: string }) => void;

/** Buscador de los listados del módulo (archivo, NIT, razón social o período). */
export function BuscadorListado({ busqueda, setBusqueda }: { busqueda: string; setBusqueda: (v: string) => void }) {
  return (
    <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
      <Icon name="search" size={15} />
      <input
        type="text"
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
        placeholder="Buscar por archivo, NIT, razón social o período…"
        aria-label="Buscar por archivo, NIT, razón social o período"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
      />
      {busqueda.length > 0 && (
        <button
          type="button"
          onClick={() => setBusqueda("")}
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
          className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/** Base compartida de los botones de la columna «Acciones»: todos cuadrados y
 *  del MISMO tamaño, para que la columna quede alineada fila a fila. */
export const BOTON_ACCION =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition";

export const etiquetaOrigen = (origen: string | null): string => {
  if (origen === "perfil") return "Perfil guardado";
  if (origen === "manual") return "Mapeo manual";
  if (origen === "ia") return "Sugerencia automática";
  return "Origen no registrado";
};

export function BadgeComentarios({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-600"
      title={`${n} comentario(s)`}
    >
      💬 {n}
    </span>
  );
}

/** Razón social + NIT, en dos renglones (igual que el listado de borradores). */
export function ClienteCelda({ nombre, nit, href }: { nombre: string; nit: string | null; href?: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      {href ? (
        <Link href={href} className="font-medium text-ink-800 hover:text-blue-500 hover:underline">
          {nombre}
        </Link>
      ) : (
        <span className="font-medium text-ink-800">{nombre}</span>
      )}
      {nit && <span className="font-mono text-[10.5px] text-ink-400">{nit}</span>}
    </span>
  );
}

/** Versión dentro de su (cliente, período). «—» cuando aún no se agrupa. */
export function VersionCelda({
  version,
  versiones,
  agrupado,
  href,
}: {
  version: number;
  versiones: number;
  agrupado: boolean;
  href?: string;
}) {
  if (!agrupado) {
    return (
      <span
        className="text-[11px] text-ink-400"
        title="Sin cliente o sin período: aún no se agrupa con otras versiones."
      >
        —
      </span>
    );
  }
  const conteo = `de ${versiones}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Chip label={`v${version}`} tone={versiones > 1 ? "blue" : "ink"} />
      {versiones > 1 && (
        href ? (
          <Link
            href={href}
            className="text-[10.5px] text-blue-500 hover:underline"
            title={`Ver las ${versiones} versiones del período`}
          >
            {conteo}
          </Link>
        ) : (
          <span
            className="text-[10.5px] text-ink-400"
            title={`${versiones} cargues del mismo cliente y período`}
          >
            {conteo}
          </span>
        )
      )}
    </span>
  );
}

/** Encabezado ordenable con las flechitas del listado de borradores. */
export function HeaderOrdenable({
  label,
  columna,
  activa,
  direccion,
  onOrdenar,
  alineacion = "left",
}: {
  label: string;
  columna: ColumnaOrdenModulo;
  activa: ColumnaOrdenModulo | null;
  direccion: DireccionOrden;
  onOrdenar: (columna: ColumnaOrdenModulo) => void;
  alineacion?: "left" | "right";
}) {
  const activo = activa === columna;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(columna)}
      className={`inline-flex items-center gap-1 font-semibold transition hover:text-ink-800 ${
        alineacion === "right" ? "ml-auto" : ""
      } ${activo ? "text-ink-800" : "text-ink-500"}`}
      aria-sort={activo ? (direccion === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      {activo ? (
        <Icon name="chev-d" size={12} className={direccion === "asc" ? "rotate-180" : undefined} />
      ) : (
        <span className="inline-flex flex-col leading-none opacity-40" aria-hidden>
          <Icon name="chev-d" size={9} className="rotate-180 -mb-px" />
          <Icon name="chev-d" size={9} className="-mt-px" />
        </span>
      )}
    </button>
  );
}

export function PieTabla({
  rangeLabel,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  rangeLabel: string;
  page: number;
  totalPages: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <span className="text-[12px] text-ink-500">{rangeLabel}</span>
      <div className="flex flex-wrap items-center gap-3">
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}

/** Estado de orden de una tabla (columna + dirección), con el ciclo del listado. */
function useOrdenTabla() {
  const [columna, setColumna] = useState<ColumnaOrdenModulo | null>(null);
  const [direccion, setDireccion] = useState<DireccionOrden>("asc");

  const ordenar = (siguiente: ColumnaOrdenModulo) => {
    if (columna === siguiente) {
      setDireccion((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setColumna(siguiente);
      setDireccion(direccionInicialColumnaModulo(siguiente));
    }
  };

  return { columna, direccion, ordenar };
}

/**
 * Filtra por el buscador de la pantalla y ordena por la columna activa; el orden
 * por defecto (sin columna) es el que ya trae el servidor. Devuelve la página
 * visible, que vuelve a la primera al cambiar la búsqueda o el orden.
 */
export function useListadoModulo<T extends FilaListadoModulo>(rows: T[], busqueda: string) {
  const orden = useOrdenTabla();
  const visibles = useMemo(() => {
    const filtradas = rows.filter((row) => coincideBusquedaModulo(row, busqueda));
    return orden.columna
      ? ordenarFilasModulo(filtradas, orden.columna, orden.direccion)
      : filtradas;
  }, [rows, busqueda, orden.columna, orden.direccion]);
  const pg = usePagination(visibles, 50);

  // `setPage` viene de useState (identidad estable), así que el efecto solo se
  // dispara cuando cambian de verdad la búsqueda o el orden.
  const { setPage } = pg;
  useEffect(() => {
    setPage(1);
  }, [busqueda, orden.columna, orden.direccion, setPage]);

  return { ...pg, visibles, orden };
}
