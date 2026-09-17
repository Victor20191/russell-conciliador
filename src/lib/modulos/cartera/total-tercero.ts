// TOTAL POR CLIENTE impreso DEBAJO de sus documentos («Total ACME S.A.S.») — puro.
//
// Es la tercera forma en que un archivo por documento declara el saldo de cada tercero, además
// de la cabecera de un reporte jerárquico (SAP, SIESA) y del saldo del proveedor en la primera
// fila de su bloque (SIIGO). La detección de subtotales ya la reconoce como subtotal; aquí se
// decide si ese subtotal es el de UN tercero, para usarlo como su saldo declarado en el control
// «Σ de los documentos del cliente contra el total del cliente».
import { claveSinNit, normalizarTerceroCartera } from "./tercero-cartera";

type FilaConTercero = {
  datos: Record<string, unknown>;
  /** Saldo que la fila ya declara para su tercero (cabecera o 1.ª fila del bloque). */
  saldoDeclarado?: number | null;
};

type DeteccionConBloque = {
  indice: number;
  clase: "subtotal" | "gran_total" | "cola_control" | null;
  bloque: { indices: readonly number[] } | null;
};

/** Identidad que se copia del bloque a la fila del total cuando esta no la trae. */
export type IdentidadTotalTercero = { nit?: unknown; dv?: unknown; sucursal?: unknown; nombre?: unknown };

const vacio = (v: unknown): boolean => v == null || String(v).trim() === "";

function identidad(datos: Record<string, unknown>) {
  const t = normalizarTerceroCartera({ nit: datos.nit, dv: datos.dv, nombre: datos.nombre, sucursal: datos.sucursal });
  return { canonica: t.claveCanonica, clave: t.claveCanonica ?? claveSinNit(t.nombre) };
}

/**
 * Subtotales que cierran el bloque de UN solo tercero, con la identidad que hay que completarles.
 *
 * Se descartan, para no inventar ni duplicar el control:
 *  - los bloques con documentos de varios terceros (un «Total cuenta 130505») o sin identidad;
 *  - los terceros cuyo saldo ya declara el archivo por otra vía (se contaría dos veces);
 *  - la fila que trae otra identificación;
 *  - la de un tercero identificado solo por su nombre cuando la fila trae texto en el nombre
 *    («Total ACME»): quedaría bajo otra clave y el control acusaría una diferencia falsa.
 */
export function totalesPorTercero(
  filas: readonly FilaConTercero[],
  detecciones: readonly DeteccionConBloque[],
): Map<number, IdentidadTotalTercero> {
  const detectadas = new Set(detecciones.map((d) => d.indice));
  const yaDeclaradas = new Set<string>();
  filas.forEach((f, i) => {
    if (f.saldoDeclarado == null || detectadas.has(i)) return;
    const { clave } = identidad(f.datos);
    if (clave) yaDeclaradas.add(clave);
  });

  const salida = new Map<number, IdentidadTotalTercero>();
  for (const d of detecciones) {
    if (d.clase !== "subtotal" || !d.bloque || d.bloque.indices.length === 0) continue;
    let clave: string | null = null;
    let canonica: string | null = null;
    let muestra: Record<string, unknown> | null = null;
    let unico = true;
    for (const i of d.bloque.indices) {
      const datos = filas[i]?.datos;
      const propia = datos ? identidad(datos) : null;
      if (!datos || !propia?.clave || (clave != null && propia.clave !== clave)) { unico = false; break; }
      clave = propia.clave;
      canonica = propia.canonica;
      muestra ??= datos;
    }
    if (!unico || clave == null || muestra == null || yaDeclaradas.has(clave)) continue;

    const fila = filas[d.indice]?.datos ?? {};
    const deLaFila = identidad(fila);
    if (deLaFila.canonica != null) {
      if (deLaFila.canonica !== clave) continue;
    } else if (!vacio(fila.nit) || (canonica == null && !vacio(fila.nombre))) {
      // Un rótulo en la columna del identificador no se pisa; sin identificador, el nombre
      // tiene que quedar libre para llevar el del tercero.
      continue;
    }
    salida.set(d.indice, {
      ...(deLaFila.canonica == null ? { nit: muestra.nit, dv: muestra.dv, sucursal: muestra.sucursal } : {}),
      ...(vacio(fila.nombre) ? { nombre: muestra.nombre } : {}),
    });
  }
  return salida;
}
