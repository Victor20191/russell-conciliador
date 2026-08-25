/**
 * Convierte el CSS de un documento HTML en estilos EN LÍNEA (`style="..."`).
 *
 * Motivo: los clientes de correo no son navegadores. Gmail elimina las
 * etiquetas `<style>` del contenido pegado, así que un documento que pinta con
 * clases (como el reporte ejecutivo, que genera la IA con una hoja de estilos
 * completa) llega al cliente sin formato: sin serif en los títulos, sin azul
 * institucional, sin tarjetas ni bordes. Lo único que sobrevive de forma
 * fiable es el atributo `style` de cada elemento.
 *
 * Toda la lógica de parseo y cascada es PURA y se prueba en Node. La única
 * función que necesita navegador es `htmlConEstilosEnLinea`, que se limita a
 * parsear el documento con DOMParser y delegar aquí.
 */

export type Declaracion = {
  propiedad: string;
  valor: string;
  importante: boolean;
};

export type ReglaCss = {
  selector: string;
  declaraciones: Declaracion[];
  /** Especificidad aproximada del selector (mayor gana). */
  especificidad: number;
  /** Posición en la hoja; desempata a igual especificidad (mayor gana). */
  orden: number;
};

export type HojaParseada = {
  /** Reglas que se pueden volcar a `style="..."`. */
  reglas: ReglaCss[];
  /** Variables CSS declaradas (`--x: valor`), ya sin el prefijo resuelto. */
  variables: Map<string, string>;
  /**
   * CSS que NO se puede poner en línea (media queries, `:hover`, `::before`…).
   * Se conserva en un `<style>` reducido para los clientes que sí lo respetan.
   */
  cssRestante: string;
};

/** Pseudo-clases y pseudo-elementos que no existen como estilo en línea. */
const PSEUDOS_NO_INLINEABLES =
  /::|:(?:hover|focus|focus-within|focus-visible|active|visited|link|target|checked|disabled|enabled|required|optional|valid|invalid|placeholder-shown|placeholder|before|after|first-line|first-letter|selection|marker)\b/i;

function quitarComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Lee un bloque `{ … }` equilibrado a partir de la llave de apertura y devuelve
 * su contenido (sin las llaves externas) y el índice siguiente al cierre.
 */
function leerBloque(css: string, inicio: number): { contenido: string; fin: number } {
  let nivel = 0;
  let comilla: string | null = null;
  let contenido = "";

  for (let i = inicio; i < css.length; i++) {
    const c = css[i];

    if (comilla) {
      contenido += c;
      if (c === "\\") {
        contenido += css[i + 1] ?? "";
        i++;
      } else if (c === comilla) {
        comilla = null;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      comilla = c;
      contenido += c;
      continue;
    }
    if (c === "{") {
      nivel++;
      if (nivel === 1) continue; // llave de apertura externa
    }
    if (c === "}") {
      nivel--;
      if (nivel === 0) return { contenido, fin: i + 1 };
    }
    contenido += c;
  }

  return { contenido, fin: css.length };
}

/** Corta por un separador de nivel superior (fuera de comillas, paréntesis y corchetes). */
function partirNivelSuperior(texto: string, separador: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let profundidad = 0;
  let comilla: string | null = null;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (comilla) {
      actual += c;
      if (c === "\\") {
        actual += texto[i + 1] ?? "";
        i++;
      } else if (c === comilla) {
        comilla = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      actual += c;
      continue;
    }
    if (c === "(" || c === "[") profundidad++;
    if (c === ")" || c === "]") profundidad = Math.max(0, profundidad - 1);
    if (c === separador && profundidad === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }

  partes.push(actual);
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

export function dividirSelectores(prelude: string): string[] {
  return partirNivelSuperior(prelude, ",");
}

export function parsearDeclaraciones(texto: string): Declaracion[] {
  const declaraciones: Declaracion[] = [];

  for (const trozo of partirNivelSuperior(texto, ";")) {
    // Restos de reglas anidadas (@media dentro de un bloque): no son declaraciones.
    if (trozo.includes("{")) continue;

    const corte = partirNivelSuperior(trozo, ":");
    if (corte.length < 2) continue;

    const propiedad = trozo.slice(0, trozo.indexOf(":")).trim().toLowerCase();
    let valor = trozo.slice(trozo.indexOf(":") + 1).trim();
    if (!propiedad || !valor) continue;

    let importante = false;
    const marca = valor.match(/!\s*important\s*$/i);
    if (marca) {
      importante = true;
      valor = valor.slice(0, marca.index).trim();
    }
    if (!valor) continue;

    declaraciones.push({ propiedad, valor, importante });
  }

  return declaraciones;
}

/**
 * Especificidad aproximada (ids · clases/atributos/pseudo-clases · elementos).
 * No necesita ser exacta al estándar: solo tiene que ordenar la cascada igual
 * que lo haría el navegador en los casos normales de una hoja de estilos.
 */
export function especificidad(selector: string): number {
  const limpio = selector.replace(/\\./g, " ");

  const ids = (limpio.match(/#[\w-]+/g) ?? []).length;
  const clases =
    (limpio.match(/\.[\w-]+/g) ?? []).length +
    (limpio.match(/\[[^\]]*\]/g) ?? []).length +
    (limpio.match(/(?<!:):(?!:)[\w-]+/g) ?? []).length;

  const resto = limpio
    .replace(/#[\w-]+/g, " ")
    .replace(/\.[\w-]+/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/::?[\w-]+(?:\([^)]*\))?/g, " ");
  const elementos = (resto.match(/(?:^|[\s>+~(])[a-zA-Z][\w-]*/g) ?? []).length;

  return ids * 1_000_000 + clases * 1_000 + elementos;
}

export function esSelectorInlineable(selector: string): boolean {
  const limpio = selector.trim();
  if (!limpio || limpio.startsWith("@")) return false;
  return !PSEUDOS_NO_INLINEABLES.test(limpio);
}

/**
 * Parte una hoja de estilos en lo que se puede volcar a `style="..."` y lo que
 * no. Las at-rules (@media, @keyframes, @supports…) nunca se pueden poner en
 * línea porque dependen del contexto de render, así que se conservan tal cual.
 */
export function parsearHojaEstilos(css: string): HojaParseada {
  const limpio = quitarComentarios(css);
  const reglas: ReglaCss[] = [];
  const restantes: string[] = [];
  const variables = new Map<string, string>();
  let orden = 0;
  let prelude = "";
  let i = 0;

  while (i < limpio.length) {
    const c = limpio[i];

    if (c === "{") {
      const { contenido, fin } = leerBloque(limpio, i);
      const selectores = prelude.trim();
      prelude = "";
      i = fin;
      if (!selectores) continue;

      if (selectores.startsWith("@")) {
        restantes.push(`${selectores}{${contenido.trim()}}`);
        continue;
      }

      const declaraciones = parsearDeclaraciones(contenido);
      for (const d of declaraciones) {
        if (d.propiedad.startsWith("--")) variables.set(d.propiedad, d.valor);
      }
      const aplicables = declaraciones.filter((d) => !d.propiedad.startsWith("--"));
      if (aplicables.length === 0) continue;

      for (const selector of dividirSelectores(selectores)) {
        if (esSelectorInlineable(selector)) {
          reglas.push({
            selector,
            declaraciones: aplicables,
            especificidad: especificidad(selector),
            orden: orden++,
          });
        } else {
          restantes.push(`${selector}{${contenido.trim()}}`);
        }
      }
      continue;
    }

    // At-rule sin bloque (@import, @charset).
    if (c === ";" && prelude.trim().startsWith("@")) {
      restantes.push(`${prelude.trim()};`);
      prelude = "";
      i++;
      continue;
    }

    prelude += c;
    i++;
  }

  return { reglas, variables, cssRestante: restantes.join("\n") };
}

/**
 * Sustituye `var(--x)` / `var(--x, fallback)` por su valor. Los clientes de
 * correo no resuelven variables CSS, y al quitar el `<style>` se perdería la
 * declaración de `:root` que las define.
 */
export function resolverVariables(
  valor: string,
  variables: Map<string, string>,
  profundidad = 0,
): string | null {
  if (profundidad > 5 || !valor.includes("var(")) {
    return valor.includes("var(") ? null : valor;
  }

  let sinResolver = false;
  const resuelto = valor.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_m, nombre, alterno) => {
    const definido = variables.get(String(nombre).trim());
    if (definido != null) return definido;
    if (alterno != null && String(alterno).trim()) return String(alterno).trim();
    sinResolver = true;
    return "";
  });

  if (sinResolver) return null;
  return resolverVariables(resuelto, variables, profundidad + 1);
}

/**
 * Aplica la cascada sobre una propiedad: gana la última declaración, salvo que
 * la vigente sea `!important` y la nueva no (regla real de CSS, que también
 * hace que un `!important` de la hoja venza al `style` en línea).
 */
export function combinarDeclaraciones(
  deLaHoja: Declaracion[],
  enLinea: Declaracion[],
): Declaracion[] {
  const mapa = new Map<string, Declaracion>();

  for (const d of [...deLaHoja, ...enLinea]) {
    const vigente = mapa.get(d.propiedad);
    if (vigente && vigente.importante && !d.importante) continue;
    mapa.set(d.propiedad, d);
  }

  return [...mapa.values()];
}

export function serializarDeclaraciones(
  declaraciones: Declaracion[],
  variables: Map<string, string> = new Map(),
): string {
  const partes: string[] = [];

  for (const d of declaraciones) {
    if (d.propiedad.startsWith("--")) continue;
    const valor = resolverVariables(d.valor, variables);
    if (valor == null || !valor.trim()) continue; // var() sin definir: mejor omitir que romper
    partes.push(`${d.propiedad}:${valor.trim()}${d.importante ? " !important" : ""}`);
  }

  return partes.join(";");
}

/** Superficie mínima de un elemento; permite probar la cascada sin un DOM real. */
export type ElementoEstilizable = {
  getAttribute(nombre: string): string | null;
  setAttribute(nombre: string, valor: string): void;
};

export type ConsultaElementos = (selector: string) => ElementoEstilizable[];

/**
 * Vuelca las reglas al atributo `style` de cada elemento que las cumple,
 * respetando el orden de la cascada (especificidad y luego posición).
 */
export function aplicarReglasEnLinea(
  reglas: ReglaCss[],
  consultar: ConsultaElementos,
  variables: Map<string, string> = new Map(),
): void {
  const acumulado = new Map<ElementoEstilizable, Declaracion[]>();

  // Los elementos que ya traen `style` entran aunque no los toque ninguna
  // regla: hay que resolverles las variables CSS igual.
  for (const el of consultarSeguro(consultar, "[style]")) {
    if (!acumulado.has(el)) acumulado.set(el, []);
  }

  const ordenadas = [...reglas].sort(
    (a, b) => a.especificidad - b.especificidad || a.orden - b.orden,
  );

  for (const regla of ordenadas) {
    for (const el of consultarSeguro(consultar, regla.selector)) {
      const lista = acumulado.get(el);
      if (lista) lista.push(...regla.declaraciones);
      else acumulado.set(el, [...regla.declaraciones]);
    }
  }

  for (const [el, declaraciones] of acumulado) {
    const enLinea = parsearDeclaraciones(el.getAttribute("style") ?? "");
    const texto = serializarDeclaraciones(
      combinarDeclaraciones(declaraciones, enLinea),
      variables,
    );
    if (texto) el.setAttribute("style", texto);
  }
}

function consultarSeguro(consultar: ConsultaElementos, selector: string): ElementoEstilizable[] {
  try {
    return consultar(selector);
  } catch {
    // Selector que el navegador no reconoce: se queda sin inline, no rompe el resto.
    return [];
  }
}
