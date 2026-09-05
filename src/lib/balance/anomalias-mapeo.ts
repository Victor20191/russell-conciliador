// Anomalías de la homologación de un cliente: auxiliares cuyo mapeo NO se explica por la
// regla de su grupo. Lógica PURA (sin BD): la pantalla `/config/mapeo` le pasa las cuentas
// del cliente y aquí se decide cuáles merecen revisión.
//
// Por qué existe. La memoria de mapeo se gobierna por la cuenta de 6 dígitos: una regla de
// grupo vale para todas sus imputables. Lo normal es que las auxiliares de 8 dígitos hereden
// esa regla —sobre los datos reales de la plataforma, 27.554 de 27.596, el 99,85%— y por eso
// el informe del PUC completo es casi todo ruido. Las pocas que NO la heredan son
// se destacan en la vista editable del PUC completo para poder corregirlas allí.
//
// Y el prevalidador tampoco las cubre del todo: vigila solo los prefijos que alimentan los
// seis módulos de conciliación, así que las que caen fuera de esos prefijos no las ve nadie.
//
// SOLO se reportan las reglas que de verdad GOBIERNAN (`reglaMapeoAplicable`). La memoria
// guarda filas automáticas que cruzan de clase contable, pero esas ya se descartan al leer
// —para que un error de la cascada no se vuelva permanente— y se limpian solas en la
// siguiente carga. Marcarlas sería reportar lo que el sistema ya protege: sobre los datos
// reales eran 12 de 21, más de la mitad del ruido.
//
// AVISA, no corrige — mismo principio que el prevalidador. Corregir se hace en la vista
// editable, que es la única que escribe.

import {
  construirConfigMapeoCliente,
  esExcepcionCuenta,
  reglaMapeoAplicable,
} from "./mapeo-cliente-config";

/** Cuenta del cliente reducida a lo que necesita la detección. */
export type CuentaMapeo = {
  id: number;
  code: string;
  level: number;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  origenMapeo: string | null;
  actualizadoEn: Date | string | null;
};

export type MotivoAnomalia =
  /** Su homologación difiere de la regla canónica de su grupo y nadie la declaró excepción. */
  "divergente";

export type AnomaliaMapeo = {
  code: string;
  motivo: MotivoAnomalia;
  /** Estándar asignado a esta auxiliar. */
  cuenta6Russell: string;
  /** Estándar de la regla canónica que gobierna su grupo. */
  cuenta6RussellDelGrupo: string;
  /** El código del cliente y su estándar están en clases contables distintas: lo grave. */
  cruzaClase: boolean;
};

/**
 * Auxiliares de cualquier longitud cuyo mapeo no se explica por la regla de su grupo y que además
 * gobiernan de verdad la próxima carga.
 *
 * Se excluyen dos cosas a propósito:
 *  - las excepciones `manual_cuenta`, porque alguien decidió que esa cuenta fuera distinta
 *    de sus hermanas y además ya se ven en la vista editable;
 *  - las que `reglaMapeoAplicable` descarta —automáticas que cruzan de clase—, porque no
 *    llegan a aplicarse: la cuenta vuelve a la cascada.
 *
 * Lo que queda es la divergencia que nadie declaró y que sí manda.
 */
export function detectarAnomaliasMapeo(cuentas: readonly CuentaMapeo[]): AnomaliaMapeo[] {
  // Misma autoridad que usa la próxima carga: no se limita a buscar una fila de nivel 6,
  // sino que aplica prioridad manual/exacta/fecha/coincidencia/id sobre todas las filas
  // gobernantes del prefijo. Así el informe nunca contradice al motor de homologación.
  const config = construirConfigMapeoCliente([...cuentas]);

  const anomalias: AnomaliaMapeo[] = [];
  for (const c of cuentas) {
    if (c.code.length <= 6 || !c.cuenta6Russell) continue;
    if (esExcepcionCuenta(c.origenMapeo)) continue;
    if (!reglaMapeoAplicable({ code: c.code, cuenta6Russell: c.cuenta6Russell, coincidencia: null, origenMapeo: c.origenMapeo })) continue;

    const delGrupo = config.get(c.code.slice(0, 6))?.std;
    if (!delGrupo || delGrupo === c.cuenta6Russell) continue;

    anomalias.push({
      code: c.code,
      motivo: "divergente",
      cuenta6Russell: c.cuenta6Russell,
      cuenta6RussellDelGrupo: delGrupo,
      cruzaClase: c.code.charAt(0) !== c.cuenta6Russell.charAt(0),
    });
  }
  // Primero lo grave: el cruce de clase contable mueve saldo de un estado financiero a otro.
  return anomalias.sort(
    (a, b) => Number(b.cruzaClase) - Number(a.cruzaClase) || a.code.localeCompare(b.code),
  );
}
