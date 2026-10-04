// La aceptación se calcula con TODO el archivo y el mismo motor de la carga.
// Un descuadre de datos se informa: nunca se modifica el archivo para hacerlo cuadrar.
import { normalizarMonto } from "@/lib/balance/extraccion/transformar";
import { createHash } from "node:crypto";
import { MODULOS_IMPORT } from "../descriptores";
import { SpecModuloSchema, type SpecModulo } from "../extraccion/esquema";
import { norm, puntajeRol } from "../extraccion/sugerir";
import { transformarModulo, type ResultadoTransformModulo } from "../extraccion/transformar";
import { prepararSpecLecturaEstructurada } from "../extraccion/lectura-estructurada";
import { letraColumnaModulo, normalizarSpecModulo, normalizarSpecModuloArchivo, validarSpecModulo } from "../perfil-modulo";
import { esImputable } from "../promocion";
import { controlSubtotales, esRotuloGranTotal, TOLERANCIA_CONTROL } from "../subtotales";
import { modeloDesdeLectura } from "./modelo-sugerido";
import { resultadoInventarioVacio, type EntradaValidacionInventario, type ResultadoAsistenciaInventario } from "./tipos";

const INV = MODULOS_IMPORT.INV;
const NUMERICAS = INV.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
const redondear = (n: number): number => Math.round(n * 100) / 100 + 0;
const texto = (v: unknown): string => String(v ?? "").trim();
const numero = (v: unknown): number | null => typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" && v.trim() ? normalizarMonto(v) : null;

/** IDs estables: hoja, columna_tipo, columna_valor, modo_tipo, total_archivo.
 * Columnas: índices 1-based de la grilla. total_archivo: fila FÍSICA del original. */
function aplicarRespuestas(spec: SpecModulo, respuestas: Record<string, string>): SpecModulo {
  const siguiente = { ...spec, columnas: { ...spec.columnas } };
  if (respuestas.hoja) siguiente.hoja = respuestas.hoja;
  for (const [id, rol] of [["columna_tipo", "tipo"], ["columna_valor", "valorTotal"]]) {
    if (/^[1-9]\d*$/.test(respuestas[id] ?? "")) siguiente.columnas[rol] = Number(respuestas[id]);
  }
  if (["columna", "arrastrar", "seccion", "global"].includes(respuestas.modo_tipo)) {
    siguiente.clasificadorModo = respuestas.modo_tipo as SpecModulo["clasificadorModo"];
    if (respuestas.modo_tipo === "global") siguiente.columnas.tipo = 0;
  }
  if (/^fila:[1-9]\d*$/.test(respuestas.total_archivo ?? "")) {
    siguiente.subtotalesFila = Number(respuestas.total_archivo.slice(5));
    siguiente.subtotalesColumna = siguiente.lecturaEstructurada
      ? siguiente.lecturaEstructurada.totales?.find((t) => t.tipo === "general")?.fuente.columna
        ?? siguiente.lecturaEstructurada.campos.find((c) => c.rol === "valorTotal")?.fuente.columna ?? 1
      : siguiente.columnas.valorTotal;
    delete siguiente.subtotalesTexto;
  }
  return siguiente;
}

export function validarLecturaInventario(input: EntradaValidacionInventario): ResultadoAsistenciaInventario {
  return validarInterna(input);
}

function validarInterna(input: EntradaValidacionInventario, lecturaPreparada?: ResultadoTransformModulo): ResultadoAsistenciaInventario {
  const salida = resultadoInventarioVacio(input.origen ?? "manual");
  const parseado = SpecModuloSchema.safeParse(input.spec);
  if (!parseado.success) {
    salida.errores.push("El mapa del archivo no tiene una estructura válida. Revisa sus columnas y filas.");
    return salida;
  }
  const respuestas = input.respuestas ?? {};
  const spec = normalizarSpecModuloArchivo(INV, aplicarRespuestas(parseado.data, respuestas));
  if (salida.origen === "patron" && JSON.stringify(normalizarSpecModulo(INV, parseado.data)) !== JSON.stringify(normalizarSpecModulo(INV, spec))) {
    // La elección del usuario cambió una regla reutilizable: debe aprenderse como
    // versión nueva del cliente. Una coordenada efímera del total no cambia origen.
    salida.origen = "manual";
  }
  salida.spec = spec;
  salida.resumen.hoja = spec.hoja;
  const hoja = input.hojas.find((h) => h.nombre === spec.hoja);
  if (!hoja) {
    salida.errores.push(`La hoja «${spec.hoja}» no existe en el archivo.`);
    return salida;
  }
  const errorSpec = validarSpecModulo(INV, spec);
  if (errorSpec) salida.errores.push(errorSpec);
  if (spec.filaEncabezado > hoja.filas.length || spec.primeraFilaDatos > hoja.filas.length) salida.errores.push("El encabezado o el inicio de datos está fuera de la hoja.");
  if (spec.subtotalesFila != null && (hoja.filasFisicas ? !hoja.filasFisicas.includes(spec.subtotalesFila) : spec.subtotalesFila > hoja.filas.length)) salida.errores.push("La fila indicada como total no existe en la hoja.");
  if (salida.errores.length) return salida;
  if (spec.lecturaEstructurada) {
    const preparada = prepararSpecLecturaEstructurada(spec, hoja);
    const lectura = transformarModulo(INV, preparada.spec, preparada.hoja);
    // Reutiliza exactamente los controles numéricos sobre celdas extraídas por reglas.
    // Las columnas canónicas no son las columnas originales de las respuestas del usuario.
    const validada = validarInterna({ hojas: [preparada.hoja], spec: preparada.spec, origen: salida.origen }, lectura);
    validada.spec = spec;
    validada.origen = salida.origen;
    validada.errores = [...new Set([...preparada.errores, ...validada.errores])];
    const movimientos = new Set(lectura.filas.filter((fila) => fila.tipoFila === "movimiento").map((fila) => fila.filaNum));
    const perdidos = preparada.trazas.filter((traza) => traza.tipo === "registro" && !movimientos.has(traza.filaAncla));
    if (perdidos.length) {
      validada.errores.push(`${perdidos.length} registro(s) reconstruidos quedaron fuera del detalle en las filas ${perdidos.slice(0, 5).map((t) => t.filaAncla).join(", ")}. Aclara su clasificación antes de continuar.`);
      validada.estructuraValida = false;
      validada.listoParaBorrador = false;
    }
    if (hoja.filas.slice(spec.filaEncabezado, spec.primeraFilaDatos - 1).some((fila) => fila.some((celda) => texto(celda) !== ""))) {
      validada.errores.push("Hay contenido entre el encabezado y el inicio de registros que quedó sin interpretar. Inclúyelo en las reglas de lectura antes de continuar.");
      validada.estructuraValida = false;
      validada.listoParaBorrador = false;
    }
    validada.advertencias = [...new Set([...preparada.advertencias, ...validada.advertencias])];
    if (preparada.errores.length) { validada.estructuraValida = false; validada.listoParaBorrador = false; }
    // No permitir que una derivación o un total válido oculte una cantidad/costo corrupto.
    // Son problemas del dato original: no se pide otra IA para reemplazar sus cifras.
    const datosIlegibles = preparada.trazas.filter((t) => t.tipo === "registro").flatMap((traza) => traza.campos
      .filter((campo) => NUMERICAS.includes(campo.rol) && ((texto(campo.valor) !== "" && numero(campo.valor) == null) || (campo.rol === "cantidad" && texto(campo.valor) === "")))
      .map((campo) => `El campo ${campo.rol} de la fila ${campo.fuentes[0]?.fila ?? traza.filaAncla} está ilegible o ausente. Revisa el dato original; no se sustituirá con IA.`));
    if (datosIlegibles.length) {
      validada.errores.push(...datosIlegibles.slice(0, 8));
      if (datosIlegibles.length > 8) validada.errores.push(`Hay ${datosIlegibles.length - 8} campos numéricos adicionales por revisar.`);
      validada.listoParaBorrador = false;
    }
    const registros = preparada.trazas.filter((t) => t.tipo === "registro");
    const porTipo = new Map<string, (typeof registros)[number]>();
    for (const registro of registros) {
      const tipo = texto(registro.campos.find((c) => c.rol === "tipo")?.valor);
      if (!porTipo.has(tipo)) porTipo.set(tipo, registro);
    }
    const muestras = porTipo.size > 1 && porTipo.size <= 3 ? [...porTipo.values()]
      : [...new Set([registros[0], registros[Math.floor(registros.length / 2)], registros.at(-1)])].filter((t) => t != null);
    validada.modeloSugerido = modeloDesdeLectura(hoja, spec, preparada.trazas);
    validada.ejemplosLectura = muestras.map((traza) => ({
      fila: traza.filaAncla,
      campos: traza.campos.map((campo) => ({ rol: campo.rol, valor: campo.valor,
        fuentes: campo.fuentes.map((fuente) => ({ hoja: hoja.nombre, fila: fuente.fila, columna: fuente.columna, texto: fuente.texto.slice(0, 240) })),
      })),
    }));
    const preguntaTipo = validada.preguntas.find((p) => p.id === "modo_tipo");
    if (preguntaTipo) {
      preguntaTipo.etiqueta = "Hay productos sin tipo en la lectura estructurada. Si todo el archivo es un solo inventario, indícalo; si el tipo está en otra etiqueta o sección, explica dónde aparece en las indicaciones de lectura.";
      preguntaTipo.opciones = [{ valor: "global", etiqueta: "Un solo inventario para todo el archivo" }];
    }
    if (validada.estructuraValida && !validada.errores.length && !validada.preguntas.length && validada.origen !== "patron") {
      const huella = createHash("sha256").update(JSON.stringify(normalizarSpecModulo(INV, spec))).digest("hex").slice(0, 24);
      const valorConfirmacion = `confirmar:${huella}`;
      if (respuestas.confirmar_lectura_estructurada !== valorConfirmacion) {
        validada.preguntas.push({ id: "confirmar_lectura_estructurada",
          etiqueta: "Revisa cómo se separaron la referencia, el tipo y los importes en estos ejemplos. ¿La lectura representa correctamente cada producto?",
          opciones: [{ valor: valorConfirmacion, etiqueta: "Sí, los ejemplos corresponden al archivo" }],
          evidencia: validada.ejemplosLectura.flatMap((ejemplo) => ejemplo.campos.flatMap((campo) => campo.fuentes)).slice(0, 4),
        });
        validada.listoParaBorrador = false;
      }
    }
    return validada;
  }
  const ancho = hoja.filas.reduce((max, fila) => Math.max(max, fila.length), 0);
  const columnas = [...Object.values(spec.columnas), ...(spec.valorFormula?.map((t) => t.columna) ?? []), spec.subtotalesColumna ?? 0];
  if (columnas.some((c) => c > ancho)) salida.errores.push("El mapa señala columnas que no existen en esta hoja.");
  const monetarias = [spec.columnas.cantidad, spec.columnas.valorUnitario, spec.columnas.valorTotal].filter((c) => c > 0);
  if (new Set(monetarias).size !== monetarias.length) salida.errores.push("Cantidad, valor unitario y valor total deben leer columnas diferentes.");
  if (salida.errores.length) return salida;

  const totales = spec.columnas.valorTotal > 0 ? hoja.filas.flatMap((fila, i) => {
    const valor = numero(fila[spec.columnas.valorTotal - 1]);
    const rotulado = fila.some((v) => esRotuloGranTotal(texto(v)));
    const tieneProducto = [spec.columnas.referencia, spec.columnas.descripcion].filter((c) => c > 0).some((c) => texto(fila[c - 1]) !== "" && !esRotuloGranTotal(texto(fila[c - 1])));
    return rotulado && !tieneProducto && valor != null ? [{ fila: hoja.filasFisicas?.[i] ?? i + 1, valor }] : [];
  }) : [];
  // Un rótulo inequívoco es evidencia del archivo, incluso si hay un solo grupo y el
  // control genérico lo habría presentado como subtotal de ese grupo.
  if (totales.length === 1 && spec.subtotalesFila == null) {
    spec.subtotalesFila = totales[0].fila;
    spec.subtotalesColumna = spec.columnas.valorTotal;
  }
  const lectura = lecturaPreparada ?? transformarModulo(INV, spec, hoja);
  const incluidas = lectura.filas.filter((fila) => esImputable({ ...fila, omitida: fila.omitida ?? null }, NUMERICAS));
  const controles = controlSubtotales(lectura.filas, (fila) => esImputable({ ...fila, omitida: fila.omitida ?? null }, NUMERICAS));
  const valorLeido = redondear(incluidas.reduce((s, fila) => s + fila.valor, 0));
  const tipos = [...new Set(incluidas.map((fila) => fila.clasificador).filter((v): v is string => !!v))];
  salida.resumen = {
    hoja: spec.hoja,
    filasIncluidas: incluidas.length,
    filasExcluidas: lectura.filas.length - incluidas.length + lectura.filasOmitidasArriba,
    valorLeido,
    totalDeclarado: controles.granTotal?.subtotalArchivo ?? null,
    diferencia: controles.granTotal ? redondear(controles.granTotal.subtotalArchivo - valorLeido) : null,
    tipoInventario: spec.clasificadorModo === "global" ? "Un inventario global" : tipos.length <= 3 ? tipos.join(", ") || null : `${tipos.length} tipos de inventario`,
  };
  if (incluidas.length === 0) salida.errores.push("No se reconocieron filas de inventario que puedan cargarse.");
  if (!Number.isFinite(valorLeido)) salida.errores.push("La lectura produjo un valor no válido.");
  if (lectura.filasOmitidasArriba > 0) salida.errores.push(`${lectura.filasOmitidasArriba} fila(s) con valor quedaron por encima del inicio de datos. Revisa el encabezado.`);

  // La misma columna numérica podría sumar y cuadrar aunque su contenido no fuera un importe.
  const encabezado = hoja.filas[spec.filaEncabezado - 1] ?? [];
  const colValor = spec.columnas.valorTotal;
  const tituloValor = norm(encabezado[colValor - 1]);
  if (colValor > 0 && /^(cantidad|unidades|existencias?|qty|codigo|referencia|sku|cuenta)$/.test(tituloValor)) {
    salida.errores.push("La columna elegida como valor total contiene una cantidad o un identificador, no un importe de inventario.");
  }
  // Valores ilegibles se separan de un mapa roto: no se reemplazan por valores inventados.
  const porFila = new Map(hoja.filas.map((fila, i) => [hoja.filasFisicas?.[i] ?? i + 1, fila]));
  const invalidas = colValor > 0 ? lectura.filas.filter((fila) => fila.tipoFila === "movimiento" && numero(porFila.get(fila.filaNum)?.[colValor - 1]) == null) : [];
  const erroresDatos: string[] = [];
  if (invalidas.length) {
    salida.advertencias.push(`${invalidas.length} fila(s) no contienen un valor total numérico; revisa las filas ${invalidas.slice(0, 5).map((f) => f.filaNum).join(", ")}.`);
    const sinValor = invalidas.filter((fila) => {
      const cruda = porFila.get(fila.filaNum);
      const sePuedeDerivar = spec.columnas.cantidad > 0 && spec.columnas.valorUnitario > 0 && numero(cruda?.[spec.columnas.cantidad - 1]) != null && numero(cruda?.[spec.columnas.valorUnitario - 1]) != null;
      // Sólo una celda VACÍA permite la derivación existente del motor. Un texto
      // corrupto debe corregirse en origen, no convertirse silenciosamente en cero.
      return texto(cruda?.[colValor - 1]) !== "" || !sePuedeDerivar;
    });
    if (sinValor.length) erroresDatos.push(`${sinValor.length} fila(s) de detalle tienen un valor ilegible o ausente. Corrige el archivo original; no se completarán esos importes con IA.`);
  }
  for (const [id, rol, etiqueta] of [["columna_tipo", "tipo", "tipo de inventario"], ["columna_valor", "valorTotal", "valor total"]]) {
    const definicion = INV.columnas.find((c) => c.nombre === rol)!;
    const candidatas = encabezado.map((v, i) => ({ columna: i + 1, puntaje: puntajeRol(norm(v), definicion) })).filter((c) => c.puntaje >= 500);
    const mejores = candidatas.filter((c) => c.puntaje === Math.max(...candidatas.map((c) => c.puntaje)));
    // Un patrón aprobado o una decisión manual ya resuelven la ambigüedad de rótulos.
    if (salida.origen !== "patron" && salida.origen !== "manual" && mejores.length > 1 && !mejores.some((c) => String(c.columna) === respuestas[id])) {
      salida.preguntas.push({ id, etiqueta: `Hay varias columnas de ${etiqueta}. ¿Cuál corresponde a este inventario?`, opciones: mejores.map((c) => ({ valor: String(c.columna), etiqueta: `${letraColumnaModulo(c.columna + (hoja.columnaInicial ?? 0))} · ${texto(encabezado[c.columna - 1])}` })) });
    }
  }
  const sinTipo = incluidas.filter((fila) => !fila.clasificador).length;
  if (sinTipo > 0 && spec.clasificadorModo !== "global") {
    salida.preguntas.push({ id: "modo_tipo", etiqueta: `${sinTipo} fila(s) no tienen tipo de inventario. ¿Cómo debe interpretarse?`, opciones: [
      { valor: "arrastrar", etiqueta: "Heredar el tipo de la fila anterior" },
      { valor: "global", etiqueta: "Un solo inventario para todo el archivo" },
    ] });
  }
  // Más de un total rotulado y con importes diferentes exige elección, no adivinación.
  if (new Set(totales.map((t) => redondear(t.valor))).size > 1 && spec.subtotalesFila == null) {
    salida.preguntas.push({ id: "total_archivo", etiqueta: "El archivo declara varios totales diferentes. ¿Cuál controla este inventario?", opciones: totales.slice(0, 8).map((t) => ({ valor: `fila:${t.fila}`, etiqueta: `Fila ${t.fila} · ${t.valor}` })) });
  }
  if (salida.resumen.totalDeclarado == null) salida.advertencias.push("El archivo no tiene un total general reconocido; el valor se calcula a partir de su detalle.");
  if (salida.resumen.diferencia != null && Math.abs(salida.resumen.diferencia) > TOLERANCIA_CONTROL) salida.advertencias.push(`El total declarado difiere del detalle en ${salida.resumen.diferencia}. Se conservan los valores originales para revisar el borrador.`);
  const gruposDescuadrados = controles.grupos.filter((g) => g.estado === "descuadre");
  if (gruposDescuadrados.length) salida.advertencias.push(`${gruposDescuadrados.length} subtotal(es) del archivo difieren de sus movimientos; revisa sus bloques en el borrador.`);
  const omitidas = lectura.filas.filter((f) => f.omitida === true).length;
  if (omitidas) salida.advertencias.push(`${omitidas} fila(s) en negrita quedaron omitidas según las reglas del motor; revísalas en el borrador.`);
  for (const excepcion of lectura.excepciones.slice(0, 8)) salida.advertencias.push(`Fila ${excepcion.filaNum}: ${excepcion.mensaje}`);
  if (lectura.excepciones.length > 8) salida.advertencias.push(`Hay ${lectura.excepciones.length - 8} observación(es) adicionales para revisar en el borrador.`);
  salida.estructuraValida = salida.errores.length === 0;
  salida.errores.push(...erroresDatos);
  if (!lecturaPreparada) salida.modeloSugerido = modeloDesdeLectura(hoja, spec, []);
  salida.listoParaBorrador = salida.estructuraValida && salida.errores.length === 0 && salida.preguntas.length === 0;
  return salida;
}
