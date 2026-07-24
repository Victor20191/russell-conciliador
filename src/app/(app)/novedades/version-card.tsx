"use client";

import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { fmtDateTime } from "@/lib/format";
import {
  parsePasos,
  esRutaInternaSegura,
  etiquetaTipo,
  toneDeTipo,
  etiquetaEstadoFuncionalidad,
  toneDeEstadoFuncionalidad,
  etiquetaEstadoVersion,
  toneDeEstadoVersion,
} from "@/lib/novedades/format";
import type { ChangeRow, VersionRow } from "./novedades-client";

// ¿La edición es posterior y significativa frente al alta? (>1 min de diferencia,
// para no marcar como "editado" el desfase del mismo guardado inicial).
function fueEditado(createdAt: string, updatedAt: string): boolean {
  const c = new Date(createdAt).getTime();
  const u = new Date(updatedAt).getTime();
  if (Number.isNaN(c) || Number.isNaN(u)) return false;
  return u - c > 60_000;
}

export function VersionCard({
  version,
  canManage,
  onEdit,
  onDelete,
  onAddChange,
  onEditChange,
  onDeleteChange,
}: {
  version: VersionRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddChange: () => void;
  onEditChange: (change: ChangeRow) => void;
  onDeleteChange: (change: ChangeRow) => void;
}) {
  // Paginación en memoria de los cambios de esta versión (mismo patrón que las
  // tablas de la app: PageSizeSelect + slice + PaginationFooter).
  const pg = usePagination(version.changes, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-navy-700">v{version.number}</span>
            <Chip label={etiquetaEstadoVersion(version.status)} tone={toneDeEstadoVersion(version.status)} />
            {version.releasedAt && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-500">
                <Icon name="calendar" size={12} className="text-ink-400" />
                Publicada el {fmtDateTime(version.releasedAt)}
              </span>
            )}
          </div>
          <h2 className="mt-1 font-serif text-lg text-ink-900">{version.title}</h2>
          {version.summary && (
            <p className="mt-1 max-w-2xl whitespace-pre-line text-[13px] text-ink-600">{version.summary}</p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-x-3 text-[12.5px]">
            <button onClick={onAddChange} className="font-medium text-blue-500 hover:underline">
              Agregar cambio
            </button>
            <button onClick={onEdit} className="text-ink-600 hover:underline">
              Editar
            </button>
            <button onClick={onDelete} className="text-err-700 hover:underline">
              Eliminar
            </button>
          </div>
        )}
      </div>

      {version.changes.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-500">
          Esta versión aún no tiene cambios documentados.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <span className="text-[12px] text-ink-500">
              {pg.total} cambio{pg.total === 1 ? "" : "s"} documentado{pg.total === 1 ? "" : "s"}
            </span>
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
          <ul className="divide-y divide-ink-100">
            {pg.pageItems.map((c) => (
              <li key={c.id} className="px-4 py-4">
                <ChangeItem
                  change={c}
                  canManage={canManage}
                  onEdit={() => onEditChange(c)}
                  onDelete={() => onDeleteChange(c)}
                />
              </li>
            ))}
          </ul>
          <PaginationFooter
            rangeLabel={pg.rangeLabel}
            currentPage={pg.page}
            totalPages={pg.totalPages}
            onPageChange={pg.setPage}
          />
        </>
      )}
    </Card>
  );
}

function ChangeItem({
  change,
  canManage,
  onEdit,
  onDelete,
}: {
  change: ChangeRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pasos = parsePasos(change.howTo);
  // El botón "Probar" solo si la ruta es interna segura y la funcionalidad no es
  // todavía "planeada" (en ese caso la ruta puede no existir aún).
  const mostrarProbar = esRutaInternaSegura(change.route) && change.featureStatus !== "planeada";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip label={etiquetaTipo(change.type)} tone={toneDeTipo(change.type)} />
          <Chip
            label={etiquetaEstadoFuncionalidad(change.featureStatus)}
            tone={toneDeEstadoFuncionalidad(change.featureStatus)}
          />
          <span className="text-[13.5px] font-semibold text-ink-800">{change.title}</span>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-x-3 text-[12px]">
            <button onClick={onEdit} className="text-blue-500 hover:underline">
              Editar
            </button>
            <button onClick={onDelete} className="text-err-700 hover:underline">
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px] text-ink-500">
        <Icon name="calendar" size={12} className="text-ink-400" />
        <span>Aplicado el {fmtDateTime(change.createdAt)}</span>
        {fueEditado(change.createdAt, change.updatedAt) && (
          <span className="text-ink-400">· editado el {fmtDateTime(change.updatedAt)}</span>
        )}
      </div>

      {change.description && (
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-600">
          {change.description}
        </p>
      )}

      {pasos.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Cómo se opera
          </div>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] text-ink-700 marker:text-ink-400">
            {pasos.map((paso, i) => (
              <li key={i}>{paso}</li>
            ))}
          </ol>
        </div>
      )}

      {change.example && (
        <div className="mt-3 rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Ejemplo</div>
          <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-700">{change.example}</p>
        </div>
      )}

      {mostrarProbar && change.route && (
        <Link
          href={change.route}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-700/90"
        >
          Probar funcionalidad
          <Icon name="chev-r" size={13} />
        </Link>
      )}
    </div>
  );
}
