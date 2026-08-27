"use client";

// Índice de un módulo (`/modulos/[codigo]`): los datos cargados, agrupados como
// en `/balance` —una tarjeta por cliente y, dentro, una fila por período con su
// conteo de versiones—, de modo que recargar el archivo del mismo cliente y
// período suma una versión al período en vez de agregar otra fila al listado.
// Los borradores por confirmar viven en la pestaña «Borradores»
// (`/modulos/[codigo]/borradores`, ver `borradores/borradores-modulo-client.tsx`).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageSizeSelect, PaginationControls, usePagination } from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import ConversacionesEntidad from "@/components/conversaciones-entidad";
import { fmtContable } from "@/lib/format";
import { archivosDeVersion } from "@/lib/modulos/archivos-carga";
import { filtrarGruposCargaModulo } from "@/lib/modulos/listado";
import { EliminarDatosModuloButton } from "./eliminar-datos-modulo-modal";
import { CargarModuloButton, type ClienteModulo, type RolModulo } from "./cargar-modulo-modal";
import { BOTON_ACCION, BadgeComentarios, BuscadorListado, etiquetaOrigen, type OnConversar } from "./listado-compartido";

/** Un período del cliente, con los datos de la versión que lo representa. */
export type PeriodoModuloRow = {
  periodo: string;
  /** Encabezado que se abre desde la fila (la versión vigente del período). */
  id: number;
  version: number;
  /** Cuántas versiones existen del mismo (cliente, período). */
  versiones: number;
  esOficial: boolean;
  estaCongelado: boolean;
  filas: number;
  total: number;
  archivoNombre: string | null;
  /** Hoja importada del archivo principal (null en cargues previos a su registro). */
  hoja: string | null;
  /** De aquí se derivan los anexos por fraccionamiento (ver `archivosDeVersion`). */
  observaciones: string | null;
  origen: string | null;
  cargadoPor: string | null;
  fecha: string;
  hora: string | null;
  comentarios: number;
  /** Marcas de auditoría del cruce ancladas al período (caen al borrarlo). */
  marcasPeriodo: number;
};

/** Una tarjeta del listado de cargados: el cliente y sus períodos. */
export type GrupoClienteRow = {
  clienteId: number;
  clienteNombre: string;
  clienteNit: string | null;
  /** Cargues del cliente en el módulo, contando TODAS las versiones de cada período. */
  cargasCliente: number;
  /** Perfiles de formato aprendidos del cliente en el módulo. */
  perfilesCliente: number;
  /** Marcas del cruce del cliente en el módulo (todos sus períodos). */
  marcasCliente: number;
  periodos: PeriodoModuloRow[];
};


export default function ModulosDatosClient({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  clientes,
  gruposCargados,
  puedeEliminar,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  clientes: ClienteModulo[];
  gruposCargados: GrupoClienteRow[];
  /** `modulos_datos:eliminar` (solo administradores): pinta la papelera del cargue. */
  puedeEliminar: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [conversando, setConversando] = useState<{ tipo: string; entityId: number; titulo: string } | null>(null);
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BuscadorListado busqueda={busqueda} setBusqueda={setBusqueda} />
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

      <CargadosPorCliente
        grupos={gruposCargados}
        busqueda={busqueda}
        ruta={ruta}
        moduloLabel={moduloLabel}
        onConversar={setConversando}
        puedeEliminar={puedeEliminar}
      />
    </div>
  );
}

function CargadosPorCliente({
  grupos,
  busqueda,
  ruta,
  moduloLabel,
  onConversar,
  puedeEliminar,
}: {
  grupos: GrupoClienteRow[];
  busqueda: string;
  ruta: string;
  moduloLabel: string;
  onConversar: OnConversar;
  puedeEliminar: boolean;
}) {
  // El buscador de la pantalla filtra la tarjeta entera cuando identifica al
  // cliente y, si no, solo los períodos que coinciden.
  const visibles = useMemo(() => filtrarGruposCargaModulo(grupos, busqueda), [grupos, busqueda]);
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, resetToFirstPage]);

  if (grupos.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title={`Aún no hay ${moduloLabel.toLowerCase()} cargados`}
          description={`Usa «Cargar ${moduloLabel.toLowerCase()}» para leer el archivo del cliente. Quedará en la pestaña «Borradores» para revisarlo antes de cargarlo.`}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {moduloLabel} cargados
        </span>
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">
          {grupos.length}
        </span>
        <span className="text-[11px] text-ink-400">
          {grupos.length === 1 ? "1 cliente" : `${grupos.length} clientes`}
        </span>
      </div>

      {visibles.length === 0 && (
        <Card>
          <div className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            No se encontraron cargues con ese archivo, NIT, razón social o período.
          </div>
        </Card>
      )}

      {pg.pageItems.map((grupo) => (
        <Card key={grupo.clienteId}>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <span className="text-ink-400">
              <Icon name="doc" size={16} />
            </span>
            <h2 className="text-[13px] font-semibold text-ink-800">{grupo.clienteNombre}</h2>
            {grupo.clienteNit && (
              <span className="font-mono text-[11px] text-ink-400">{grupo.clienteNit}</span>
            )}
            <span className="ml-auto text-[11px] text-ink-400">
              {grupo.periodos.length === 1 ? "1 período" : `${grupo.periodos.length} períodos`}
            </span>
          </div>
          <div className="max-sm:overflow-x-auto">
            <table className="tabla-encabezado-fijo w-full text-[12.5px]">
              <thead className="bg-ink-50 text-ink-500">
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">Período</th>
                  <th className="px-4 py-2 text-right font-semibold">Versiones</th>
                  <th className="px-4 py-2 font-semibold">Versión vigente</th>
                  <th className="px-4 py-2 font-semibold">Archivo</th>
                  <th className="px-4 py-2 text-right font-semibold">Filas</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Última carga</th>
                  <th className="px-4 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {grupo.periodos.map((p) => {
                  // Archivos que componen la versión vigente: el principal + los anexados
                  // por fraccionamiento. Más de uno = carga fraccionada (se avisa con chip).
                  const archivos = archivosDeVersion(p.archivoNombre, p.hoja, p.observaciones);
                  const anexos = archivos.filter((a) => a.esAnexo);
                  // El principal SIEMPRE existe aunque el cargue legado no guardara su
                  // nombre (por eso 1 + anexos, no `archivos.length`: ahí faltaría uno).
                  const totalArchivos = 1 + anexos.length;
                  return (
                  <tr key={p.periodo} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono font-medium text-ink-800">{p.periodo}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">
                      {/* El conteo abre la bitácora de versiones del período, desde
                          donde se entra a cada cargue (no solo al vigente). */}
                      {p.versiones > 1 ? (
                        <Link
                          href={`${ruta}/${p.id}?tab=versiones`}
                          title={`Ver las ${p.versiones} versiones de ${p.periodo}`}
                          className="text-blue-500 hover:underline"
                        >
                          {p.versiones}
                        </Link>
                      ) : (
                        p.versiones
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.esOficial ? (
                        <Chip label={`v${p.version} vigente`} tone="ok" />
                      ) : (
                        <span title="Ninguna versión del período está marcada como vigente.">
                          <Chip label={`v${p.version}`} tone="ink" />
                        </span>
                      )}
                    </td>
                    <td className="max-w-[280px] px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {/* Los cargues antiguos no guardaron el nombre del archivo: ahí el
                            renglón se abre por «Ver». */}
                        {p.archivoNombre ? (
                          <Link
                            href={`${ruta}/${p.id}`}
                            className="truncate font-medium text-blue-500 hover:underline"
                            title={p.archivoNombre}
                          >
                            {p.archivoNombre}
                          </Link>
                        ) : (
                          <span className="text-ink-400" title="Cargue histórico sin nombre de archivo">
                            — sin archivo —
                          </span>
                        )}
                        {p.hoja && (
                          <span className="text-[10.5px] text-ink-400" title="Hoja importada">
                            · hoja «{p.hoja}»
                          </span>
                        )}
                        {/* AVISO de carga fraccionada: el período no salió de un solo
                            archivo, sino del principal más N anexos. Se destaca aquí
                            porque el detalle de abajo es fácil de pasar por alto. */}
                        {anexos.length > 0 && (
                          <span
                            title={`Carga fraccionada: este período se armó con ${totalArchivos} archivos — ${[
                              p.archivoNombre ?? "archivo principal (sin nombre registrado)",
                              ...anexos.map((a) => a.archivo),
                            ].join(" + ")}.`}
                          >
                            <Chip label={`${totalArchivos} archivos`} tone="warn" />
                          </span>
                        )}
                        {p.comentarios > 0 && (
                          <button
                            type="button"
                            title="Ver conversaciones"
                            onClick={() =>
                              onConversar({
                                tipo: "modulos_datos",
                                entityId: p.id,
                                titulo: `${grupo.clienteNombre} · ${p.periodo} v${p.version}`,
                              })
                            }
                          >
                            <BadgeComentarios n={p.comentarios} />
                          </button>
                        )}
                      </span>
                      {/* Archivos anexados por fraccionamiento (mismo período, misma
                          versión vigente): compactos, uno por línea, con su hoja. */}
                      {anexos.map((anexo, i) => (
                        <span
                          key={`${anexo.archivo}-${i}`}
                          className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-500"
                        >
                          <span className="rounded bg-ink-100 px-1 text-[9.5px] font-medium uppercase tracking-wide text-ink-400">
                            anexo
                          </span>
                          <span className="truncate" title={anexo.archivo}>
                            {anexo.archivo}
                          </span>
                          {anexo.hoja && (
                            <span className="text-[10.5px] text-ink-400">· hoja «{anexo.hoja}»</span>
                          )}
                        </span>
                      ))}
                      <span className="block text-[10.5px] text-ink-400">{etiquetaOrigen(p.origen)}</span>
                      {p.cargadoPor && (
                        <span className="block text-[10.5px] text-ink-400">por {p.cargadoPor}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{p.filas}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-800">
                      {fmtContable(p.total)}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.estaCongelado ? (
                        <Chip label="Congelado" tone="blue" />
                      ) : p.esOficial ? (
                        <Chip label="Vigente" tone="ok" />
                      ) : (
                        <Chip label="Histórica" tone="ink" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-ink-500">
                      <span className="block whitespace-nowrap">{p.fecha}</span>
                      {p.hora && (
                        <span className="block whitespace-nowrap text-[10px] text-ink-400">{p.hora}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* Mismas acciones que el listado de borradores de balance: iconos
                          cuadrados del MISMO tamaño (BOTON_ACCION) —ver el cargue y, para
                          quien puede eliminar, retirarlo con el alcance del modal—. */}
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`${ruta}/${p.id}`}
                          title="Ver cargue"
                          aria-label={`Ver el cargue de ${p.periodo}`}
                          className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                        >
                          <Icon name="eye" size={15} />
                        </Link>
                        {puedeEliminar && (
                          <EliminarDatosModuloButton
                            encabezadoId={p.id}
                            moduloLabel={moduloLabel}
                            clienteNombre={grupo.clienteNombre}
                            periodo={p.periodo}
                            version={p.version}
                            versionesPeriodo={p.versiones}
                            cargasCliente={grupo.cargasCliente}
                            perfilesCliente={grupo.perfilesCliente}
                            marcasPeriodo={p.marcasPeriodo}
                            marcasCliente={grupo.marcasCliente}
                            className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700`}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-150 bg-white px-4 py-2.5 shadow-sm">
        <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
        <div className="flex flex-wrap items-center gap-3">
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
        </div>
      </div>
    </div>
  );
}
