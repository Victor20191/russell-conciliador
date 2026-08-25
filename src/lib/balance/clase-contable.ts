// ============================================================
// Guarda de CLASE contable de la homologación al plan estándar Russell.
//
// La clase PUC (primer dígito) decide en qué ESTADO FINANCIERO cae una cuenta:
// 1/2/3 balance, 4/5/6/7 resultado, 8/9 orden. Homologar una cuenta del cliente
// a una cuenta estándar de OTRA clase la reubica en toda la plataforma, porque
// varias vistas derivan la jerarquía del ESTÁNDAR y no del código del cliente:
// `agruparJerarquia` arma el árbol de `/balance/[id]` desde `cuenta_6_russell`,
// `agruparPorRussell` hace lo propio, el prevalidador clasifica por el estándar
// y el cruce contable de módulos reparte el saldo contable por esa misma columna.
//
// Los barridos deterministas ya la respetan —el exacto por construcción (usa el
// prefijo del propio código) y el de descripción de forma explícita
// (`mejorPorDescripcion` solo compara dentro de la misma clase)—, pero el barrido
// de IA la tenía únicamente como instrucción del prompt, sin nada que la hiciera
// cumplir: bastaba un nombre parecido para cruzar de clase. Caso reportado por
// operación (QUIFARMA S.A.S.): `14059805 TRASLADOS` y otras cuatro auxiliares de
// inventarios homologadas a `799505 Traslado o cierre de costos de producción`,
// que sacaron $4.159.857.241,71 del grupo 14 y lo dejaron en $7.348 millones
// frente a los $3.188.261.072,18 del archivo.
//
// El desvío es SILENCIOSO: las sumas y el cuadre se calculan sobre el código del
// CLIENTE (`agregarDetalle`), así que el balance sigue cuadrando y ninguna
// validación lo delataba. De ahí que la guarda descarte solo lo AUTOMÁTICO
// (cascada e IA): una homologación hecha a mano es una decisión humana explícita
// —a veces legítima, p. ej. reclasificar un anticipo mal codificado— y se respeta.
// ============================================================

/** Clase PUC (primer dígito) de un código contable; "" si no hay código. */
export function claseContable(code: string | null | undefined): string {
  return (code ?? "").trim().charAt(0);
}

/**
 * ¿La homologación mueve la cuenta de clase contable? Sin alguno de los dos
 * códigos no hay juicio posible y devuelve `false` (no hay nada que descartar).
 */
export function cruzaClaseContable(
  codigoCliente: string | null | undefined,
  codigoEstandar: string | null | undefined,
): boolean {
  const cliente = claseContable(codigoCliente);
  const estandar = claseContable(codigoEstandar);
  if (!cliente || !estandar) return false;
  return cliente !== estandar;
}
