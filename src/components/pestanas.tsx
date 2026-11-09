"use client";

import Link from "next/link";

/**
 * Una pestaña: botón (cambia la vista en la misma pantalla) o enlace (`href`, cuando la pestaña
 * carga otros datos del servidor, como las de Mapeos DIAN). Va dentro de un contenedor con
 * `role="tablist"`. `conteo` muestra un número a la derecha.
 */
export function Pestana({
  activa,
  label,
  onClick,
  href,
  conteo,
}: {
  activa: boolean;
  label: string;
  onClick?: () => void;
  href?: string;
  conteo?: number;
}) {
  const clase = `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${activa ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`;
  const contenido = (
    <>
      {label}
      {conteo != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${activa ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-500"}`}>{conteo}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} role="tab" aria-selected={activa} className={clase} scroll={false}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" role="tab" aria-selected={activa} onClick={onClick} className={clase}>
      {contenido}
    </button>
  );
}
