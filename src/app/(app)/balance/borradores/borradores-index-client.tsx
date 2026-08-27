"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import {
  PageSizeSelect,
  PaginationControls,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fmt } from "@/lib/format";
import { claveNit } from "@/lib/nit";
import type { VinculoClienteBorrador } from "@/lib/balance/autorizacion-borrador";
import { compararApertura, etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";
import { descartarBorrador } from "@/app/actions/balance";
import { notifySuccess, notifyError } from "@/lib/client-notifications";

export type BorradorRow = {
  loteId: string;
  archivoNombre: string;
  conEncabezado: boolean;
  nitDetectado: string | null;
  cliente: VinculoClienteBorrador;
  periodo: string;
  cuentasMovimiento: number;
  cuadrado: boolean;
  partidaDobleDiff: number;
  /** Apertura DECLARADA en el borrador (`cuenta` | `tercero`); null = aún sin declarar. */
  apertura: string | null;
  cargadoPor: string | null;
  creadoEn: string | null;
  fecha: string;
  hora: string | null;
  /** Posición cronológica dentro de su (cliente, período). 1 si no se agrupa. */
  version: number;
  /** Cuántos borradores vivos comparten ese (cliente, período). */
  versionesGrupo: number;
  /** null = sin cliente o sin período: el borrador no se agrupa con ninguno. */
  claveGrupo: string | null;
};

/** Base compartida de los botones de la columna «Acciones»: todos cuadrados y
 *  del MISMO tamaño, para que la columna quede alineada fila a fila. */
const BOTON_ACCION =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition";

function normalizarBusqueda(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fechaOrdenBorrador(valor: string | null): number {
  if (!valor) return 0;
  const fecha = Date.parse(valor);
  return Number.isFinite(fecha) ? fecha : 0;
}

export type ColumnaOrdenBorrador =
  | "archivo"
  | "cliente"
  | "periodo"
  | "version"
  | "tipo"
  | "cuentas"
  | "estado"
  | "fecha";

export type DireccionOrden = "asc" | "desc";

function nombreClienteOrden(cliente: VinculoClienteBorrador): string {
  if (cliente.tipo === "sin_cliente") return "";
  return cliente.nombre ?? "";
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

/**
 * Orden por defecto: vigentes (cliente asignado) primero; luego los grupos
 * (cliente + período) por su cargue más reciente y, DENTRO de cada grupo, las
 * versiones juntas de la más nueva a la más vieja. Así las versiones de un mismo
 * balance quedan contiguas en vez de repartidas por el listado.
 */
export function ordenarBorradoresListado(
  rows: readonly BorradorRow[],
): BorradorRow[] {
  const tsGrupo = new Map<string, number>();
  for (const r of rows) {
    if (!r.claveGrupo) continue;
    tsGrupo.set(
      r.claveGrupo,
      Math.max(tsGrupo.get(r.claveGrupo) ?? 0, fechaOrdenBorrador(r.creadoEn)),
    );
  }
  const tsOrden = (r: BorradorRow) =>
    (r.claveGrupo ? tsGrupo.get(r.claveGrupo) : undefined) ?? fechaOrdenBorrador(r.creadoEn);

  return [...rows].sort((a, b) => {
    const grupoA = a.cliente.tipo === "asignado" ? 0 : 1;
    const grupoB = b.cliente.tipo === "asignado" ? 0 : 1;
    if (grupoA !== grupoB) return grupoA - grupoB;
    const ts = tsOrden(b) - tsOrden(a);
    if (ts !== 0) return ts;
    if (a.claveGrupo && a.claveGrupo === b.claveGrupo) return b.version - a.version;
    return fechaOrdenBorrador(b.creadoEn) - fechaOrdenBorrador(a.creadoEn);
  });
}

/** Orden explícito por columna (texto A–Z / número o fecha menor–mayor). */
export function ordenarBorradoresPorColumna(
  rows: readonly BorradorRow[],
  columna: ColumnaOrdenBorrador,
  direccion: DireccionOrden,
): BorradorRow[] {
  const dir = direccion === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (columna) {
      case "archivo":
        cmp = compararTexto(a.archivoNombre, b.archivoNombre);
        break;
      case "cliente":
        cmp =
          compararTexto(nombreClienteOrden(a.cliente), nombreClienteOrden(b.cliente))
          || compararTexto(a.nitDetectado ?? "", b.nitDetectado ?? "");
        break;
      case "periodo":
        cmp = compararTexto(a.periodo, b.periodo);
        break;
      case "version":
        cmp = a.version - b.version;
        break;
      case "tipo":
        // Los borradores sin declarar quedan siempre al final (ver `compararApertura`).
        cmp = compararApertura(a.apertura, b.apertura);
        break;
      case "cuentas":
        cmp = a.cuentasMovimiento - b.cuentasMovimiento;
        break;
      case "estado":
        // Texto: Cuadrado / Descuadrado; desempate por magnitud del descuadre.
        cmp =
          compararTexto(
            a.cuadrado ? "Cuadrado" : "Descuadrado",
            b.cuadrado ? "Cuadrado" : "Descuadrado",
          )
          || Math.abs(a.partidaDobleDiff) - Math.abs(b.partidaDobleDiff);
        break;
      case "fecha":
        cmp = fechaOrdenBorrador(a.creadoEn) - fechaOrdenBorrador(b.creadoEn);
        break;
    }
    if (cmp !== 0) return cmp * dir;
    // Desempate estable por fecha reciente y nombre de archivo.
    return (
      fechaOrdenBorrador(b.creadoEn) - fechaOrdenBorrador(a.creadoEn)
      || compararTexto(a.archivoNombre, b.archivoNombre)
    );
  });
}

/** Texto A→Z al primer clic; números y fechas de mayor a menor. */
export function direccionInicialColumna(
  columna: ColumnaOrdenBorrador,
): DireccionOrden {
  return columna === "cuentas" || columna === "fecha" || columna === "version"
    ? "desc"
    : "asc";
}

/** Coincide si el término aparece en archivo, razón social o NIT (con o sin DV). */
export function coincideBusquedaBorrador(
  borrador: Pick<BorradorRow, "archivoNombre" | "cliente" | "nitDetectado">,
  busqueda: string,
): boolean {
  const termino = normalizarBusqueda(busqueda);
  if (!termino) return true;

  const nitBuscado = claveNit(busqueda);
  const nombreCliente = borrador.cliente.tipo === "sin_cliente"
    ? null
    : borrador.cliente.nombre;
  const nitCliente = borrador.cliente.tipo === "sin_cliente"
    ? null
    : borrador.cliente.nit;
  const nitsFila = [borrador.nitDetectado, nitCliente]
    .map((nit) => claveNit(nit ?? ""))
    .filter(Boolean);

  return (
    normalizarBusqueda(borrador.archivoNombre).includes(termino)
    || normalizarBusqueda(nombreCliente).includes(termino)
    || normalizarBusqueda(nitCliente).includes(termino)
    || normalizarBusqueda(borrador.nitDetectado).includes(termino)
    || (
      nitBuscado.length > 0
      && nitsFila.some((nit) => nit.includes(nitBuscado))
    )
  );
}

export function ClienteBorradorCelda({
  cliente,
  nitDetectado,
}: {
  cliente: VinculoClienteBorrador;
  nitDetectado: string | null;
}) {
  if (cliente.tipo === "asignado") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="font-medium text-ink-800">
          {cliente.nombre ?? `Cliente #${cliente.id}`}
        </span>
        {(cliente.nit ?? nitDetectado) && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {cliente.nit ?? nitDetectado}
          </span>
        )}
      </span>
    );
  }

  if (cliente.tipo === "sugerido") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="font-medium text-ink-700">{cliente.nombre}</span>
        <span className="w-fit rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[9.5px] font-semibold text-warn-700">
          Histórico · sugerencia por NIT
        </span>
        <span className="text-[10px] text-warn-700">
          Aún no está asignado
        </span>
        {(nitDetectado ?? cliente.nit) && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {nitDetectado ?? cliente.nit}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className="w-fit rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[10px] font-semibold text-warn-700"
        title="Asignar el cliente es obligatorio: hazlo al abrir el borrador."
      >
        Histórico · sin cliente asignado
      </span>
      {nitDetectado && (
        <span className="font-mono text-[10.5px] text-ink-400">
          NIT detectado: {nitDetectado}
        </span>
      )}
    </span>
  );
}

/** Versión del borrador dentro de su (cliente, período). «—» cuando el lote aún
 *  no tiene cliente o período con qué agruparse. */
export function VersionBorradorCelda({
  version,
  versionesGrupo,
  agrupado,
}: {
  version: number;
  versionesGrupo: number;
  agrupado: boolean;
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
  return (
    <span className="inline-flex items-center gap-1.5">
      <Chip label={`v${version}`} tone={versionesGrupo > 1 ? "blue" : "ink"} />
      {versionesGrupo > 1 && (
        <span
          className="text-[10.5px] text-ink-400"
          title={`${versionesGrupo} borradores del mismo cliente y período`}
        >
          de {versionesGrupo}
        </span>
      )}
    </span>
  );
}

/** Apertura declarada del cargue. «Pendiente» mientras no se responda en el borrador
 *  (es obligatoria para cargarlo) y «—» en los borradores previos a este dato. */
export function TipoBalanceCelda({
  apertura,
  conEncabezado,
}: {
  apertura: string | null;
  conEncabezado: boolean;
}) {
  const valor = parsearApertura(apertura);
  if (valor) {
    return <Chip label={etiquetaApertura(valor)} tone={valor === "tercero" ? "blue" : "ink"} />;
  }
  if (!conEncabezado) {
    return (
      <span className="text-[11px] text-ink-400" title="Borrador recuperado del staging: no tiene encabezado donde registrarlo.">
        —
      </span>
    );
  }
  return (
    <span
      className="w-fit rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[10px] font-semibold text-warn-700"
      title="Sin declarar. Ábrelo y responde si es por cuenta o por terceros: es obligatorio para cargarlo."
    >
      Pendiente
    </span>
  );
}

export default function BorradoresIndexClient({ rows }: { rows: BorradorRow[] }) {
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  /** Borrador cuyo descarte se está confirmando en el modal (null = cerrado). */
  const [confirmar, setConfirmar] = useState<BorradorRow | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [ordenColumna, setOrdenColumna] = useState<ColumnaOrdenBorrador | null>(null);
  const [ordenDir, setOrdenDir] = useState<DireccionOrden>("asc");

  const borradoresOrdenados = useMemo(() => {
    if (!ordenColumna) return ordenarBorradoresListado(rows);
    return ordenarBorradoresPorColumna(rows, ordenColumna, ordenDir);
  }, [rows, ordenColumna, ordenDir]);

  const borradoresFiltrados = useMemo(
    () => borradoresOrdenados.filter(
      (borrador) => coincideBusquedaBorrador(borrador, busqueda),
    ),
    [borradoresOrdenados, busqueda],
  );
  const pg = usePagination(borradoresFiltrados, 50);

  const cambiarOrden = (columna: ColumnaOrdenBorrador) => {
    if (ordenColumna === columna) {
      setOrdenDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setOrdenColumna(columna);
      setOrdenDir(direccionInicialColumna(columna));
    }
    pg.resetToFirstPage();
  };

  const headerOrdenable = (
    label: string,
    columna: ColumnaOrdenBorrador,
    alineacion: "left" | "right" = "left",
  ) => {
    const activo = ordenColumna === columna;
    return (
      <button
        type="button"
        onClick={() => cambiarOrden(columna)}
        className={`inline-flex items-center gap-1 font-semibold transition hover:text-ink-800 ${
          alineacion === "right" ? "ml-auto" : ""
        } ${activo ? "text-ink-800" : "text-ink-500"}`}
        aria-sort={
          activo ? (ordenDir === "asc" ? "ascending" : "descending") : "none"
        }
      >
        <span>{label}</span>
        {activo ? (
          <Icon
            name="chev-d"
            size={12}
            className={ordenDir === "asc" ? "rotate-180" : undefined}
          />
        ) : (
          <span className="inline-flex flex-col leading-none opacity-40" aria-hidden>
            <Icon name="chev-d" size={9} className="rotate-180 -mb-px" />
            <Icon name="chev-d" size={9} className="-mt-px" />
          </span>
        )}
      </button>
    );
  };

  const onDescartar = () => {
    if (!confirmar) return;
    const loteId = confirmar.loteId;
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      // El toast se emite ANTES del refresh y fuera de la lógica de cierre:
      // así el usuario ve la confirmación aunque la lista se vuelva a pintar.
      if (r.ok) {
        notifySuccess(r.message ?? "Borrador descartado.");
        setConfirmar(null);
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo descartar.");
      }
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title="No tienes borradores"
          description="Sube un balance desde «Balance» → «Cargar balance». Tras leerlo, quedará aquí como borrador para revisar antes de cargarlo."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
        <Icon name="search" size={15} />
        <input
          type="text"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar por archivo, NIT o razón social…"
          aria-label="Buscar borradores por archivo, NIT o razón social"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
        />
        {busqueda.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              pg.resetToFirstPage();
            }}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
            className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left">
                <th className="px-3 py-2">{headerOrdenable("Archivo", "archivo")}</th>
                <th className="px-3 py-2">{headerOrdenable("Cliente / NIT", "cliente")}</th>
                <th className="px-3 py-2">{headerOrdenable("Período", "periodo")}</th>
                <th className="px-3 py-2">{headerOrdenable("Versión", "version")}</th>
                <th className="px-3 py-2">{headerOrdenable("Tipo de balance", "tipo")}</th>
                <th className="px-3 py-2 text-right">
                  <div className="flex justify-end">
                    {headerOrdenable("Cuentas", "cuentas", "right")}
                  </div>
                </th>
                <th className="px-3 py-2">{headerOrdenable("Estado", "estado")}</th>
                <th className="px-3 py-2">{headerOrdenable("Fecha", "fecha")}</th>
                <th className="px-3 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((r) => (
                <tr key={r.loteId} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
                  <td className="px-3 py-2">
                    <Link href={`/balance/borradores/${r.loteId}`} className="font-medium text-blue-500 hover:underline">
                      {r.archivoNombre}
                    </Link>
                    {!r.conEncabezado && <span className="block text-[10.5px] text-ink-400">recuperado del staging (relee para el nombre)</span>}
                    {r.cargadoPor && <span className="block text-[10.5px] text-ink-400">por {r.cargadoPor}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    <ClienteBorradorCelda
                      cliente={r.cliente}
                      nitDetectado={r.nitDetectado}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-600">{r.periodo}</td>
                  <td className="px-3 py-2">
                    <VersionBorradorCelda
                      version={r.version}
                      versionesGrupo={r.versionesGrupo}
                      agrupado={r.claveGrupo != null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TipoBalanceCelda apertura={r.apertura} conEncabezado={r.conEncabezado} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{r.cuentasMovimiento}</td>
                  <td className="px-3 py-2">
                    {r.cuadrado ? (
                      <Chip label="Cuadrado" tone="ok" />
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <Chip label="Descuadrado" tone="warn" />
                        <span className="text-[10px] text-warn-700">DB−CR {fmt(r.partidaDobleDiff)}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-ink-500">
                    <span className="block whitespace-nowrap">{r.fecha}</span>
                    {r.hora && <span className="block whitespace-nowrap text-[10px] text-ink-400">{r.hora}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {/* Acciones como iconos cuadrados del MISMO tamaño (BOTON_ACCION):
                        revisar (ojo) y descartar (papelera). El descarte pide
                        confirmación en un modal (ver al final del componente). */}
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/balance/borradores/${r.loteId}`}
                        title="Revisar borrador"
                        aria-label="Revisar borrador"
                        className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                      >
                        <Icon name="eye" size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirmar(r)}
                        title="Descartar borrador"
                        aria-label="Descartar borrador"
                        className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {borradoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    No se encontraron borradores con ese archivo, NIT o razón social.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
          <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
          <div className="flex flex-wrap items-center gap-3">
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
          </div>
        </div>
      </Card>
      <Modal
        open={confirmar !== null}
        onClose={() => {
          if (!descartando) setConfirmar(null);
        }}
        title="Descartar borrador"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              disabled={descartando}
              className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDescartar}
              disabled={descartando}
              className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
            >
              {descartando ? (
                <EstadoProcesando etiqueta="Descartando" />
              ) : (
                <>
                  <Icon name="trash" size={14} /> Descartar borrador
                </>
              )}
            </button>
          </>
        }
      >
        {confirmar && (
          <div className="space-y-4">
            <div className="rounded-lg border border-ink-150 bg-ink-50 px-4 py-3">
              <p className="text-[13px] font-semibold text-ink-800">{confirmar.archivoNombre}</p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {confirmar.cliente.tipo !== "sin_cliente" && confirmar.cliente.nombre
                  ? confirmar.cliente.nombre
                  : confirmar.nitDetectado
                    ? `NIT ${confirmar.nitDetectado}`
                    : "Sin cliente identificado"}
                {confirmar.periodo ? ` · ${confirmar.periodo}` : ""}
                {` · ${confirmar.cuentasMovimiento} cuenta(s)`}
              </p>
            </div>
            <div className="flex gap-2 rounded-lg border border-err-200 bg-err-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-err-800">
              <span className="mt-0.5 shrink-0">
                <Icon name="warn" size={14} />
              </span>
              <p>
                Se eliminará el borrador y su lectura del archivo. Nada se ha guardado como balance
                oficial, así que podrás volver a cargar el archivo cuando quieras. Esta acción no se
                puede deshacer.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
