"use client";

import { useEffect } from "react";

/**
 * Modales abiertos a la vez. Es un contador y no un booleano porque un modal
 * puede abrir otro encima (p. ej. la galería de adjuntos sobre el detalle de
 * un ticket): al cerrar el de arriba, el de abajo sigue exigiendo el bloqueo.
 */
let abiertos = 0;

/** Marca en `<html>` que hay al menos un modal abierto (la lee `globals.css`). */
const ATRIBUTO = "modalAbierto";

/**
 * Congela el desplazamiento de la app de fondo mientras el modal está abierto.
 *
 * No basta con `overflow: hidden` en el documento: el cascarón ocupa la altura
 * exacta de la ventana y quien realmente se desplaza es el `<main>` (y el
 * `<aside>` del menú). Como el velo del modal cubre toda la ventana, la rueda
 * sobre él se propagaba a ese contenedor y la página de atrás se iba, dejando
 * el modal flotando sobre un fondo en blanco.
 *
 * El bloqueo se hace por CSS (atributo en `<html>` + regla en `globals.css`)
 * para que valga también en los contenedores del cascarón, que este hook no
 * conoce. El cuerpo del modal conserva su propio scroll: la regla solo alcanza
 * a los contenedores marcados con `data-scroll-app`.
 */
export function useBloqueoScrollFondo(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    abiertos += 1;
    document.documentElement.dataset[ATRIBUTO] = "true";
    return () => {
      abiertos -= 1;
      if (abiertos === 0) delete document.documentElement.dataset[ATRIBUTO];
    };
  }, [activo]);
}
