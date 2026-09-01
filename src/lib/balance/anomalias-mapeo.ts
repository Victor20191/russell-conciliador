// Anomalías de la homologación de un cliente: auxiliares cuyo mapeo NO se explica por la
// regla de su grupo. Lógica PURA (sin BD): la pantalla `/config/mapeo` le pasa las cuentas
// del cliente y aquí se decide cuáles merecen revisión.
//
// Por qué existe. La memoria de mapeo se gobierna por la cuenta de 6 dígitos: una regla de
// grupo vale para todas sus imputables. Lo normal es que las auxiliares de 8 dígitos hereden
// esa regla —sobre los datos reales de la plataforma, 27.554 de 27.596, el 99,85%— y por eso
// el informe del PUC completo es casi todo ruido. Las pocas que NO la heredan son
// justamente las que nadie mira: no salen en la vista editable, que solo lista el nivel 6 y
// las excepciones declaradas.
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

import { reglaMapeoAplicable } from "./mapeo-cliente-config";

/** Cuenta del cliente reducida a lo que necesita la detección. */
export type CuentaMapeo = {
  code: string;
  level: number;
  cuenta6Russell: string | null;
  origenMapeo: string | null;
};

export type MotivoAnomalia =
  /** Su homologación difiere de la regla de su grupo de 6 díg y nadie la declaró excepción. */
  | "divergente"
  /** Su cuenta de 6 díg no existe en la memoria: la auxiliar quedó huérfana. */
  | "sin-grupo";

export type AnomaliaMapeo = {
  code: string;
  motivo: MotivoAnomalia;
  /** Estándar asignado a esta auxiliar. */
  cuenta6Russell: string;
  /** Estándar de su grupo; `null` cuando el motivo es `sin-grupo`. */
  cuenta6RussellDelGrupo: string | null;
  /** El código del cliente y su estándar están en clases contables distintas: lo grave. */
  cruzaClase: boolean;
};

/** Excepción declarada a mano para UNA cuenta: es legítima y no se reporta. */
const ES_EXCEPCION = "manual_cuenta";

/**
 * Auxiliares (nivel 8) cuyo mapeo no se explica por la regla de su grupo Y que además
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
  // Regla del grupo: el estándar asignado a la cuenta de 6 dígitos.
  const reglaDelGrupo = new Map<string, string>();
  for (const c of cuentas) {
    if (c.level === 6 && c.cuenta6Russell) reglaDelGrupo.set(c.code, c.cuenta6Russell);
  }

  const anomalias: AnomaliaMapeo[] = [];
  for (const c of cuentas) {
    if (c.level !== 8 || !c.cuenta6Russell) continue;
    if (c.origenMapeo === ES_EXCEPCION) continue;
    if (!reglaMapeoAplicable({ code: c.code, cuenta6Russell: c.cuenta6Russell, coincidencia: null, origenMapeo: c.origenMapeo })) continue;

    const delGrupo = reglaDelGrupo.get(c.code.slice(0, 6)) ?? null;
    const motivo: MotivoAnomalia | null =
      delGrupo == null ? "sin-grupo" : delGrupo !== c.cuenta6Russell ? "divergente" : null;
    if (!motivo) continue;

    anomalias.push({
      code: c.code,
      motivo,
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
