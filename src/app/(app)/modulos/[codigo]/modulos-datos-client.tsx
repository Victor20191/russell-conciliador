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
import { archivosRotuladosDeVersion } from "@/lib/modulos/archivos-carga";
import { INFO_CONTENIDO_ARCHIVO, type ContenidoArchivo, type ContenidoArchivoCargue } from "@/lib/modulos/ingresos/contenido-archivo";
import {
  contarPeriodosPorEstado,
  ESTADOS_PERIODO_MODULO,
  estadoPeriodoModulo,
  filtrarGruposCargaModulo,
  filtrarGruposPorEstado,
  type EstadoPeriodoModulo,
} from "@/lib/modulos/listado";
import { EliminarDatosModuloButton } from "./eliminar-datos-modulo-modal";
import { AgregarArchivoButton, CargarModuloButton, type ClienteModulo, type RolModulo } from "./cargar-modulo-modal";
import {
  BOTON_ACCION,
  BadgeComentarios,
  BuscadorListado,
  etiquetaOrigen,
  FiltroEstadoListado,
  type OnConversar,
} from "./listado-compartido";

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
  /** Lote del archivo principal: empareja su contenido declarado. */
  loteId: string | null;
  /** Qué trae cada archivo del cargue (Ingresos); null en cargues anteriores o en otros módulos. */
  contenidoArchivos: ContenidoArchivoCargue[] | null;
  origen: string | null;
  cargadoPor: string | null;
  fecha: string;
  hora: string | null;
  comentarios: number;
  /** Marcas de auditoría del cruce ancladas al período (caen al borrarlo). */
  marcasPeriodo: number;
  /** Conciliación del período cerrada (en firme); null si no se ha cerrado o se desbloqueó. */
  conciliacionCerrada: { cerradoPor: string; cerradoEn: string; encabezadoId: number } | null;
};

/** Qué trae un archivo del cargue (Ingresos): «Facturas», «Notas crédito» o ambas. */
function RotuloContenido({ contenido, invertido }: { contenido: ContenidoArchivo; invertido: boolean }) {
  const notas = contenido === "notas_credito";
  return (
    <span
      className={`rounded px-1 text-[9.5px] font-medium uppercase tracking-wide ${notas ? "bg-warn-100 text-warn-700" : "bg-blue-50 text-navy-700"}`}
      title={notas
        ? invertido
          ? "Archivo de notas crédito: venía en positivo y se cambió a negativo para que reste."
          : "Archivo de notas crédito: ya venía en negativo y se dejó con su signo."
        : `Archivo declarado como «${INFO_CONTENIDO_ARCHIVO[contenido].rotulo}» al cargarlo.`}
    >
      {INFO_CONTENIDO_ARCHIVO[contenido].rotulo}
    </span>
  );
}

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
  conNivelCartera,
  clientes,
  gruposCargados,
  puedeCrear,
  puedeEliminar,
  puedeAdministrarPatrones,
  confirmarClasificador,
  confirmarTotal,
  confirmarAgrupador,
  avisaCuentaArchivo,
  rolValor,
  confirmarValorSinImpuestos,
  cuentaEnClasificador,
  confirmarContenido,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  rolValor: string;
  confirmarValorSinImpuestos: boolean;
  /** Activos fijos: el clasificador trae pegada la cuenta del cliente. */
  cuentaEnClasificador: boolean;
  confirmarContenido: boolean;
  /** El módulo concilia por tercero: la carga declara qué es una fila y de dónde viene. */
  conNivelCartera: boolean;
  clientes: ClienteModulo[];
  gruposCargados: GrupoClienteRow[];
  /** `modulos_datos:crear`: controla las entradas visibles al flujo de carga. */
  puedeCrear: boolean;
  /** `modulos_datos:eliminar` (solo administradores): pinta la papelera del cargue. */
  puedeEliminar: boolean;
  /** `perfiles_carga:administrar`: la carga ofrece «Crear patrón» cuando un archivo no coincide. */
  puedeAdministrarPatrones: boolean;
  confirmarClasificador: boolean;
  confirmarTotal: { rolValor: string } | null;
  confirmarAgrupador: boolean;
  /** Nómina: la carga avisa cuando el patrón lee la cuenta contable del cliente. */
  avisaCuentaArchivo: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [conversando, setConversando] = useState<{ tipo: string; entityId: number; titulo: string } | null>(null);
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BuscadorListado busqueda={busqueda} setBusqueda={setBusqueda} />
        {puedeCrear && (
          <CargarModuloButton
            moduloCodigo={moduloCodigo}
            moduloLabel={moduloLabel}
            roles={roles}
            clasificadorRol={clasificadorRol}
            conNivelCartera={conNivelCartera}
            clientes={clientes}
            puedeAdministrarPatrones={puedeAdministrarPatrones}
            confirmarClasificador={confirmarClasificador}
            confirmarTotal={confirmarTotal}
            confirmarAgrupador={confirmarAgrupador}
            avisaCuentaArchivo={avisaCuentaArchivo}
            rolValor={rolValor}
            confirmarValorSinImpuestos={confirmarValorSinImpuestos}
            cuentaEnClasificador={cuentaEnClasificador}
            confirmarContenido={confirmarContenido}
          />
        )}
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
        conNivelCartera={conNivelCartera}
        moduloCodigo={moduloCodigo}
        moduloLabel={moduloLabel}
        roles={roles}
        clasificadorRol={clasificadorRol}
        clientes={clientes}
        onConversar={setConversando}
        puedeCrear={puedeCrear}
        puedeEliminar={puedeEliminar}
        puedeAdministrarPatrones={puedeAdministrarPatrones}
        confirmarClasificador={confirmarClasificador}
        confirmarTotal={confirmarTotal}
        confirmarAgrupador={confirmarAgrupador}
        avisaCuentaArchivo={avisaCuentaArchivo}
        rolValor={rolValor}
        confirmarValorSinImpuestos={confirmarValorSinImpuestos}
        cuentaEnClasificador={cuentaEnClasificador}
        confirmarContenido={confirmarContenido}
      />
    </div>
  );
}

function CargadosPorCliente({
  grupos,
  busqueda,
  ruta,
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  conNivelCartera,
  clientes,
  onConversar,
  puedeCrear,
  puedeEliminar,
  puedeAdministrarPatrones,
  confirmarClasificador,
  confirmarTotal,
  confirmarAgrupador,
  avisaCuentaArchivo,
  rolValor,
  confirmarValorSinImpuestos,
  cuentaEnClasificador,
  confirmarContenido,
}: {
  grupos: GrupoClienteRow[];
  busqueda: string;
  ruta: string;
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  conNivelCartera: boolean;
  clientes: ClienteModulo[];
  onConversar: OnConversar;
  puedeCrear: boolean;
  puedeEliminar: boolean;
  puedeAdministrarPatrones: boolean;
  confirmarClasificador: boolean;
  confirmarTotal: { rolValor: string } | null;
  confirmarAgrupador: boolean;
  /** Nómina: la carga avisa cuando el patrón lee la cuenta contable del cliente. */
  avisaCuentaArchivo: boolean;
  rolValor: string;
  confirmarValorSinImpuestos: boolean;
  /** Activos fijos: el clasificador trae pegada la cuenta del cliente. */
  cuentaEnClasificador: boolean;
  confirmarContenido: boolean;
}) {
  const [estado, setEstado] = useState<EstadoPeriodoModulo | null>(null);
  const conteoEstados = useMemo(() => contarPeriodosPorEstado(grupos), [grupos]);
  // Primero el estado (recorta los períodos) y luego el buscador: filtra la tarjeta entera cuando
  // identifica al cliente y, si no, solo los períodos que coinciden.
  const visibles = useMemo(
    () => filtrarGruposCargaModulo(filtrarGruposPorEstado(grupos, estado), busqueda),
    [grupos, estado, busqueda],
  );
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, estado, resetToFirstPage]);

  if (grupos.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title={`Aún no hay ${moduloLabel.toLowerCase()} cargados`}
          description={puedeCrear
            ? `Usa «Cargar ${moduloLabel.toLowerCase()}» para leer el archivo del cliente. Quedará en la pestaña «Borradores» para revisarlo antes de cargarlo.`
            : "No hay cargues disponibles dentro de tu alcance de lectura."}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {moduloLabel} cargados
        </span>
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">
          {grupos.length}
        </span>
        <span className="text-[11px] text-ink-400">
          {grupos.length === 1 ? "1 cliente" : `${grupos.length} clientes`}
        </span>
        <div className="ml-auto">
          <FiltroEstadoListado estado={estado} setEstado={setEstado} conteo={conteoEstados} />
        </div>
      </div>

      {visibles.length === 0 && (
        <Card>
          <div className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            {estado
              ? `No se encontraron períodos en estado «${ESTADOS_PERIODO_MODULO.find((e) => e.valor === estado)?.etiqueta}»${busqueda.trim() ? " con esa búsqueda" : ""}.`
              : "No se encontraron cargues con ese archivo, NIT, razón social o período."}
          </div>
        </Card>
      )}

      {pg.pageItems.map((grupo) => (
        <Card key={grupo.clienteId}>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <span className="text-ink-400">
              <Icon name="doc" size={16} />
            </span>
            <h2 className="min-w-0 break-words text-[13px] font-semibold text-ink-800">{grupo.clienteNombre}</h2>
            {grupo.clienteNit && (
              <span className="font-mono text-[11px] text-ink-400">{grupo.clienteNit}</span>
            )}
            <span className="ml-auto text-[11px] text-ink-400">
              {grupo.periodos.length === 1 ? "1 período" : `${grupo.periodos.length} períodos`}
            </span>
          </div>
          {/* Scroll horizontal hasta xl: con la barra lateral, un portátil deja ~750–1000 px y la
              tabla se salía de la tarjeta. Desde xl no lleva scroll propio para que el encabezado
              fijo (`tabla-encabezado-fijo`) siga pegado al <main>. */}
          <div className="max-xl:overflow-x-auto">
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
                  const archivos = archivosRotuladosDeVersion(p.archivoNombre, p.hoja, p.observaciones, p.contenidoArchivos, p.loteId);
                  const principal = archivos.find((a) => !a.esAnexo) ?? null;
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
                        {principal?.contenido && <RotuloContenido contenido={principal.contenido} invertido={principal.signoInvertido} />}
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
                          {anexo.contenido && <RotuloContenido contenido={anexo.contenido} invertido={anexo.signoInvertido} />}
                        </span>
                      ))}
                      <span className="block text-[10.5px] text-ink-400">{etiquetaOrigen(p.origen)}</span>
                      {p.cargadoPor && (
                        <span className="block text-[10.5px] text-ink-400">por {p.cargadoPor}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ink-700">{p.filas}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-ink-800">
                      {fmtContable(p.total)}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* La conciliación cerrada manda sobre el estado de la versión: es lo
                          que el equipo necesita saber del período (la versión ya se ve en
                          «Versión vigente»). El cierre es del período y puede venir de otra
                          versión: el título dice de cuál. */}
                      {estadoPeriodoModulo(p) === "cerrado" && p.conciliacionCerrada ? (
                        <span
                          title={`Conciliación en firme · cargue #${p.conciliacionCerrada.encabezadoId} · cerró ${p.conciliacionCerrada.cerradoPor} · ${p.conciliacionCerrada.cerradoEn}`}
                          className="flex flex-col items-start gap-0.5"
                        >
                          <span className="inline-flex items-center gap-1 rounded-full bg-navy-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Icon name="check" size={10} /> Cerrado
                          </span>
                          <span className="whitespace-nowrap text-[10px] text-ink-400">por {p.conciliacionCerrada.cerradoPor}</span>
                        </span>
                      ) : (
                        <Chip label="Vigente" tone="ok" />
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
                        {/* Adición explícita al cargue vigente: el usuario declara que
                            este archivo se SUMA, en vez de dejar que el sistema lo adivine.
                            No aplica sobre versiones históricas ni sobre un congelado. */}
                        {puedeCrear && p.esOficial && !p.estaCongelado && (
                          <AgregarArchivoButton
                            moduloCodigo={moduloCodigo}
                            moduloLabel={moduloLabel}
                            roles={roles}
                            conNivelCartera={conNivelCartera}
                            clasificadorRol={clasificadorRol}
                            clientes={clientes}
                            puedeAdministrarPatrones={puedeAdministrarPatrones}
                            confirmarClasificador={confirmarClasificador}
                            confirmarTotal={confirmarTotal}
                            confirmarAgrupador={confirmarAgrupador}
                            avisaCuentaArchivo={avisaCuentaArchivo}
                            rolValor={rolValor}
                            confirmarValorSinImpuestos={confirmarValorSinImpuestos}
                            cuentaEnClasificador={cuentaEnClasificador}
                            confirmarContenido={confirmarContenido}
                            anexo={{
                              encabezadoId: p.id,
                              clienteId: grupo.clienteId,
                              clienteNombre: grupo.clienteNombre,
                              periodo: p.periodo,
                            }}
                            className={`${BOTON_ACCION} border-navy-600 text-navy-700 hover:bg-blue-50 hover:text-navy-800`}
                          />
                        )}
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
