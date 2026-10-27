"use client";

import { useCallback, useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * Si una imagen quedó rota. `onError` no basta: si la imagen falla antes de que
 * React tome la página (hidratación), el evento ya pasó y nadie lo escucha; por
 * eso, al montarse, `decode()` confirma si quedó rota.
 */
export function useImagenRota(): [boolean, (img: HTMLImageElement | null) => void, () => void] {
  const [rota, setRota] = useState(false);
  const marcar = useCallback(() => setRota(true), []);
  const revisar = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    img.decode().catch(() => {
      if (img.isConnected && img.complete && img.naturalWidth === 0) setRota(true);
    });
  }, []);
  return [rota, revisar, marcar];
}

/**
 * `<img>` que, si la imagen no carga, muestra `respaldo` en lugar del ícono roto
 * del navegador (que trae sus propios colores, fuera del manual de marca).
 */
export function ImagenConRespaldo({ respaldo, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { respaldo: ReactNode }) {
  const [rota, revisar, marcar] = useImagenRota();
  if (rota) return <>{respaldo}</>;
  // eslint-disable-next-line @next/next/no-img-element -- imágenes de endpoints autenticados o archivos locales
  return <img {...props} alt={alt} ref={revisar} onError={marcar} />;
}
