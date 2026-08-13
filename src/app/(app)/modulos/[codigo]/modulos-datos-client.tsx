"use client";

// Índice de un módulo (`/modulos/[codigo]`): mismo listado que Balance Borrador
// —buscador, encabezados ordenables, chips de estado, columna de acciones y pie
// paginado— sobre las dos tablas de la pantalla: borradores por confirmar y datos
// cargados.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  usePagination,
  type PageSize,
} from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import ConversacionesEntidad from "@/components/conversaciones-entidad";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  coincideBusquedaModulo,
  direccionInicialColumnaModulo,
  ordenarFilasModulo,
  type ColumnaOrdenModulo,
  type DireccionOrden,
  type FilaListadoModulo,
} from "@/lib/modulos/listado";
import { descartarBorradorModulo } from "@/app/actions/modulos-datos";
import { CargarModuloButton, type ClienteModulo, type RolModulo } from "./cargar-modulo-modal";

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
};

export type CargadoModuloRow = FilaListadoModulo & {
  id: number;
  esOficial: boolean;
  /** Cuántas versiones existen del mismo (cliente, período). */
  versiones: number;
  origen: string | null;
  cargadoPor: string | null;
  fecha: string;
  hora: string | null;
  comentarios: number;
};

/** Base compartida de los botones de la columna «Acciones»: todos cuadrados y
 *  del MISMO tamaño, para que la columna quede alineada fila a fila. */
const BOTON_ACCION =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition";

const etiquetaOrigen = (origen: string | null): string => {
  if (origen === "perfil") return "Perfil guardado";
  if (origen === "manual") return "Mapeo manual";
  if (origen === "ia") return "Sugerencia automática";
  return "Origen no registrado";
};

function BadgeComentarios({ n }: { n: number }) {
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
function ClienteCelda({ nombre, nit, href }: { nombre: string; nit: string | null; href?: string }) {
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
function VersionCelda({
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
function HeaderOrdenable({
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

function PieTabla({
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
function useListadoModulo<T extends FilaListadoModulo>(rows: T[], busqueda: string) {
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

export default function ModulosDatosClient({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  clientes,
  borradores,
  cargados,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  clientes: ClienteModulo[];
  borradores: BorradorModuloRow[];
  cargados: CargadoModuloRow[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [conversando, setConversando] = useState<{ tipo: string; entityId: number; titulo: string } | null>(null);
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <CargarModuloButton
          moduloCodigo={moduloCodigo}
          moduloLabel={moduloLabel}
          roles={roles}
          clasificadorRol={clasificadorRol}
          clientes={clientes}
        />
      </div>

      {conversando && (
        <ConversacionesEntidad
          tipo={conversando.tipo}
          entityId={conversando.entityId}
          titulo={conversando.titulo}
          onClose={() => setConversando(null)}
        />
      )}

      {borradores.length > 0 && (
        <TablaBorradores
          rows={borradores}
          busqueda={busqueda}
          ruta={ruta}
          onConversar={setConversando}
        />
      )}

      <TablaCargados
        rows={cargados}
        busqueda={busqueda}
        ruta={ruta}
        moduloLabel={moduloLabel}
        onConversar={setConversando}
      />
    </div>
  );
}

type OnConversar = (c: { tipo: string; entityId: number; titulo: string }) => void;

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
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-warn-50/60 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
          Borradores por confirmar
        </span>
        <span className="rounded-full bg-warn-100 px-1.5 text-[10px] font-semibold text-warn-700">
          {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
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
                  <span className="inline-flex flex-col gap-0.5">
                    <Chip label="Por confirmar" tone="warn" />
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

function TablaCargados({
  rows,
  busqueda,
  ruta,
  moduloLabel,
  onConversar,
}: {
  rows: CargadoModuloRow[];
  busqueda: string;
  ruta: string;
  moduloLabel: string;
  onConversar: OnConversar;
}) {
  const { visibles, orden, ...pg } = useListadoModulo(rows, busqueda);

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

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title={`Aún no hay ${moduloLabel.toLowerCase()} cargados`}
          description={`Usa «Cargar ${moduloLabel.toLowerCase()}» para leer el archivo del cliente. Quedará como borrador para revisarlo antes de cargarlo.`}
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {moduloLabel} cargados
        </span>
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">
          {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
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
              <th className="px-3 py-2">{header("Última carga", "fecha")}</th>
              <th className="px-3 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((r) => (
              <tr key={r.id} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
                <td className="max-w-[260px] px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {/* Los cargues antiguos no guardaron el nombre del archivo: ahí el
                        renglón se abre por la razón social o por el ojo de «Acciones». */}
                    {r.archivoNombre ? (
                      <Link
                        href={`${ruta}/${r.id}`}
                        className="truncate font-medium text-blue-500 hover:underline"
                        title={r.archivoNombre}
                      >
                        {r.archivoNombre}
                      </Link>
                    ) : (
                      <span className="text-ink-400" title="Cargue histórico sin nombre de archivo">
                        — sin archivo —
                      </span>
                    )}
                    {r.comentarios > 0 && (
                      <button
                        type="button"
                        title="Ver conversaciones"
                        onClick={() =>
                          onConversar({
                            tipo: "modulos_datos",
                            entityId: r.id,
                            titulo: `${r.clienteNombre} · ${r.periodo} v${r.version}`,
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
                  <ClienteCelda nombre={r.clienteNombre} nit={r.clienteNit} href={`${ruta}/${r.id}`} />
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-600">{r.periodo ?? "—"}</td>
                <td className="px-3 py-2">
                  <VersionCelda
                    version={r.version}
                    versiones={r.versiones}
                    agrupado
                    href={`${ruta}/${r.id}?tab=versiones`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{r.filas}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-800">
                  {fmtContable(r.total)}
                </td>
                <td className="px-3 py-2">
                  {r.esOficial ? (
                    <Chip label="Vigente" tone="ok" />
                  ) : (
                    <Chip label="Histórica" tone="ink" />
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-ink-500">
                  <span className="block whitespace-nowrap">{r.fecha}</span>
                  {r.hora && <span className="block whitespace-nowrap text-[10px] text-ink-400">{r.hora}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`${ruta}/${r.id}`}
                      title={`Ver ${moduloLabel.toLowerCase()} cargados`}
                      aria-label={`Ver ${moduloLabel.toLowerCase()} cargados`}
                      className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                    >
                      <Icon name="eye" size={15} />
                    </Link>
                    <Link
                      href={`${ruta}/${r.id}?tab=versiones`}
                      title="Ver versiones del período"
                      aria-label="Ver versiones del período"
                      className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                    >
                      <Icon name="log" size={15} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                  No se encontraron cargues con ese archivo, NIT, razón social o período.
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
