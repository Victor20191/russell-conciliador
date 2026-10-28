import { posicionEmergente } from "@/lib/marca/emergentes";

/**
 * Piezas compartidas de los controles de la marca: reemplazan, para TODA la
 * plataforma, lo que el navegador dibujaría con los colores y la fuente del
 * sistema operativo (la lista de un `<select>`, el calendario de una fecha, las
 * sugerencias de un `<datalist>`, el aviso de `title`, la burbuja de validación).
 * El control nativo sigue siendo el dueño del valor: los formularios, los eventos
 * de React y el envío no cambian.
 */

/** Cambia el valor como si lo hubiera hecho la persona: React y el formulario se enteran. */
export function fijarValor(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valor: string): void {
  const prototipo =
    control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototipo, "value")?.set?.call(control, valor);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Ubica la ventana junto a su control (debajo, o encima si no cabe) y la muestra. */
export function ubicarJunto(panel: HTMLElement, control: Element, anchoMinimo?: number): void {
  const ancla = control.getBoundingClientRect();
  if (anchoMinimo != null) panel.style.minWidth = `${Math.max(ancla.width, anchoMinimo)}px`;
  const { top, left } = posicionEmergente(ancla, { ancho: panel.offsetWidth, alto: panel.offsetHeight }, vista());
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.visibility = "visible";
}

/**
 * La página se desplazó con una ventana abierta: la ventana sigue a su control y
 * solo se cierra si el control salió de la vista. (Cerrarla con cualquier
 * desplazamiento la cerraba al abrirla: enfocar el control mueve su contenedor.)
 */
export function seguirAlControl(evento: Event, panel: HTMLElement | null, control: Element | null, reubicar: () => void, cerrar: () => void): void {
  if (!panel || !control) return;
  if (evento.target instanceof Node && panel.contains(evento.target)) return;
  const caja = control.getBoundingClientRect();
  if (caja.bottom < 0 || caja.top > window.innerHeight) cerrar();
  else reubicar();
}

/** Medidas de la ventana para posicionar. */
export function vista(): { ancho: number; alto: number } {
  return { ancho: window.innerWidth, alto: window.innerHeight };
}

/** Marca de las ventanas emergentes de la marca: un clic dentro no las cierra. */
export const ATRIBUTO_EMERGENTE = "data-rb-emergente";

/** Capa: por encima de los modales (z-50). */
export const CAPA_EMERGENTE = "z-[95]";
export const CAPA_AVISO = "z-[100]";

export const CLASE_EMERGENTE = `fixed ${CAPA_EMERGENTE} rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-800 shadow-lg`;
