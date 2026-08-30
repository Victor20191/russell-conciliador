"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actualizarDocumentacionArchivoModulo } from "@/app/actions/modulos-datos";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { ResumenRecoleccionModulo } from "@/lib/modulos/archivo-original";

export type ArchivoBitacoraModuloVm = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  clienteNit: string | null;
  moduloCodigo: string;
  moduloLabel: string;
  periodo: string | null;
  nombreArchivo: string;
  tipoContenido: string | null;
  tamanoBytes: number | null;
  huellaSha256: string | null;
  ubicacionCarpeta: string;
  softwareOrigen: string | null;
  ubicacionOrigen: string | null;
  reflejoContableEsperado: string | null;
  documentacionCompleta: boolean;
  estado: string;
  disponible: boolean;
  esAnexo: boolean;
  cargadoPor: string | null;
  fecha: string;
};

export default function BitacoraArchivosModuloClient({
  archivos,
  estadosModulos,
  pagina,
  totalPaginas,
  totalArchivos,
  puedeEditar,
}: {
  archivos: ArchivoBitacoraModuloVm[];
  estadosModulos: ResumenRecoleccionModulo[];
  pagina: number;
  totalPaginas: number;
  totalArchivos: number;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editando, setEditando] = useState<ArchivoBitacoraModuloVm | null>(null);

  const irPagina = (nuevaPagina: number) => {
    router.push(nuevaPagina <= 1 ? pathname : `${pathname}?pagina=${nuevaPagina}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="estado-recoleccion">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="estado-recoleccion" className="text-[12px] font-semibold uppercase tracking-wider text-ink-600">
              Estado de recolección por módulo
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-400">
              Disponible significa que existe al menos un original verificable y descargable dentro de tu alcance, sin importar el estado de sus datos procesados.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {estadosModulos.map((modulo) => (
            <Card key={modulo.codigo} className="flex items-center gap-3 px-3.5 py-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                modulo.estado === "disponible" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"
              }`}>
                <Icon name={modulo.estado === "disponible" ? "check" : "warn"} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-ink-800">{modulo.label}</span>
                <span className="block text-[11px] text-ink-400">
                  {modulo.archivosDisponibles} disponible(s) · {modulo.archivosRegistrados} registrado(s)
                </span>
              </span>
              <Chip
                label={modulo.estado === "disponible" ? "Disponible" : "Pendiente"}
                tone={modulo.estado === "disponible" ? "ok" : "warn"}
              />
            </Card>
          ))}
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-800">Archivos originales del módulo</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-400">
              {totalArchivos === 1 ? "1 archivo registrado" : `${totalArchivos} archivos registrados`}. El original no se elimina al cargar, descartar ni retirar los datos procesados.
            </p>
          </div>
          <Chip label="Conservación inalterada + SHA-256" tone="blue" />
        </div>

        {archivos.length === 0 ? (
          <EmptyState
            icon="doc"
            title="Este módulo aún no tiene archivos originales"
            description="Cuando se lea el primer archivo, quedará conservado y aparecerá aquí. El tablero superior lo mantendrá como pendiente hasta entonces."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-[12px]">
              <thead className="bg-ink-50 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Archivo original</th>
                  <th className="px-3 py-2 font-semibold">Cliente / módulo</th>
                  <th className="px-3 py-2 font-semibold">Origen documentado</th>
                  <th className="px-3 py-2 font-semibold">Carpeta conservada</th>
                  <th className="px-3 py-2 font-semibold">Reflejo contable esperado</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold">Registro</th>
                  <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((archivo) => (
                  <tr key={archivo.id} className="border-t border-ink-100 align-top hover:bg-ink-50/70">
                    <td className="max-w-[260px] px-3 py-2.5">
                      <span className="block truncate font-semibold text-ink-800" title={archivo.nombreArchivo}>
                        {archivo.nombreArchivo}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-ink-400">
                        {archivo.tamanoBytes != null ? tamanoLegible(archivo.tamanoBytes) : "tamaño histórico no registrado"}
                        {archivo.esAnexo ? " · anexo" : ""}
                      </span>
                      {archivo.huellaSha256 ? (
                        <code className="mt-1 block truncate text-[10px] text-ink-500" title={`SHA-256 ${archivo.huellaSha256}`}>
                          SHA-256 {archivo.huellaSha256.slice(0, 16)}…
                        </code>
                      ) : (
                        <span className="mt-1 block text-[10px] text-warn-700">Sin huella: cargue anterior a la conservación</span>
                      )}
                    </td>
                    <td className="max-w-[210px] px-3 py-2.5">
                      <span className="block font-medium text-ink-800">{archivo.clienteNombre}</span>
                      <span className="block font-mono text-[10.5px] text-ink-400">{archivo.clienteNit ?? `Cliente ${archivo.clienteId}`}</span>
                      <span className="mt-1 block text-[10.5px] text-ink-500">{archivo.moduloLabel} · {archivo.periodo ?? "período pendiente"}</span>
                    </td>
                    <td className="max-w-[230px] px-3 py-2.5 text-ink-600">
                      <span className="block"><b className="font-medium text-ink-700">Software:</b> {archivo.softwareOrigen ?? "Pendiente"}</span>
                      <span className="mt-1 block break-words"><b className="font-medium text-ink-700">Ubicación:</b> {archivo.ubicacionOrigen ?? "Pendiente"}</span>
                    </td>
                    <td className="max-w-[230px] px-3 py-2.5">
                      <code className="block break-all rounded bg-ink-100 px-2 py-1 text-[10.5px] leading-relaxed text-ink-600">
                        {archivo.ubicacionCarpeta}
                      </code>
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5 text-ink-600">
                      {archivo.reflejoContableEsperado ?? <span className="text-warn-700">Pendiente de documentar</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-col items-start gap-1.5">
                        <Chip label={etiquetaEstado(archivo.estado)} tone={tonoEstado(archivo.estado)} />
                        <Chip
                          label={archivo.disponible
                            ? "Original disponible"
                            : archivo.estado === "recibido" || archivo.estado === "no_procesable"
                              ? "Original no disponible"
                              : "Solo metadata histórica"}
                          tone={archivo.disponible ? "ok" : "warn"}
                        />
                        <Chip label={archivo.documentacionCompleta ? "Documentación completa" : "Documentación pendiente"} tone={archivo.documentacionCompleta ? "blue" : "warn"} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[10.5px] text-ink-500">
                      <span className="block">{archivo.fecha}</span>
                      <span className="mt-0.5 block">{archivo.cargadoPor ? `por ${archivo.cargadoPor}` : "autor no registrado"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {archivo.disponible && (
                          <a
                            href={`/api/modulos/archivos-originales/${archivo.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ok-200 text-ok-700 hover:bg-ok-100"
                            title="Descargar y verificar el original"
                            aria-label={`Descargar el original ${archivo.nombreArchivo}`}
                          >
                            <Icon name="download" size={14} />
                          </a>
                        )}
                        {puedeEditar && (
                          <button
                            type="button"
                            onClick={() => setEditando(archivo)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100"
                            title="Completar o editar la documentación"
                            aria-label={`Documentar ${archivo.nombreArchivo}`}
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalArchivos > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
            <span className="text-[11.5px] text-ink-500">
              Página {pagina} de {totalPaginas} · {totalArchivos} registro(s)
            </span>
            <PaginationControls currentPage={pagina} totalPages={totalPaginas} onPageChange={irPagina} />
          </div>
        )}
      </Card>

      {editando && (
        <DocumentarArchivoModal
          archivo={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DocumentarArchivoModal({
  archivo,
  onClose,
  onGuardado,
}: {
  archivo: ArchivoBitacoraModuloVm;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [softwareOrigen, setSoftwareOrigen] = useState(archivo.softwareOrigen ?? "");
  const [ubicacionOrigen, setUbicacionOrigen] = useState(archivo.ubicacionOrigen ?? "");
  const [reflejoContableEsperado, setReflejoContableEsperado] = useState(archivo.reflejoContableEsperado ?? "");
  const [guardando, startGuardar] = useTransition();

  const guardar = () => {
    startGuardar(async () => {
      const resultado = await actualizarDocumentacionArchivoModulo({
        archivoId: archivo.id,
        softwareOrigen,
        ubicacionOrigen,
        reflejoContableEsperado,
      });
      if (!resultado.ok) {
        notifyError(resultado.message ?? "No se pudo actualizar la documentación.");
        return;
      }
      notifySuccess(resultado.message ?? "Documentación actualizada.");
      onGuardado();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Documentar original · ${archivo.nombreArchivo}`}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar documentación"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px]">
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
          Estos campos son progresivos y no alteran el archivo. La documentación queda completa cuando identifica software, ubicación de origen y reflejo esperado en contabilidad.
        </p>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink-700">Software de origen</span>
          <input value={softwareOrigen} onChange={(e) => setSoftwareOrigen(e.target.value)} maxLength={160} placeholder="Ej. SIIGO, SAP, SIESA" className="rounded-md border border-ink-200 px-3 py-2 outline-none focus:border-blue-400" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink-700">Ubicación o carpeta en el origen</span>
          <input value={ubicacionOrigen} onChange={(e) => setUbicacionOrigen(e.target.value)} maxLength={500} placeholder="Ej. Facturación / 2026 / Agosto" className="rounded-md border border-ink-200 px-3 py-2 outline-none focus:border-blue-400" />
          <span className="text-[10.5px] text-ink-400">Es una referencia manual: el navegador no entrega la ruta local real.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-ink-700">Cómo debe reflejarse en contabilidad</span>
          <textarea value={reflejoContableEsperado} onChange={(e) => setReflejoContableEsperado(e.target.value)} maxLength={4000} rows={5} placeholder="Describe las cuentas, el valor neto esperado y cualquier regla relevante para el cruce." className="resize-y rounded-md border border-ink-200 px-3 py-2 outline-none focus:border-blue-400" />
        </label>
      </div>
    </Modal>
  );
}

function etiquetaEstado(estado: string): string {
  if (estado === "recibido") return "Original recibido";
  if (estado === "no_procesable") return "No procesable";
  if (estado === "cargado") return "Cargado";
  if (estado === "descartado") return "Borrador descartado";
  if (estado === "cargue_eliminado") return "Datos procesados retirados";
  return "Borrador";
}

function tonoEstado(estado: string): "ok" | "warn" | "ink" {
  if (estado === "cargado") return "ok";
  if (estado === "borrador" || estado === "recibido" || estado === "no_procesable") return "warn";
  return "ink";
}

function tamanoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
