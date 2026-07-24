"use client";

import { useActionState, useEffect, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmt, fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { actualizarUmbral, restaurarUmbral } from "@/app/actions/parametros";
import type { ActionState } from "@/lib/definitions";
import type { UmbralVista } from "@/lib/parametros/umbrales";

/** Solo dígitos: el input acepta pegar «$ 50.000» y se queda con 50000. */
const soloDigitos = (s: string) => s.replace(/[^\d]/g, "");
/** Miles con punto mientras se escribe (es-CO), sin símbolo de moneda. */
const conSeparadores = (s: string) => (s === "" ? "" : Number(s).toLocaleString("es-CO"));

export default function ParametrosClient({ umbrales }: { umbrales: UmbralVista[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
        Los cambios son <span className="font-semibold">retroactivos</span>: como las validaciones se recalculan
        cada vez que se abre un balance, subir o bajar un umbral cambia al instante las alertas de todos los
        borradores y balances existentes, incluidos los oficiales y congelados.
      </div>
      {umbrales.map((u) => (
        <UmbralEditor key={u.clave} umbral={u} />
      ))}
    </div>
  );
}

function UmbralEditor({ umbral }: { umbral: UmbralVista }) {
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(actualizarUmbral, {});
  const [restaurarState, restaurarAction, restaurando] = useActionState<ActionState, FormData>(restaurarUmbral, {});
  const [valor, setValor] = useState(String(umbral.valor));
  const [valorPrevio, setValorPrevio] = useState(umbral.valor);
  const [confirmarReset, setConfirmarReset] = useState(false);

  // Resincroniza el input cuando el servidor revalida (tras guardar o restaurar).
  // Patrón de ajuste de estado en render (no en efecto).
  if (umbral.valor !== valorPrevio) {
    setValorPrevio(umbral.valor);
    setValor(String(umbral.valor));
    setConfirmarReset(false);
  }

  useEffect(() => {
    notifyActionState(guardarState, { success: "Umbral actualizado.", error: "No se pudo guardar el umbral." });
  }, [guardarState]);

  useEffect(() => {
    notifyActionState(restaurarState, { success: "Umbral restaurado al predeterminado.", error: "No se pudo restaurar el umbral." });
  }, [restaurarState]);

  const numero = valor === "" ? null : Number(valor);
  const fueraDeRango = numero != null && (numero < umbral.minimo || numero > umbral.maximo);
  const sucio = valor !== String(umbral.valor);
  const puedeGuardar = sucio && numero != null && !fueraDeRango && !guardando;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="settings" size={15} />
            <h2 className="text-[14px] font-semibold text-ink-900">{umbral.nombre}</h2>
            <Chip label={umbral.esPredeterminado ? "Predeterminado" : "Personalizado"} tone={umbral.esPredeterminado ? "ink" : "ai"} />
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{umbral.descripcion}</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
            <span className="font-semibold text-ink-500">Dónde aplica:</span> {umbral.dondeAplica}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-ink-400">
          {umbral.actualizadoEn ? (
            <>
              Editado {fmtDateTime(umbral.actualizadoEn)}
              {umbral.actualizadoPor ? ` · ${umbral.actualizadoPor}` : ""}
            </>
          ) : (
            "Sin ediciones"
          )}
        </div>
      </div>

      <form action={guardarAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="clave" value={umbral.clave} />
        {/* El name va en un hidden con el valor CRUDO: el input visible lleva
            separadores de miles para leerse, pero al servidor viaja el número. */}
        <input type="hidden" name="valor" value={valor} />
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-ink-400">$</span>
          <input
            inputMode="numeric"
            value={conSeparadores(valor)}
            onChange={(e) => setValor(soloDigitos(e.target.value))}
            aria-label={`Monto del umbral ${umbral.nombre}`}
            className={`w-44 rounded-md border bg-white px-3 py-1.5 text-right font-mono text-[13px] tabular-nums text-ink-800 outline-none focus:border-blue-400 ${fueraDeRango ? "border-err-500" : "border-ink-200"}`}
          />
        </div>
        <span className="text-[11px] text-ink-400">
          Predeterminado {fmt(umbral.predeterminado)}
        </span>
        {fueraDeRango ? (
          <span className="text-[11.5px] font-medium text-err-700">
            Debe estar entre {fmt(umbral.minimo)} y {fmt(umbral.maximo)}.
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* Restaurar predeterminado: confirmación en dos pasos (descarta cambios). */}
          {confirmarReset ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] text-ink-500">¿Restaurar {fmt(umbral.predeterminado)}?</span>
              <button
                type="submit"
                form={`reset-${umbral.clave}`}
                disabled={restaurando}
                className="rounded-md border border-err-100 px-2.5 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-100/50 disabled:opacity-60"
              >
                {restaurando ? <EstadoProcesando>Restaurando</EstadoProcesando> : "Sí, restaurar"}
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
              disabled={umbral.esPredeterminado}
              title={umbral.esPredeterminado ? "Ya está en el valor predeterminado." : undefined}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
            >
              Restaurar predeterminado
            </button>
          )}

          <button
            type="submit"
            disabled={!puedeGuardar}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50"
          >
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar cambios"}
          </button>
        </div>
      </form>

      {/* Form separado para restaurar (no puede anidarse en el de guardar). */}
      <form id={`reset-${umbral.clave}`} action={restaurarAction} className="hidden">
        <input type="hidden" name="clave" value={umbral.clave} />
      </form>
    </Card>
  );
}
