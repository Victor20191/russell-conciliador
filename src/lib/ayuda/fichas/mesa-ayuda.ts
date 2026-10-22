// Ayuda en pantalla — ficha de la Mesa de ayuda (novedades reportadas a Xentria).

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

export const FICHA_MESA_AYUDA: FichaAyuda = {
  id: "soporte.mesa_ayuda",
  titulo: "Mesa de ayuda",
  proposito: "Las novedades reportadas sobre la plataforma: fallas, dudas y mejoras. Xentria las atiende y documenta la solución.",
  antesDeEmpezar: ["Antes de reportar, ten a mano la URL exacta de la pantalla y una captura completa."],
  etapas: [
    {
      titulo: "Reportar",
      acciones: [
        {
          nombre: "Nueva novedad",
          queHace:
            "Abre «Montar una novedad»: ruta y menú donde ocurre, URL de la pantalla, asunto, descripción y hasta 5 archivos (imágenes de hasta 4 MB; PDF, Excel o TXT de hasta 10 MB). «Enviar a Xentria» la crea.",
          regla: REGLAS.crearNovedad,
          fuente: { archivo: `${ACCIONES}/soporte.ts`, funcion: "crearNovedadInterna" },
        },
      ],
    },
    {
      titulo: "Seguir",
      acciones: [
        { nombre: "Tabla · Kanban", queHace: "Cambia la forma de ver las novedades; el navegador la recuerda.", regla: REGLAS.verMesaAyuda },
        {
          nombre: "Buscar · Reportado por",
          queHace: "Filtran por código, asunto, persona o ubicación, y por quién reportó.",
          regla: REGLAS.verMesaAyuda,
        },
        {
          nombre: "Estados visibles",
          queHace:
            "Oculta estados en la tabla y el Kanban; se guarda para tu usuario en todos tus dispositivos. «Mostrar todos temporalmente» los muestra sin cambiar tu preferencia.",
          regla: REGLAS.verMesaAyuda,
          fuente: { archivo: `${ACCIONES}/soporte-preferencias.ts`, funcion: "guardarEstadosOcultosTickets" },
        },
        {
          nombre: "Enviar mensaje",
          queHace: "En el detalle de una novedad, agrega un mensaje a su hilo.",
          regla: REGLAS.verMesaAyuda,
          condiciones: ["Solo quien reportó la novedad (y Xentria)."],
          fuente: { archivo: `${ACCIONES}/soporte.ts`, funcion: "agregarMensajeTicket" },
        },
      ],
    },
    {
      titulo: "Atender",
      acciones: [
        {
          nombre: "Guardar cambios · Mover a…",
          queHace: "Cambia el estado de la novedad y documenta la respuesta oficial o un mensaje para quien la reportó.",
          regla: REGLAS.gestionarNovedad,
          condiciones: [
            "La respuesta oficial se escribe una sola vez: al pasar a «Resuelto» se pide solo si la novedad aún no tiene; lo que se añada después va como mensaje del hilo.",
          ],
          fuente: { archivo: `${ACCIONES}/soporte.ts`, funcion: "gestionarTicket" },
        },
        {
          nombre: "Eliminar",
          queHace: "Elimina la novedad y sus archivos de forma definitiva; para retirarla sin borrarla se usa «Cerrado».",
          regla: REGLAS.eliminarNovedad,
          fuente: { archivo: `${ACCIONES}/soporte.ts`, funcion: "eliminarTicketSoporte" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Abierto", significado: "Entró y todavía nadie la tomó." },
    { etiqueta: "En evaluación", significado: "Es una mejora de la plataforma y está en estudio." },
    { etiqueta: "En proceso", significado: "Xentria la está atendiendo." },
    { etiqueta: "Resuelto", significado: "Se solucionó y quedó documentada." },
    { etiqueta: "Cerrado", significado: "Cerrada sin más gestión." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué no veo una novedad resuelta?",
      respuesta: "Por defecto se ocultan «Resuelto» y «Cerrado»: actívalos en «Estados» o usa «Mostrar todos temporalmente».",
    },
    { pregunta: "¿Quién puede escribir en el hilo?", respuesta: "Quien reportó la novedad y Xentria; los demás la ven sin poder escribir." },
  ],
};
