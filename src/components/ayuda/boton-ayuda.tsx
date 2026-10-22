"use client";

import { Icon } from "@/components/icons";
import { ID_BOTON_AYUDA, ID_PANEL_AYUDA, useAccionesAyuda, useEstadoAyuda } from "./contexto";

/** Trae el código del panel antes del clic (al pasar el mouse o enfocar el botón). */
function precargarPanel() {
  void import("./panel-ayuda");
}

/** Botón «?» de la barra superior: abre y cierra la ayuda de la pantalla actual. */
export default function BotonAyuda() {
  const { alternar } = useAccionesAyuda();
  const { abierta } = useEstadoAyuda();
  return (
    <button
      id={ID_BOTON_AYUDA}
      type="button"
      onClick={alternar}
      onPointerEnter={precargarPanel}
      onFocus={precargarPanel}
      aria-label="Ayuda de esta pantalla"
      title="Ayuda de esta pantalla"
      aria-expanded={abierta}
      aria-controls={abierta ? ID_PANEL_AYUDA : undefined}
      className={`rounded-md border p-2 transition ${
        abierta ? "border-blue-400 bg-blue-50 text-navy-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
      }`}
    >
      <Icon name="help-circle" size={16} />
    </button>
  );
}
