"use client";

// Pestaña «Borradores» de un módulo (`/modulos/[codigo]/borradores`): mismo
// listado que Balance Borrador —buscador, encabezados ordenables, chips de
// estado, acciones y pie paginado—. Los datos cargados viven en `/modulos/[codigo]`.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import ConversacionesEntidad from "@/components/conversaciones-entidad";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { type ColumnaOrdenModulo, type FilaListadoModulo } from "@/lib/modulos/listado";
import { descartarBorradorModulo } from "@/app/actions/modulos-datos";
import {
  BOTON_ACCION,
  BadgeComentarios,
  BuscadorListado,
  ClienteCelda,
  HeaderOrdenable,
  PieTabla,
  VersionCelda,
  etiquetaOrigen,
  useListadoModulo,
  type OnConversar,
} from "../listado-compartido";

export type BorradorModuloRow = FilaListadoModulo & {
  loteId: string;
  /** Id numérico del lote: ancla de los comentarios del borrador. */
  loteRowId: number;
  archivoNombre: string;
  versionesGrupo: number;
  /** null = sin cliente o sin período: el borrador no se agrupa con ninguno. */
  claveGrupo: string | null;
  /** Filas de movimiento omitidas a mano en el borrador. */
  omitidas: number;
  origen: string | null;
  cargadoPor: string | null;
  fecha: string;
  hora: string | null;
  comentarios: number;
  /** Cargue al que este borrador se SUMARÁ («Agregar archivo»); null = versiona. */
  anexo: { version: number; periodo: string; vigente: boolean } | null;
};

export default function BorradoresModuloClient({
  moduloCodigo,
  moduloLabel,
  borradores,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  borradores: BorradorModuloRow[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [conversando, setConversando] = useState<{ tipo: string; entityId: number; titulo: string } | null>(null);
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;

  if (borradores.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title={`No hay ${moduloLabel.toLowerCase()} en borrador`}
          description={`Sube el archivo desde la pestaña «Cargados» → «Cargar ${moduloLabel.toLowerCase()}». Tras leerlo, quedará aquí como borrador para revisarlo antes de cargarlo.`}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BuscadorListado busqueda={busqueda} setBusqueda={setBusqueda} />
      </div>

      {conversando && (
        <ConversacionesEntidad
          tipo={conversando.tipo}
          entityId={conversando.entityId}
          titulo={conversando.titulo}
          onClose={() => setConversando(null)}
        />
      )}

      <TablaBorradores rows={borradores} busqueda={busqueda} ruta={ruta} onConversar={setConversando} />
    </div>
  );
}

function TablaBorradores({
  rows,
  busqueda,
  ruta,
  onConversar,
}: {
  rows: BorradorModuloRow[];
  busqueda: string;
  ruta: string;
  onConversar: OnConversar;
}) {
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const { visibles, orden, ...pg } = useListadoModulo(rows, busqueda);

  const onDescartar = (loteId: string) => {
    startDescartar(async () => {
      const r = await descartarBorradorModulo(loteId);
      if (r.ok) notifySuccess(r.message ?? "Borrador descartado.");
      else notifyError(r.message ?? "No se pudo descartar.");
      setConfirmar(null);
      router.refresh();
    });
  };

  const header = (label: string, columna: ColumnaOrdenModulo, alineacion?: "left" | "right") => (
    <HeaderOrdenable
      label={label}
      columna={columna}
      activa={orden.columna}
      direccion={orden.direccion}
      onOrdenar={orden.ordenar}
      alineacion={alineacion}
    />
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 bg-warn-50/60 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
          Borradores por confirmar
        </span>
        <span className="rounded-full bg-warn-100 px-1.5 text-[10px] font-semibold text-warn-700">
          {rows.length}
        </span>
      </div>
      <div className="max-sm:overflow-x-auto">
        <table className="tabla-encabezado-fijo w-full text-[12.5px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-3 py-2">{header("Archivo", "archivo")}</th>
              <th className="px-3 py-2">{header("Cliente / NIT", "cliente")}</th>
              <th className="px-3 py-2">{header("Período", "periodo")}</th>
              <th className="px-3 py-2">{header("Versión", "version")}</th>
              <th className="px-3 py-2 text-right">
                <div className="flex justify-end">{header("Filas", "filas", "right")}</div>
              </th>
              <th className="px-3 py-2 text-right">
                <div className="flex justify-end">{header("Total", "total", "right")}</div>
              </th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2">{header("Fecha", "fecha")}</th>
              <th className="px-3 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((r) => (
              <tr key={r.loteId} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`${ruta}/borradores/${r.loteId}`}
                      className="font-medium text-blue-500 hover:underline"
                    >
                      {r.archivoNombre}
                    </Link>
                    {r.comentarios > 0 && (
                      <button
                        type="button"
                        title="Ver conversaciones"
                        onClick={() =>
                          onConversar({
                            tipo: "modulos_borrador",
                            entityId: r.loteRowId,
                            titulo: `${r.clienteNombre}${r.periodo ? ` · ${r.periodo}` : ""}`,
                          })
                        }
                      >
                        <BadgeComentarios n={r.comentarios} />
                      </button>
                    )}
                  </span>
                  <span className="block text-[10.5px] text-ink-400">{etiquetaOrigen(r.origen)}</span>
                  {r.cargadoPor && <span className="block text-[10.5px] text-ink-400">por {r.cargadoPor}</span>}
                </td>
                <td className="px-3 py-2 text-ink-700">
                  <ClienteCelda nombre={r.clienteNombre} nit={r.clienteNit} />
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-600">{r.periodo ?? "—"}</td>
                <td className="px-3 py-2">
                  <VersionCelda
                    version={r.version}
                    versiones={r.versionesGrupo}
                    agrupado={r.claveGrupo != null}
                  />
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums text-ink-700"
                  title="Filas de movimiento no omitidas"
                >
                  {r.filas}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-800">
                  {fmtContable(r.total)}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex flex-col items-start gap-0.5">
                    <Chip label="Por confirmar" tone="warn" />
                    {r.anexo && (
                      r.anexo.vigente ? (
                        <span
                          className="whitespace-nowrap text-[10px] font-semibold text-navy-700"
                          title={`Al confirmar se SUMA a la v${r.anexo.version} de ${r.anexo.periodo}; no crea versión nueva`}
                        >
                          ↳ Anexo a v{r.anexo.version}
                        </span>
                      ) : (
                        <span
                          className="whitespace-nowrap text-[10px] font-semibold text-err-700"
                          title={`La v${r.anexo.version} de ${r.anexo.periodo} ya no es la vigente: al confirmar se creará una versión nueva`}
                        >
                          ↳ Anexo a v{r.anexo.version} · ya no vigente
                        </span>
                      )
                    )}
                    {r.omitidas > 0 && (
                      <span className="text-[10px] text-warn-700">{r.omitidas} omitida(s)</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-[11px] text-ink-500">
                  <span className="block whitespace-nowrap">{r.fecha}</span>
                  {r.hora && <span className="block whitespace-nowrap text-[10px] text-ink-400">{r.hora}</span>}
                </td>
                <td className="px-3 py-2">
                  {/* Acciones como iconos cuadrados del MISMO tamaño (BOTON_ACCION):
                      revisar (ojo) y descartar (papelera). El descarte pide
                      confirmación en el sitio, con ✓/✕ del mismo tamaño. */}
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`${ruta}/borradores/${r.loteId}`}
                      title="Revisar borrador"
                      aria-label="Revisar borrador"
                      className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                    >
                      <Icon name="eye" size={15} />
                    </Link>
                    {confirmar === r.loteId ? (
                      <>
                        <button
                          onClick={() => onDescartar(r.loteId)}
                          disabled={descartando}
                          title="Confirmar descarte"
                          aria-label="Confirmar descarte"
                          className={`${BOTON_ACCION} border-err-300 bg-err-100 text-err-700 hover:bg-err-200 disabled:opacity-60`}
                        >
                          {descartando ? <EstadoProcesando etiqueta="Descartando" /> : <Icon name="check" size={15} />}
                        </button>
                        <button
                          onClick={() => setConfirmar(null)}
                          title="Cancelar"
                          aria-label="Cancelar descarte"
                          className={`${BOTON_ACCION} border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-ink-800`}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmar(r.loteId)}
                        title="Descartar borrador"
                        aria-label="Descartar borrador"
                        className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                  No se encontraron borradores con ese archivo, NIT, razón social o período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PieTabla
        rangeLabel={pg.rangeLabel}
        page={pg.page}
        totalPages={pg.totalPages}
        pageSize={pg.pageSize}
        onPageChange={pg.setPage}
        onPageSizeChange={pg.setPageSize}
      />
    </Card>
  );
}

