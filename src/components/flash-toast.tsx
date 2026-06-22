"use client";

import { useEffect, useRef } from "react";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  type ClientNotificationTone,
} from "@/lib/client-notifications";

/**
 * Dispara un toast UNA sola vez al montar. Pensado para confirmar el resultado
 * de una operación que terminó con un redirect del servidor (p. ej. «ejecutar
 * conciliación» o «cambiar contraseña»): el componente de origen ya navegó, así
 * que la confirmación se emite en la página destino. El `ActionToaster` vive en
 * el layout (app) y persiste entre navegaciones, por lo que recibe el evento.
 *
 * Quién decide MOSTRARSE es el server component destino (leyendo `searchParams`).
 * Con `clearParam` se elimina ese query param de la URL mediante la History API
 * (sin recargar ni navegar) para que un refresh no vuelva a disparar el toast.
 */
export function FlashToast({
  tone = "success",
  title,
  message,
  clearParam,
}: {
  tone?: ClientNotificationTone;
  title: string;
  message?: string;
  clearParam?: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const notify =
      tone === "error" ? notifyError : tone === "info" ? notifyInfo : notifySuccess;
    notify(title, message);

    if (clearParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearParam)) {
        url.searchParams.delete(clearParam);
        const qs = url.searchParams.toString();
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`,
        );
      }
    }
  }, [tone, title, message, clearParam]);

  return null;
}
