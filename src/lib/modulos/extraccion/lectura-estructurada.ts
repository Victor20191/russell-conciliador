// Gramática declarativa de lectura de INV. Nunca ejecuta expresiones, código ni regex
// aportados por una persona o por IA. Toda cifra debe proceder de una celda trazable.
import * as z from "zod";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { SpecModulo } from "./esquema";

export const ROLES_LECTURA_INVENTARIO = ["tipo", "referencia", "descripcion", "cantidad", "valorUnitario", "valorTotal"] as const;
export type RolLecturaInventario = typeof ROLES_LECTURA_INVENTARIO[number];
const columna = z.number().int().min(1).max(16_384);
const literal = z.string().min(1).max(160).refine((v) => v.trim().length > 0, "El literal no puede contener solo espacios.");

export const CondicionLecturaSchema = z.object({
  columna,
  operador: z.enum(["igual", "empieza", "contiene", "no_vacia"]),
  texto: literal.optional(),
}).strict().refine((v) => v.operador === "no_vacia" || Boolean(v.texto), "La condición necesita un texto literal.");

export const SelectorLecturaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("completa") }).strict(),
  z.object({ tipo: z.literal("separador"), separador: z.string().min(1).max(20), indice: z.number().int().min(1).max(64) }).strict(),
  z.object({ tipo: z.literal("etiqueta"), inicio: literal, fin: literal.optional() }).strict(),
  z.object({ tipo: z.literal("posicion"), inicio: z.number().int().min(1).max(32_767), longitud: z.number().int().min(1).max(32_767) }).strict(),
]);
export const FuenteLecturaSchema = z.object({
  columna,
  // Desplazamiento en FILAS FÍSICAS de Excel, no en la grilla compactada por ingesta.
  desplazamientoFila: z.number().int().min(0).max(31),
  selector: SelectorLecturaSchema,
}).strict();

export const LecturaEstructuradaSchema = z.object({
  version: z.literal(1),
  registro: z.object({ ancla: CondicionLecturaSchema, maxFilas: z.number().int().min(1).max(32) }).strict(),
  campos: z.array(z.object({ rol: z.enum(ROLES_LECTURA_INVENTARIO), fuente: FuenteLecturaSchema }).strict()).min(1).max(6),
  seccion: z.object({ condicion: CondicionLecturaSchema, fuente: FuenteLecturaSchema }).strict().optional(),
  totales: z.array(z.object({ condicion: CondicionLecturaSchema, fuente: FuenteLecturaSchema, tipo: z.enum(["general", "subtotal"]) }).strict()).max(12).optional(),
  ignorarFilas: z.array(z.object({ condicion: CondicionLecturaSchema, motivo: z.string().trim().min(8).max(200) }).strict()).max(12).optional(),
  ignorarColumnas: z.array(z.object({ columna, motivo: z.string().trim().min(8).max(200) }).strict()).max(32).optional(),
}).strict().superRefine((v, ctx) => {
  const roles = new Set<string>();
  v.campos.forEach((campo, i) => {
    if (roles.has(campo.rol)) ctx.addIssue({ code: "custom", path: ["campos", i, "rol"], message: "Cada rol solo puede leerse una vez." });
    roles.add(campo.rol);
    if (campo.fuente.desplazamientoFila >= v.registro.maxFilas) ctx.addIssue({ code: "custom", path: ["campos", i, "fuente"], message: "La fuente debe quedar dentro del bloque del registro." });
  });
  if (!roles.has("valorTotal") && !(roles.has("cantidad") && roles.has("valorUnitario"))) ctx.addIssue({ code: "custom", path: ["campos"], message: "Lee el valor total o la cantidad y el valor unitario; no se pueden inventar importes." });
  if (v.seccion?.fuente.desplazamientoFila) ctx.addIssue({ code: "custom", path: ["seccion", "fuente"], message: "El tipo de sección debe leerse en su propia fila." });
  v.totales?.forEach((t, i) => {
    if (t.fuente.desplazamientoFila) ctx.addIssue({ code: "custom", path: ["totales", i, "fuente"], message: "El total debe leerse en su propia fila." });
    if (t.condicion.operador === "no_vacia") ctx.addIssue({ code: "custom", path: ["totales", i, "condicion"], message: "Los totales necesitan un rótulo explícito." });
  });
  v.ignorarFilas?.forEach((t, i) => {
    if (t.condicion.operador === "no_vacia") ctx.addIssue({ code: "custom", path: ["ignorarFilas", i, "condicion"], message: "No se permite omitir cualquier fila con contenido." });
  });
  const usadas = columnasLecturaEstructurada(v);
  v.ignorarColumnas?.forEach((t, i) => {
    if (usadas.has(t.columna)) ctx.addIssue({ code: "custom", path: ["ignorarColumnas", i, "columna"], message: "Una columna usada por la lectura no puede ignorarse." });
  });
});

export type LecturaEstructurada = z.infer<typeof LecturaEstructuradaSchema>;
export type CondicionLectura = z.infer<typeof CondicionLecturaSchema>;
export type FuenteLectura = z.infer<typeof FuenteLecturaSchema>;
export type SelectorLectura = z.infer<typeof SelectorLecturaSchema>;
export type FuenteTrazaLectura = { fila: number; columna: number; texto: string; inicio: number; fin: number };
export type TrazaCampoLectura = { rol: RolLecturaInventario; valor: CeldaCruda; fuentes: FuenteTrazaLectura[] };
export type TrazaRegistroLectura = { filaAncla: number; filasOrigen: number[]; campos: TrazaCampoLectura[]; tipo: "registro" | "total" | "subtotal" };
/** Ubicación física (fila y columna de Excel) de un problema de lectura, para señalarlo en la grilla. */
export type IncidenciaLectura = {
  fila: number;
  columna?: number;
  tipo: "fuera_de_inicio" | "registro" | "regla" | "total" | "seccion" | "sin_interpretar" | "signo";
  mensaje: string;
};
export type ResultadoLecturaEstructurada = { hoja: GridHoja; columnas: Record<string, number>; errores: string[]; advertencias: string[]; trazas: TrazaRegistroLectura[]; incidencias: IncidenciaLectura[] };

/** Todas las columnas físicas relativas a la grilla que forman parte del formato. */
export function columnasLecturaEstructurada(reglas: LecturaEstructurada): Set<number> {
  return new Set([
    reglas.registro.ancla.columna,
    ...reglas.campos.map((c) => c.fuente.columna),
    ...(reglas.seccion ? [reglas.seccion.condicion.columna, reglas.seccion.fuente.columna] : []),
    ...(reglas.totales ?? []).flatMap((t) => [t.condicion.columna, t.fuente.columna]),
    ...(reglas.ignorarFilas ?? []).map((t) => t.condicion.columna),
  ]);
}

/** También las columnas auxiliares deben trasladarse al reutilizar un patrón. */
export function columnasFormatoLecturaEstructurada(reglas: LecturaEstructurada): Set<number> {
  return new Set([...columnasLecturaEstructurada(reglas), ...(reglas.ignorarColumnas ?? []).map((t) => t.columna)]);
}

export function trasladarLecturaEstructurada(reglas: LecturaEstructurada, mapa: Readonly<Record<number, number>>): LecturaEstructurada | null {
  if ([...columnasFormatoLecturaEstructurada(reglas)].some((c) => mapa[c] == null)) return null;
  const condicion = (c: CondicionLectura): CondicionLectura => ({ ...c, columna: mapa[c.columna] });
  const fuente = (f: FuenteLectura): FuenteLectura => ({ ...f, columna: mapa[f.columna] });
  return {
    ...reglas,
    registro: { ...reglas.registro, ancla: condicion(reglas.registro.ancla) },
    campos: reglas.campos.map((c) => ({ ...c, fuente: fuente(c.fuente) })),
    ...(reglas.seccion ? { seccion: { condicion: condicion(reglas.seccion.condicion), fuente: fuente(reglas.seccion.fuente) } } : {}),
    ...(reglas.totales ? { totales: reglas.totales.map((t) => ({ ...t, condicion: condicion(t.condicion), fuente: fuente(t.fuente) })) } : {}),
    ...(reglas.ignorarFilas ? { ignorarFilas: reglas.ignorarFilas.map((t) => ({ ...t, condicion: condicion(t.condicion) })) } : {}),
    ...(reglas.ignorarColumnas ? { ignorarColumnas: reglas.ignorarColumnas.map((t) => ({ ...t, columna: mapa[t.columna] })) } : {}),
  };
}

const textoCelda = (v: CeldaCruda | undefined) => v == null ? "" : String(v);
const textoComparado = (s: string) => s.toLocaleLowerCase("es");
const tieneContenido = (s: string) => /[\p{L}\p{N}]/u.test(s);
const MAX_ERRORES = 40;
const MAX_INCIDENCIAS = 200;
const MAX_TEXTO_CELDA = 32_767;

/** normalizarMonto es deliberadamente tolerante para formatos antiguos. Una selección
 * nueva de IA tiene que representar UN número; no puede concatenar códigos o etiquetas. */
export function tokenNumerico(valor: CeldaCruda, rol: RolLecturaInventario): { valor: CeldaCruda; mezclado: boolean } {
  if (typeof valor !== "string" || !valor.trim() || !/[0-9]/.test(valor)) return { valor, mezclado: false };
  let token = valor.trim();
  if (rol === "cantidad") token = token.replace(/\s+(?:unidades|unds?|und\.|un|kg|kgs|g|gr|lt|lts|l|m|m2|m3)\.?$/i, "").trim();
  else token = token.replace(/^(?:COP|USD|EUR|\$)\s*/i, "").replace(/\s*(?:COP|USD|EUR|\$)$/i, "").trim();
  // Paréntesis contables y signo negativo se mantienen; el motor de importes los resuelve.
  const sinSigno = token.startsWith("(") && token.endsWith(")") ? token.slice(1, -1).trim() : token.replace(/^[+-]\s*/, "");
  const numero = /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?|[.,]\d+)$/;
  return { valor: token, mezclado: !numero.test(sinSigno) };
}

export type ResultadoSelector =
  | { ok: true; inicio: number; fin: number; inicioCobertura: number; valor: string | null }
  | { ok: false; motivo: "segmento" | "etiqueta" | "cierre" | "etiqueta_repetida" | "tramo" };

/** Recorte del tramo leído: espacios y separadores sueltos en los bordes no son dato. */
export function valorDeTramo(texto: string, inicio: number, fin: number): string | null {
  return texto.slice(inicio, fin).trim().replace(/^[|;·]+\s*|\s*[|;·]+$/g, "").trim() || null;
}

/**
 * Ubica el tramo que un selector toma de una celda. Es la ÚNICA implementación: la usan el motor
 * y el deductor de la lectura por ejemplo, así una regla deducida se lee igual al cargar.
 * `inicioCobertura` incluye el rótulo o el separador que el tramo consume.
 */
export function aplicarSelector(texto: string, selector: SelectorLectura): ResultadoSelector {
  if (selector.tipo === "completa") return { ok: true, inicio: 0, fin: texto.length, inicioCobertura: 0, valor: texto.trim() || null };
  if (selector.tipo === "separador") {
    let cursor = 0;
    for (let p = 1; p < selector.indice; p++) {
      const siguiente = texto.indexOf(selector.separador, cursor);
      if (siguiente < 0) return { ok: false, motivo: "segmento" };
      cursor = siguiente + selector.separador.length;
    }
    const siguiente = texto.indexOf(selector.separador, cursor);
    const fin = siguiente < 0 ? texto.length : siguiente;
    const inicioCobertura = Math.max(0, cursor - (selector.indice > 1 ? selector.separador.length : 0));
    return { ok: true, inicio: cursor, fin, inicioCobertura, valor: valorDeTramo(texto, cursor, fin) };
  }
  if (selector.tipo === "etiqueta") {
    const comparado = textoComparado(texto);
    const etiqueta = textoComparado(selector.inicio);
    const posicion = comparado.indexOf(etiqueta);
    if (posicion < 0) return { ok: false, motivo: "etiqueta" };
    const inicio = posicion + etiqueta.length;
    let fin = texto.length;
    if (selector.fin) {
      fin = comparado.indexOf(textoComparado(selector.fin), inicio);
      if (fin < 0) return { ok: false, motivo: "cierre" };
    }
    const repetida = comparado.indexOf(etiqueta, inicio);
    if (repetida >= 0 && repetida < fin) return { ok: false, motivo: "etiqueta_repetida" };
    return { ok: true, inicio, fin, inicioCobertura: posicion, valor: valorDeTramo(texto, inicio, fin) };
  }
  const inicio = selector.inicio - 1;
  const fin = inicio + selector.longitud;
  if (inicio >= texto.length || fin > texto.length) return { ok: false, motivo: "tramo" };
  return { ok: true, inicio, fin, inicioCobertura: inicio, valor: valorDeTramo(texto, inicio, fin) };
}

/** Devuelve el intervalo del marcador, sin evaluar patrones suministrados por el usuario. */
export function evaluarCondicion(fila: CeldaCruda[], condicion: CondicionLectura): [number, number] | null {
  const original = textoCelda(fila[condicion.columna - 1]);
  const texto = textoComparado(original.trim());
  if (condicion.operador === "no_vacia") return texto ? [0, 0] : null;
  const literal = textoComparado(condicion.texto ?? "");
  if (!literal) return null;
  const inicio = textoComparado(original).indexOf(literal);
  const coincide = condicion.operador === "igual" ? texto === literal
    : condicion.operador === "empieza" ? texto.startsWith(literal) : inicio >= 0;
  return coincide && inicio >= 0 ? [inicio, inicio + literal.length] : null;
}

/** La grilla canónica es interna; el patrón conserva las coordenadas del original. */
export function ejecutarLecturaEstructurada(hoja: GridHoja, reglas: LecturaEstructurada, primeraFilaDatos = 1): ResultadoLecturaEstructurada {
  const columnas = Object.fromEntries(ROLES_LECTURA_INVENTARIO.map((rol, i) => [rol, i + 1]));
  const salida: ResultadoLecturaEstructurada = {
    hoja: { nombre: hoja.nombre, filas: [["Tipo", "Referencia", "Descripción", "Cantidad", "Valor unitario", "Valor total"]], filasFisicas: [hoja.filasFisicas?.[Math.max(0, primeraFilaDatos - 2)] ?? Math.max(1, primeraFilaDatos - 1)] },
    columnas, errores: [], advertencias: [], trazas: [], incidencias: [],
  };
  const parseado = LecturaEstructuradaSchema.safeParse(reglas);
  if (!parseado.success) {
    salida.errores.push(`Las reglas de lectura no son válidas: ${parseado.error.issues[0]?.message ?? "revisa su estructura"}`);
    return salida;
  }
  reglas = parseado.data;
  let erroresExtra = 0;
  // Las incidencias ubican el problema para señalarlo en la grilla; los mensajes no cambian.
  const error = (mensaje: string, lugar?: Omit<IncidenciaLectura, "mensaje">) => {
    if (salida.errores.length < MAX_ERRORES) salida.errores.push(mensaje);
    else erroresExtra++;
    if (lugar && salida.incidencias.length < MAX_INCIDENCIAS) salida.incidencias.push({ ...lugar, mensaje });
  };
  const filaFisica = (i: number) => hoja.filasFisicas?.[i] ?? i + 1;
  const porFilaFisica = new Map(hoja.filas.map((_, i) => [filaFisica(i), i]));
  const primerIndice = Math.max(0, primeraFilaDatos - 1);
  // No permitir que una propuesta esconda registros adelantando el inicio. Los banners y
  // metadatos no coinciden con un ancla rotulada y siguen siendo un preámbulo permitido.
  if (reglas.registro.ancla.operador !== "no_vacia") {
    for (let i = 0; i < Math.min(primerIndice, hoja.filas.length); i++) {
      const fila = hoja.filas[i] ?? [];
      const esSeccion = reglas.seccion && evaluarCondicion(fila, reglas.seccion.condicion);
      const esTotal = reglas.totales?.some((t) => evaluarCondicion(fila, t.condicion));
      const esIgnorada = reglas.ignorarFilas?.some((t) => evaluarCondicion(fila, t.condicion));
      if (!esSeccion && !esTotal && !esIgnorada && evaluarCondicion(fila, reglas.registro.ancla)) error(`Hay un registro de inventario en la fila ${filaFisica(i)} anterior al inicio elegido. Inclúyelo en la lectura.`, { fila: filaFisica(i), tipo: "fuera_de_inicio" });
    }
  }
  const cubiertas = new Map<string, [number, number][]>();
  const fuentesNumericas: FuenteTrazaLectura[] = [];
  const columnasIgnoradas = new Set(reglas.ignorarColumnas?.map((c) => c.columna) ?? []);
  const filasIgnoradas = new Set<number>();
  const cubrir = (i: number, c: number, inicio: number, fin: number) => {
    const clave = `${i}:${c}`;
    const rangos = cubiertas.get(clave) ?? [];
    rangos.push([inicio, fin]);
    cubiertas.set(clave, rangos);
  };
  const cubrirCondicion = (i: number, condicion: CondicionLectura) => {
    const intervalo = evaluarCondicion(hoja.filas[i] ?? [], condicion);
    if (intervalo) cubrir(i, condicion.columna, ...intervalo);
  };
  const coordenada = (i: number, c: number) => `fila ${filaFisica(i)}, columna ${c + (hoja.columnaInicial ?? 0)}`;
  const lugarCelda = (i: number, c: number, tipo: IncidenciaLectura["tipo"]): Omit<IncidenciaLectura, "mensaje"> => ({ fila: filaFisica(i), columna: c + (hoja.columnaInicial ?? 0), tipo });

  const extraer = (ancla: number, fuente: FuenteLectura, limiteFisico: number, explorar = false): { valor: CeldaCruda; fuentes: FuenteTrazaLectura[] } => {
    const fisica = filaFisica(ancla) + fuente.desplazamientoFila;
    const indice = porFilaFisica.get(fisica);
    if (indice == null || fisica >= limiteFisico) {
      if (!explorar) error(`El registro de la fila ${filaFisica(ancla)} necesita la fila ${fisica}, ausente o perteneciente a otro bloque.`, { fila: filaFisica(ancla), tipo: "registro" });
      return { valor: null, fuentes: [] };
    }
    const fallo = (mensaje: string) => { if (!explorar) error(mensaje, lugarCelda(indice, fuente.columna, "registro")); };
    const original = hoja.filas[indice]?.[fuente.columna - 1] ?? null;
    const texto = textoCelda(original);
    if (texto.length > MAX_TEXTO_CELDA) {
      fallo(`La celda de ${coordenada(indice, fuente.columna)} supera el tamaño de lectura permitido.`);
      return { valor: null, fuentes: [] };
    }
    const selector = fuente.selector;
    const tramo = aplicarSelector(texto, selector);
    if (!tramo.ok) {
      const donde = coordenada(indice, fuente.columna);
      if (tramo.motivo === "segmento" && selector.tipo === "separador") fallo(`No existe el segmento ${selector.indice} en ${donde}.`);
      else if (tramo.motivo === "etiqueta" && selector.tipo === "etiqueta") fallo(`No se encontró la etiqueta «${selector.inicio}» en ${donde}.`);
      else if (tramo.motivo === "cierre" && selector.tipo === "etiqueta") fallo(`No se encontró el cierre «${selector.fin}» en ${donde}.`);
      else if (tramo.motivo === "etiqueta_repetida" && selector.tipo === "etiqueta") fallo(`La etiqueta «${selector.inicio}» aparece varias veces en ${donde}; aclara cuál corresponde.`);
      else fallo(`El tramo de texto no cabe en ${donde}.`);
      return { valor: null, fuentes: [] };
    }
    if (!explorar) cubrir(indice, fuente.columna, tramo.inicioCobertura, tramo.fin);
    const valor = selector.tipo === "completa" ? original : tramo.valor;
    return { valor, fuentes: [{ fila: fisica, columna: fuente.columna + (hoja.columnaInicial ?? 0), texto, inicio: tramo.inicio, fin: tramo.fin }] };
  };

  if (reglas.registro.ancla.operador === "no_vacia") {
    const numericos = reglas.campos.filter((c) => ["cantidad", "valorUnitario", "valorTotal"].includes(c.rol));
    for (let i = 0; i < Math.min(primerIndice, hoja.filas.length); i++) {
      const fila = hoja.filas[i] ?? [];
      if (!evaluarCondicion(fila, reglas.registro.ancla)) continue;
      if (reglas.seccion && evaluarCondicion(fila, reglas.seccion.condicion)) continue;
      if (reglas.totales?.some((t) => evaluarCondicion(fila, t.condicion)) || reglas.ignorarFilas?.some((t) => evaluarCondicion(fila, t.condicion))) continue;
      const extraidos = new Map(numericos.map((c) => [c.rol, extraer(i, c.fuente, filaFisica(i) + reglas.registro.maxFilas, true).valor]));
      const esNumero = (rol: RolLecturaInventario) => {
        const valor = extraidos.get(rol);
        return valor != null && /[0-9]/.test(String(valor)) && !tokenNumerico(valor, rol).mezclado;
      };
      if (esNumero("valorTotal") || (esNumero("cantidad") && esNumero("valorUnitario"))) error(`Hay un registro con importe en la fila ${filaFisica(i)} anterior al inicio elegido. Inclúyelo en la lectura.`, { fila: filaFisica(i), tipo: "fuera_de_inicio" });
    }
  }

  type ClaseFila = { tipo: "registro" } | { tipo: "seccion" } | { tipo: "ignorar"; indice: number } | { tipo: "total"; indice: number };
  const clases = new Map<number, ClaseFila>();
  for (let i = primerIndice; i < hoja.filas.length; i++) {
    const fila = hoja.filas[i] ?? [];
    if (fila.every((c) => !textoCelda(c).trim())) continue;
    const especiales: ClaseFila[] = [];
    reglas.totales?.forEach((t, indice) => { if (evaluarCondicion(fila, t.condicion)) especiales.push({ tipo: "total", indice }); });
    if (reglas.seccion && evaluarCondicion(fila, reglas.seccion.condicion)) especiales.push({ tipo: "seccion" });
    reglas.ignorarFilas?.forEach((t, indice) => { if (evaluarCondicion(fila, t.condicion)) especiales.push({ tipo: "ignorar", indice }); });
    if (especiales.length > 1) { error(`La fila ${filaFisica(i)} coincide con varias reglas de sección, total u omisión; aclara su significado.`, { fila: filaFisica(i), tipo: "regla" }); continue; }
    if (especiales[0]) clases.set(i, especiales[0]);
    else if (evaluarCondicion(fila, reglas.registro.ancla)) clases.set(i, { tipo: "registro" });
  }

  let tipoSeccion: { valor: CeldaCruda; fuentes: FuenteTrazaLectura[] } | null = null;
  const indices = [...clases.keys()];
  for (let n = 0; n < indices.length; n++) {
    const i = indices[n];
    const clase = clases.get(i)!;
    const limite = Math.min(filaFisica(i) + reglas.registro.maxFilas, indices[n + 1] == null ? Infinity : filaFisica(indices[n + 1]));
    if (clase.tipo === "ignorar") {
      const regla = reglas.ignorarFilas![clase.indice];
      filasIgnoradas.add(i);
      if (!salida.advertencias.includes(`Se omiten las filas que cumplen «${regla.condicion.texto}»: ${regla.motivo}`)) salida.advertencias.push(`Se omiten las filas que cumplen «${regla.condicion.texto}»: ${regla.motivo}`);
      continue;
    }
    if (clase.tipo === "seccion") {
      cubrirCondicion(i, reglas.seccion!.condicion);
      tipoSeccion = extraer(i, reglas.seccion!.fuente, filaFisica(i) + 1);
      if (!textoCelda(tipoSeccion.valor).trim()) error(`La sección de la fila ${filaFisica(i)} no declara un tipo de inventario.`, { fila: filaFisica(i), tipo: "seccion" });
      continue;
    }
    const campos: TrazaCampoLectura[] = [];
    const fila: CeldaCruda[] = Array(6).fill(null);
    let tipo: TrazaRegistroLectura["tipo"] = "registro";
    if (clase.tipo === "total") {
      const regla = reglas.totales![clase.indice];
      cubrirCondicion(i, regla.condicion);
      const extraido = extraer(i, regla.fuente, filaFisica(i) + 1);
      const numero = tokenNumerico(extraido.valor, "valorTotal");
      fuentesNumericas.push(...extraido.fuentes);
      if (numero.mezclado) error(`El total de la fila ${filaFisica(i)} contiene varios valores o etiquetas sin separar.`, { fila: filaFisica(i), tipo: "total" });
      else if (extraido.valor == null || typeof extraido.valor === "boolean" || (typeof extraido.valor === "number" ? !Number.isFinite(extraido.valor) : !/[0-9]/.test(extraido.valor))) error(`El total declarado en la fila ${filaFisica(i)} está vacío o no contiene un importe válido. Corrige su lectura o el archivo original.`, { fila: filaFisica(i), tipo: "total" });
      else extraido.valor = numero.valor;
      tipo = regla.tipo === "general" ? "total" : "subtotal";
      fila[0] = tipo === "total" ? "Total general" : `Subtotal ${textoCelda(tipoSeccion?.valor)}`.trim();
      fila[5] = extraido.valor;
      campos.push({ rol: "valorTotal", ...extraido });
    } else {
      cubrirCondicion(i, reglas.registro.ancla);
      for (const campo of reglas.campos) {
        const extraido = extraer(i, campo.fuente, limite);
        if (campo.rol === "cantidad" || campo.rol === "valorUnitario" || campo.rol === "valorTotal") {
          fuentesNumericas.push(...extraido.fuentes);
          const numero = tokenNumerico(extraido.valor, campo.rol);
          if (numero.mezclado) error(`El campo «${campo.rol}» de la fila ${filaFisica(i)} contiene etiquetas, varios números o texto mezclado. Define cómo separar su valor; no se combinarán sus dígitos.`, { fila: extraido.fuentes[0]?.fila ?? filaFisica(i), ...(extraido.fuentes[0] ? { columna: extraido.fuentes[0].columna } : {}), tipo: "registro" });
          else extraido.valor = numero.valor;
        }
        fila[columnas[campo.rol] - 1] = extraido.valor;
        campos.push({ rol: campo.rol, ...extraido });
      }
      if (!reglas.campos.some((c) => c.rol === "tipo") && tipoSeccion) {
        fila[0] = tipoSeccion.valor;
        campos.push({ rol: "tipo", ...tipoSeccion });
      }
      for (let a = 0; a < campos.length; a++) {
        for (let b = a + 1; b < campos.length; b++) {
          if (campos[a].fuentes.some((f) => campos[b].fuentes.some((g) => f.fila === g.fila && f.columna === g.columna && f.inicio < g.fin && g.inicio < f.fin))) {
            error(`Los campos «${campos[a].rol}» y «${campos[b].rol}» del registro de la fila ${filaFisica(i)} leen el mismo tramo de texto. Separa sus fuentes antes de continuar.`, { fila: filaFisica(i), tipo: "registro" });
          }
        }
      }
    }
    const filasOrigen = [...new Set(campos.flatMap((c) => c.fuentes.map((f) => f.fila)))].sort((a, b) => a - b);
    salida.trazas.push({ filaAncla: filaFisica(i), filasOrigen, campos, tipo });
    salida.hoja.filas.push(fila);
    salida.hoja.filasFisicas!.push(filaFisica(i));
  }

  // Cobertura del archivo completo, incluidos renglones fuera de los bloques reconocidos.
  // Ningún importe, referencia o etiqueta queda descartado por una conjetura de la IA.
  for (let i = primerIndice; i < hoja.filas.length; i++) {
    if (filasIgnoradas.has(i)) continue;
    for (let c = 1; c <= (hoja.filas[i]?.length ?? 0); c++) {
      if (columnasIgnoradas.has(c)) continue;
      const texto = textoCelda(hoja.filas[i][c - 1]);
      if (!tieneContenido(texto)) continue;
      const rangos = (cubiertas.get(`${i}:${c}`) ?? []).sort((a, b) => a[0] - b[0]);
      let cursor = 0;
      let restante = "";
      for (const [inicio, fin] of rangos) {
        if (inicio > cursor) restante += texto.slice(cursor, inicio);
        cursor = Math.max(cursor, fin);
      }
      restante += texto.slice(cursor);
      if (tieneContenido(restante)) error(`Contenido sin interpretar en ${coordenada(i, c)}: «${restante.trim().slice(0, 100)}». Aclara qué representa antes de continuar.`, lugarCelda(i, c, "sin_interpretar"));
    }
  }
  // Los signos son datos aunque no contengan letras ni dígitos: una posición fija no
  // puede tomar «1200» y dejar por fuera el «−» o los paréntesis que lo hacen negativo.
  for (const fuente of fuentesNumericas) {
    const indice = porFilaFisica.get(fuente.fila);
    if (indice == null) continue;
    const c = fuente.columna - (hoja.columnaInicial ?? 0);
    const rangos = cubiertas.get(`${indice}:${c}`) ?? [];
    const estaCubierto = (posicion: number) => rangos.some(([desde, hasta]) => posicion >= desde && posicion < hasta);
    let antes = fuente.inicio - 1;
    let despues = fuente.fin;
    while (antes >= 0 && /\s/.test(fuente.texto[antes])) antes--;
    while (despues < fuente.texto.length && /\s/.test(fuente.texto[despues])) despues++;
    const posiciones = [antes, despues].filter((p) => p >= 0 && p < fuente.texto.length && !estaCubierto(p));
    if (posiciones.some((p) => /[+\-−(),.%]/.test(fuente.texto[p]))) error(`Hay un signo numérico sin interpretar en fila ${fuente.fila}, columna ${fuente.columna}. Incluye el signo o paréntesis en la selección del importe.`, { fila: fuente.fila, columna: fuente.columna, tipo: "signo" });
  }
  for (const c of reglas.ignorarColumnas ?? []) salida.advertencias.push(`Se omite la columna ${c.columna + (hoja.columnaInicial ?? 0)}: ${c.motivo}`);
  if (!salida.trazas.some((t) => t.tipo === "registro")) error("No se reconoció ningún registro de inventario con estas reglas.");
  if (erroresExtra > 0) salida.errores.push(`Hay ${erroresExtra} incidencia(s) adicionales de lectura; revisa las reglas del formato.`);
  return salida;
}

/** Preparación compartida por transform y validación: evita interpretar otra vez el original. */
export function prepararSpecLecturaEstructurada(spec: SpecModulo, hoja: GridHoja): ResultadoLecturaEstructurada & { spec: SpecModulo } {
  if (!spec.lecturaEstructurada) return { hoja, spec, columnas: spec.columnas, errores: [], advertencias: [], trazas: [], incidencias: [] };
  const resultado = ejecutarLecturaEstructurada(hoja, spec.lecturaEstructurada, spec.primeraFilaDatos);
  if (spec.clasificadorModo === "arrastrar" || spec.arrastrarClasificador) {
    let ultimoTipo: TrazaCampoLectura | undefined;
    for (let i = 0; i < resultado.trazas.length; i++) {
      const traza = resultado.trazas[i];
      if (traza.tipo !== "registro") continue;
      const tipo = traza.campos.find((c) => c.rol === "tipo");
      if (tipo && textoCelda(tipo.valor).trim()) ultimoTipo = tipo;
      else if (tipo && ultimoTipo) {
        tipo.valor = ultimoTipo.valor;
        tipo.fuentes = [...tipo.fuentes, ...ultimoTipo.fuentes];
        traza.filasOrigen = [...new Set([...traza.filasOrigen, ...ultimoTipo.fuentes.map((f) => f.fila)])].sort((a, b) => a - b);
        resultado.hoja.filas[i + 1][0] = ultimoTipo.valor;
      }
    }
  }
  const columnas = { ...resultado.columnas };
  const roles = new Set(spec.lecturaEstructurada.campos.map((c) => c.rol));
  for (const rol of ROLES_LECTURA_INVENTARIO) {
    if (!roles.has(rol) && rol !== "valorTotal" && !(rol === "tipo" && spec.lecturaEstructurada.seccion)) columnas[rol] = 0;
  }
  // El total siempre conserva su columna canónica: el motor permite derivarlo de cantidad×unitario.
  const canonico: SpecModulo = {
    hoja: spec.hoja, filaEncabezado: 1, primeraFilaDatos: 2, columnas,
    clasificadorModo: spec.clasificadorModo === "global" ? "global" : spec.clasificadorModo === "arrastrar" || spec.arrastrarClasificador ? "arrastrar" : "columna",
    subtotales: "rotulo",
    ...(spec.subtotalesFila ? { subtotalesFila: spec.subtotalesFila, subtotalesColumna: 6 } : {}),
  };
  return { ...resultado, spec: canonico };
}

/** Coordenadas persistibles por registro; sin textos/cifras duplicados en los datos finales. */
export function origenInventarioDeTraza(traza: TrazaRegistroLectura): string {
  return JSON.stringify({ version: 1, filaAncla: traza.filaAncla, filasOrigen: traza.filasOrigen, tipo: traza.tipo, campos: traza.campos.map((c) => ({ rol: c.rol, fuentes: c.fuentes.map(({ fila, columna, inicio, fin }) => ({ fila, columna, inicio, fin })) })) });
}
