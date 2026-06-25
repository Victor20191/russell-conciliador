"use client";

import { useState } from "react";

/**
 * Avatar de usuario: pinta la foto de perfil si existe y, si no (o si la imagen
 * falla al cargar), cae a las iniciales — el comportamiento actual de toda la
 * plataforma. Usa `<img>` nativo a propósito: la foto se sirve por un endpoint
 * autenticado (`/api/usuarios/[id]/foto`) y el optimizador de `next/image`
 * haría un fetch del servidor SIN la cookie de sesión.
 */
export function Avatar({
  src,
  initials,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  initials: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  const dim = { width: size, height: size } as const;

  if (src && !fallo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado; ver nota arriba
      <img
        src={src}
        alt={name ? `Foto de ${name}` : "Foto de perfil"}
        title={name}
        width={size}
        height={size}
        onError={() => setFallo(true)}
        style={dim}
        className={`shrink-0 rounded-full bg-ink-100 object-cover ${className}`}
      />
    );
  }

  return (
    <span
      title={name}
      style={{ ...dim, fontSize: Math.round(size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-full bg-navy-700 font-semibold leading-none text-white ${className}`}
    >
      {initials}
    </span>
  );
}
