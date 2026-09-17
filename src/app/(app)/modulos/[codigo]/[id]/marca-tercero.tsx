"use client";

import { useState, useTransition } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import ComentarioAncla from "@/components/comentario-ancla";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { guardarMarcaCruce } from "@/app/actions/modulos-datos";
import {
  anclaCruceTercero,
  anclaObservacionMarca,
  etiquetaMarca,
  intercalarObservaciones,
  MAX_NOTA_MARCA,
  MAX_REFERENCIA_ANEXO,
  type FilaCruceTerceroMarcada,
} from "@/lib/modulos/marcas-cruce";
import { EditorSoportesMarca, InsigniaMarca, ListaSoportesMarca, ReferenciaMarca, type ReferenciaMarcaVm } from "./soportes-marca";

// Marcas de auditoría del cruce por tercero: la misma gramática de la cédula contable —el
// número en la tabla y el detalle al pie— con un tercero en lugar de una cuenta.

/** Cómo se nombra un tercero en la marca, en su hilo y al emparejarlo. */
export function etiquetaTercero(fila: Pick<FilaCruceTerceroMarcada, "clave" | "nombre" | "sinNit">): string {
  if (fila.sinNit) return `${fila.nombre ?? fila.clave.slice(1)} (sin NIT)`;
  return fila.nombre ? `${fila.clave} · ${fila.nombre}` : fila.clave;
}

/** La marca de un tercero en la tabla: número (enlace a su observación) o botón para crearla. */
export function CeldaMarcaTercero({
  fila,
  encabezadoId,
  comentarios,
  puedeEditar,
  onMarcar,
}: {
  fila: FilaCruceTerceroMarcada;
  encabezadoId: number;
  comentarios: number;
  puedeEditar: boolean;
  onMarcar: () => void;
}) {
  const hilo = (
    <ComentarioAncla
      tipo="modulos_datos"
      entityId={encabezadoId}
      anchor={anclaCruceTercero(fila.clave)}
      titulo={etiquetaTercero(fila)}
      count={comentarios}
    />
  );

  if (!fila.admiteMarca && !fila.marca) {
    return <div className="flex items-center justify-center gap-1">{hilo}</div>;
  }

  if (!fila.marca) {
    return (
      <div className="flex items-center justify-center gap-1">
        {puedeEditar ? (
          <button
            type="button"
            onClick={onMarcar}
            title={fila.requiereMarca ? "Poner una marca a esta diferencia" : "Diferencia bajo el umbral: la marca es opcional"}
            className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed px-1 transition hover:border-navy-700 hover:text-navy-700 ${
              fila.requiereMarca ? "border-warn-500 text-warn-700" : "border-ink-300 text-ink-400"
            }`}
          >
            <Icon name="plus" size={12} />
          </button>
        ) : (
          <span
            title={fila.requiereMarca ? "Diferencia sin marca" : "Diferencia bajo el umbral"}
            className={`text-[11.5px] font-semibold ${fila.requiereMarca ? "text-warn-700" : "text-ink-400"}`}
          >
            —
          </span>
        )}
        {hilo}
      </div>
    );
  }

  const { marca } = fila;
  const titulo = fila.desactualizada
    ? `Marca ${marca.numero} · la diferencia era ${fmtContable(marca.diferencia)} cuando se escribió y hoy es ${fmtContable(fila.diferencia)}. Ver observación al pie.`
    : `Marca ${marca.numero} · ver la observación al pie`;
  return (
    <div className="flex items-center justify-center gap-1">
      <a href={`#${anclaObservacionMarca(marca.numero)}`} className="inline-flex">
        <InsigniaMarca numero={marca.numero} tono={fila.desactualizada ? "warn" : "ok"} titulo={titulo} />
      </a>
      {hilo}
    </div>
  );
}

/** Las observaciones del cruce por tercero: el detalle numerado de cada marca, al pie. */
export function ObservacionesMarcasTercero({
  observaciones,
  referencias,
  encabezadoId,
  comentarios,
  puedeEditar,
  ocupado,
  onEditar,
  onQuitar,
}: {
  observaciones: FilaCruceTerceroMarcada[];
  /** Las demás marcas del período (cruce contable, o sin renglón), citadas en su lugar. */
  referencias: ReferenciaMarcaVm[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
  ocupado: boolean;
  onEditar: (fila: FilaCruceTerceroMarcada) => void;
  onQuitar: (fila: FilaCruceTerceroMarcada) => void;
}) {
  const entradas = intercalarObservaciones(observaciones, (f) => f.marca!.numero, referencias);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Observaciones · marcas del cruce por tercero</h3>
        {entradas.length > 0 && (
          <span className="text-[11px] text-ink-400">
            {entradas.length} {entradas.length === 1 ? "marca" : "marcas"} en este período
            {entradas.length > observaciones.length ? ` · ${observaciones.length} de este cruce` : ""}
          </span>
        )}
      </div>

      {entradas.length === 0 ? (
        <p className="px-3 py-5 text-center text-[12px] text-ink-400">
          Sin marcas todavía. Pon una marca a una diferencia de la tabla y su detalle aparecerá aquí.
        </p>
      ) : (
        <ol className="divide-y divide-ink-100">
          {entradas.map((entrada) => {
            if (entrada.tipo === "referencia") return <ReferenciaMarca key={`ref-${entrada.numero}`} referencia={entrada.marca} />;
            const fila = entrada.item;
            const marca = fila.marca!;
            return (
              <li key={fila.clave} id={anclaObservacionMarca(marca.numero)} className="flex scroll-mt-24 gap-3 px-3 py-3">
                <div className="pt-0.5">
                  <InsigniaMarca numero={marca.numero} tono={fila.desactualizada ? "warn" : "ok"} titulo={`Marca ${marca.numero}`} />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[12.5px] font-semibold text-ink-800">{etiquetaTercero(fila)}</span>
                    <span className={`text-[12px] font-semibold tabular-nums ${fila.admiteMarca ? "text-err-700" : "text-ok-700"}`}>
                      {fmtContable(fila.diferencia)}
                    </span>
                    {fila.desactualizada && (
                      <span title={`La diferencia era ${fmtContable(marca.diferencia)} cuando se escribió esta marca.`}>
                        <Chip label="Revisar" tone="warn" />
                      </span>
                    )}
                    {!fila.admiteMarca && <Chip label="Ya cuadra" tone="ok" />}
                  </div>

                  <p className="whitespace-pre-wrap break-words text-[12px] text-ink-700">{marca.nota}</p>

                  {marca.referenciaAnexo && (
                    <p className="text-[11.5px] text-ink-600">
                      <span className="font-semibold text-ink-500">Anexo:</span> {marca.referenciaAnexo}
                    </p>
                  )}

                  <ListaSoportesMarca adjuntos={marca.adjuntos} />

                  <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-ink-400">
                    <span>
                      {marca.marcadoPor ? `${marca.marcadoPor} · ` : ""}
                      {marca.marcadoEn}
                    </span>
                    <ComentarioAncla
                      tipo="modulos_datos"
                      entityId={encabezadoId}
                      anchor={anclaCruceTercero(fila.clave)}
                      titulo={etiquetaTercero(fila)}
                      count={comentarios[anclaCruceTercero(fila.clave)] ?? 0}
                    />
                  </div>
                </div>

                {puedeEditar && (
                  <div className="flex shrink-0 items-start gap-1">
                    <button
                      type="button"
                      onClick={() => onEditar(fila)}
                      title="Editar la marca"
                      aria-label="Editar la marca"
                      className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuitar(fila)}
                      disabled={ocupado}
                      title="Retirar la marca (se lleva sus soportes)"
                      aria-label="Retirar la marca"
                      className="rounded p-1 text-err-500 transition hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Modal para poner (o reescribir) la marca de un tercero y adjuntarle soportes. */
export function ModalMarcaTercero({
  fila,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  fila: FilaCruceTerceroMarcada;
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nota, setNota] = useState(fila.marca?.nota ?? "");
  const [anexo, setAnexo] = useState(fila.marca?.referenciaAnexo ?? "");
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [guardando, startGuardar] = useTransition();

  const guardar = () => {
    const texto = nota.trim();
    if (!texto || guardando) return;
    startGuardar(async () => {
      const datos = new FormData();
      datos.set("encabezadoId", String(encabezadoId));
      datos.set("dimension", "tercero");
      datos.set("clave", fila.clave);
      datos.set("nota", texto);
      datos.set("referenciaAnexo", anexo.trim());
      // La diferencia la recalcula el servidor sobre el cruce vigente.
      for (const archivo of nuevos) datos.append("soportes", archivo);

      const r = await guardarMarcaCruce(datos);
      if (r.ok) {
        notifySuccess(r.message ?? "Marca guardada.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudo guardar la marca.");
      }
    });
  };

  const titulo = fila.marca
    ? `${etiquetaMarca(fila.marca.numero)} · ${etiquetaTercero(fila)}`
    : `Nueva marca · ${etiquetaTercero(fila)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      size="lg"
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={!nota.trim() || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Guardando…" : fila.marca ? "Guardar cambios" : "Poner marca"}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px]">
          <div>
            <div className="text-ink-500">Contabilidad</div>
            <div className="font-semibold tabular-nums text-ink-800">{fmtContable(fila.contable.total)}</div>
          </div>
          <div>
            <div className="text-ink-500">Auxiliar</div>
            <div className="font-semibold tabular-nums text-ink-800">{fmtContable(fila.modulo.total)}</div>
          </div>
          <div>
            <div className="text-ink-500">Diferencia</div>
            <div className={`font-semibold tabular-nums ${fila.admiteMarca ? "text-err-700" : "text-ok-700"}`}>{fmtContable(fila.diferencia)}</div>
          </div>
        </div>

        {fila.admiteMarca && !fila.requiereMarca && (
          <p className="text-[11.5px] text-ink-500">
            La diferencia está por debajo del umbral de descuadre: la marca es opcional y no condiciona el cierre.
          </p>
        )}

        {fila.desactualizada && fila.marca && (
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            La diferencia era <b>{fmtContable(fila.marca.diferencia)}</b> cuando se escribió esta marca. Actualízala para dejar constancia del monto de hoy.
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">Detalle de la marca</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={5}
            autoFocus
            placeholder="Explica a qué corresponde la diferencia del tercero y cómo se soporta al corte."
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <span className="self-end text-[10.5px] text-ink-400">{nota.length}/{MAX_NOTA_MARCA}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">
            Referencia al anexo <span className="font-normal text-ink-400">(opcional)</span>
          </span>
          <input
            type="text"
            value={anexo}
            onChange={(e) => setAnexo(e.target.value.slice(0, MAX_REFERENCIA_ANEXO))}
            placeholder="P. ej. Anexo C-2 · confirmación de saldo"
            className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </label>

        <EditorSoportesMarca encabezadoId={encabezadoId} yaGuardados={fila.marca?.adjuntos ?? []} nuevos={nuevos} onCambiarNuevos={setNuevos} />

        <p className="text-[11.5px] text-ink-500">
          La marca queda numerada en el cruce por tercero y su detalle en observaciones. La numeración es la misma del cruce contable. Se conserva al cargar versiones nuevas de este período.
        </p>
      </div>
    </Modal>
  );
}
