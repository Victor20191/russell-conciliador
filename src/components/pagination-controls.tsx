"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** Opciones del selector "Mostrar" — filas por página. */
export const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const ARROW_BUTTON_CLASS =
  "inline-grid h-9 w-9 place-items-center rounded-md border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-800 disabled:cursor-not-allowed disabled:border-ink-150 disabled:bg-ink-50 disabled:text-ink-300 disabled:shadow-none";
const PAGE_BUTTON_CLASS =
  "inline-grid h-9 min-w-9 place-items-center rounded-md px-2 font-mono text-[12px] font-semibold transition";
const ACTIVE_PAGE_CLASS =
  "bg-navy-700 text-white shadow-sm";
const INACTIVE_PAGE_CLASS =
  "border border-transparent text-ink-500 hover:border-ink-200 hover:bg-ink-50 hover:text-ink-800";

function visiblePages(currentPage: number, totalPages: number) {
  const pageCount = Math.min(5, totalPages);
  let start = Math.max(1, currentPage - 2);
  const endOverflow = start + pageCount - 1 - totalPages;

  if (endOverflow > 0) start = Math.max(1, start - endOverflow);

  return Array.from({ length: pageCount }, (_, index) => start + index);
}

function DoubleChevron({ direction }: { direction: "left" | "right" }) {
  const firstClass = direction === "left" ? "-mr-2" : "";
  const secondClass = direction === "right" ? "-ml-2" : "";

  return (
    <span className="inline-flex items-center" aria-hidden="true">
      <Icon name={direction === "left" ? "chev-l" : "chev-r"} size={13} className={firstClass} />
      <Icon name={direction === "left" ? "chev-l" : "chev-r"} size={13} className={secondClass} />
    </span>
  );
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, currentPage), lastPage);
  const isFirstPage = safePage === 1;
  const isLastPage = safePage === lastPage;
  const pages = visiblePages(safePage, lastPage);

  return (
    <nav className="flex flex-wrap items-center justify-end gap-1.5" aria-label="Paginación">
      <button
        type="button"
        onClick={() => onPageChange(1)}
        disabled={isFirstPage}
        className={ARROW_BUTTON_CLASS}
        aria-label="Ir a la primera página"
        title="Primera página"
      >
        <DoubleChevron direction="left" />
      </button>
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, safePage - 1))}
        disabled={isFirstPage}
        className={ARROW_BUTTON_CLASS}
        aria-label="Ir a la página anterior"
        title="Página anterior"
      >
        <Icon name="chev-l" size={15} />
      </button>
      <div className="mx-1 flex items-center gap-1" aria-live="polite">
        {pages.map((pageNumber) => {
          const active = pageNumber === safePage;

          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`${PAGE_BUTTON_CLASS} ${active ? ACTIVE_PAGE_CLASS : INACTIVE_PAGE_CLASS}`}
              aria-current={active ? "page" : undefined}
              aria-label={`Ir a la página ${pageNumber}`}
            >
              {pageNumber}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(lastPage, safePage + 1))}
        disabled={isLastPage}
        className={ARROW_BUTTON_CLASS}
        aria-label="Ir a la página siguiente"
        title="Página siguiente"
      >
        <Icon name="chev-r" size={15} />
      </button>
      <button
        type="button"
        onClick={() => onPageChange(lastPage)}
        disabled={isLastPage}
        className={ARROW_BUTTON_CLASS}
        aria-label="Ir a la última página"
        title="Última página"
      >
        <DoubleChevron direction="right" />
      </button>
    </nav>
  );
}

/**
 * Paginación en memoria reutilizable para todas las tablas de la app.
 * Recibe el arreglo YA filtrado y devuelve solo la página visible (`pageItems`),
 * de modo que el DOM nunca renderiza más de `pageSize` filas aunque lleguen
 * miles de registros. La página se autoacota si el filtro reduce los resultados.
 *
 * Para reiniciar a la página 1 al cambiar un filtro, llama `resetToFirstPage()`
 * (o `setPage(1)`) desde el handler del filtro.
 */
export function usePagination<T>(items: T[], initialPageSize: PageSize = 50) {
  const [pageSize, setPageSizeState] = useState<PageSize>(initialPageSize);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = items.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);
  const pageItems = items.slice(start, end);
  const rangeLabel =
    items.length === 0 ? "Sin resultados" : `Mostrando ${start + 1}-${end} de ${items.length}`;

  function setPageSize(size: PageSize) {
    setPageSizeState(size);
    setPage(1);
  }

  function resetToFirstPage() {
    setPage(1);
  }

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    resetToFirstPage,
    totalPages,
    pageItems,
    start,
    end,
    total: items.length,
    rangeLabel,
  };
}

/** Selector "Mostrar 50/100/200" para la barra de herramientas de una tabla. */
export function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (size: PageSize) => void;
}) {
  return (
    <label className="ml-auto flex shrink-0 items-center justify-end gap-1.5 text-[12px] font-medium text-ink-500">
      Mostrar
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as PageSize)}
        className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pie de tabla estándar: rango "Mostrando X-Y de Z" + controles de paginación. */
export function PaginationFooter({
  rangeLabel,
  currentPage,
  totalPages,
  onPageChange,
}: {
  rangeLabel: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <div className="text-[12px] text-ink-500">{rangeLabel}</div>
      <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
