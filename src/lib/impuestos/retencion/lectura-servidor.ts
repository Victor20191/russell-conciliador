import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, conReintentoSinTemperatura, MODELO_EXTRACCION } from "@/lib/anthropic";
import { MODELO_EXTRACCION_RAPIDA } from "@/lib/ia/modelos";
import { getPromptContenido } from "@/lib/ia/prompts";
import { CLAVE_FORMULARIO_DIAN } from "@/lib/ia/prompts-catalogo";
import type { UsoIA } from "@/lib/ia/uso";
import { controlesLectura, lecturaConErrores, normalizarLectura, type ContextoLectura, type ControlLectura, type LecturaCruda, type LecturaFormulario } from "./lectura";

/**
 * Lectura de un formulario DIAN (350 o 490) con Claude: primero el modelo rápido y, si algún
 * control que bloquea falla, una segunda lectura con el más capaz (la cascada del balance). Se
 * queda con la lectura que menos controles bloqueantes falla. No guarda nada.
 */

const LecturaFormularioSchema = z.object({
  formulario: z.string(),
  anio: z.string(),
  periodo: z.string(),
  numero: z.string(),
  nit: z.string(),
  dv: z.string(),
  razonSocial: z.string(),
  codigoCorreccion: z.string(),
  numeroAnterior: z.string(),
  concepto: z.string(),
  numeroPagado: z.string(),
  cuota: z.string(),
  deCuotas: z.string(),
  fechaLimitePago: z.string(),
  autoadhesivo: z.string(),
  fechaSello: z.string(),
  renglones: z.array(z.object({ renglon: z.number().int(), valor: z.string() })),
  exterior: z.array(z.object({ pais: z.string(), tipoPersona: z.string(), valorRetencion: z.string() })),
});

const MAX_TOKENS_FORMULARIO = 8000;

async function leerUnaVez(pdfBase64: string, modelo: string, system: string): Promise<{ cruda: LecturaCruda; uso: UsoIA }> {
  const client = await getAnthropic();
  const r = await conReintentoSinTemperatura(
    (ajustes) =>
      client.messages.parse({
        model: modelo,
        max_tokens: MAX_TOKENS_FORMULARIO,
        ...ajustes,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: "Transcribe el formulario en el esquema pedido." },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(LecturaFormularioSchema) },
      }),
    modelo,
  );
  if (!r.parsed_output) throw new Error("La IA no devolvió el formulario en el esquema esperado.");
  return { cruda: r.parsed_output, uso: { tipoOperacion: "lectura_formulario_dian", modelo, usage: r.usage } };
}

export type ResultadoLecturaIA = {
  cruda: LecturaCruda;
  lectura: LecturaFormulario;
  controles: ControlLectura[];
  modelo: string;
  usos: UsoIA[];
};

export async function leerFormularioDianConIA(pdfBase64: string, ctx: ContextoLectura): Promise<ResultadoLecturaIA> {
  const system = await getPromptContenido(CLAVE_FORMULARIO_DIAN);
  const usos: UsoIA[] = [];
  const evaluar = (cruda: LecturaCruda) => {
    const lectura = normalizarLectura(cruda);
    return { lectura, controles: controlesLectura(lectura, ctx) };
  };
  const primera = await leerUnaVez(pdfBase64, MODELO_EXTRACCION_RAPIDA, system);
  usos.push(primera.uso);
  let mejor = { cruda: primera.cruda, modelo: MODELO_EXTRACCION_RAPIDA, ...evaluar(primera.cruda) };
  if (lecturaConErrores(mejor.controles) && MODELO_EXTRACCION !== MODELO_EXTRACCION_RAPIDA) {
    const segunda = await leerUnaVez(pdfBase64, MODELO_EXTRACCION, system);
    usos.push(segunda.uso);
    const evaluada = { cruda: segunda.cruda, modelo: MODELO_EXTRACCION, ...evaluar(segunda.cruda) };
    const fallas = (c: ControlLectura[]) => c.filter((x) => x.bloquea && !x.ok).length;
    if (fallas(evaluada.controles) <= fallas(mejor.controles)) mejor = evaluada;
  }
  return { ...mejor, usos };
}
