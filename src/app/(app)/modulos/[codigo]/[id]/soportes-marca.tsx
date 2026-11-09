"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarSoporteMarca } from "@/app/actions/modulos-datos";
import { SOPORTES_MARCA_MAX, tamanoLegible, urlSoporteMarca } from "@/lib/modulos/marcas-adjuntos";
import { fmtContable } from "@/lib/format";
import {
  anclaObservacionMarca,
  leerMontoMarca,
  montoDeMarca,
  textoMontoMarca,
  type AdjuntoMarca,
  type MarcaCruce,
  type MarcaPeriodo,
  type MarcasDelRenglon,
} from "@/lib/modulos/marcas-cruce";

// Piezas de las marcas de auditoría que comparten la cédula contable, el cruce por tercero y el
// control de deducciones.

/**
 * Las marcas de un renglón en la tabla: un número por marca (enlace a su observación) y, a quien
 * puede editar, «+» para agregar otra. Un renglón puede llevar varias: cada una explica su monto.
 */
export function InsigniasMarcasRenglon({
  renglon,
  diferencia,
  requiereMarca,
  admiteMarca,
  puedeEditar,
  onAgregar,
}: {
  renglon: MarcasDelRenglon;
  /** La cifra que explican (para el aviso al pasar el mouse). */
  diferencia: number;
  requiereMarca: boolean;
  admiteMarca: boolean;
  puedeEditar: boolean;
  onAgregar: () => void;
}) {
  const { marcas, desactualizada, porExplicar } = renglon;
  const tono = desactualizada ? "warn" : "ok";
  const titulo = (m: MarcaCruce) =>
    `Marca ${m.numero} · explica ${fmtContable(montoDeMarca(m))}`
    + (desactualizada ? ` · el renglón tiene ${fmtContable(diferencia)} y faltan ${fmtContable(porExplicar)} por explicar` : "")
    + " · ver la observación al pie";
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-0.5">
      {marcas.map((m) => (
        <a key={m.numero} href={`#${anclaObservacionMarca(m.numero)}`} className="inline-flex">
          <InsigniaMarca numero={m.numero} tono={tono} titulo={titulo(m)} />
        </a>
      ))}
      {admiteMarca && (puedeEditar ? (
        <button
          type="button"
          onClick={onAgregar}
          title={marcas.length > 0
            ? `Agregar otra marca a este renglón${desactualizada ? ` (faltan ${fmtContable(porExplicar)} por explicar)` : ""}`
            : requiereMarca ? "Poner una marca a esta diferencia" : "Diferencia bajo el umbral: la marca es opcional"}
          aria-label={marcas.length > 0 ? "Agregar otra marca" : "Poner una marca"}
          className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed px-1 transition hover:border-navy-700 hover:text-navy-700 ${
            (marcas.length === 0 && requiereMarca) || desactualizada ? "border-warn-500 text-warn-700" : "border-ink-300 text-ink-400"
          }`}
        >
          <Icon name="plus" size={12} />
        </button>
      ) : marcas.length === 0 ? (
        <span
          title={requiereMarca ? "Diferencia sin marca" : "Diferencia bajo el umbral"}
          className={`text-[11.5px] font-semibold ${requiereMarca ? "text-warn-700" : "text-ink-400"}`}
        >
          —
        </span>
      ) : null)}
    </span>
  );
}

/**
 * Cuánto explica la marca que se está escribiendo. Viene propuesto con lo que falta por explicar
 * del renglón; «Usar lo que falta» lo vuelve a poner.
 */
export function CampoMontoMarca({
  texto,
  onCambiar,
  faltante,
  cifra,
  otras,
}: {
  texto: string;
  onCambiar: (texto: string) => void;
  /** Lo que falta por explicar sin contar esta marca: la cifra menos lo que explican las demás. */
  faltante: number;
  /** La cifra del renglón que explican sus marcas. */
  cifra: number;
  /** Lo que explican las demás marcas del renglón. */
  otras: number;
}) {
  const monto = leerMontoMarca(texto);
  const quedaria = monto == null ? null : Math.round((faltante - monto) * 100) / 100 + 0;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink-700">Monto que explica esta marca</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={texto}
            onChange={(e) => onCambiar(e.target.value)}
            placeholder="0,00"
            className={`w-56 rounded-md border px-3 py-2 text-right text-[12.5px] tabular-nums focus:outline-none focus:ring-2 focus:ring-navy-600 ${monto == null ? "border-err-500" : "border-ink-200"}`}
          />
          <button
            type="button"
            onClick={() => onCambiar(textoMontoMarca(faltante))}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Usar lo que falta ({fmtContable(faltante)})
          </button>
        </div>
      </label>
      <span className="text-[11px] text-ink-500">
        Cifra del renglón {fmtContable(cifra)}
        {otras !== 0 ? ` · otras marcas explican ${fmtContable(otras)}` : ""}
        {quedaria == null
          ? " · escribe el monto con su signo, p. ej. -1.234.567,89"
          : Math.abs(quedaria) <= 0.01
            ? " · con este monto el renglón queda explicado"
            : ` · con este monto quedan ${fmtContable(quedaria)} por explicar`}
      </span>
    </div>
  );
}

/** El número de la marca tal como se pinta en la cédula. */
export function InsigniaMarca({
  numero,
  tono,
  titulo,
}: {
  numero: number;
  tono: "ok" | "warn" | "ink";
  titulo: string;
}) {
  const colores = tono === "warn"
    ? "border-warn-500 bg-warn-100 text-warn-700"
    : tono === "ink" ? "border-ink-300 bg-white text-ink-500" : "border-navy-700 bg-white text-navy-700";
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
        <li key={a.id} className="min-w-0 max-w-full">
          <a
            href={`${urlSoporteMarca(a.id)}?descargar=1`}
            className="inline-flex max-w-[min(260px,100%)] items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700 transition hover:border-blue-400 hover:text-blue-700"
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
                className="shrink-0 rounded p-0.5 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-60"
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

/** Otra marca del período, citada en las observaciones de una pestaña que no es la suya. */
export type ReferenciaMarcaVm = MarcaPeriodo & {
  /** Cuenta(s) o tercero, como los nombra su propia pestaña. */
  etiqueta: string;
  /** Pestaña donde se ve y se edita; null si su renglón ya no aparece en el cruce. */
  destino: { etiqueta: string; ir: () => void } | null;
};

/**
 * La numeración de las marcas es una sola para el cruce contable y el cruce por tercero: cada
 * pestaña cita las de la otra, en su lugar, para que la secuencia 1, 2, 3… se lea sin huecos.
 * Se edita solo en su pestaña.
 */
export function ReferenciaMarca({
  referencia,
  onQuitar,
  onEditar,
  ocupado = false,
}: {
  referencia: ReferenciaMarcaVm;
  /** Pasar la marca sin renglón al renglón que hoy contiene sus cuentas, y editarla ahí. */
  onEditar?: () => void;
  /**
   * Retirar una marca cuyo renglón ya no aparece (se agruparon sus cuentas, cambió el mapeo).
   * Sin esto no había cómo soltar las cuentas no modulares que dejó: seguían tachadas y no
   * había dónde editarlas.
   */
  onQuitar?: () => void;
  ocupado?: boolean;
}) {
  const { destino } = referencia;
  const noModulares = referencia.noModulares ?? [];
  return (
    <li id={anclaObservacionMarca(referencia.numero)} className="flex gap-3 bg-ink-50/60 px-3 py-2.5 scroll-mt-24">
      <div className="pt-0.5">
        <InsigniaMarca numero={referencia.numero} tono="ink" titulo={`Marca ${referencia.numero}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="font-semibold text-ink-700">{referencia.etiqueta}</span>
          <span className="tabular-nums text-ink-500" title={`Lo que explica la marca · la diferencia del renglón era ${fmtContable(referencia.diferencia)} cuando se escribió`}>
            {fmtContable(referencia.monto ?? referencia.diferencia)}
          </span>
          {destino ? (
            <button type="button" onClick={destino.ir} className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-50">
              Ver en {destino.etiqueta} →
            </button>
          ) : (
            <span className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[10.5px] text-ink-500">Su renglón ya no aparece en el cruce</span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-[11.5px] text-ink-600">{referencia.nota}</p>
        {noModulares.length > 0 && (
          <p className="text-[11px] leading-snug text-ink-500">
            <span className="font-semibold text-ink-600">Deja fuera de la conciliación:</span>{" "}
            {noModulares.map((c) => `${c.cuenta8}${c.nombre ? ` ${c.nombre}` : ""}`).join(" · ")}.
            {!destino && (onEditar
              ? " Edítala para pasarla al renglón actual, o retírala para que vuelvan a contar."
              : " Retira la marca para que vuelvan a contar.")}
          </p>
        )}
        <span className="text-[10.5px] text-ink-400">
          {referencia.marcadoPor ? `${referencia.marcadoPor} · ` : ""}{referencia.marcadoEn}
          {referencia.soportes > 0 ? ` · ${referencia.soportes} soporte${referencia.soportes === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      {(onQuitar || onEditar) && (
        <div className="flex shrink-0 items-start gap-1">
          {onEditar && (
            <button
              type="button"
              onClick={onEditar}
              disabled={ocupado}
              title="Editar la marca: pasa al renglón que hoy contiene sus cuentas"
              aria-label="Editar la marca"
              className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-60"
            >
              <Icon name="edit" size={13} />
            </button>
          )}
          {onQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            disabled={ocupado}
            title="Retirar la marca (se lleva sus soportes y libera sus cuentas no modulares)"
            aria-label="Retirar la marca"
            className="rounded p-1 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-60"
          >
            <Icon name="trash" size={13} />
          </button>
          )}
        </div>
      )}
    </li>
  );
}
