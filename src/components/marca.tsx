import Image from "next/image";

/**
 * Proporción del imagotipo oficial: el PDF vectorial del área de mercadeo, pasado a
 * SVG con el lienzo ajustado a su arte (412,6 × 89,5 puntos).
 */
const PROPORCION = 89.5 / 412.6;

/** §4.2: el ancho mínimo del logotipo es 30 mm (≈ 114 px a 96 ppp). */
export const ANCHO_MINIMO_LOGO_PX = 114;

/** §4.2: espacio libre alrededor del logo, al menos el 20 % de su ancho. */
export function espacioLibreLogo(ancho: number): number {
  return Math.ceil(Math.max(ancho, ANCHO_MINIMO_LOGO_PX) * 0.2);
}

/**
 * Logotipo oficial de Russell Bedford (Manual de Marca §1 y §4): el símbolo del
 * globo, el nombre y el eslogan «taking you further» siempre juntos, tal como los
 * entrega el área de mercadeo, sin redibujarlos: el PDF vectorial oficial en SVG
 * (`public/marca/russell-bedford-*.svg`), con el azul en su equivalente RGB del
 * manual (§3.1, `#001871`; el PDF viene en CMYK).
 *
 * - `azul` sobre fondo blanco o claro; `blanco` sobre un fondo de color sólido.
 * - Nunca más angosto que 30 mm: un ancho menor se lleva al mínimo.
 * - Reserva su espacio libre (20 % del ancho por cada lado) con padding, para
 *   que nada se acerque ni se lea junto al nombre. `espacioLibre={false}` solo
 *   cuando el contenedor ya garantiza ese margen vacío.
 */
export function LogoRussellBedford({
  variante = "azul",
  ancho = ANCHO_MINIMO_LOGO_PX,
  espacioLibre = true,
  prioridad = false,
  className = "",
}: {
  variante?: "azul" | "blanco";
  ancho?: number;
  espacioLibre?: boolean;
  prioridad?: boolean;
  className?: string;
}) {
  const w = Math.max(Math.round(ancho), ANCHO_MINIMO_LOGO_PX);
  const h = Math.round(w * PROPORCION);
  return (
    <span
      className={`inline-block shrink-0 leading-none ${className}`.trim()}
      style={espacioLibre ? { padding: espacioLibreLogo(w) } : undefined}
    >
      <Image
        src={`/marca/russell-bedford-${variante}.svg`}
        alt="Russell Bedford · taking you further"
        width={w}
        height={h}
        // El archivo oficial se sirve tal cual: el optimizador recomprimiría el arte de la marca.
        unoptimized
        priority={prioridad}
        className="block max-w-none select-none"
        draggable={false}
      />
    </span>
  );
}

/**
 * El símbolo del globo como MOTIVO DECORATIVO (§4.1): permitido por separado del
 * logotipo, nunca como logo por derecho propio, distorsionado ni girado. Por eso
 * es `aria-hidden` y no lleva texto alternativo: no identifica a la firma.
 */
export function MotivoGlobo({
  variante = "azul",
  tamano,
  className = "",
}: {
  variante?: "azul" | "blanco";
  tamano: number;
  className?: string;
}) {
  return (
    <Image
      src={`/marca/isotipo-${variante}.svg`}
      alt=""
      aria-hidden
      width={tamano}
      height={tamano}
      unoptimized
      className={`pointer-events-none select-none ${className}`.trim()}
      draggable={false}
    />
  );
}

/** Franja institucional de cuatro colores (§5.1 y §5.2): cierra pantallas y documentos. */
export function FranjaMarca({ className = "h-1" }: { className?: string }) {
  return <div aria-hidden className={`franja-marca w-full shrink-0 ${className}`.trim()} />;
}
