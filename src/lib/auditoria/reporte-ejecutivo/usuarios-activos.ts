// Indicador «Usuarios activos: X de Y (Z %)» y su complemento «Nunca han ingresado: N».
//
// Responde una pregunta distinta de la tabla de detalle: esa lista a quienes
// tuvieron ingreso o acción; este indicador mide cuántas personas del equipo
// usan la plataforma frente a cuántas cuentas hay. Por eso el denominador son las
// cuentas, no la actividad.
//
// Definiciones:
//   - Y (total): cuentas habilitadas (`active`) del equipo de Russell, sin las de
//     Xentria (`esCuentaInterna`) ni las de prueba o genéricas (`esCuentaDePrueba`).
//   - X (activos): de esas Y, quienes tuvieron actividad en el período: al menos
//     un registro de acceso (ingreso o navegación) o al menos una acción auditada.
//   - Z (porcentaje): X / Y, con un decimal; null si no hay cuentas que medir.
//   - N (nuncaIngresaron): de esas Y, quienes jamás tuvieron un registro de acceso
//     ni un inicio de sesión guardado en su cuenta.
//
// La señal principal es la NAVEGACIÓN por usuario, no el inicio de sesión: la
// sesión dura 7 días, así que una persona puede trabajar varios días con un solo
// «ingreso». Los accesos se cruzan por `userId` (hay nombres repetidos); la
// bitácora de auditoría solo guarda el nombre, y por eso una acción únicamente
// se le atribuye a una cuenta cuando ese nombre no lo comparte ninguna otra.
//
// Un registro tampoco puede ser anterior a la cuenta a la que se le atribuye:
// cuando la base se re-sembró (24/Ago/2026) los ids se reutilizaron, y tres
// accesos de otra persona («Luisa», id 99) quedaron pegados a una cuenta creada
// dos meses después, que así parecía haber ingresado. Solo cuenta el registro
// cuya fecha es igual o posterior a la creación de la cuenta.
//
// Módulo PURO.
import { esCuentaDePrueba, esCuentaInterna, normalizarNombre } from "./usuarios-reporte";

export type CuentaUsuario = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  /** Último inicio de sesión guardado en la cuenta; sobrevive a la purga de accesos. */
  lastLoginAt?: Date | string | null;
  /** Creación de la cuenta: ningún registro anterior a esta fecha le pertenece. */
  createdAt?: Date | string | null;
};

/** Último acceso de una cuenta (por `userId`) dentro de la ventana que se consultó. */
export type AccesoDeCuenta = { userId: number; ultimoEn: Date | string };

/** Última acción auditada de un nombre dentro de la ventana que se consultó. */
export type AccionDeNombre = { nombre: string; ultimaEn: Date | string };

export type UsuariosActivos = {
  /** Y: cuentas habilitadas del equipo (sin Xentria ni cuentas de prueba). */
  total: number;
  /** X: de las Y, las que usaron la plataforma en el período. */
  activos: number;
  /** Z: porcentaje de X sobre Y, con un decimal; null si Y = 0. */
  porcentaje: number | null;
  /** N: de las Y, las que nunca han ingresado. */
  nuncaIngresaron: number;
};

export type EstadoCuenta = "activa" | "inactiva" | "nunca";

/** Las cuentas sobre las que se mide: habilitadas, del equipo de Russell y no de prueba. */
export function cuentasMedidas<T extends Pick<CuentaUsuario, "name" | "email" | "active">>(
  cuentas: readonly T[],
): T[] {
  return cuentas.filter((c) => c.active && !esCuentaInterna(c.email) && !esCuentaDePrueba(c.name));
}

export type EntradaUsuariosActivos = {
  /** TODAS las cuentas de la plataforma: los nombres repetidos se detectan entre todas. */
  cuentas: readonly CuentaUsuario[];
  /** Cuentas (`userId`) con al menos un ingreso o una navegación en el período. */
  accesosEnPeriodo: Iterable<AccesoDeCuenta>;
  /** Nombres (como los guarda la bitácora) con al menos una acción auditada en el período. */
  accionesEnPeriodo: Iterable<AccionDeNombre>;
  /** Cuentas (`userId`) con algún registro de acceso, de cualquier fecha. */
  accesosHistoricos: Iterable<AccesoDeCuenta>;
};

const aMilisegundos = (fecha: Date | string): number => new Date(fecha).getTime();

/** Para cada clave, el registro más reciente que se haya visto. */
function ultimoPor<T>(items: Iterable<T>, clave: (item: T) => string | number, en: (item: T) => Date | string) {
  const ultimo = new Map<string | number, number>();
  for (const item of items) {
    const ms = aMilisegundos(en(item));
    const actual = ultimo.get(clave(item));
    if (Number.isFinite(ms) && (actual === undefined || ms > actual)) ultimo.set(clave(item), ms);
  }
  return ultimo;
}

/** Cada cuenta medida con su estado: útil para probar la regla y para verificarla contra datos reales. */
export function clasificarCuentas(
  entrada: EntradaUsuariosActivos,
): Array<{ cuenta: CuentaUsuario; estado: EstadoCuenta }> {
  const accesoEnPeriodo = ultimoPor(entrada.accesosEnPeriodo, (a) => a.userId, (a) => a.ultimoEn);
  const accesoHistorico = ultimoPor(entrada.accesosHistoricos, (a) => a.userId, (a) => a.ultimoEn);
  const accionEnPeriodo = ultimoPor(entrada.accionesEnPeriodo, (a) => normalizarNombre(a.nombre), (a) => a.ultimaEn);

  // Una acción de bitácora solo se atribuye si su nombre es único en la plataforma.
  const repeticiones = new Map<string, number>();
  for (const cuenta of entrada.cuentas) {
    const nombre = normalizarNombre(cuenta.name);
    repeticiones.set(nombre, (repeticiones.get(nombre) ?? 0) + 1);
  }

  return cuentasMedidas(entrada.cuentas).map((cuenta) => {
    const nombre = normalizarNombre(cuenta.name);
    const creada = cuenta.createdAt ? aMilisegundos(cuenta.createdAt) : Number.NaN;
    // Sin fecha de creación conocida no hay con qué descartar: el registro vale.
    const esDeLaCuenta = (ultimo: number | undefined): boolean =>
      ultimo !== undefined && (!Number.isFinite(creada) || ultimo >= creada);

    const actua =
      esDeLaCuenta(accesoEnPeriodo.get(cuenta.id)) ||
      (repeticiones.get(nombre) === 1 && esDeLaCuenta(accionEnPeriodo.get(nombre)));
    if (actua) return { cuenta, estado: "activa" as const };
    // Sin actividad en el período: «nunca» solo si tampoco hay rastro histórico de un ingreso.
    const ingresoAlgunaVez = esDeLaCuenta(accesoHistorico.get(cuenta.id)) || Boolean(cuenta.lastLoginAt);
    return { cuenta, estado: ingresoAlgunaVez ? ("inactiva" as const) : ("nunca" as const) };
  });
}

/** Z: X / Y con un decimal; null (y no una división por cero) cuando no hay cuentas que medir. */
function porcentajeActivos(activos: number, total: number): number | null {
  return total > 0 ? Math.round((activos / total) * 1000) / 10 : null;
}

export function calcularUsuariosActivos(entrada: EntradaUsuariosActivos): UsuariosActivos {
  const clasificadas = clasificarCuentas(entrada);
  const total = clasificadas.length;
  const activos = clasificadas.filter((c) => c.estado === "activa").length;
  const nuncaIngresaron = clasificadas.filter((c) => c.estado === "nunca").length;
  return { total, activos, porcentaje: porcentajeActivos(activos, total), nuncaIngresaron };
}

/**
 * Lee el indicador de un valor desconocido (una instantánea guardada). Las
 * anteriores a este indicador no lo traen: devuelve null y no se inventa nada.
 */
export function leerUsuariosActivos(valor: unknown): UsuariosActivos | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<Record<keyof UsuariosActivos, unknown>>;
  const entero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (!entero(v.total) || !entero(v.activos) || !entero(v.nuncaIngresaron)) return null;
  if (v.activos > v.total || v.nuncaIngresaron > v.total) return null;
  // El porcentaje se vuelve a derivar: no se confía en lo que traiga el JSON guardado.
  return {
    total: v.total,
    activos: v.activos,
    porcentaje: porcentajeActivos(v.activos, v.total),
    nuncaIngresaron: v.nuncaIngresaron,
  };
}

/** Una línea que aclara qué cuenta como activo y qué cuentas forman el total. */
export const NOTA_USUARIOS_ACTIVOS =
  "Se cuenta como activo a quien entró, navegó o hizo alguna operación en el período. El total son las cuentas habilitadas del equipo, sin las de Xentria ni las de prueba.";

const formatoEntero = new Intl.NumberFormat("es-CO");
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** «4 de 68 (5,9 %)»; sin porcentaje cuando no hay cuentas que medir. */
export function textoFraccionUsuariosActivos(u: UsuariosActivos): string {
  const fraccion = `${formatoEntero.format(u.activos)} de ${formatoEntero.format(u.total)}`;
  return u.porcentaje == null ? fraccion : `${fraccion} (${formatoPorcentaje.format(u.porcentaje)} %)`;
}

/** «Usuarios activos: 4 de 68 (5,9 %)». */
export function textoUsuariosActivos(u: UsuariosActivos): string {
  return `Usuarios activos: ${textoFraccionUsuariosActivos(u)}`;
}

/** «Nunca han ingresado: 59». */
export function textoNuncaIngresaron(u: UsuariosActivos): string {
  return `Nunca han ingresado: ${formatoEntero.format(u.nuncaIngresaron)}`;
}
