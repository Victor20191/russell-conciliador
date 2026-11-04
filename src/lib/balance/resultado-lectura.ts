// Qué parte del resultado de la lectura se pinta en el modal de carga. Es pura (sin
// React ni BD) para poder comprobar los dos pasos del formulario sin montar la app:
//   · paso 1: el usuario elige el archivo (y la hoja) y lo envía;
//   · paso 2: ya hay un cliente elegido (`clienteCarga != null`), el input de archivo
//     está desmontado y el formulario solo conserva «Continuar con cliente».
// El resultado de una lectura fallida debe verse en AMBOS pasos; el aviso «elige un
// cliente» (`requiereCliente`) no es un error y tiene su propio recuadro.
import type { Excepcion } from "./extraccion/esquema";
import { excepcionesSinRechazo, type RechazoLectura } from "./extraccion/causa-sin-cuentas";
import { MENSAJE_RECUPERAR_LECTURA } from "./recuperacion-red";

export const TITULO_OTRAS_OBSERVACIONES = "Otras observaciones de la lectura";

/** Subconjunto de `LeerBalanceState` que decide la visibilidad. */
export type EstadoLecturaVisible = {
  message?: string;
  requiereCliente?: boolean;
  errorProveedorIA?: boolean;
  errores?: unknown[];
  excepciones?: Excepcion[];
  rechazoLectura?: RechazoLectura;
};

export type ResultadoLecturaVisible = {
  /** Mensaje de error genérico (rojo, o ámbar si fue el proveedor de IA). */
  mensaje: boolean;
  /** Panel de rechazo: sustituye al mensaje genérico. */
  rechazo: RechazoLectura | null;
  errores: boolean;
  excepciones: Excepcion[];
  /** Título de la tabla de excepciones; `undefined` = el predeterminado. */
  tituloExcepciones: string | undefined;
};

export function resolverResultadoLectura(p: {
  estado: EstadoLecturaVisible;
  /** Hay un cliente elegido (el formulario está en su segundo paso). */
  segundoPaso: boolean;
  /** Se cambió de archivo, hoja, proveedor o cliente después de esta lectura. */
  desactualizado: boolean;
  /** Se está subiendo o leyendo: el estado anterior sigue montado hasta que llegue el nuevo. */
  enCurso: boolean;
  /** El mensaje es el de «reintenta» tras perder la respuesta y ya procede mostrarlo. */
  reintentoPendiente: boolean;
}): ResultadoLecturaVisible {
  const { estado } = p;
  const rechazoDeLectura = estado.rechazoLectura && estado.message ? estado.rechazoLectura : null;
  // Un rechazo describe a UN archivo: no se pinta nada de él (ni mensaje ni
  // excepciones) cuando ya se eligió otro o mientras se vuelve a leer.
  const obsoleto = rechazoDeLectura != null && (p.desactualizado || p.enCurso);
  const rechazo = obsoleto ? null : rechazoDeLectura;
  const visible = (!p.segundoPaso || !estado.requiereCliente) && !obsoleto;
  const excepciones = rechazo ? excepcionesSinRechazo(estado.excepciones ?? []) : (estado.excepciones ?? []);
  return {
    mensaje:
      visible
      && !rechazo
      && !!estado.message
      && !estado.requiereCliente
      && (estado.message !== MENSAJE_RECUPERAR_LECTURA || p.reintentoPendiente),
    rechazo: visible ? rechazo : null,
    errores: visible && (estado.errores?.length ?? 0) > 0,
    excepciones: visible ? excepciones : [],
    tituloExcepciones: rechazo ? TITULO_OTRAS_OBSERVACIONES : undefined,
  };
}
