// Ayuda en pantalla — tipos de las fichas (puro, sin BD ni React).
//
// Una ficha describe UNA pantalla tal como funciona hoy: para qué sirve, qué se puede hacer
// (en el orden del trabajo), quién lo puede hacer y bajo qué condiciones. No es un registro de
// novedades: sin fechas ni «antes/ahora» (las novedades van a /novedades).
//
// Los roles NO se escriben en la ficha: cada acción declara su `regla` (los permisos que
// verifica el servidor y el alcance sobre el cliente) y el panel la cruza con la matriz viva.

import type { DescriptorModulo } from "@/lib/modulos/descriptores";

/**
 * Qué relación con el cliente necesita, además del permiso, quien NO es administrador
 * (Administrador y Superadministrador tienen alcance global y no la necesitan):
 * - `ninguno`: la acción no es sobre un cliente.
 * - `lectura`: el cliente está en su cartera (asignado o, el Socio, por sus gerentes).
 * - `escritura`: está asignado al cliente como staff o senior.
 * - `senior_o_gerente`: está asignado al cliente como senior o gerente.
 */
export type AlcanceVia = "ninguno" | "lectura" | "escritura" | "senior_o_gerente";

/** Una forma de poder hacer la acción: TODOS sus permisos + el alcance. */
export type Via = { permisos: readonly string[]; alcance: AlcanceVia };

/** Basta cumplir UNA de las vías. */
export type Regla = readonly Via[];

/** Filtro por módulo: el elemento solo aparece en los módulos para los que devuelve true. */
export type AplicaModulo = (d: DescriptorModulo) => boolean;

export type AccionAyuda = {
  /** Texto exacto del botón o control, como se ve en pantalla. */
  nombre: string;
  queHace: string;
  regla: Regla;
  condiciones?: readonly string[];
  aplica?: AplicaModulo;
  /** Dónde verifica el servidor la regla (lo comprueba una prueba). */
  fuente?: { archivo: string; funcion: string };
};

export type EtapaAyuda = { titulo: string; acciones: readonly AccionAyuda[]; aplica?: AplicaModulo };

export type PestanaAyuda = {
  /** Identificador de la pestaña en la pantalla (`TABS_BALANCE` / `TABS_CARGUE`). */
  id: string;
  titulo: string;
  proposito: string;
  etapas: readonly EtapaAyuda[];
  aplica?: AplicaModulo;
};

export type EstadoAyuda = { etiqueta: string; significado: string; aplica?: AplicaModulo };

export type PreguntaAyuda = { pregunta: string; respuesta: string; aplica?: AplicaModulo };

export type EnlaceAyuda = {
  label: string;
  href: string;
  /** Permiso para abrir la página; sin él el enlace no se muestra. */
  permiso?: string;
  aplica?: AplicaModulo;
};

export type FichaAyuda = {
  id: string;
  titulo: string;
  proposito: string;
  antesDeEmpezar?: readonly string[];
  etapas: readonly EtapaAyuda[];
  pestanas?: readonly PestanaAyuda[];
  estados?: readonly EstadoAyuda[];
  preguntas?: readonly PreguntaAyuda[];
  relacionadas?: readonly EnlaceAyuda[];
};
