"use client";

// Terceros RELACIONADOS con una marca existente (9/Nov/2026): la marca ② de la cédula puede explicar
// la suma de las diferencias de varios NIT del cruce por tercero. Se seleccionan en la tabla, se
// relacionan con ella y se deja un comentario sobre ellos; cada uno queda explicado por la diferencia
// que tenía al relacionarlo. Aquí viven la barra de la selección, el modal y el bloque al pie.
import { useState, useTransition } from "react";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { relacionarTercerosConMarca } from "@/app/actions/modulos-datos";
import {
  anclaObservacionMarca,
  MAX_NOTA_MARCA,
  type FilaCruceTerceroMarcada,
  type RelacionMarcaTercerosVm,
} from "@/lib/modulos/marcas-cruce";
import { InsigniaMarca } from "./soportes-marca";

const redondear = (v: number) => Math.round(v * 100) / 100 + 0;

/** Una marca del período que se puede elegir para relacionar terceros. */
export type MarcaParaRelacionar = { numero: number; etiqueta: string; nota: string; monto: number };

/** Barra fija de la selección: cuántos, cuánto suman y qué hacer con ellos. */
export function BarraSeleccionTerceros({
  cantidad,
  suma,
  ocupado,
  onRelacionar,
  onLimpiar,
}: {
  cantidad: number;
  suma: number;
  ocupado: boolean;
  onRelacionar: () => void;
  onLimpiar: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-navy-700 bg-white px-4 py-2.5 text-[12.5px] shadow-lg">
      <span className="font-semibold text-navy-800">
        {cantidad === 1 ? "1 tercero seleccionado" : `${cantidad.toLocaleString("es-CO")} terceros seleccionados`}
      </span>
      <span className="text-ink-600">
        Σ diferencia <b className="tabular-nums text-ink-800">{fmtContable(suma)}</b>
      </span>
      <button
        type="button"
        onClick={onRelacionar}
        disabled={ocupado}
        className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
      >
        <Icon name="link" size={12} />
        Relacionar con una marca
      </button>
      <button type="button" onClick={onLimpiar} className="text-[12px] font-semibold text-ink-500 hover:text-ink-700 hover:underline">
        Quitar selección
      </button>
    </div>
  );
}

/** El número de la marca con que está relacionado un tercero, en su columna Marca. */
export function InsigniaRelacionTercero({ fila }: { fila: FilaCruceTerceroMarcada }) {
  const relacion = fila.relacion;
  if (!relacion) return null;
  const titulo = `Relacionado con la marca ${relacion.numero} · explica ${fmtContable(relacion.diferencia)}`
    + (fila.desactualizada ? ` · la diferencia hoy es ${fmtContable(fila.diferencia)}: faltan ${fmtContable(fila.porExplicar)} por explicar` : "")
    + " · ver la relación al pie";
  return (
    <a href={`#${anclaObservacionMarca(relacion.numero)}`} className="inline-flex items-center gap-0.5" title={titulo}>
      <Icon name="link" size={11} className={fila.desactualizada ? "text-warn-700" : "text-navy-700"} />
      <InsigniaMarca numero={relacion.numero} tono={fila.desactualizada ? "warn" : "ok"} titulo={titulo} />
    </a>
  );
}

/** Modal: elegir la marca, comparar la suma y dejar un comentario sobre los terceros. */
export function ModalRelacionarMarca({
  terceros,
  marcas,
  relaciones,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  terceros: FilaCruceTerceroMarcada[];
  marcas: MarcaParaRelacionar[];
  relaciones: RelacionMarcaTercerosVm[];
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [numero, setNumero] = useState<number | null>(marcas.length === 1 ? marcas[0].numero : null);
  const relacionDe = (n: number | null) => (n == null ? null : relaciones.find((r) => r.numero === n) ?? null);
  const [comentario, setComentario] = useState(relacionDe(numero)?.comentario ?? "");
  const [guardando, startGuardar] = useTransition();
  const suma = redondear(terceros.reduce((s, t) => s + t.diferencia, 0));
  const marca = marcas.find((m) => m.numero === numero) ?? null;
  const existente = relacionDe(numero);
  const totalRelacionado = redondear(suma + (existente?.suma ?? 0));
  const diferencia = marca ? redondear(marca.monto - totalRelacionado) : null;

  const elegir = (n: number) => {
    setNumero(n);
    // Al cambiar de marca se propone el comentario que ya tenga su relación.
    setComentario(relacionDe(n)?.comentario ?? "");
  };

  const guardar = () => {
    if (numero == null || guardando) return;
    startGuardar(async () => {
      const r = await relacionarTercerosConMarca({ encabezadoId, numero, claves: terceros.map((t) => t.clave), comentario });
      if (r.ok) {
        notifySuccess(r.message ?? "Terceros relacionados.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudo relacionar los terceros.");
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Relacionar ${terceros.length === 1 ? "1 tercero" : `${terceros.length.toLocaleString("es-CO")} terceros`} con una marca`}
      size="lg"
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={numero == null || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {guardando ? "Relacionando…" : numero == null ? "Elige una marca" : `Relacionar con la marca ${numero}`}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px]">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Terceros seleccionados · Σ diferencia {fmtContable(suma)}</span>
          <ul className="max-h-32 overflow-y-auto rounded-md border border-ink-150 bg-ink-50 px-3 py-1.5 text-[11.5px] text-ink-600">
            {terceros.map((t) => (
              <li key={t.clave} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{t.sinNit ? "Sin NIT" : t.clave}{t.nombre ? ` · ${t.nombre}` : ""}</span>
                <span className="shrink-0 tabular-nums">{fmtContable(t.diferencia)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Marca que explica estas diferencias</span>
          {marcas.length === 0 ? (
            <p className="text-ink-500">No hay marcas en este período. Pon primero la marca en «Cruce contable» (o en un tercero) y relaciónalos con ella.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {marcas.map((m) => {
                const rel = relacionDe(m.numero);
                return (
                  <li key={m.numero}>
                    <label className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${numero === m.numero ? "border-navy-700 bg-blue-50" : "border-ink-150 hover:border-ink-300"}`}>
                      <input type="radio" name="marca-relacion" checked={numero === m.numero} onChange={() => elegir(m.numero)} className="mt-1" />
                      <InsigniaMarca numero={m.numero} tono="ok" titulo={`Marca ${m.numero}`} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="break-words font-semibold text-ink-800">{m.etiqueta}</span>
                        <span className="text-[11.5px] text-ink-500">
                          Explica <b className="tabular-nums text-ink-700">{fmtContable(m.monto)}</b>
                          {rel ? ` · ya tiene ${rel.terceros.length} tercero(s) relacionados por ${fmtContable(rel.suma)}` : ""}
                        </span>
                        <span className="line-clamp-2 text-[11.5px] text-ink-500">{m.nota}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {marca && diferencia != null && (
          <div className={`rounded-md border px-3 py-2 text-[12px] ${Math.abs(diferencia) <= 0.01 ? "border-ok-500 bg-ok-100 text-ok-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>
            Seleccionados <b className="tabular-nums">{fmtContable(suma)}</b>
            {existente ? <> + ya relacionados <b className="tabular-nums">{fmtContable(existente.suma)}</b></> : null}
            {" · "}la marca {marca.numero} explica <b className="tabular-nums">{fmtContable(marca.monto)}</b>
            {" · "}
            {Math.abs(diferencia) <= 0.01
              ? <b>Coinciden</b>
              : <>diferencia <b className="tabular-nums">{fmtContable(diferencia)}</b>. Solo informa: la marca puede explicar más cosas que estos terceros.</>}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">
            Comentario sobre estos terceros <span className="font-normal text-ink-400">(opcional)</span>
          </span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={4}
            placeholder="P. ej. diferencia en cambio de proveedores del exterior; facturas registradas solo en el módulo financiero."
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <span className="self-end text-[10.5px] text-ink-400">{comentario.length}/{MAX_NOTA_MARCA}</span>
        </label>

        <p className="text-[11.5px] text-ink-500">
          Cada tercero queda explicado por la marca con la diferencia que tiene hoy; si después cambia, queda por explicar. El comentario es uno por relación: si la marca ya tenía terceros relacionados, reemplaza el que había. Los soportes van en la marca.
        </p>
      </div>
    </Modal>
  );
}

/** Al pie, debajo de la marca: los terceros que tiene relacionados, su suma y el comentario. */
export function BloqueRelacionTerceros({
  relacion,
  puedeEditar,
  ocupado,
  onQuitarTercero,
  onDeshacer,
}: {
  relacion: RelacionMarcaTercerosVm;
  puedeEditar: boolean;
  ocupado: boolean;
  onQuitarTercero: (clave: string) => void;
  onDeshacer: () => void;
}) {
  const [abierta, setAbierta] = useState(relacion.terceros.length <= 12);
  return (
    <li className="flex gap-3 border-l-4 border-l-blue-300 bg-blue-50/40 px-3 py-2.5">
      <div className="pt-0.5">
        <Icon name="link" size={14} className="text-navy-700" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink-800">
            {relacion.terceros.length === 1 ? "1 tercero relacionado" : `${relacion.terceros.length} terceros relacionados`} con la marca {relacion.numero}
          </span>
          <Chip label={`Σ ${fmtContable(relacion.suma)}`} tone="blue" />
          <button type="button" onClick={() => setAbierta((v) => !v)} className="text-[11.5px] font-semibold text-blue-700 hover:underline">
            {abierta ? "Ocultar terceros" : "Ver terceros"}
          </button>
        </div>
        {relacion.comentario && <p className="whitespace-pre-wrap break-words text-ink-700">{relacion.comentario}</p>}
        {abierta && (
          <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150 bg-white">
            {relacion.terceros.map((t) => (
              <li key={t.clave} className="flex items-center justify-between gap-3 px-2.5 py-1 text-[11.5px]">
                <span className="min-w-0 truncate text-ink-700">{t.clave.startsWith("~") ? "Sin NIT" : t.clave}{t.nombre ? ` · ${t.nombre}` : ""}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-ink-600" title="Diferencia cuando se relacionó: lo que explica la marca">{fmtContable(t.diferencia)}</span>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => onQuitarTercero(t.clave)}
                      disabled={ocupado}
                      title="Quitar este tercero de la relación"
                      aria-label="Quitar este tercero de la relación"
                      className="rounded p-0.5 text-ink-400 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-60"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span className="text-[10.5px] text-ink-400">
          {relacion.creadoPor ? `${relacion.creadoPor} · ` : ""}{relacion.actualizadoEn}
        </span>
      </div>
      {puedeEditar && (
        <div className="flex shrink-0 items-start">
          <button
            type="button"
            onClick={onDeshacer}
            disabled={ocupado}
            title="Deshacer la relación: los terceros vuelven a pedir su propia marca"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-600 transition hover:border-err-500 hover:text-err-700 disabled:opacity-60"
          >
            Deshacer relación
          </button>
        </div>
      )}
    </li>
  );
}
