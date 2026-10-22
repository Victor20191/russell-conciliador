// Ayuda en pantalla — reglas de acceso que comparten las fichas (puro).
//
// Cada regla repite lo que verifica el servidor (permiso + alcance sobre el cliente). Cuando una
// acción cambie de permiso, se cambia aquí y la ficha describe el estado nuevo.

import type { AlcanceVia, Regla, Via } from "./tipos";

function via(permisos: string | readonly string[], alcance: AlcanceVia): Via {
  return { permisos: typeof permisos === "string" ? [permisos] : permisos, alcance };
}

export const REGLAS = {
  // ----- Balance de comprobación -----
  verBalance: [via("balance:ver", "lectura")],
  comentarBalance: [via("balance:comentar", "lectura")],
  /** Cargar, corregir el borrador, dar OK, eliminar una cuenta, cuenta alternativa del prevalidador. */
  cargarBalance: [via("balance:crear", "escritura")],
  /** Homologar, re-homologar, cerrar, abrir, aprobar el prevalidador, reemplazar el conciliado. */
  revisarBalance: [via("balance:revisar", "lectura")],
  eliminarBalance: [via("balance:eliminar", "escritura"), via("balance:revisar", "lectura")],
  eliminarHistorialBalance: [via("balance:eliminar", "escritura")],
  compararCorte: [via("balance:crear", "escritura"), via("balance:editar", "escritura")],
  verBorradoresBalance: [via("balance:crear", "lectura"), via("balance:revisar", "lectura")],
  descartarBorradorBalance: [via("balance:crear", "escritura"), via("balance:revisar", "lectura")],

  // ----- Módulos de conciliación -----
  verModulo: [via("modulos_datos:ver", "lectura")],
  comentarModulo: [via("modulos_datos:comentar", "lectura")],
  cargarModulo: [via("modulos_datos:crear", "escritura")],
  comentarBorradorModulo: [via(["modulos_datos:crear", "modulos_borrador:comentar"], "escritura")],
  verPatrones: [via("modulos_datos:crear", "ninguno")],
  administrarPatrones: [via("perfiles_carga:administrar", "ninguno")],
  editarModulo: [via("modulos_datos:editar", "escritura")],
  eliminarModulo: [via("modulos_datos:eliminar", "escritura")],
  eliminarHistorialModulo: [via(["modulos_datos:eliminar", "perfiles_carga:administrar"], "escritura")],
  comentarAlertaModulo: [via("modulos_datos:editar", "escritura"), via("modulos_datos:ver", "senior_o_gerente")],
  cerrarConciliacion: [via("conciliaciones:cerrar", "senior_o_gerente")],
  desbloquearConciliacion: [via("conciliaciones:desbloquear", "senior_o_gerente")],

  // ----- Catálogos contables -----
  verPlanRussell: [via("mapeo:ver", "ninguno")],
  administrarPlanRussell: [via("mapeo:administrar", "ninguno")],
  /** Conceptos de nómina se consultan de todos los clientes (no solo la cartera). */
  verConceptosNomina: [via("modulos_datos:ver", "ninguno")],
  descargarPlantillaConceptos: [via("modulos_datos:editar", "ninguno")],

  // ----- Clientes y equipo -----
  verClientes: [via("clientes:ver", "ninguno")],
  editarClienteOperativo: [via("clientes:editar", "lectura")],
  configurarCliente: [via("clientes:configurar", "lectura")],
  crearCliente: [via(["clientes:crear", "clientes:configurar"], "ninguno")],
  eliminarCliente: [via("clientes:eliminar", "ninguno")],
  verUsuarios: [via("usuarios:ver", "ninguno")],
  crearUsuario: [via("usuarios:crear", "ninguno")],
  editarUsuario: [via("usuarios:editar", "ninguno")],
  eliminarUsuario: [via("usuarios:eliminar", "ninguno")],
  verEstructura: [via("estructura:ver", "ninguno")],
  /** Solo pide una sesión (Mi perfil): una vía sin permisos. */
  cualquierUsuario: [via([], "ninguno")],

  // ----- Parametrización -----
  verParametros: [via("parametros:ver", "ninguno"), via("parametros:administrar", "ninguno")],
  administrarParametros: [via("parametros:administrar", "ninguno")],

  // ----- Mesa de ayuda -----
  verMesaAyuda: [via("soporte:ver", "ninguno")],
  crearNovedad: [via("soporte:crear", "ninguno")],
  gestionarNovedad: [via("soporte:administrar", "ninguno")],
  eliminarNovedad: [via("soporte:eliminar", "ninguno")],
} satisfies Record<string, Regla>;
