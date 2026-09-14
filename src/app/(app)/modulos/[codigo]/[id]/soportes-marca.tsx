"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarSoporteMarca } from "@/app/actions/modulos-datos";
import { SOPORTES_MARCA_MAX, tamanoLegible, urlSoporteMarca } from "@/lib/modulos/marcas-adjuntos";
import type { AdjuntoMarca } from "@/lib/modulos/marcas-cruce";

// Piezas de las marcas de auditoría que comparten la cédula contable y el cruce por tercero.

/** El número de la marca tal como se pinta en la cédula. */
export function InsigniaMarca({
  numero,
  tono,
  titulo,
}: {
  numero: number;
  tono: "ok" | "warn";
  titulo: string;
}) {
  const colores = tono === "warn" ? "border-warn-500 bg-warn-100 text-warn-700" : "border-navy-700 bg-white text-navy-700";
  return (
    <span
      title={titulo}
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${colores}`}
    >
      {numero}
    </span>
  );
}

/** Los soportes de una marca, como enlaces de descarga (nada si no tiene). */
export function ListaSoportesMarca({ adjuntos }: { adjuntos: AdjuntoMarca[] }) {
  if (adjuntos.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {adjuntos.map((a) => (
        <li key={a.id}>
          <a
            href={`${urlSoporteMarca(a.id)}?descargar=1`}
            className="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 transition hover:border-blue-400 hover:text-blue-700"
            title={`${a.nombreArchivo} · ${tamanoLegible(a.tamanoBytes)}`}
          >
            <Icon name="doc" size={11} />
            <span className="truncate">{a.nombreArchivo}</span>
            <span className="shrink-0 text-ink-400">{tamanoLegible(a.tamanoBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Soportes de la marca en su modal: los ya guardados (se eliminan en el acto) y los nuevos,
 * que se suben al guardar la marca.
 */
export function EditorSoportesMarca({
  encabezadoId,
  yaGuardados,
  nuevos,
  onCambiarNuevos,
}: {
  encabezadoId: number;
  yaGuardados: AdjuntoMarca[];
  nuevos: File[];
  onCambiarNuevos: (archivos: File[]) => void;
}) {
  const router = useRouter();
  const [borrandoSoporte, startBorrarSoporte] = useTransition();
  const cupo = SOPORTES_MARCA_MAX - yaGuardados.length - nuevos.length;

  const agregar = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const elegidos = Array.from(lista);
    if (elegidos.length > cupo) {
      notifyError(`Una marca admite hasta ${SOPORTES_MARCA_MAX} soportes.`);
      return;
    }
    onCambiarNuevos([...nuevos, ...elegidos]);
  };

  const quitarSoporte = (soporteId: number) => {
    startBorrarSoporte(async () => {
      const r = await eliminarSoporteMarca({ encabezadoId, soporteId });
      if (r.ok) {
        notifySuccess(r.message ?? "Soporte eliminado.");
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo eliminar el soporte.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-700">
        Soportes <span className="font-normal text-ink-400">(PDF, Excel, CSV o imagen · hasta {SOPORTES_MARCA_MAX})</span>
      </span>

      {yaGuardados.length > 0 && (
        <ul className="flex flex-col gap-1">
          {yaGuardados.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border border-ink-150 bg-white px-2 py-1.5 text-[11.5px]">
              <Icon name="doc" size={12} />
              <a
                href={`${urlSoporteMarca(a.id)}?descargar=1`}
                className="min-w-0 flex-1 truncate text-ink-700 hover:text-blue-700 hover:underline"
                title={a.nombreArchivo}
              >
                {a.nombreArchivo}
              </a>
              <span className="shrink-0 text-ink-400">{tamanoLegible(a.tamanoBytes)}</span>
              <button
                type="button"
                onClick={() => quitarSoporte(a.id)}
                disabled={borrandoSoporte}
                title="Eliminar este soporte"
                aria-label="Eliminar este soporte"
                className="shrink-0 rounded p-0.5 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
              >
                <Icon name="trash" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {nuevos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {nuevos.map((archivo, i) => (
            <li key={`${archivo.name}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50 px-2 py-1.5 text-[11.5px]">
              <Icon name="upload" size={12} />
              <span className="min-w-0 flex-1 truncate text-ink-700" title={archivo.name}>{archivo.name}</span>
              <span className="shrink-0 text-ink-400">{tamanoLegible(archivo.size)}</span>
              <button
                type="button"
                onClick={() => onCambiarNuevos(nuevos.filter((_, j) => j !== i))}
                title="Quitar de la lista"
                aria-label="Quitar de la lista"
                className="shrink-0 rounded p-0.5 text-err-500 transition hover:bg-err-50 hover:text-err-700"
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {cupo > 0 ? (
        <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-900">
          <Icon name="plus" size={12} /> Adjuntar soporte
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.xlsm,.xls,.csv,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              agregar(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <span className="text-[11px] text-ink-400">Alcanzaste el máximo de {SOPORTES_MARCA_MAX} soportes.</span>
      )}
    </div>
  );
}
