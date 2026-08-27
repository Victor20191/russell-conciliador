import {
  ESTADO_TICKET_CERRADO,
  ESTADO_TICKET_RESUELTO,
  etiquetaEstadoTicket,
} from "./soporte-estados";

/**
 * Historial de un ticket: la conversación completa en orden, lista para pintarse
 * como un chat.
 *
 * La gracia de armarlo aquí —puro, sin BD— es que las CUATRO pantallas que
 * muestran un ticket (la bandeja de Xentria, la página del usuario, el modal del
 * listado y el portal público) cuenten exactamente la misma historia. Antes cada
 * una decidía por su cuenta qué mostrar y en qué orden, y el portal público, por
 * ejemplo, escondía la descripción bajo un título distinto.
 *
 * Las tres fuentes son heterogéneas a propósito: la apertura y la respuesta
 * oficial son COLUMNAS del ticket (una sola de cada una, editables), mientras que
 * los mensajes y los cambios de estado son filas append-only. Unificarlas es
 * justamente lo que convierte «un ticket con notas» en un hilo.
 */

/** De qué lado del hilo viene un mensaje. */
export type LadoTicket = "reportante" | "xentria";

export type AdjuntoHistorial = { id: number; fileName: string };

export type MensajeTicket = {
  id: number;
  autor: string;
  lado: LadoTicket;
  contenido: string;
  createdAt: string;
};

export type EventoEstadoTicket = {
  id: number;
  autor: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  createdAt: string;
};

export type EntradaHistorial =
  /** El reporte original: lo que se escribió al abrir el ticket, con sus imágenes. */
  | {
      clave: string;
      tipo: "apertura";
      lado: "reportante";
      autor: string;
      contenido: string;
      fecha: string;
      adjuntos: AdjuntoHistorial[];
    }
  /** Un mensaje del hilo, de cualquiera de los dos lados. */
  | {
      clave: string;
      tipo: "mensaje";
      lado: LadoTicket;
      autor: string;
      contenido: string;
      fecha: string;
    }
  /** La respuesta oficial de Xentria: una sola, destacada, la conclusión del ticket. */
  | {
      clave: string;
      tipo: "respuesta";
      lado: "xentria";
      autor: string;
      contenido: string;
      fecha: string | null;
    }
  /** Un cambio de estado, sin lado: se pinta centrado, como un hito. */
  | {
      clave: string;
      tipo: "estado";
      autor: string;
      estadoAnterior: string | null;
      estadoNuevo: string;
      etiqueta: string;
      fecha: string;
    };

export type TicketHistorialEntrada = {
  reportante: string;
  descripcion: string;
  createdAt: string;
  adjuntos?: AdjuntoHistorial[];
  status: string;
  solution: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  mensajes: MensajeTicket[];
  eventos: EventoEstadoTicket[];
};

/**
 * Desempate cuando dos entradas comparten instante. Pasa de verdad: documentar
 * la solución escribe la respuesta Y mueve el estado a «Resuelto» en la misma
 * transacción, y sin este orden el hito «pasó a Resuelto» podía aparecer antes
 * de la respuesta que lo explica.
 */
const PESO_TIPO: Record<EntradaHistorial["tipo"], number> = {
  apertura: 0,
  mensaje: 1,
  respuesta: 2,
  estado: 3,
};

function marca(fecha: string | null): number {
  if (fecha === null) return Number.POSITIVE_INFINITY;
  const t = Date.parse(fecha);
  // Una fecha ilegible NO tumba el hilo ni se cuela al principio: se va al final,
  // que es donde menos reescribe la historia.
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function esLadoTicket(valor: string): valor is LadoTicket {
  return valor === "reportante" || valor === "xentria";
}

/**
 * Arma el hilo completo, en orden ascendente. La apertura va siempre primera:
 * es el único punto fijo del ticket y no compite con nada por fecha.
 */
export function construirHistorialTicket(ticket: TicketHistorialEntrada): EntradaHistorial[] {
  const entradas: EntradaHistorial[] = [];

  entradas.push({
    clave: "apertura",
    tipo: "apertura",
    lado: "reportante",
    autor: ticket.reportante,
    contenido: ticket.descripcion,
    fecha: ticket.createdAt,
    adjuntos: ticket.adjuntos ?? [],
  });

  for (const mensaje of ticket.mensajes) {
    entradas.push({
      clave: `mensaje-${mensaje.id}`,
      tipo: "mensaje",
      lado: mensaje.lado,
      autor: mensaje.autor,
      contenido: mensaje.contenido,
      fecha: mensaje.createdAt,
    });
  }

  if (ticket.solution) {
    entradas.push({
      clave: "respuesta",
      tipo: "respuesta",
      lado: "xentria",
      autor: ticket.resolvedByName ?? "Xentria",
      contenido: ticket.solution,
      // Sin `resolvedAt` (respuesta guardada sin marcar resuelto) no hay fecha
      // que mostrar y la entrada se va al final: es lo último que se sabe.
      fecha: ticket.resolvedAt,
    });
  }

  for (const evento of ticket.eventos) {
    entradas.push({
      clave: `estado-${evento.id}`,
      tipo: "estado",
      autor: evento.autor,
      estadoAnterior: evento.estadoAnterior,
      estadoNuevo: evento.estadoNuevo,
      etiqueta: etiquetaEstadoTicket(evento.estadoNuevo),
      fecha: evento.createdAt,
    });
  }

  // Tickets anteriores a la tabla de eventos: no hay ni un cambio registrado,
  // pero el ticket sí está resuelto o cerrado y se sabe cuándo. Se reconstruye
  // ese único hito para que el hilo no termine en el aire. Si falta la fecha no
  // se inventa nada: mejor un hilo incompleto que uno que miente.
  const cerrado = ticket.status === ESTADO_TICKET_RESUELTO || ticket.status === ESTADO_TICKET_CERRADO;
  if (ticket.eventos.length === 0 && cerrado && ticket.resolvedAt) {
    entradas.push({
      clave: "estado-derivado",
      tipo: "estado",
      autor: ticket.resolvedByName ?? "Xentria",
      estadoAnterior: null,
      estadoNuevo: ticket.status,
      etiqueta: etiquetaEstadoTicket(ticket.status),
      fecha: ticket.resolvedAt,
    });
  }

  // Se compara con `<`/`>` y no restando: dos entradas sin fecha valen las dos
  // `Infinity` y la resta daría `NaN`, que deja el orden indefinido.
  // `sort` es estable, así que dos mensajes del mismo instante conservan el
  // orden en que llegaron de la BD (id ascendente).
  return entradas.sort((a, b) => {
    const fa = marca(a.fecha);
    const fb = marca(b.fecha);
    if (fa < fb) return -1;
    if (fa > fb) return 1;
    return PESO_TIPO[a.tipo] - PESO_TIPO[b.tipo];
  });
}

/**
 * ¿Quién puede escribir en el hilo? Xentria siempre; quien reportó, solo en SU
 * ticket. Puro para poder decidirlo igual en la Server Action (que autoriza) y
 * en la UI (que decide si pinta la caja de texto).
 *
 * El lado lo manda el permiso, no la identidad: si quien escribe administra
 * soporte, su mensaje es de Xentria aunque además sea el autor del ticket. Es lo
 * que hace predecible el hilo — la misma persona no aparece cambiando de bando.
 */
export function ladoParaEscribir({
  administra,
  usuarioId,
  creadoPorId,
}: {
  administra: boolean;
  usuarioId: number | null;
  creadoPorId: number | null;
}): LadoTicket | null {
  if (administra) return "xentria";
  if (usuarioId !== null && creadoPorId !== null && usuarioId === creadoPorId) return "reportante";
  return null;
}

/**
 * Puente entre las filas de Prisma y el hilo. Los tipos son ESTRUCTURALES a
 * propósito (nada de importar el cliente generado): así este archivo sigue
 * siendo puro y testeable, y las cuatro pantallas comparten el mismo mapeo en
 * vez de repetir `toISOString()` cada una a su manera.
 */
export function historialDeTicket(ticket: {
  reporterFirstName: string;
  reporterLastName: string;
  description: string;
  createdAt: Date;
  status: string;
  solution: string | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  attachments?: AdjuntoHistorial[];
  messages: {
    id: number;
    authorName: string;
    authorSide: string;
    body: string;
    createdAt: Date;
  }[];
  events: {
    id: number;
    authorName: string;
    previousStatus: string | null;
    newStatus: string;
    createdAt: Date;
  }[];
}): EntradaHistorial[] {
  return construirHistorialTicket({
    reportante: `${ticket.reporterFirstName} ${ticket.reporterLastName}`,
    descripcion: ticket.description,
    createdAt: ticket.createdAt.toISOString(),
    adjuntos: ticket.attachments ?? [],
    status: ticket.status,
    solution: ticket.solution,
    resolvedByName: ticket.resolvedByName,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    mensajes: ticket.messages.map((mensaje) => ({
      id: mensaje.id,
      autor: mensaje.authorName,
      // Un lado desconocido se atribuye a Xentria, que es lo que eran todos los
      // mensajes antes de que el hilo tuviera dos bandos: nunca se le pone en
      // boca a quien reportó algo que no escribió.
      lado: esLadoTicket(mensaje.authorSide) ? mensaje.authorSide : "xentria",
      contenido: mensaje.body,
      createdAt: mensaje.createdAt.toISOString(),
    })),
    eventos: ticket.events.map((evento) => ({
      id: evento.id,
      autor: evento.authorName,
      estadoAnterior: evento.previousStatus,
      estadoNuevo: evento.newStatus,
      createdAt: evento.createdAt.toISOString(),
    })),
  });
}

/** El `select` de Prisma que necesita `historialDeTicket`, para no repetirlo. */
export const SELECT_HISTORIAL = {
  messages: {
    orderBy: { createdAt: "asc" },
    select: { id: true, authorName: true, authorSide: true, body: true, createdAt: true },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorName: true,
      previousStatus: true,
      newStatus: true,
      createdAt: true,
    },
  },
} as const;
