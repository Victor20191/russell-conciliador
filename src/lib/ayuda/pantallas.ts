// Ayuda en pantalla — a qué página lleva cada ficha y con qué permiso se abre (puro). Lo usan
// «¿Quién hace qué?» y el ciclo del cliente para enlazar. Las fichas de un detalle (un balance, un
// borrador, un cargue) no tienen enlace propio: se llega desde su listado.

import type { FichaId } from "./resolver";

export type PantallaAyuda = { href: (modulo: string) => string; permiso?: string };

const deModulo = (sufijo: string) => (m: string) => `/modulos/${m.toLowerCase()}${sufijo}`;

export const PANTALLAS: Partial<Record<FichaId, PantallaAyuda>> = {
  "balance.listado": { href: () => "/balance", permiso: "balance:ver" },
  "balance.borradores": { href: () => "/balance/borradores", permiso: "balance:crear" },
  "modulo.cargados": { href: deModulo(""), permiso: "modulos_datos:ver" },
  "modulo.borradores": { href: deModulo("/borradores"), permiso: "modulos_datos:crear" },
  "modulo.patrones": { href: deModulo("/patrones"), permiso: "modulos_datos:crear" },
  "modulo.patrones_manuales": { href: deModulo("/patrones-manuales"), permiso: "modulos_datos:crear" },
  "catalogo.plan_russell": { href: () => "/config/mapeo", permiso: "mapeo:ver" },
  "catalogo.mapeo_cliente": { href: () => "/config/mapeo-cliente", permiso: "mapeo:ver" },
  "catalogo.conceptos_nomina": { href: () => "/config/conceptos-nomina", permiso: "modulos_datos:ver" },
  "equipo.clientes": { href: () => "/config/clientes", permiso: "clientes:ver" },
  "equipo.usuarios": { href: () => "/config/usuarios", permiso: "usuarios:ver" },
  "equipo.estructura": { href: () => "/estructura", permiso: "estructura:ver" },
  "equipo.perfil": { href: () => "/perfil" },
  "parametros.filtros_cuentas": { href: (m) => `/config/prevalidador/${m.toLowerCase()}`, permiso: "parametros:ver" },
  "parametros.alertas": { href: () => "/config/parametros", permiso: "parametros:ver" },
  "soporte.mesa_ayuda": { href: () => "/reportes", permiso: "soporte:ver" },
};
