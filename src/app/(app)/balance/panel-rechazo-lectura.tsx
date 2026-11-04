"use client";

import { useEffect, useRef } from "react";
import { IconoEnTexto } from "@/components/icons";
import type { RechazoLectura } from "@/lib/balance/extraccion/causa-sin-cuentas";

/**
 * Panel con la causa por la que el archivo NO se cargó. Aparece cuando el modelo
 * marcó el archivo como no importable: el usuario debe entender que repetir la
 * lectura (con otro modelo o más tarde) no cambia el resultado y que lo que falta
 * es un archivo distinto. Es presentacional: no llama a ninguna acción del servidor.
 */
export function PanelRechazoLectura({
  message,
  rechazo,
}: {
  /** Frase que dice la causa por sí sola (`LeerBalanceState.message`). */
  message: string;
  rechazo: RechazoLectura;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // El cuerpo del modal tiene scroll: si el panel aparece fuera de la vista, se acerca.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const faltan = rechazo.columnasFaltantes.length > 0;
  // Sin columnas faltantes el mensaje ya trae el motivo: repetirlo sería duplicar la frase.
  const detalle = rechazo.motivo && !message.includes(rechazo.motivo) ? rechazo.motivo : null;

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-1.5 rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] text-err-700"
    >
      <p className="font-semibold">
        <IconoEnTexto name="warn" />
        {message}
      </p>
      {detalle && (
        <p>
          <span className="font-semibold">Detalle de la lectura:</span> {detalle}
        </p>
      )}
      <p>
        <span className="font-semibold">Qué hacer:</span> pide o genera en el ERP un balance de prueba con saldo
        inicial, débitos, créditos y saldo final, y cárgalo.
      </p>
      <p>
        No es una falla temporal ni se debe al tamaño del archivo.
        {faltan && " Volver a leerlo no agrega esas columnas."}
      </p>
    </div>
  );
}
