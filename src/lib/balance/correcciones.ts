// Correcciones por CUENTA memorizadas en el perfil del cliente — lógica PURA (sin
// BD): traduce los cambios manuales del borrador (por código/fila del lote actual)
// a correcciones re-aplicables por cuenta, y calcula el plan de cambios para
// re-aplicarlas al staging de un lote NUEVO del mismo cliente.
//
// Las claves son por CUENTA (no por fila): el `filaNum` cambia entre archivos, el
// código PUC no. Para filas sin código numérico (pies/totales del ERP, p. ej.
// «Total general») la clave es el texto crudo de la columna código; si tampoco lo
// hay, el nombre. La re-aplicación usa las MISMAS salvaguardas del guardado manual
// (`aplicarCambiosBorrador`): reclasifica solo el tipo opuesto, invierte lados solo
// si el control contable lo verifica, y respeta el tri-estado `omitida` que el
// usuario ya tocó en el lote destino.

export type TipoFilaForzado = "agrupadora" | "movimiento";

/** Cambios TEMPORALES del borrador tal como los guarda `aplicarCambiosBorrador`. */
export type DeltasBorrador = {
  override: Record<string, TipoFilaForzado>;
  invertidos: string[];
  desacopladas: Record<string, boolean>;
  omitidas: Record<string, boolean>; // filaNum → on/off
  padres: Record<string, number | null>; // filaNum → filaNum destino (null = quitar)
};

/** Fila del staging en formato puro (Decimal ya convertido a number). */
export type FilaStagingCorreccion = {
  filaNum: number;
  codigo: string; // normalizado ("" si no numérico)
  codigoCrudo: string;
  nombre: string;
  tipoFila: string;
  tipoFilaForzado: TipoFilaForzado | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
  desacoplada: boolean;
  omitida: boolean | null;
  padreManual: number | null;
};

/** Corrección memorizada por cuenta (espejo de `correcciones_carga_balance`). */
export type CorreccionCuenta = {
  cuenta: string;
  nombre: string | null;
  tipoFilaForzado: TipoFilaForzado | null;
  invertirLados: boolean;
  desacoplada: boolean | null; // null = sin corrección
  omitida: boolean | null; // tri-estado: true omitir, false rescatar, null sin corrección
  // undefined = sin tocar (no pisa lo memorizado); null = QUITAR el re-parentado;
  // string = anidar bajo la fila con esta clave.
  padreCodigo?: string | null;
};

/** Plan de UPDATE por fila del staging destino (solo los campos que cambian). */
export type CambioFila = {
  filaNum: number;
  tipoFila?: TipoFilaForzado;
  tipoFilaForzado?: TipoFilaForzado;
  debitos?: number; // intercambio explícito de lados (valores finales)
  creditos?: number;
  desacoplada?: boolean;
  omitida?: boolean;
  padreManual?: number | null;
};

const esNumerico = (c: string) => /^\d+$/.test(c);
// Control contable de una fila: saldo ant + débito − crédito = saldo actual (±$1).
const controlCuadra = (si: number, db: number, cr: number, sf: number) => Math.abs(si + db - cr - sf) <= 1;

/**
 * Clave re-aplicable de una fila: el código PUC si es numérico; si no, el texto
 * crudo de la columna código (pies/totales del ERP); en último caso el nombre.
 * "" = fila sin clave útil (no se memoriza).
 */
export function claveCuenta(f: Pick<FilaStagingCorreccion, "codigo" | "codigoCrudo" | "nombre">): string {
  if (f.codigo !== "" && esNumerico(f.codigo)) return f.codigo;
  const crudo = (f.codigoCrudo ?? "").trim();
  if (crudo) return crudo.slice(0, 120);
  return (f.nombre ?? "").trim().slice(0, 120);
}

/**
 * Traduce los deltas guardados del borrador (códigos y filaNum del LOTE ACTUAL) a
 * correcciones por cuenta, fusionadas por clave. Los deltas por `filaNum` (omitir,
 * re-parentar) se resuelven contra las filas del lote; si la fila o el destino ya
 * no existen, ese delta se descarta (no hay clave que memorizar).
 */
export function construirCorrecciones(filas: FilaStagingCorreccion[], d: DeltasBorrador): CorreccionCuenta[] {
  const porFila = new Map<number, FilaStagingCorreccion>(filas.map((f) => [f.filaNum, f]));
  const porCodigo = new Map<string, FilaStagingCorreccion>();
  for (const f of filas) if (f.codigo !== "" && esNumerico(f.codigo) && !porCodigo.has(f.codigo)) porCodigo.set(f.codigo, f);

  const out = new Map<string, CorreccionCuenta>();
  const entrada = (cuenta: string, nombre: string | null): CorreccionCuenta => {
    let c = out.get(cuenta);
    if (!c) {
      c = { cuenta, nombre, tipoFilaForzado: null, invertirLados: false, desacoplada: null, omitida: null };
      out.set(cuenta, c);
    }
    if (!c.nombre && nombre) c.nombre = nombre;
    return c;
  };

  for (const [cod, tipo] of Object.entries(d.override ?? {})) {
    if (!esNumerico(cod) || (tipo !== "agrupadora" && tipo !== "movimiento")) continue;
    entrada(cod, porCodigo.get(cod)?.nombre ?? null).tipoFilaForzado = tipo;
  }
  for (const cod of d.invertidos ?? []) {
    if (!esNumerico(cod)) continue;
    entrada(cod, porCodigo.get(cod)?.nombre ?? null).invertirLados = true;
  }
  for (const [cod, on] of Object.entries(d.desacopladas ?? {})) {
    if (!esNumerico(cod)) continue;
    entrada(cod, porCodigo.get(cod)?.nombre ?? null).desacoplada = !!on;
  }
  for (const [filaStr, on] of Object.entries(d.omitidas ?? {})) {
    const fila = porFila.get(Number(filaStr));
    if (!fila) continue;
    const cuenta = claveCuenta(fila);
    if (!cuenta) continue;
    entrada(cuenta, fila.nombre?.trim() || null).omitida = !!on;
  }
  for (const [filaStr, destino] of Object.entries(d.padres ?? {})) {
    const fila = porFila.get(Number(filaStr));
    if (!fila) continue;
    const cuenta = claveCuenta(fila);
    if (!cuenta) continue;
    if (destino == null) {
      entrada(cuenta, fila.nombre?.trim() || null).padreCodigo = null;
      continue;
    }
    const padre = porFila.get(destino);
    if (!padre) continue;
    const padreClave = claveCuenta(padre);
    if (!padreClave || padreClave === cuenta) continue;
    entrada(cuenta, fila.nombre?.trim() || null).padreCodigo = padreClave;
  }
  return [...out.values()];
}

/**
 * Plan para RE-APLICAR las correcciones memorizadas a las filas de un lote nuevo.
 * Salvaguardas (mismas del guardado manual):
 *  - reclasificar: solo si el tipo actual es el OPUESTO (nunca toca filas `total`);
 *  - invertir lados: solo si el control contable falla y SÍ cuadra al intercambiar;
 *  - omitir/rescatar: solo filas con `omitida` SIN TOCAR en el lote destino (null) —
 *    el tri-estado manual del lote gana siempre;
 *  - re-parentar: el destino se resuelve por clave en el lote destino (preferida la
 *    fila agrupadora); si no existe, el re-parentado se salta.
 * Devuelve los UPDATE por fila y las cuentas que efectivamente aplicaron.
 */
export function planAplicarCorrecciones(
  filas: FilaStagingCorreccion[],
  correcciones: CorreccionCuenta[],
): { cambios: CambioFila[]; cuentasAplicadas: string[] } {
  const porClave = new Map<string, FilaStagingCorreccion[]>();
  for (const f of filas) {
    const k = claveCuenta(f);
    if (!k) continue;
    const arr = porClave.get(k);
    if (arr) arr.push(f);
    else porClave.set(k, [f]);
  }

  const cambios: CambioFila[] = [];
  const cuentasAplicadas: string[] = [];
  for (const c of correcciones) {
    const rows = porClave.get(c.cuenta) ?? [];
    if (rows.length === 0) continue;

    let destino: FilaStagingCorreccion | null = null;
    if (typeof c.padreCodigo === "string" && c.padreCodigo) {
      const cand = porClave.get(c.padreCodigo) ?? [];
      destino = cand.find((r) => r.tipoFila === "agrupadora") ?? cand[0] ?? null;
    }

    let aplico = false;
    for (const f of rows) {
      const ch: CambioFila = { filaNum: f.filaNum };
      if (c.tipoFilaForzado && f.tipoFila !== "total") {
        if (c.tipoFilaForzado === "agrupadora" && f.tipoFila !== "agrupadora") ch.tipoFila = "agrupadora";
        if (c.tipoFilaForzado === "movimiento" && f.tipoFila === "agrupadora") ch.tipoFila = "movimiento";
        if (f.tipoFilaForzado !== c.tipoFilaForzado) ch.tipoFilaForzado = c.tipoFilaForzado;
      }
      if (
        c.invertirLados &&
        !controlCuadra(f.saldoInicial, f.debitos, f.creditos, f.saldoFinal) &&
        controlCuadra(f.saldoInicial, f.creditos, f.debitos, f.saldoFinal)
      ) {
        ch.debitos = f.creditos;
        ch.creditos = f.debitos;
      }
      if (c.desacoplada != null && f.desacoplada !== c.desacoplada) ch.desacoplada = c.desacoplada;
      if (c.omitida != null && f.omitida == null) ch.omitida = c.omitida;
      if (c.padreCodigo === null && f.padreManual != null) ch.padreManual = null;
      if (destino && destino.filaNum !== f.filaNum && f.padreManual !== destino.filaNum) ch.padreManual = destino.filaNum;
      if (Object.keys(ch).length > 1) {
        cambios.push(ch);
        aplico = true;
      }
    }
    if (aplico) cuentasAplicadas.push(c.cuenta);
  }
  return { cambios, cuentasAplicadas };
}
