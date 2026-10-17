"use client";

// Tarjeta de Novedades con las alertas del archivo que exigen comentario para cerrar la
// conciliación (Inventarios: valores negativos y las tres alertas de costo). Un comentario por
// tipo de alerta; si la alerta cambió desde que se escribió, queda «por revisar» y se confirma
// volviéndolo a guardar.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { guardarComentarioAlerta } from "@/app/actions/comentarios-alertas-modulo";
import {
  contarAlerta,
  MAX_COMENTARIO_ALERTA,
  MIN_COMENTARIO_ALERTA,
  type AlertaConComentario,
  type EstadoComentarioAlerta,
} from "@/lib/modulos/comentarios-alertas";

const CHIP: Record<EstadoComentarioAlerta, { label: string; tone: "ok" | "warn" | "err" }> = {
  pendiente: { label: "Falta comentario", tone: "err" },
  por_revisar: { label: "Por revisar", tone: "warn" },
  comentada: { label: "Comentada", tone: "ok" },
};

/** «3 documentos · $ 1.200» o el detalle propio de la alerta (la fecha de corte deducida). */
function cifras(a: Pick<AlertaConComentario, "referencias" | "valor" | "unidad" | "muestraValor">): string {
  return `${contarAlerta(a.referencias, a.unidad)}${a.muestraValor && a.valor !== 0 ? ` · ${fmtContable(a.valor)}` : ""}`;
}

export function ComentariosAlertasCard({
  alertas,
  encabezadoId,
  puedeComentar,
}: {
  alertas: AlertaConComentario[];
  encabezadoId: number;
  puedeComentar: boolean;
}) {
  const [editando, setEditando] = useState<AlertaConComentario | null>(null);
  if (alertas.length === 0) return null;
  const faltan = alertas.filter((a) => a.estado !== "comentada").length;

  return (
    <Card className="p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Alertas que exigen comentario para cerrar</div>
      <p className="mb-3 text-[12px] text-ink-500">
        Cada tipo de alerta del cargue necesita un comentario de al menos {MIN_COMENTARIO_ALERTA} caracteres para poder cerrar la conciliación.
        {faltan > 0
          ? <> Faltan <b className="text-err-700">{faltan}</b>.</>
          : <span className="text-ok-700"> Todas están comentadas.</span>}
      </p>
      <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150">
        {alertas.map((a) => (
          <li key={a.tipo} className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold text-ink-800">{a.etiqueta}</span>
                <span className="text-[12px] text-ink-500">{a.detalle ?? cifras(a)}</span>
                <Chip label={CHIP[a.estado].label} tone={CHIP[a.estado].tone} />
              </div>
              {puedeComentar && (
                <button
                  type="button"
                  onClick={() => setEditando(a)}
                  className="rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
                >
                  {a.estado === "pendiente" ? "Comentar" : a.estado === "por_revisar" ? "Revisar" : "Editar"}
                </button>
              )}
            </div>
            {a.comentario && (
              <>
                <p className="whitespace-pre-wrap break-words text-[12px] text-ink-700">{a.comentario.comentario}</p>
                <p className="text-[11px] text-ink-400">
                  {a.comentario.comentadoPor ?? "—"} · {a.comentario.comentadoEn}
                  {a.estado === "por_revisar" && (
                    <span className="text-warn-700">
                      {" "}· cuando se escribió: {cifras({ ...a, referencias: a.comentario.referencias, valor: a.comentario.valor })}; hoy: {cifras(a)}
                      {!a.muestraValor && a.referencias === a.comentario.referencias ? " (cambiaron los casos o las fechas)" : ""}.
                    </span>
                  )}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      {editando && (
        <ModalComentarioAlerta key={editando.tipo} alerta={editando} encabezadoId={encabezadoId} onClose={() => setEditando(null)} />
      )}
    </Card>
  );
}

function ModalComentarioAlerta({
  alerta,
  encabezadoId,
  onClose,
}: {
  alerta: AlertaConComentario;
  encabezadoId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(alerta.comentario?.comentario ?? "");
  const [guardando, startGuardar] = useTransition();
  const largo = texto.trim().length;
  const valido = largo >= MIN_COMENTARIO_ALERTA && largo <= MAX_COMENTARIO_ALERTA;

  const guardar = () => {
    startGuardar(async () => {
      const r = await guardarComentarioAlerta({ encabezadoId, tipo: alerta.tipo, comentario: texto });
      if (r.ok) {
        notifySuccess(r.message ?? "Comentario guardado.");
        onClose();
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo guardar el comentario.");
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Comentario · ${alerta.etiqueta}`}
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={!valido || guardando}
          className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : alerta.estado === "por_revisar" ? "Confirmar comentario" : "Guardar comentario"}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-ink-600">
          {alerta.detalle ?? <>Hoy la alerta tiene {cifras(alerta)}.</>} El comentario queda para todo el período y se guarda con
          estas cifras: si una versión nueva las cambia, quedará por revisar.
        </p>
        {alerta.estado === "por_revisar" && alerta.comentario && (
          <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            La alerta cambió desde que se escribió este comentario ({cifras({ ...alerta, referencias: alerta.comentario.referencias, valor: alerta.comentario.valor })} entonces, {cifras(alerta)} hoy). Revísalo y guárdalo de nuevo para confirmarlo.
          </p>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          maxLength={MAX_COMENTARIO_ALERTA}
          aria-label={`Comentario de la alerta ${alerta.etiqueta}`}
          placeholder="Explica por qué se presenta la alerta y qué se verificó."
          className="w-full rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-800 outline-none focus:border-blue-400"
        />
        <span className={`text-right text-[11px] ${largo < MIN_COMENTARIO_ALERTA ? "text-err-700" : "text-ink-400"}`}>
          {largo < MIN_COMENTARIO_ALERTA ? `Mínimo ${MIN_COMENTARIO_ALERTA} caracteres (${largo})` : `${largo} / ${MAX_COMENTARIO_ALERTA}`}
        </span>
      </div>
    </Modal>
  );
}
