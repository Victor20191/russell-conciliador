// Orquestador de la extracción asistida por IA.
//
// Une las piezas: ingesta del archivo → aplicar el PERFIL guardado del cliente
// si vino uno (0 llamadas IA) → si no, cascada de detección de estructura para
// tabulares (Sonnet→Opus) o extracción directa para PDF/texto → transformación/
// validación determinista. El resultado alimenta a `calcularBalance` en la
// Server Action. Sigue PURO respecto a BD/sesión: el lookup del perfil y el
// registro de consumo los hace la action (out-param `usosOut`).
import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODELO_EXTRACCION, conReintentoSinTemperatura } from "@/lib/anthropic";
import { CASCADA_EXTRACCION } from "@/lib/ia/modelos";
import { getPromptContenido, CLAVE_EXTRACCION } from "@/lib/ia/prompts";
import { ingerir, construirVistaPrevia, contarPaginasPDF, LIMITE_PAGINAS_PDF, type Ingesta } from "./ingesta";
import { MappingSpecSchema, ExtraccionDirectaSchema } from "./esquema";
import { transformarTabular, validarDirecta, type ParamsExtraccion, type ResultadoTransform } from "./transformar";
import { esTransformacionAceptable, debeEscalarExtraccion } from "./validacion";
import { veredictoOrientacion, invertirColumnasMovimiento } from "./verificacion";
import type { GridHoja } from "./ingesta";
import type { MappingSpec } from "./esquema";
import type { UsoIA } from "@/lib/ia/uso";

function bloqueParametros(params: ParamsExtraccion): string {
  return [
    "PARÁMETROS EXTERNOS (tienen prioridad):",
    `- NIT_ESPERADO: ${params.nit ?? "(vacío)"}`,
    `- PERIODO_ESPERADO: ${params.periodoInicial ?? "?"} a ${params.periodoFinal ?? "?"}`,
    `- ESTANDAR_CONTABLE: ${params.estandar}`,
  ].join("\n");
}

const MAX_TOKENS_ESTRUCTURA = 8000;
const MAX_TOKENS_DIRECTA = 32000;

/**
 * Corrección DETERMINISTA (0 llamadas IA) de columnas débito↔crédito
 * intercambiadas en el spec de la IA: si la votación de orientación por fila
 * delata la inversión, se re-transforma con las columnas swapeadas EN EL SPEC
 * (así el editor de estructura y el perfil guardado quedan coherentes). El
 * intercambio se conserva solo si el resultado corregido es aceptable y vota
 * «directa»; si no, se devuelve el original intacto (que `esTransformacionAceptable`
 * rechazará → escala al siguiente tier).
 */
function corregirOrientacionInvertida(
  spec: MappingSpec,
  resultado: ResultadoTransform,
  hojas: GridHoja[],
  params: ParamsExtraccion,
): { spec: MappingSpec; resultado: ResultadoTransform } {
  if (veredictoOrientacion(resultado.orientacionControl) !== "invertida") return { spec, resultado };
  const specSwap = invertirColumnasMovimiento(spec);
  const resSwap = transformarTabular(specSwap, hojas, params);
  if (veredictoOrientacion(resSwap.orientacionControl) !== "directa" || !esTransformacionAceptable(resSwap)) {
    return { spec, resultado };
  }
  resSwap.excepciones.push({
    hoja: spec.hoja,
    fila: null,
    campo: "columnas",
    valor: `débitos C${spec.columnas.debitos} ↔ créditos C${spec.columnas.creditos}`,
    regla: "Columnas débito/crédito invertidas — corregidas automáticamente",
    accion: "Verificar el mapeo en el editor de estructura antes de cargar.",
  });
  return { spec: specSwap, resultado: resSwap };
}

function esBalancePorTerceroRecuperable(spec: MappingSpec): boolean {
  if (spec.importable || spec.columnas.tercero <= 0) return false;
  const cols = spec.columnas;
  const tieneMapaMinimo =
    cols.codigo > 0 &&
    cols.nombre > 0 &&
    cols.saldoInicial > 0 &&
    (cols.debitos > 0 || cols.creditos > 0) &&
    (cols.saldoFinal > 0 || (cols.saldoFinalDebito > 0 && cols.saldoFinalCredito > 0));
  if (!tieneMapaMinimo) return false;
  const textoMotivo = `${spec.motivoNoImportable ?? ""} ${spec.notas ?? ""}`;
  return /tercero|centro de costo|duplic|consolid/i.test(textoMotivo);
}

function recuperarBalancePorTercero(spec: MappingSpec): MappingSpec {
  return {
    ...spec,
    importable: true,
    motivoNoImportable: null,
    excepciones: [
      ...spec.excepciones,
      {
        hoja: spec.hoja,
        fila: null,
        campo: "tercero",
        valor: null,
        regla: "Balance por tercero con fila consolidada",
        accion: "La plataforma importará la fila consolidada sin tercero cuando exista y omitirá el desglose por tercero/centro de costo para evitar doble conteo.",
      },
    ],
    notas: [spec.notas, "Recuperado como balance por tercero: se priorizan filas consolidadas sin tercero por código."].filter(Boolean).join(" "),
  };
}

export type OpcionesExtraccion = {
  /**
   * Excel multi-hoja: cuando el usuario eligió explícitamente la hoja del
   * balance, se restringe la vista previa y la extracción a esa hoja — la IA NO
   * decide cuál cargar. Si no viene, la IA identifica la hoja entre todas.
   */
  hojaElegida?: string | null;
  /**
   * Si se pasa, se le agrega el `usage` (tokens) de cada llamada a Claude para
   * que la Server Action registre el consumo de IA. No altera el resultado;
   * mantiene el pipeline desacoplado de la BD/sesión.
   */
  usosOut?: UsoIA[];
  /** Ingesta ya realizada por la action (evita releer el buffer). */
  ingesta?: Ingesta;
  /**
   * PERFIL guardado del cliente (spec reconstruido por huella del layout): se
   * aplica de forma determinista SIN llamar a la IA. Si el resultado no es
   * aceptable se descarta y se cae a la cascada normal.
   */
  specGuardado?: MappingSpec | null;
};

export type ResultadoExtraccion = {
  resultado: ResultadoTransform;
  /** Cómo se obtuvo la estructura: perfil guardado (0 IA) o modelo. */
  origenExtraccion: "perfil" | "ia";
  /** Spec de estructura usado (null en PDF/texto: extracción directa sin spec). */
  spec: MappingSpec | null;
};

/**
 * Extrae el balance de un archivo. Lanza si la IA no devuelve un resultado
 * válido o si el archivo es ilegible (lo captura la Server Action).
 */
export async function extraerBalance(
  data: ArrayBuffer,
  fileName: string,
  params: ParamsExtraccion,
  opciones: OpcionesExtraccion = {},
): Promise<ResultadoExtraccion> {
  const { hojaElegida, usosOut, specGuardado } = opciones;
  const ingesta = opciones.ingesta ?? (await ingerir(data, fileName));

  if (ingesta.modo === "tabular") {
    const elegida = hojaElegida?.trim() || null;

    // 1) Perfil guardado del cliente: transformación determinista, 0 llamadas IA.
    //    Si el layout cambió y el resultado no es aceptable, se descarta el perfil.
    if (specGuardado) {
      const spec = elegida ? { ...specGuardado, hoja: elegida } : specGuardado;
      const resultado = transformarTabular(spec, ingesta.hojas, params);
      if (esTransformacionAceptable(resultado)) {
        return { resultado, origenExtraccion: "perfil", spec };
      }
    }

    // 2) Cascada de detección de estructura (Sonnet→Opus por confianza/resultado).
    const client = getAnthropic();
    // Prompt de sistema vigente (editable por el Superadministrador, BD → fábrica).
    // Prompt caching: con Sonnet (mínimo cacheable 2048 tokens) el prompt
    // (~2,1-2,5K tokens) SÍ se cachea entre cargas; con Opus (mínimo 4096) queda
    // corto y no se cachea (sin coste extra). El grueso de la entrada es la vista
    // previa del archivo: cambia por carga y no es cacheable.
    const promptTexto = await getPromptContenido(CLAVE_EXTRACCION);
    const system = [{ type: "text" as const, text: promptTexto, cache_control: { type: "ephemeral" as const } }];

    // Hoja elegida por el usuario: solo la mandamos a la IA (y luego la forzamos
    // en el spec). Fallback a todas si el nombre no coincide con ninguna hoja.
    const soloElegida = elegida ? ingesta.hojas.filter((h) => h.nombre === elegida) : [];
    const hojasVista = soloElegida.length > 0 ? soloElegida : ingesta.hojas;
    const vista = construirVistaPrevia(hojasVista);

    const lineas = [
      bloqueParametros(params),
      "",
      "Modo ESTRUCTURA: describe el mapa del balance (no transcribas filas). Índices de columna 1-based (A=1).",
    ];
    if (elegida) {
      lineas.push(`HOJA SELECCIONADA POR EL USUARIO (obligatoria): «${elegida}». Devuelve el mapeo SOLO de esta hoja; ignora cualquier otra.`);
    }
    lineas.push("Vista previa del archivo:", vista);
    const instruccion = lineas.join("\n");

    // Mejor intento hasta ahora (para usarlo si el último tier tampoco convence:
    // el descuadre no bloquea el cargue, solo lo marca).
    let mejor: { spec: MappingSpec; resultado: ResultadoTransform } | null = null;

    for (const tier of CASCADA_EXTRACCION) {
      const r = await conReintentoSinTemperatura(
        (ajustes) =>
          client.messages.parse({
            model: tier.modelo,
            max_tokens: MAX_TOKENS_ESTRUCTURA,
            ...ajustes,
            system,
            messages: [{ role: "user", content: [{ type: "text", text: instruccion }] }],
            output_config: { format: zodOutputFormat(MappingSpecSchema) },
          }),
        tier.modelo,
      );
      usosOut?.push({ tipoOperacion: "extraccion_tabular", modelo: tier.modelo, usage: r.usage });
      const crudo = r.parsed_output;
      if (!crudo) continue; // sin spec en este tier → probar el siguiente

      const specTier = esBalancePorTerceroRecuperable(crudo) ? recuperarBalancePorTercero(crudo) : crudo;
      // Forzamos la hoja elegida en el spec para que `transformarTabular` procese
      // esa hoja (recibe todas las hojas para encontrarla completa). Se transforma
      // SIEMPRE (con `importable: false` devuelve el resultado vacío con el motivo,
      // igual que antes de la cascada).
      const specInicial = elegida ? { ...specTier, hoja: elegida } : specTier;
      // Corrige débitos↔créditos invertidos ANTES de evaluar aceptación/escalado.
      const { spec, resultado } = corregirOrientacionInvertida(
        specInicial,
        transformarTabular(specInicial, ingesta.hojas, params),
        ingesta.hojas,
        params,
      );

      // Mejor intento: un resultado ACEPTABLE se conserva; entre no aceptables
      // gana el tier más capaz (el más reciente). Cubre el caso de un tier rápido
      // aceptable pero con confianza baja que Opus no logra mejorar.
      const candidatoAceptable = esTransformacionAceptable(resultado);
      const mejorAceptable = mejor ? esTransformacionAceptable(mejor.resultado) : false;
      if (!mejor || candidatoAceptable || !mejorAceptable) mejor = { spec, resultado };

      if (!debeEscalarExtraccion(spec, resultado, tier.umbralConfianza)) break;
    }

    if (!mejor) throw new Error("La IA no devolvió un mapeo válido del archivo. Reintenta o revisa el formato.");
    // Metadatos para la huella diagnóstica: cómo se leyó y con qué confianza.
    return { resultado: { ...mejor.resultado, modo: "tabular", confianza: mejor.spec.confianza }, origenExtraccion: "ia", spec: mejor.spec };
  }

  // Documento (PDF o texto): extracción directa, siempre con el modelo mayor.
  const client = getAnthropic();
  const promptTexto = await getPromptContenido(CLAVE_EXTRACCION);
  const system = [{ type: "text" as const, text: promptTexto, cache_control: { type: "ephemeral" as const } }];
  const doc = ingesta.documento;
  if (doc.tipo === "pdf") {
    const paginas = contarPaginasPDF(data);
    if (paginas != null && paginas > LIMITE_PAGINAS_PDF) {
      throw new Error(`El PDF tiene ${paginas} páginas y el máximo que la IA puede leer es ${LIMITE_PAGINAS_PDF}. Divídelo o exporta el balance a Excel/CSV.`);
    }
  }
  const instruccion = [
    bloqueParametros(params),
    "",
    "Modo EXTRACCIÓN: devuelve las filas de detalle (cuentas imputables) ya normalizadas en el esquema pedido.",
    doc.tipo === "texto" ? `\nCONTENIDO:\n${doc.texto.slice(0, 200_000)}` : "",
  ].join("\n");

  const content =
    doc.tipo === "pdf"
      ? [
          { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: doc.base64 } },
          { type: "text" as const, text: instruccion },
        ]
      : [{ type: "text" as const, text: instruccion }];

  const r = await conReintentoSinTemperatura((ajustes) =>
    client.messages.parse({
      model: MODELO_EXTRACCION,
      max_tokens: MAX_TOKENS_DIRECTA,
      ...ajustes,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ExtraccionDirectaSchema) },
    }),
  );
  usosOut?.push({ tipoOperacion: "extraccion_pdf", modelo: MODELO_EXTRACCION, usage: r.usage });
  const extr = r.parsed_output;
  if (!extr) throw new Error("La IA no devolvió filas válidas del documento. Reintenta o revisa el archivo.");
  // Metadatos para la huella diagnóstica (la extracción directa no declara confianza).
  return { resultado: { ...validarDirecta(extr, params), modo: "documento" }, origenExtraccion: "ia", spec: null };
}
