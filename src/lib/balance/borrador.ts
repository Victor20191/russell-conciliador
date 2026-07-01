// Árbol CRUDO del borrador (paso 1), directamente de lo extraído del Excel — SIN
// homologación al plan Russell. Anida las filas del staging por PREFIJO de código
// en orden de archivo, preservando la estructura tal cual (incl. balances
// multi-sucursal: cada "1 ACTIVO" queda como una raíz con su subárbol). Localiza
// el descuadre POR NODO agrupador: total del archivo vs suma de los hijos.
//
// SILENCIA "gemelos": es común que el ERP ubique un detalle bajo una agrupadora
// que NO le corresponde por código (mismo nombre que su subtotal, pero el código
// no anida por prefijo). En esos casos el subtotal parece "hueco" y su padre lo
// cuenta doble, aunque AL SUMAR está bien. Se detecta el par subtotal↔detalle
// (mismo nombre, el detalle explica el hueco) y se atribuye el detalle a su
// subtotal SOLO para el cálculo del descuadre — el árbol se muestra tal cual.
import { marcarSubtotalesDuplicados, reclasificarRepetidos, type TipoFila } from "@/lib/balance/extraccion/transformar";

export type FilaBorrador = {
  filaNum: number;
  codigo: string; // normalizado ("" si no numérico)
  codigoCrudo: string;
  nombre: string;
  nivel: number | null;
  tipoFila: TipoFila;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type NodoBorrador = FilaBorrador & {
  // Agrupadora: saldoFinal − Σ(hijos + gemelos atribuidos). null si no aplica
  // (hoja/sin hijos); 0 si cuadra dentro de la tolerancia; ≠0 = ahí está el descuadre.
  descuadre: number | null;
  // Subtotal de 6 díg duplicado de un detalle de 8 díg idéntico: no se importa ni
  // se cuenta en el descuadre (su detalle ya lleva el valor).
  subtotalDuplicado: boolean;
  hijos: NodoBorrador[];
};

const esNumerico = (c: string) => /^\d+$/.test(c);
const esPrefijoEstricto = (a: string, b: string) => a.length > 0 && b.length > a.length && b.startsWith(a);
const normNombre = (s: string) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Construye el bosque (varias raíces posibles) del borrador a partir de las filas
 * del staging. Nesting determinista con una pila de ancestros: cada fila cuelga de
 * la fila previa cuyo `codigo` es prefijo ESTRICTO del suyo. `tol` = tolerancia
 * (COP) para marcar descuadre por nodo.
 */
export function construirArbolBorrador(filas: FilaBorrador[], tol = 1): NodoBorrador[] {
  const roots: NodoBorrador[] = [];
  const pila: NodoBorrador[] = [];
  const ordenadas = [...filas].sort((a, b) => a.filaNum - b.filaNum);
  // Código repetido (encabezado + movimiento con el mismo código): la repetición
  // pasa a movimiento (muta `tipoFila` de las filas de entrada).
  reclasificarRepetidos(ordenadas);
  // Subtotales de 6 díg duplicados de su detalle de 8 díg (mal-numerados): no se
  // cuentan en el descuadre (su padre no los debe sumar; el detalle ya está).
  const dupSet = marcarSubtotalesDuplicados(ordenadas.filter((f) => f.tipoFila === "movimiento"));

  for (const f of ordenadas) {
    const nodo: NodoBorrador = { ...f, descuadre: null, subtotalDuplicado: dupSet.has(f), hijos: [] };
    if (nodo.tipoFila === "movimiento") {
      // Un movimiento cuelga de la agrupadora ABIERTA más profunda (por ORDEN del
      // archivo), NO por prefijo de código. Así los movimientos «desacoplados» que
      // el ERP ubicó bajo una agrupadora que no les corresponde por código (p. ej.
      // `139005` bajo `1305 CLIENTES`) quedan bajo su agrupadora real y el subtotal
      // cuadra. No abre ni cierra bloques.
      const padre = pila[pila.length - 1];
      if (padre) padre.hijos.push(nodo);
      else roots.push(nodo);
    } else {
      // Agrupadora/total: cierra los bloques cuyo código ya no es prefijo del actual.
      while (pila.length > 0 && !(esNumerico(nodo.codigo) && esPrefijoEstricto(pila[pila.length - 1].codigo, nodo.codigo))) {
        pila.pop();
      }
      const padre = pila[pila.length - 1];
      if (padre) padre.hijos.push(nodo);
      else roots.push(nodo);
      pila.push(nodo);
    }
  }

  // Aplanar + indexar por nombre para detectar gemelos.
  const todos: NodoBorrador[] = [];
  const aplanar = (n: NodoBorrador) => { todos.push(n); n.hijos.forEach(aplanar); };
  roots.forEach(aplanar);
  const porNombre = new Map<string, NodoBorrador[]>();
  for (const n of todos) {
    const k = normNombre(n.nombre);
    (porNombre.get(k) ?? porNombre.set(k, []).get(k)!).push(n);
  }
  const esDescendiente = (posible: NodoBorrador, ancestro: NodoBorrador): boolean =>
    ancestro.hijos.some((h) => h === posible || esDescendiente(posible, h));

  // Detección de gemelos: para cada agrupadora "hueca" (su hueco = saldo − Σhijos ≠ 0),
  // busca un nodo del mismo NOMBRE cuyo saldo ≈ hueco y que NO sea su descendiente.
  // Ese detalle se atribuye al subtotal (perteneceA) para el cómputo del descuadre.
  const perteneceA = new Map<number, NodoBorrador>();
  const usados = new Set<number>();
  for (const A of todos) {
    if (A.tipoFila === "movimiento" || A.hijos.length === 0) continue;
    const hueco = A.saldoFinal - A.hijos.reduce((s, h) => s + h.saldoFinal, 0);
    if (Math.abs(hueco) <= tol) continue; // ya cuadra con sus hijos
    const cand = (porNombre.get(normNombre(A.nombre)) ?? []).filter(
      (B) => B !== A && !usados.has(B.filaNum) && Math.abs(B.saldoFinal - hueco) <= tol && !esDescendiente(B, A),
    );
    if (cand.length > 0) {
      perteneceA.set(cand[0].filaNum, A);
      usados.add(cand[0].filaNum);
    }
  }

  // Descuadre por nodo, con re-atribución de gemelos:
  //  - se excluyen los hijos que son gemelos filiados en otro subtotal, y
  //  - se suman los gemelos que fueron atribuidos a este nodo.
  const gemelosDe = new Map<number, NodoBorrador[]>(); // A.filaNum → detalles atribuidos
  for (const [filaNum, A] of perteneceA) {
    const B = todos.find((n) => n.filaNum === filaNum)!;
    (gemelosDe.get(A.filaNum) ?? gemelosDe.set(A.filaNum, []).get(A.filaNum)!).push(B);
  }
  const marcar = (n: NodoBorrador) => {
    for (const h of n.hijos) marcar(h);
    const atribuidos = gemelosDe.get(n.filaNum) ?? [];
    if (n.tipoFila !== "movimiento" && (n.hijos.length > 0 || atribuidos.length > 0)) {
      let suma = 0;
      for (const h of n.hijos) if (!perteneceA.has(h.filaNum) && !h.subtotalDuplicado) suma += h.saldoFinal;
      for (const g of atribuidos) suma += g.saldoFinal;
      const d = n.saldoFinal - suma;
      n.descuadre = Math.abs(d) > tol ? d : 0;
    }
  };
  roots.forEach(marcar);
  return roots;
}

/** Total de nodos en el bosque (para contadores/UI). */
export function contarNodos(nodos: NodoBorrador[]): number {
  return nodos.reduce((n, x) => n + 1 + contarNodos(x.hijos), 0);
}

/**
 * Aplana el árbol a una lista en orden de despliegue, con la profundidad de cada
 * nodo (para exportar/serializar). Si `filtro` trae códigos, incluye solo las ramas
 * que contienen una coincidencia (código que empieza por alguno del filtro): sus
 * ancestros (ruta) + todo el subárbol de cada coincidencia. Misma lógica que el
 * filtro visual del árbol.
 */
export function aplanarArbolFiltrado(arbol: NodoBorrador[], filtro: string[] = []): { nodo: NodoBorrador; profundidad: number }[] {
  const activo = filtro.length > 0;
  const coincide = (c: string) => activo && filtro.some((f) => c.startsWith(f));
  const subRama = new Map<number, boolean>();
  const marcar = (n: NodoBorrador): boolean => {
    let hay = coincide(n.codigo);
    for (const h of n.hijos) if (marcar(h)) hay = true;
    subRama.set(n.filaNum, hay);
    return hay;
  };
  arbol.forEach(marcar);
  const out: { nodo: NodoBorrador; profundidad: number }[] = [];
  const rec = (n: NodoBorrador, prof: number, bajoMatch: boolean) => {
    if (activo && !bajoMatch && !subRama.get(n.filaNum)) return;
    out.push({ nodo: n, profundidad: prof });
    const esMatch = coincide(n.codigo);
    n.hijos.forEach((h) => rec(h, prof + 1, bajoMatch || esMatch));
  };
  arbol.forEach((r) => rec(r, 0, false));
  return out;
}
