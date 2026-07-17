"use client";

import { useActionState, useEffect, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { actualizarPrompt, restaurarPrompt } from "@/app/actions/prompts";
import type { ActionState } from "@/lib/definitions";
import type { PromptVista } from "@/lib/ia/prompts";

export default function PromptsClient({ prompts }: { prompts: PromptVista[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-ai-100 bg-ai-100/30 px-3 py-2.5 text-[12.5px] text-ai-700">
        Estos son los <span className="font-semibold">prompts de sistema</span> que guían a la IA. Los datos variables
        (parámetros del archivo, vista previa, plan de cuentas y lista de cuentas a mapear) se agregan
        automáticamente en cada llamada y no se editan aquí.
      </div>
      {prompts.map((p) => (
        <PromptEditor key={p.clave} prompt={p} />
      ))}
    </div>
  );
}

function PromptEditor({ prompt }: { prompt: PromptVista }) {
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(actualizarPrompt, {});
  const [restaurarState, restaurarAction, restaurando] = useActionState<ActionState, FormData>(restaurarPrompt, {});
  const [valor, setValor] = useState(prompt.contenido);
  const [contenidoPrevio, setContenidoPrevio] = useState(prompt.contenido);
  const [confirmarReset, setConfirmarReset] = useState(false);

  // Resincroniza el textarea cuando el servidor revalida (tras guardar o
  // restaurar). Patrón de ajuste de estado en render (no en efecto).
  if (prompt.contenido !== contenidoPrevio) {
    setContenidoPrevio(prompt.contenido);
    setValor(prompt.contenido);
    setConfirmarReset(false);
  }

  useEffect(() => {
    notifyActionState(guardarState, { success: "Prompt actualizado.", error: "No se pudo guardar el prompt." });
  }, [guardarState]);

  useEffect(() => {
    notifyActionState(restaurarState, { success: "Prompt restaurado al predeterminado.", error: "No se pudo restaurar el prompt." });
  }, [restaurarState]);

  const sucio = valor !== prompt.contenido;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="ai" size={15} />
            <h2 className="text-[14px] font-semibold text-ink-900">{prompt.nombre}</h2>
            <Chip label={prompt.esPredeterminado ? "Predeterminado" : "Personalizado"} tone={prompt.esPredeterminado ? "ink" : "ai"} />
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{prompt.descripcion}</p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-ink-400">
          {prompt.actualizadoEn ? (
            <>
              Editado {fmtDateTime(prompt.actualizadoEn)}
              {prompt.actualizadoPor ? ` · ${prompt.actualizadoPor}` : ""}
            </>
          ) : (
            "Sin ediciones"
          )}
        </div>
      </div>

      <form action={guardarAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="clave" value={prompt.clave} />
        <textarea
          name="contenido"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          rows={16}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-ink-200 bg-ink-50/40 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-800 outline-none focus:border-blue-400"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-400">{valor.length.toLocaleString("es-CO")} caracteres</span>

          {/* Restaurar predeterminado: confirmación en dos pasos (descarta cambios). */}
          <div className="ml-auto flex items-center gap-2">
            {confirmarReset ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-ink-500">¿Restaurar el predeterminado?</span>
                <button
                  type="submit"
                  form={`reset-${prompt.clave}`}
                  disabled={restaurando}
                  className="rounded-md border border-err-200 px-2.5 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-50 disabled:opacity-60"
                >
                  {restaurando ? "Restaurando…" : "Sí, restaurar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarReset(false)}
                  className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarReset(true)}
                disabled={prompt.esPredeterminado}
                title={prompt.esPredeterminado ? "Ya está en el valor predeterminado." : undefined}
                className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
              >
                Restaurar predeterminado
              </button>
            )}

            <button
              type="submit"
              disabled={!sucio || guardando}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </form>

      {/* Form separado para restaurar (no puede anidarse en el de guardar). */}
      <form id={`reset-${prompt.clave}`} action={restaurarAction} className="hidden">
        <input type="hidden" name="clave" value={prompt.clave} />
      </form>
    </Card>
  );
}
