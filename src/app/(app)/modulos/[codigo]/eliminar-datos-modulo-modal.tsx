"use client";

// Eliminación de datos CARGADOS de un módulo desde su listado (`/modulos/[codigo]`).
// Mismo contrato de UI que `/balance`: el botón no borra nada por sí solo, abre un
// modal donde se elige explícitamente el alcance (esta versión, todo el período o
// todo el historial del cliente en este módulo con sus perfiles de formato).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarDatosModulo } from "@/app/actions/modulos-datos";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { AlcanceEliminacionModulo } from "@/lib/modulos/alcance-eliminacion";

type Opcion = {
  value: AlcanceEliminacionModulo;
  titulo: string;
  descripcion: string;
  conteo: string;
};

export function EliminarDatosModuloButton({
  encabezadoId,
  moduloLabel,
  clienteNombre,
  periodo,
  version,
  versionesPeriodo,
  cargasCliente,
  perfilesCliente,
  marcasPeriodo,
  marcasCliente,
  className,
}: {
  encabezadoId: number;
  moduloLabel: string;
  clienteNombre: string;
  periodo: string;
  version: number;
  /** Cuántas versiones tiene el período (incluida la vigente). */
  versionesPeriodo: number;
  /** Cargues del cliente en ESTE módulo (todos sus períodos y versiones). */
  cargasCliente: number;
  /** Perfiles de formato aprendidos del cliente en este módulo. */
  perfilesCliente: number;
  /** Marcas de auditoría del cruce ancladas a este período. */
  marcasPeriodo: number;
  /** Marcas de auditoría del cruce del cliente en este módulo. */
  marcasCliente: number;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [alcance, setAlcance] = useState<AlcanceEliminacionModulo>("version");
  const [eliminando, startEliminar] = useTransition();

  const modulo = moduloLabel.toLowerCase();
  const opciones: Opcion[] = [
    {
      value: "version",
      titulo: "Solo esta versión",
      descripcion: `Elimina los datos procesados de la v${version} de ${periodo} con sus filas. El archivo original y su SHA-256 permanecen en la bitácora. Las demás versiones, las marcas del cruce y los perfiles se conservan.`,
      conteo: "1 cargue",
    },
    {
      value: "periodo",
      titulo: "Todo este período",
      descripcion: `Elimina todas las versiones procesadas de ${periodo}${
        marcasPeriodo > 0 ? " y las marcas de auditoría del cruce de ese período (con sus soportes)" : ""
      }. Los archivos originales permanecen en la bitácora. Los demás períodos y los perfiles se conservan.`,
      conteo: `${versionesPeriodo} cargue(s)${marcasPeriodo > 0 ? ` · ${marcasPeriodo} marca(s)` : ""}`,
    },
    {
      value: "cliente_perfiles",
      titulo: `Todos los ${modulo} del cliente y sus perfiles de carga`,
      descripcion: `Elimina todo el historial procesado de ${modulo} del cliente${
        marcasCliente > 0 ? ", sus marcas del cruce" : ""
      } y las estructuras de archivo aprendidas. Los originales permanecen descargables en la bitácora; el cliente, los borradores, las preferencias, las correcciones y la consolidación se conservan.`,
      conteo: `${cargasCliente} cargue(s) · ${perfilesCliente} perfil(es)${
        marcasCliente > 0 ? ` · ${marcasCliente} marca(s)` : ""
      }`,
    },
  ];

  const confirmar = () => {
    startEliminar(async () => {
      const resultado = await eliminarDatosModulo({ encabezadoId, alcance });
      if (!resultado.ok) {
        notifyError(resultado.message ?? "No se pudo eliminar la información.");
        return;
      }
      setAbierto(false);
      notifySuccess(resultado.message ?? "La información seleccionada fue eliminada.");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Eliminar cargue"
        aria-label={`Eliminar el cargue de ${periodo}`}
        className={className ?? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-err-200 text-err-600 transition hover:bg-err-50 hover:text-err-700"}
      >
        <Icon name="trash" size={15} />
      </button>

      <Modal
        open={abierto}
        onClose={() => {
          if (!eliminando) setAbierto(false);
        }}
        title={`Eliminar ${modulo} cargados · define el alcance`}
        size="2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              disabled={eliminando}
              className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={eliminando}
              className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
            >
              {eliminando ? (
                <EstadoProcesando etiqueta="Eliminando" />
              ) : (
                <>
                  <Icon name="trash" size={14} /> Eliminar lo seleccionado
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-150 bg-ink-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-800">{clienteNombre}</p>
            <p className="mt-0.5 text-[12px] text-ink-500">
              Estás ubicado en {moduloLabel} · {periodo} · v{version}. Elige exactamente cuánto deseas borrar.
            </p>
          </div>

          <div role="radiogroup" aria-label="Alcance de la eliminación" className="space-y-2">
            {opciones.map((opcion) => {
              const seleccionada = alcance === opcion.value;
              return (
                <label
                  key={opcion.value}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3.5 transition ${
                    seleccionada
                      ? "border-err-400 bg-err-50 ring-1 ring-err-200"
                      : "border-ink-150 hover:border-ink-200 hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="alcance-eliminacion-modulo"
                    value={opcion.value}
                    checked={seleccionada}
                    onChange={() => setAlcance(opcion.value)}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink-800">{opcion.titulo}</span>
                      <span className="rounded-full border border-ink-150 bg-white px-2 py-0.5 font-mono text-[10.5px] text-ink-600">
                        {opcion.conteo}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-500">
                      {opcion.descripcion}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2 rounded-lg border border-err-200 bg-err-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-err-800">
            <span className="mt-0.5 shrink-0">
              <Icon name="warn" size={14} />
            </span>
            <p>
              Esta acción no se puede deshacer para los datos procesados. Los archivos originales no se borran:
              la bitácora conserva su contenido exacto, SHA-256, autor y documentación.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
