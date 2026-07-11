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
  // Desacople MANUAL: anida por PREFIJO de código (su padre real), ignorando el
  // contenedor por orden. Corrige un detalle mal ubicado por el ERP bajo una
  // agrupadora de código ajeno (p. ej. `145020` colgado de `1305`).
  desacoplada?: boolean;
  // Omitir MANUAL: la fila SE CONSERVA en el árbol/crudo (para el comparativo línea a
  // línea), pero se EXCLUYE de los cálculos (no cuenta en el descuadre de su padre,
  // ni en las sumas/partida doble, ni se vuelca al balance al cargar).
  omitida?: boolean;
  // Re-parentado MANUAL (tabulador): `filaNum` de la agrupadora bajo la que el usuario
  // colgó esta fila (indentar/desindentar), sobreescribiendo la anidación automática.
  padreManual?: number | null;
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

  // ¿"Totales al final" (summary-below)? Algunos ERP ponen el SUBTOTAL DESPUÉS de su
  // detalle, rotulado en la columna de código como "TOTAL 110505". Ahí el ORDEN no da
  // la jerarquía; se anida por PREFIJO de código (order-agnóstico), con los subtotales
  // como padres. Se detecta si la mayoría de las agrupadoras vienen así rotuladas.
  const esTotalCrudo = (f: FilaBorrador) => /^\s*(?:sub)?total/i.test(f.codigoCrudo ?? "");
  const agrup = ordenadas.filter((f) => f.tipoFila !== "movimiento" && esNumerico(f.codigo));
  const summaryBelow = agrup.length > 0 && agrup.filter(esTotalCrudo).length > agrup.length / 2;

  if (summaryBelow) {
    const nodos = ordenadas.map((f) => ({ ...f, descuadre: null, subtotalDuplicado: dupSet.has(f), hijos: [] }) as NodoBorrador);
    const agrPorCodigo = new Map<string, NodoBorrador>();
    for (const n of nodos) if (n.tipoFila !== "movimiento" && esNumerico(n.codigo) && !agrPorCodigo.has(n.codigo)) agrPorCodigo.set(n.codigo, n);
    const padreDe = (code: string): NodoBorrador | null => {
      for (let len = code.length - 1; len >= 1; len--) {
        const p = agrPorCodigo.get(code.slice(0, len));
        if (p) return p;
      }
      return null;
    };
    for (const n of nodos) {
      const padre = esNumerico(n.codigo) ? padreDe(n.codigo) : null;
      if (padre && padre !== n) padre.hijos.push(n);
      else roots.push(n);
    }
  } else {
  for (const f of ordenadas) {
    const nodo: NodoBorrador = { ...f, descuadre: null, subtotalDuplicado: dupSet.has(f), hijos: [] };
    if (nodo.tipoFila === "movimiento") {
      // Un movimiento cuelga de la agrupadora ABIERTA más profunda que sea un
      // CONTENEDOR plausible: código estrictamente MÁS CORTO que el suyo (por ORDEN
      // del archivo, no por prefijo). Dos códigos de igual longitud son HERMANOS, no
      // padre-hijo (un 6 díg no cuelga de otro 6 díg). Así:
      //  - se respeta el desacople del ERP: un detalle bajo un grupo de código ajeno
      //    pero de MENOR nivel (p. ej. `139005` bajo `1305 CLIENTES`) queda ahí y el
      //    subtotal cuadra; PERO
      //  - una cuenta HERMANA que el orden ubicó tras el detalle de otra (p. ej.
      //    `135531` justo después de las hijas de `135515`) NO se traga: sube al
      //    contenedor común real (`1355`), y ambos subtotales cuadran.
      // No abre ni cierra bloques. Fallback al tope si el código no es numérico o no
      // hay contenedor más corto (conserva el comportamiento por orden).
      let padre: NodoBorrador | undefined;
      if (esNumerico(nodo.codigo)) {
        for (let i = pila.length - 1; i >= 0; i--) {
          const t = pila[i];
          if (!esNumerico(t.codigo)) continue;
          if (nodo.desacoplada) {
            // Desacople MANUAL: SOLO cuelga de un ancestro real por PREFIJO estricto;
            // ignora los contenedores por orden de código ajeno. Si no hay ancestro
            // por prefijo en la pila, queda como raíz (fuera de la agrupadora ajena).
            if (nodo.codigo.startsWith(t.codigo) && t.codigo.length < nodo.codigo.length) { padre = t; break; }
          } else if (t.codigo.length < nodo.codigo.length || t.codigo === nodo.codigo) {
            // Normal: contenedor por nivel (código más corto), o el MISMO código (caso
            // «código repetido»: encabezado + su movimiento homónimo).
            padre = t; break;
          }
        }
      }
      // Desacoplada sin ancestro por prefijo → raíz; si no, fallback al tope por orden.
      padre = padre ?? (nodo.desacoplada ? undefined : pila[pila.length - 1]);
      if (padre) padre.hijos.push(nodo);
      else roots.push(nodo);
    } else {
      // Agrupadora/total: cuelga de la agrupadora abierta más cercana de NIVEL más
      // SUPERFICIAL (código más corto), respetando la INDENTACIÓN del cliente aunque
      // el código no anide por prefijo. Así una cuenta que el cliente ubicó dentro de
      // un grupo ajeno por código (p. ej. `531520` dentro de `5305`) queda bajo ese
      // grupo y su subtotal cuadra, en vez de "saltar" fuera por prefijo. Cierra los
      // bloques de nivel igual o más profundo (código de igual o mayor longitud).
      const nivelSuperior = (top: NodoBorrador) => esNumerico(nodo.codigo) && esNumerico(top.codigo) && top.codigo.length < nodo.codigo.length;
      while (pila.length > 0 && !nivelSuperior(pila[pila.length - 1])) {
        pila.pop();
      }
      const padre = pila[pila.length - 1];
      if (padre) padre.hijos.push(nodo);
      else roots.push(nodo);
      pila.push(nodo);
    }
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

  // Re-parentado MANUAL (tabulador): el usuario movió una fila bajo la agrupadora que
  // eligió (indentar/desindentar → `padreManual` = filaNum destino). Se aplica sobre el
  // árbol ya anidado, ANTES del descuadre, para que el nuevo padre la cuente y el viejo
  // deje de descuadrar. Ignora un destino inexistente o que crearía un ciclo.
  if (todos.some((n) => n.padreManual != null)) {
    const porFilaNum = new Map(todos.map((n) => [n.filaNum, n]));
    const padreActual = new Map<number, NodoBorrador | null>();
    const mapPadres = (n: NodoBorrador, p: NodoBorrador | null) => { padreActual.set(n.filaNum, p); n.hijos.forEach((h) => mapPadres(h, n)); };
    roots.forEach((r) => mapPadres(r, null));
    for (const n of todos) {
      if (n.padreManual == null) continue;
      const destino = porFilaNum.get(n.padreManual);
      if (!destino || destino === n || esDescendiente(destino, n)) continue;
      const actual = padreActual.get(n.filaNum) ?? null;
      if (actual) actual.hijos = actual.hijos.filter((h) => h !== n);
      else { const i = roots.indexOf(n); if (i >= 0) roots.splice(i, 1); }
      destino.hijos.push(n);
      padreActual.set(n.filaNum, destino);
    }
  }

  // Detección de gemelos: para cada agrupadora "hueca" (su hueco = saldo − Σhijos ≠ 0),
  // busca un nodo del mismo NOMBRE cuyo saldo ≈ hueco y que NO sea su descendiente.
  // Ese detalle se atribuye al subtotal (perteneceA) para el cómputo del descuadre.
  const perteneceA = new Map<number, NodoBorrador>();
  const usados = new Set<number>();
  for (const A of todos) {
    // Un nodo OMITIDO (p. ej. una agrupadora del re-listado con guiones tachada) NO
    // reclama gemelos: no cuenta, así que no debe atribuirse el saldo de una fila real.
    if (A.tipoFila === "movimiento" || A.hijos.length === 0 || A.omitida) continue;
    const hueco = A.saldoFinal - A.hijos.reduce((s, h) => s + (h.omitida ? 0 : h.saldoFinal), 0);
    if (Math.abs(hueco) <= tol) continue; // ya cuadra con sus hijos
    const cand = (porNombre.get(normNombre(A.nombre)) ?? []).filter(
      (B) => B !== A && !B.omitida && !usados.has(B.filaNum) && Math.abs(B.saldoFinal - hueco) <= tol && !esDescendiente(B, A),
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
    // Un nodo OMITIDO (p. ej. una agrupadora del re-listado con guiones que se marcó
    // tachada) no computa descuadre: no cuenta, así que no debe mostrar Δ falso.
    if (n.tipoFila !== "movimiento" && !n.omitida && (n.hijos.length > 0 || atribuidos.length > 0)) {
      let suma = 0;
      for (const h of n.hijos) if (!perteneceA.has(h.filaNum) && !h.subtotalDuplicado && !h.omitida) suma += h.saldoFinal;
      for (const g of atribuidos) suma += g.saldoFinal;
      const d = n.saldoFinal - suma;
      n.descuadre = Math.abs(d) > tol ? d : 0;
    }
  };
  roots.forEach(marcar);
  return roots;
}

/**
 * Reclasifica a MOVIMIENTO las agrupadoras HUÉRFANAS: nodos marcados como
 * agrupadora que en el árbol NO tienen ningún hijo y traen movimiento (saldo o
 * débito/crédito ≠ 0). Una "agrupadora" que no agrupa nada es en realidad una
 * hoja imputable — el ERP exportó el saldo DIRECTO en la cuenta, sin desglose
 * (p. ej. `2205 NACIONALES` con su saldo y sin subcuentas); si se deja como
 * agrupadora, su plata se pierde al cargar (una agrupadora se asume = Σ hijos, y
 * no tiene). MUTA `filas` (tipoFila) y devuelve las filas reclasificadas.
 *
 * Seguro contra DOBLE CONTEO: un nodo sin hijos no tiene descendientes que ya
 * aporten su saldo, y la detección de gemelos ignora los nodos sin hijos (ver el
 * `continue` en `construirArbolBorrador`), así que tampoco recibe un gemelo.
 *
 * Solo aplica a códigos NUMÉRICOS: un pie/total de código no numérico («Totales
 * Prueba», «Total general») NO es una cuenta, así que NO se recupera a movimiento
 * (lo dejó como «total» `reclasificarNoImputables` y así debe quedar).
 */
export function reclasificarHuerfanas(filas: FilaBorrador[]): FilaBorrador[] {
  const tieneMovimiento = (n: NodoBorrador) =>
    Math.abs(n.saldoFinal) > 0.005 || Math.abs(n.debitos) > 0.005 || Math.abs(n.creditos) > 0.005;
  const arbol = construirArbolBorrador(filas);
  const huerfanas = new Set<number>(); // filaNum
  const rec = (n: NodoBorrador) => {
    // Sin hijos que cuenten: 0 hijos, o TODOS omitidos (p. ej. un tercero que se coló
    // y el usuario excluyó con ✕). Así la cuenta cuyos únicos hijos están omitidos se
    // vuelve imputable y aporta su saldo completo, en vez de perderse como agrupadora.
    const sinHijosReales = n.hijos.every((h) => h.omitida);
    // Un nodo ya OMITIDO no se recupera a movimiento: está tachado y excluido a propósito.
    if (n.tipoFila !== "movimiento" && !n.omitida && esNumerico(n.codigo) && sinHijosReales && !n.subtotalDuplicado && tieneMovimiento(n)) {
      huerfanas.add(n.filaNum);
    }
    n.hijos.forEach(rec);
  };
  arbol.forEach(rec);
  const cambiadas: FilaBorrador[] = [];
  for (const f of filas) {
    if (huerfanas.has(f.filaNum)) {
      f.tipoFila = "movimiento";
      cambiadas.push(f);
    }
  }
  return cambiadas;
}

/** Total de nodos en el bosque (para contadores/UI). */
export function contarNodos(nodos: NodoBorrador[]): number {
  return nodos.reduce((n, x) => n + 1 + contarNodos(x.hijos), 0);
}

/**
 * Aplana el árbol a una lista con la profundidad (nivel) de cada nodo, ordenada por
 * el ORDEN ORIGINAL del archivo (`filaNum`) — no por el recorrido del árbol — para
 * que el export conserve el crudo tal cual (p. ej. en «totales al final» el subtotal
 * sale DESPUÉS de su detalle, como en el Excel). Si `filtro` trae códigos, incluye
 * solo las ramas que contienen una coincidencia (código que empieza por alguno del
 * filtro): sus ancestros (ruta) + todo el subárbol de cada coincidencia.
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
  // Orden ORIGINAL del archivo: conserva el crudo (detalle→subtotal en summary-below).
  out.sort((a, b) => a.nodo.filaNum - b.nodo.filaNum);
  return out;
}
