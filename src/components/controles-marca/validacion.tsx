"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { mensajeValidacion, posicionEmergente } from "@/lib/marca/emergentes";
import { CAPA_AVISO, vista } from "./comun";

/**
 * Validación de formularios con la marca. Un campo obligatorio vacío o un valor
 * fuera de su regla hacen que el navegador muestre su burbuja (fuente y colores
 * del sistema, y el idioma del navegador). Al cancelar el evento `invalid` la
 * burbuja no aparece y el mensaje, en español, se muestra aquí bajo el campo.
 */

type Mensaje = { texto: string; campo: Element };

export function ValidacionDeMarca() {
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let yaMostrado = false;
    const alInvalidar = (evento: Event) => {
      evento.preventDefault();
      const campo = evento.target as HTMLInputElement;
      // Un envío dispara `invalid` en cada campo inválido: se avisa el primero, como el navegador.
      if (yaMostrado) return;
      yaMostrado = true;
      queueMicrotask(() => {
        yaMostrado = false;
      });
      campo.focus?.({ preventScroll: true });
      campo.scrollIntoView?.({ block: "nearest" });
      const etiqueta = campo instanceof HTMLSelectElement ? "select" : campo instanceof HTMLTextAreaElement ? "textarea" : "input";
      const texto = mensajeValidacion({
        validez: campo.validity,
        etiqueta,
        tipo: (campo.getAttribute("type") ?? "").toLowerCase(),
        min: campo.getAttribute("min") ?? undefined,
        max: campo.getAttribute("max") ?? undefined,
        minLength: campo.minLength,
        maxLength: campo.maxLength,
        largo: campo.value?.length,
        formato: campo.getAttribute("title") ?? campo.getAttribute("data-rb-aviso"),
        mensajePropio: campo.validationMessage,
      });
      setMensaje({ texto, campo });
    };
    document.addEventListener("invalid", alInvalidar, true);
    return () => document.removeEventListener("invalid", alInvalidar, true);
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const cerrar = () => setMensaje(null);
    const reloj = window.setTimeout(cerrar, 6000);
    mensaje.campo.addEventListener("input", cerrar);
    mensaje.campo.addEventListener("blur", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      window.clearTimeout(reloj);
      mensaje.campo.removeEventListener("input", cerrar);
      mensaje.campo.removeEventListener("blur", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [mensaje]);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!mensaje || !el) return;
    const { top, left } = posicionEmergente(mensaje.campo.getBoundingClientRect(), { ancho: el.offsetWidth, alto: el.offsetHeight }, vista());
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }, [mensaje]);

  if (!mensaje) return null;
  return createPortal(
    <div
      ref={caja}
      role="alert"
      style={{ top: 0, left: 0, visibility: "hidden" }}
      className={`pointer-events-none fixed ${CAPA_AVISO} flex max-w-[320px] items-start gap-1.5 rounded-md border border-err-500 bg-white px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-err-700 shadow-md`}
    >
      <Icon name="warn" size={13} stroke={2} className="mt-px shrink-0" />
      <span>{mensaje.texto}</span>
    </div>,
    document.body,
  );
}
