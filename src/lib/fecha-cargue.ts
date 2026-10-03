// Fechas que se asignan a un cargue (período, fecha de corte) — puro, sin BD.
//
// Los seis módulos y el balance de comprobación comparten dos reglas (1/Oct/2026, pedido del
// usuario):
//   1. Ninguna fecha puede ser futura, en el calendario de Colombia. En los módulos el período
//      es un mes y no puede ser posterior al mes en curso; una fecha (la de corte de Cartera y
//      CxP, el «desde» y el «hasta» del balance) no puede ser posterior a hoy.
//   2. La fecha elegida se confirma antes de seguir («Seleccionaste diciembre de 2025, del 1 al
//      31 de diciembre de 2025. ¿Es correcto?»). Eso lo hace la pantalla
//      (`src/components/confirmacion-fecha.tsx`); aquí viven la regla y los textos.
// El mes en curso SÍ se acepta como período de un módulo (no es una fecha futura). Como su fin
// todavía no llega, la fecha de corte que se sugiere para él es hoy, no el último día del mes.
// Lo usan el navegador y el servidor: las pantallas lo aplican al elegir la fecha y las acciones
// lo vuelven a comprobar (`leerDatosModulo`, `aplicarCambiosBorradorModulo`,
// `cargarBorradorModulo`, `actualizarFechaCorteModulo`; en el balance, `actualizarPeriodoBorrador`
// y `confirmarCargaBalance` vía `ConfirmarBalanceSchema`).
import { fechaColombiaISO } from "@/lib/fecha-hora";
import { finDePeriodo } from "@/lib/modulos/cartera/fecha-corte";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PERIODO = /^(\d{4})-(\d{2})$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Hoy en Colombia («AAAA-MM-DD»). */
export function hoyColombiaISO(ahora: Date = new Date()): string {
  return fechaColombiaISO(ahora);
}

/** Mes en curso en Colombia («AAAA-MM»): el último período que se puede cargar. */
export function mesActualColombia(ahora: Date = new Date()): string {
  return hoyColombiaISO(ahora).slice(0, 7);
}

/** «2025-12» → «diciembre de 2025»; null si no es un período. */
export function nombrePeriodo(periodo: string): string | null {
  const m = PERIODO.exec(periodo.trim());
  const mes = m ? Number(m[2]) : 0;
  if (!m || mes < 1 || mes > 12) return null;
  return `${MESES[mes - 1]} de ${m[1]}`;
}

/** «2025-12-31» → «31 de diciembre de 2025»; null si no es una fecha. */
export function nombreFecha(fecha: string): string | null {
  const m = FECHA.exec(fecha.trim());
  if (!m) return null;
  const periodo = nombrePeriodo(`${m[1]}-${m[2]}`);
  return periodo ? `${Number(m[3])} de ${periodo}` : null;
}

/** «2025-12» → «del 1 al 31 de diciembre de 2025». */
export function rangoDelPeriodo(periodo: string): string | null {
  const nombre = nombrePeriodo(periodo);
  const fin = finDePeriodo(periodo);
  return nombre && fin ? `del 1 al ${Number(fin.slice(8))} de ${nombre}` : null;
}

/** «del 1 de enero de 2025 al 31 de diciembre de 2025»; null si alguna no es una fecha. */
export function nombreRangoFechas(desde: string, hasta: string): string | null {
  const a = nombreFecha(desde);
  const b = nombreFecha(hasta);
  return a && b ? `del ${a} al ${b}` : null;
}

/** Por qué no se acepta el período, o null si se acepta. Un período mal escrito lo rechaza quien lo valida. */
export function motivoPeriodoFuturo(periodo: string, ahora: Date = new Date()): string | null {
  const p = periodo.trim();
  if (!nombrePeriodo(p)) return null;
  const actual = mesActualColombia(ahora);
  if (p <= actual) return null;
  return `El período ${nombrePeriodo(p)} todavía no empieza: elige ${nombrePeriodo(actual)} o un mes anterior.`;
}

/** Por qué no se acepta la fecha, o null si se acepta (no puede ser posterior a hoy). */
export function motivoFechaFutura(fecha: string, etiqueta = "La fecha", ahora: Date = new Date()): string | null {
  const f = fecha.trim();
  if (!nombreFecha(f)) return null;
  const hoy = hoyColombiaISO(ahora);
  if (f <= hoy) return null;
  return `${etiqueta} ${nombreFecha(f)} es posterior a hoy (${nombreFecha(hoy)}): no se aceptan fechas futuras.`;
}

/** Fecha de corte por defecto: el fin del período o, si el período es el mes en curso, hoy. */
export function fechaCorteSugeridaDe(periodo: string, ahora: Date = new Date()): string | null {
  const fin = finDePeriodo(periodo);
  if (!fin) return null;
  const hoy = hoyColombiaISO(ahora);
  return fin > hoy ? hoy : fin;
}
