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
  // Clasificación fijada manualmente por un auditor. La vista del borrador puede
  // preservarla aunque aún no tenga hijas; el análisis automático la deja intacta.
  tipoFilaForzado?: "agrupadora" | "movimiento" | null;
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
// Una fila "descuadre" es un MOVIMIENTO que falló el control (saldo ≠ si+db−cr):
// estructuralmente es una HOJA, no un contenedor. Se anida/clasifica como movimiento —
// si no, el árbol la trata como agrupadora y le cuelga las cuentas siguientes por orden.
const esHojaMovimiento = (t: TipoFila) => t === "movimiento" || t === "descuadre";
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
  // Una decisión MANUAL siempre gana sobre la inferencia estructural. En lotes nuevos
  // esta marca solo existe si provino del perfil del cliente; la extracción/IA no la crea.
  for (const fila of ordenadas) {
    if (fila.tipoFilaForzado && esNumerico(fila.codigo) && fila.tipoFila !== "total") {
      fila.tipoFila = fila.tipoFilaForzado;
    }
  }
  // Subtotales de 6 díg duplicados de su detalle de 8 díg (mal-numerados): no se
  // cuentan en el descuadre (su padre no los debe sumar; el detalle ya está).
  const dupSet = marcarSubtotalesDuplicados(ordenadas.filter((f) => f.tipoFila === "movimiento"));

  // ¿"Totales al final" (summary-below)? Algunos ERP ponen el SUBTOTAL DESPUÉS de su
  // detalle, rotulado en la columna de código como "TOTAL 110505". Ahí el ORDEN no da
  // la jerarquía; se anida por PREFIJO de código (order-agnóstico), con los subtotales
  // como padres. Se detecta si la mayoría de las agrupadoras vienen así rotuladas.
  const esTotalCrudo = (f: FilaBorrador) => /^\s*(?:sub)?total/i.test(f.codigoCrudo ?? "");
  const agrup = ordenadas.filter((f) => !esHojaMovimiento(f.tipoFila) && esNumerico(f.codigo));
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
    if (esHojaMovimiento(nodo.tipoFila)) {
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
    } else if (!esNumerico(nodo.codigo)) {
      // Fila NO numérica (total/pie/ruido sin código real: `<none>`, «Total general»,
      // marca del ERP). NO es una cuenta ni un contenedor: se coloca como RAÍZ (nivel
      // superior) SIN vaciar ni empujar la pila de agrupadoras numéricas abiertas. Así
      // no infla el descuadre de ninguna agrupadora («Total general» queda como raíz) y,
      // si viene INTERCALADA, no deja huérfana la cuenta en curso ni detacha sus hijas
      // (antes `nivelSuperior` —que exige código numérico— era falso para todos y vaciaba
      // la pila, degradando la agrupadora a movimiento). Ver casos `5220`/`<none>`.
      roots.push(nodo);
    } else {
      // Agrupadora NUMÉRICA: cuelga de la agrupadora abierta más cercana de NIVEL más
      // SUPERFICIAL (código más corto), respetando la INDENTACIÓN del cliente aunque
      // el código no anide por prefijo. Así una cuenta que el cliente ubicó dentro de
      // un grupo ajeno por código (p. ej. `531520` dentro de `5305`) queda bajo ese
      // grupo y su subtotal cuadra, en vez de "saltar" fuera por prefijo. Cierra los
      // bloques de nivel igual o más profundo (código de igual o mayor longitud).
      const nivelSuperior = (top: NodoBorrador) => esNumerico(top.codigo) && top.codigo.length < nodo.codigo.length;
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
  // La descendencia se responde en O(1) con rangos DFS (entrada/salida), calculados
  // UNA sola vez (perezoso) sobre el árbol ya re-parentado: el chequeo recursivo por
  // candidato era cuadrático con nombres muy repetidos (balances por tercero).
  let rangos: Map<number, { entrada: number; salida: number }> | null = null;
  const esDescendienteRapido = (posible: NodoBorrador, ancestro: NodoBorrador): boolean => {
    if (rangos == null) {
      const porFila = new Map<number, { entrada: number; salida: number }>();
      let reloj = 0;
      const marcarRango = (n: NodoBorrador) => {
        const r = { entrada: reloj++, salida: 0 };
        porFila.set(n.filaNum, r);
        for (const h of n.hijos) marcarRango(h);
        r.salida = reloj++;
      };
      roots.forEach(marcarRango);
      rangos = porFila;
    }
    const rp = rangos.get(posible.filaNum);
    const ra = rangos.get(ancestro.filaNum);
    return rp != null && ra != null && ra.entrada < rp.entrada && rp.salida < ra.salida;
  };
  const perteneceA = new Map<number, NodoBorrador>();
  const usados = new Set<number>();
  for (const A of todos) {
    // Un nodo OMITIDO (p. ej. una agrupadora del re-listado con guiones tachada) NO
    // reclama gemelos: no cuenta, así que no debe atribuirse el saldo de una fila real.
    if (A.tipoFila === "movimiento" || A.hijos.length === 0 || A.omitida) continue;
    const hueco = A.saldoFinal - A.hijos.reduce((s, h) => s + (h.omitida ? 0 : h.saldoFinal), 0);
    if (Math.abs(hueco) <= tol) continue; // ya cuadra con sus hijos
    const cand = (porNombre.get(normNombre(A.nombre)) ?? []).filter(
      (B) => B !== A && !B.omitida && !usados.has(B.filaNum) && Math.abs(B.saldoFinal - hueco) <= tol && !esDescendienteRapido(B, A),
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
export function reclasificarHuerfanas(
  filas: FilaBorrador[],
  opciones: { preservarAgrupadorasForzadas?: boolean } = {},
): FilaBorrador[] {
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
    const preservarManual = opciones.preservarAgrupadorasForzadas && n.tipoFilaForzado === "agrupadora";
    if (!preservarManual && n.tipoFila !== "movimiento" && !n.omitida && esNumerico(n.codigo) && sinHijosReales && !n.subtotalDuplicado && tieneMovimiento(n)) {
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

/**
 * MARCA como `omitida` (por defecto, tachadas) las filas que NO van al balance:
 *  1. PIES/NOTAS del ERP: código que NO EMPIEZA POR DÍGITO («Procesado en: …», «Total
 *     general», «<none>», marcas del software, rótulos) o sin código. Una cuenta PUC real
 *     siempre arranca en número (`1`, `11`, `1105`, `110505`…), incluso con sufijos/letras
 *     alfanuméricas (`110A505`, `236550INAC`), por eso se usa «empieza por dígito» y NO
 *     `!esNumerico` (que tacharía esas cuentas reales — CONSERVADOR a propósito).
 *  2. CUENTAS DE ORDEN (clase 8 deudoras / 9 acreedoras): memorando fuera de balance, no
 *     entran en la ecuación contable. Se ocultan por defecto (caso KOEN); si un cliente las
 *     necesita, se rescatan.
 *
 * Se muestran DESHABILITADAS y no cuentan, pero el usuario puede RESCATAR alguna con
 * «Incluir». MUTA `filas` (`omitida`), devuelve el conteo. Respeta el TRI-ESTADO como
 * `marcarRelistadoGuiones`: solo marca filas cuyo `omitida` está SIN definir (`undefined`);
 * si el usuario la rescató (`false`) o la omitió a mano (`true`), se respeta.
 */
// Placeholder de código de un ROLLUP DE CLASE de SIIGO: un número redondo gigante
// (`800000000000000` = 8×10^14) que el ERP pone en la fila «Cta Nivel 1» en vez del
// código de clase real. Dígito no-cero + ≥10 ceros: NINGUNA cuenta PUC real luce así
// (un IVA largo real como `614505157005` tiene dígitos no-cero). El dígito líder NO es la
// clase (`8…` para un rollup de clase 5), por eso la clase se deriva de los HIJOS.
const ES_CODIGO_PLACEHOLDER = /^[1-9]0{10,}$/;

/**
 * Corrige el código placeholder de los rollups de clase de SIIGO: reemplaza el número
 * gigante por la CLASE real (1 díg) derivada de su primer hijo con código PUC (la fila
 * siguiente en orden). Así el rollup («Otros Gastos») queda como nodo de clase `5`, anida
 * a sus `53…`, no lo oculta `marcarNoContables` y `totalArchivo("5")` vuelve a encontrarlo.
 * MUTA `filas` (`codigo`/`nivel`/`tipoFila`) y devuelve cuántas corrigió. Debe correr ANTES
 * del resto de pasadas. Si no hay hijo numérico después, deja la fila igual (fallback).
 */
export function corregirCodigosPlaceholder(filas: FilaBorrador[]): number {
  const ordenadas = [...filas].sort((a, b) => a.filaNum - b.filaNum);
  let n = 0;
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i];
    if (!ES_CODIGO_PLACEHOLDER.test(f.codigo)) continue;
    // Primer hijo con código PUC real (1-10 díg, no otro placeholder) hacia abajo.
    const hijo = ordenadas.slice(i + 1).find((h) => /^\d{1,10}$/.test(h.codigo));
    if (!hijo) continue; // sin hijo numérico → no se puede derivar la clase
    f.codigo = hijo.codigo.charAt(0); // la CLASE (primer dígito del hijo)
    f.nivel = 1;
    f.tipoFila = "agrupadora"; // es un rollup con hijos, no un movimiento
    n++;
  }
  return n;
}

// Delimitador de SUCURSAL en un balance multi-sucursal consolidado: el archivo trae un
// balance completo por sucursal, cada uno encabezado por una fila «00X NOMBRE» (`002
// MEDELLIN`, `012 CALI- CEDIS`) cuyo código es el NÚMERO de sucursal (2-3 díg que empieza
// en 0) y cuyo saldo es el TOTAL de esa sucursal. NO es una cuenta PUC (no hay clase 0);
// si se deja, se cuenta como cuenta de «clase 0» e infla el balance. 2-3 díg para no
// tocar una cuenta real zero-padded larga (`011005`), que no luce así.
const ES_DELIMITADOR_SUCURSAL = /^0\d{0,2}$/;

export function marcarNoContables(filas: FilaBorrador[]): number {
  let n = 0;
  for (const f of filas) {
    if (f.omitida !== undefined) continue; // respeta rescate/omisión manual (tri-estado)
    const esPieONota = !/^\d/.test(f.codigo); // no empieza por dígito → no es cuenta
    const esCuentaDeOrden = /^[89]/.test(f.codigo); // clase 8/9 → fuera de balance
    const esSucursal = ES_DELIMITADOR_SUCURSAL.test(f.codigo); // total de sucursal, no PUC
    if (esPieONota || esCuentaDeOrden || esSucursal) {
      f.omitida = true;
      n++;
    }
  }
  return n;
}

/**
 * Reclasifica a AGRUPADORA los MOVIMIENTOS que son SUBTOTALES en un export TOTALMENTE
 * JERÁRQUICO: cada nivel viene exportado con su saldo (= Σ de su detalle), por lo que la
 * subcuenta y sus auxiliares aparecen TODOS como filas imputables y se cuentan DOBLE
 * (p. ej. SIESA `110501 CAJA GENERAL` + sus auxiliares `1105…`, que además no comparten
 * prefijo con su subtotal). Regla: un movimiento cuyo SIGUIENTE movimiento (por orden de
 * archivo) tiene código MÁS LARGO tiene detalle debajo → es agrupadora; solo cuentan las
 * HOJAS (el nivel más profundo). Funciona por ORDEN+LONGITUD (no por prefijo), porque el
 * anidado de movimientos de `construirArbolBorrador` es por orden y así el detalle se
 * cuelga del subtotal promovido.
 *
 * AGRESIVA a propósito (SIN guardia de suma): en un balance MIXTO —donde una cuenta con
 * detalle también trae saldo propio— borraría ese saldo. Por eso se activa SOLO por
 * opción del cliente (`imputarSoloHojas`), no de forma global. MUTA `filas` (tipoFila) y
 * devuelve las reclasificadas.
 */
export function reclasificarSoloHojas(filas: FilaBorrador[]): FilaBorrador[] {
  const mov = filas
    .filter((f) => f.tipoFila === "movimiento" && !f.omitida && esNumerico(f.codigo))
    .sort((a, b) => a.filaNum - b.filaNum);
  const promover = new Set<number>();
  // Tiene detalle debajo si el SIGUIENTE movimiento (por orden) es de código más largo.
  for (let i = 0; i < mov.length - 1; i++) {
    if (mov[i + 1].codigo.length > mov[i].codigo.length) promover.add(mov[i].filaNum);
  }
  const cambiadas: FilaBorrador[] = [];
  for (const f of filas) if (promover.has(f.filaNum)) { f.tipoFila = "agrupadora"; cambiadas.push(f); }
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

// ---- Tabulador: contexto para "Ubicar" (elegir destino por prefijo + mover en lote) ----

/** Referencia mínima a un nodo para el selector del tabulador. */
export type RefNodo = { filaNum: number; codigo: string; codigoCrudo: string; nombre: string };

export type ContextoNodo = {
  padre: number | null; // filaNum del padre en el árbol (null si es raíz)
  // Ancestros por PREFIJO de código presentes en el árbol, del MÁS PROFUNDO al más
  // superficial (p. ej. `522003` → [5220, 52, 5]). Son los destinos válidos de "anidar".
  candidatos: RefNodo[];
};

const aRef = (n: NodoBorrador): RefNodo => ({ filaNum: n.filaNum, codigo: n.codigo, codigoCrudo: n.codigoCrudo, nombre: n.nombre });

/**
 * Contexto del TABULADOR por nodo: su padre en el árbol y los destinos de anidación
 * (ancestros por prefijo de código). Puro y testeable; lo consume el modal "Ubicar"
 * del borrador. Solo para nodos de código numérico. Los candidatos de cada nodo se
 * resuelven probando los prefijos de su PROPIO código contra un índice código→nodos
 * (O(n·L)); compararlo todos×todos es cuadrático y con un balance abierto por
 * tercero (50k+ filas) congelaba el navegador.
 */
export function contextoTabulador(arbol: NodoBorrador[]): Map<number, ContextoNodo> {
  const numericos: RefNodo[] = []; // en orden de árbol (DFS)
  const padreDe = new Map<number, number | null>();
  const rec = (nodos: NodoBorrador[], padre: number | null) => {
    for (const n of nodos) {
      if (esNumerico(n.codigo)) numericos.push(aRef(n));
      padreDe.set(n.filaNum, padre);
      rec(n.hijos, n.filaNum);
    }
  };
  rec(arbol, null);

  const porCodigo = new Map<string, RefNodo[]>();
  for (const r of numericos) {
    (porCodigo.get(r.codigo) ?? porCodigo.set(r.codigo, []).get(r.codigo)!).push(r);
  }

  const m = new Map<number, ContextoNodo>();
  for (const x of numericos) {
    // Prefijos del más largo al más corto = candidatos del más profundo al más
    // superficial (mismo orden que producía el sort por longitud descendente).
    const candidatos: RefNodo[] = [];
    for (let len = x.codigo.length - 1; len >= 1; len--) {
      const grupo = porCodigo.get(x.codigo.slice(0, len));
      if (grupo) candidatos.push(...grupo);
    }
    m.set(x.filaNum, { padre: padreDe.get(x.filaNum) ?? null, candidatos });
  }
  return m;
}

/** ¿La fila está MAL ubicada? Tiene un ancestro por prefijo (destino) más profundo que
 *  su padre actual → merece el botón "Ubicar". */
export function puedeUbicar(ctx: ContextoNodo | undefined): boolean {
  return !!ctx && ctx.candidatos.length > 0 && ctx.candidatos[0].filaNum !== ctx.padre;
}

// ---- Reubicación GLOBAL: buscar cualquier cuenta y anidarla bajo una agrupadora ----

export type CuentaReubicacion = RefNodo & {
  tipoFila: TipoFila;
  omitida: boolean;
  subtotalDuplicado: boolean;
  padre: number | null;
  padreManual: number | null;
  ruta: RefNodo[];
  descendientes: number[];
  busqueda: string;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type IndiceReubicacion = {
  cuentas: CuentaReubicacion[];
  porFila: Map<number, CuentaReubicacion>;
};

/** Normalización compartida por los buscadores de origen/destino. */
export function normalizarBusquedaCuenta(valor: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Índice global del bosque actual. Conserva la ruta y los descendientes de cada
 * cuenta para pintar el selector y excluir destinos que producirían un ciclo.
 */
export function construirIndiceReubicacion(arbol: NodoBorrador[]): IndiceReubicacion {
  const cuentas: CuentaReubicacion[] = [];
  const porFila = new Map<number, CuentaReubicacion>();

  const rec = (n: NodoBorrador, padre: number | null, ruta: RefNodo[]): number[] => {
    const ref = aRef(n);
    const numerica = esNumerico(n.codigo) && n.tipoFila !== "total";
    const cuenta: CuentaReubicacion | null = numerica
      ? {
          ...ref,
          tipoFila: n.tipoFila,
          omitida: !!n.omitida,
          subtotalDuplicado: n.subtotalDuplicado,
          padre,
          padreManual: n.padreManual ?? null,
          ruta,
          descendientes: [],
          busqueda: normalizarBusquedaCuenta(`${n.codigoCrudo} ${n.codigo} ${n.nombre}`),
          saldoInicial: n.saldoInicial,
          debitos: n.debitos,
          creditos: n.creditos,
          saldoFinal: n.saldoFinal,
        }
      : null;
    if (cuenta) {
      cuentas.push(cuenta);
      porFila.set(cuenta.filaNum, cuenta);
    }

    const rutaHijos = numerica ? [...ruta, ref] : ruta;
    const descendientes: number[] = [];
    for (const h of n.hijos) {
      if (esNumerico(h.codigo) && h.tipoFila !== "total") descendientes.push(h.filaNum);
      // push(...sub) con un subárbol de decenas de miles de nodos revienta el límite
      // de argumentos del motor (RangeError); se acumula elemento a elemento.
      for (const d of rec(h, n.filaNum, rutaHijos)) descendientes.push(d);
    }
    if (cuenta) cuenta.descendientes = descendientes;
    return descendientes;
  };

  for (const raiz of arbol) rec(raiz, null, []);
  return { cuentas, porFila };
}

/** Destinos globales válidos: agrupadoras activas, fuera de la propia subrama. */
export function destinosReubicacion(indice: IndiceReubicacion, filaNum: number): CuentaReubicacion[] {
  const origen = indice.porFila.get(filaNum);
  if (!origen) return [];
  const prohibidas = new Set(origen.descendientes);
  prohibidas.add(origen.filaNum);
  if (origen.padre != null) prohibidas.add(origen.padre);

  return indice.cuentas
    .filter((c) => c.tipoFila === "agrupadora" && !c.omitida && !c.subtotalDuplicado && !prohibidas.has(c.filaNum))
    .sort((a, b) => {
      const sugA = origen.codigo.startsWith(a.codigo) && a.codigo.length < origen.codigo.length;
      const sugB = origen.codigo.startsWith(b.codigo) && b.codigo.length < origen.codigo.length;
      if (sugA !== sugB) return sugA ? -1 : 1;
      if (sugA && sugB && a.codigo.length !== b.codigo.length) return b.codigo.length - a.codigo.length;
      return a.filaNum - b.filaNum;
    });
}

export function esDestinoSugerido(origen: CuentaReubicacion, destino: CuentaReubicacion): boolean {
  return destino.codigo.length < origen.codigo.length && origen.codigo.startsWith(destino.codigo);
}

export type TotalesAgrupacion = {
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type ComparacionAgrupacion = {
  objetivo: TotalesAgrupacion;
  seleccion: TotalesAgrupacion;
  diferencias: TotalesAgrupacion;
  coincide: boolean;
};

const totalesCuenta = (cuenta: Pick<CuentaReubicacion, "saldoInicial" | "debitos" | "creditos" | "saldoFinal">): TotalesAgrupacion => ({
  saldoInicial: cuenta.saldoInicial,
  debitos: cuenta.debitos,
  creditos: cuenta.creditos,
  saldoFinal: cuenta.saldoFinal,
});

/** Compara los cuatro movimientos de la futura agrupadora contra las hijas elegidas. */
export function compararTotalesAgrupacion(
  origen: CuentaReubicacion,
  hijas: CuentaReubicacion[],
  tolerancia = 1,
): ComparacionAgrupacion {
  const objetivo = totalesCuenta(origen);
  const seleccion = hijas.reduce<TotalesAgrupacion>(
    (suma, fila) => ({
      saldoInicial: suma.saldoInicial + fila.saldoInicial,
      debitos: suma.debitos + fila.debitos,
      creditos: suma.creditos + fila.creditos,
      saldoFinal: suma.saldoFinal + fila.saldoFinal,
    }),
    { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 },
  );
  const diferencias: TotalesAgrupacion = {
    saldoInicial: objetivo.saldoInicial - seleccion.saldoInicial,
    debitos: objetivo.debitos - seleccion.debitos,
    creditos: objetivo.creditos - seleccion.creditos,
    saldoFinal: objetivo.saldoFinal - seleccion.saldoFinal,
  };
  return {
    objetivo,
    seleccion,
    diferencias,
    coincide: Object.values(diferencias).every((valor) => Math.abs(valor) <= tolerancia),
  };
}

/**
 * Sugiere los movimientos hermanos consecutivos que explican exactamente los cuatro
 * totales de una cuenta. Es solo una ayuda visual: nunca valida ni bloquea el cambio.
 */
export function sugerirMovimientosAgrupadora(
  indice: IndiceReubicacion,
  filaNum: number,
  tolerancia = 1,
): number[] {
  const origen = indice.porFila.get(filaNum);
  if (!origen) return [];
  const candidatas = indice.cuentas
    .filter((cuenta) =>
      cuenta.filaNum > origen.filaNum &&
      cuenta.padre === origen.padre &&
      cuenta.codigo.length === origen.codigo.length &&
      cuenta.tipoFila === "movimiento" &&
      !cuenta.omitida &&
      !cuenta.subtotalDuplicado,
    )
    .sort((a, b) => a.filaNum - b.filaNum);

  const seleccion: CuentaReubicacion[] = [];
  for (const candidata of candidatas) {
    seleccion.push(candidata);
    if (compararTotalesAgrupacion(origen, seleccion, tolerancia).coincide) {
      return seleccion.map((cuenta) => cuenta.filaNum);
    }
  }
  return [];
}

export type ResultadoValidacionReubicacion = { ok: true } | { ok: false; message: string };

const mapaPadresArbol = (arbol: NodoBorrador[]): Map<number, number | null> => {
  const padres = new Map<number, number | null>();
  const rec = (n: NodoBorrador, padre: number | null) => {
    padres.set(n.filaNum, padre);
    n.hijos.forEach((h) => rec(h, n.filaNum));
  };
  arbol.forEach((n) => rec(n, null));
  return padres;
};

/**
 * Valida el grafo FINAL antes de persistir. Parte de la jerarquía automática,
 * superpone todos los `padreManual` (existentes + parche) y rechaza referencias
 * inexistentes, destinos que no agrupan, operaciones sin efecto y ciclos.
 */
export function validarReubicacionesBorrador(
  filas: FilaBorrador[],
  parche: Record<string, number | null>,
): ResultadoValidacionReubicacion {
  const porFila = new Map(filas.map((f) => [f.filaNum, { ...f }]));
  const cambios = Object.entries(parche ?? {}).filter(([fila]) => /^\d+$/.test(fila));
  if (cambios.length === 0) return { ok: true };

  const arbolActual = construirArbolBorrador(filas.map((f) => ({ ...f })));
  const padreActual = mapaPadresArbol(arbolActual);

  for (const [filaStr, destino] of cambios) {
    const filaNum = Number(filaStr);
    const origen = porFila.get(filaNum);
    if (!origen || !esNumerico(origen.codigo) || origen.tipoFila === "total") {
      return { ok: false, message: `La fila ${filaNum} no es una cuenta reubicable de este borrador.` };
    }
    if (destino == null) {
      origen.padreManual = null;
      continue;
    }
    const padre = porFila.get(destino);
    if (!padre || !esNumerico(padre.codigo)) {
      return { ok: false, message: "La agrupadora seleccionada no pertenece a este borrador." };
    }
    if (padre.tipoFila !== "agrupadora" || padre.omitida) {
      return { ok: false, message: `${padre.codigoCrudo || padre.codigo} no es una agrupadora disponible.` };
    }
    if (filaNum === destino) return { ok: false, message: "Una cuenta no puede anidarse bajo sí misma." };
    if (padreActual.get(filaNum) === destino) {
      return { ok: false, message: "La cuenta ya está ubicada bajo esa agrupadora." };
    }
    origen.padreManual = destino;
  }

  // Árbol sin overrides: define el padre automático al restaurar (`null`).
  const automaticas = [...porFila.values()].map((f) => ({ ...f, padreManual: null }));
  const padreFinal = mapaPadresArbol(construirArbolBorrador(automaticas));
  for (const f of porFila.values()) if (f.padreManual != null) padreFinal.set(f.filaNum, f.padreManual);

  for (const inicio of padreFinal.keys()) {
    const vistos = new Set<number>();
    let cursor: number | null | undefined = inicio;
    while (cursor != null) {
      if (vistos.has(cursor)) return { ok: false, message: "La reubicación formaría un ciclo dentro del árbol de cuentas." };
      vistos.add(cursor);
      cursor = padreFinal.get(cursor);
    }
  }
  return { ok: true };
}
