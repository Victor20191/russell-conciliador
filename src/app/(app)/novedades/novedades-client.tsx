"use client";

import { useState } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { ordenarVersiones } from "@/lib/novedades/format";
import { VersionCard } from "./version-card";
import { VersionForm, DeleteVersionForm } from "./version-form";
import { ChangeForm, DeleteChangeForm } from "./change-form";
import { ReporteFuncionalNovedades } from "./reporte-funcional";

export type ChangeRow = {
  id: number;
  versionId: number;
  type: string;
  title: string;
  description: string;
  moduleKey: string | null;
  route: string | null;
  howTo: string | null;
  example: string | null;
  featureStatus: string;
  order: number;
  createdAt: string; // ISO — cuándo se aplicó (documentó) el cambio
  updatedAt: string; // ISO — última edición del cambio
};

export type VersionRow = {
  id: number;
  number: string;
  title: string;
  summary: string | null;
  status: string;
  releasedAt: string | null; // ISO
  createdAt: string; // ISO — cuándo se registró la versión
  order: number;
  changes: ChangeRow[];
};

const BTN_PRIMARIO =
  "rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700/90 disabled:opacity-60";

type VersionModal = { mode: "create" } | { mode: "edit"; version: VersionRow };

export default function NovedadesClient({
  versions,
  canManage,
}: {
  versions: VersionRow[];
  canManage: boolean;
}) {
  const [versionModal, setVersionModal] = useState<VersionModal | null>(null);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<VersionRow | null>(null);
  const [changeModal, setChangeModal] = useState<{ versionId: number; change: ChangeRow | null } | null>(null);
  const [deleteChangeTarget, setDeleteChangeTarget] = useState<ChangeRow | null>(null);

  const ordenadas = ordenarVersiones(versions);
  const totalCambios = versions.reduce((acc, v) => acc + v.changes.length, 0);
  // Paginación en memoria del timeline (mismo patrón que las tablas de la app).
  // `versions` se mantiene completo para el selector de versiones del formulario
  // de cambios y para los totales del reporte; solo se pagina lo que se renderiza.
  const pg = usePagination(ordenadas, 50);

  return (
    <div>
      <PageHeader
        title="Novedades"
        subtitle="Cambios, nuevas funcionalidades y control de versiones de la plataforma."
        actions={
          canManage ? (
            <button onClick={() => setVersionModal({ mode: "create" })} className={BTN_PRIMARIO}>
              Nueva versión
            </button>
          ) : undefined
        }
      />

      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-ink-600">
        Aquí encuentras qué se ha construido en la plataforma, organizado por versión. Cada cambio
        explica <strong>qué es</strong>, <strong>cómo se opera</strong> y trae un ejemplo; cuando aplica,
        el botón «Probar funcionalidad» te lleva directo a la ruta para usarla.
      </p>

      <ReporteFuncionalNovedades
        versions={ordenadas.map((v) => ({
          id: v.id,
          number: v.number,
          title: v.title,
          changesCount: v.changes.length,
          releasedAt: v.releasedAt,
          createdAt: v.createdAt,
        }))}
        totalVersions={versions.length}
        totalChanges={totalCambios}
      />

      {ordenadas.length === 0 ? (
        <Card>
          <EmptyState
            icon="bell"
            title="Aún no hay novedades"
            description={
              canManage
                ? "Crea la primera versión para empezar a documentar los cambios de la plataforma."
                : "Pronto verás aquí los cambios y nuevas funcionalidades."
            }
            action={
              canManage ? (
                <button onClick={() => setVersionModal({ mode: "create" })} className={BTN_PRIMARIO}>
                  Nueva versión
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-ink-500">{pg.rangeLabel} versiones</span>
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
          <div className="flex flex-col gap-5">
            {pg.pageItems.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                canManage={canManage}
                onEdit={() => setVersionModal({ mode: "edit", version: v })}
                onDelete={() => setDeleteVersionTarget(v)}
                onAddChange={() => setChangeModal({ versionId: v.id, change: null })}
                onEditChange={(c) => setChangeModal({ versionId: c.versionId, change: c })}
                onDeleteChange={(c) => setDeleteChangeTarget(c)}
              />
            ))}
          </div>
          {pg.totalPages > 1 && (
            <Card className="mt-5">
              <PaginationFooter
                rangeLabel={pg.rangeLabel}
                currentPage={pg.page}
                totalPages={pg.totalPages}
                onPageChange={pg.setPage}
              />
            </Card>
          )}
        </>
      )}

      {versionModal && (
        <VersionForm
          mode={versionModal.mode}
          version={versionModal.mode === "edit" ? versionModal.version : undefined}
          onClose={() => setVersionModal(null)}
        />
      )}
      {deleteVersionTarget && (
        <DeleteVersionForm version={deleteVersionTarget} onClose={() => setDeleteVersionTarget(null)} />
      )}
      {changeModal && (
        <ChangeForm
          versions={versions}
          versionId={changeModal.versionId}
          change={changeModal.change}
          onClose={() => setChangeModal(null)}
        />
      )}
      {deleteChangeTarget && (
        <DeleteChangeForm change={deleteChangeTarget} onClose={() => setDeleteChangeTarget(null)} />
      )}
    </div>
  );
}
