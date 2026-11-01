import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, conReintentoSinTemperatura, MODELO_EXTRACCION } from "@/lib/anthropic";
import { getPromptContenido } from "@/lib/ia/prompts";
import { CLAVE_CALENDARIO_DIAN } from "@/lib/ia/prompts-catalogo";
import type { UsoIA } from "@/lib/ia/uso";
import { FORMULARIOS_CALENDARIO, type FormularioCalendario, type VencimientoDian } from "./calendario";

/**
 * Lectura del PDF del calendario tributario de la DIAN con Claude. Devuelve una PROPUESTA: no
 * guarda nada; la valida `validarCalendario` y el usuario la revisa antes de guardarla.
 */

const LecturaCalendarioSchema = z.object({
  anio: z.number().int(),
  vencimientos: z.array(
    z.object({
      periodo: z.number().int(),
      ultimoDigito: z.number().int(),
      fecha: z.string(),
    }),
  ),
});

const MAX_TOKENS_CALENDARIO = 8000;

export async function leerCalendarioDianConIA(
  pdfBase64: string,
  anio: number,
  formulario: FormularioCalendario,
): Promise<{ anioLeido: number; filas: VencimientoDian[]; usos: UsoIA[] }> {
  const def = FORMULARIOS_CALENDARIO[formulario];
  const system = await getPromptContenido(CLAVE_CALENDARIO_DIAN);
  const instruccion = `Año: ${anio}. Formulario: ${def.etiqueta} (${def.periodos} períodos). Devuelve las fechas límite de ese año en el esquema pedido.`;
  const client = await getAnthropic();
  const modelo = MODELO_EXTRACCION;
  const r = await conReintentoSinTemperatura(
    (ajustes) =>
      client.messages.parse({
        model: modelo,
        max_tokens: MAX_TOKENS_CALENDARIO,
        ...ajustes,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: instruccion },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(LecturaCalendarioSchema) },
      }),
    modelo,
  );
  const usos: UsoIA[] = [{ tipoOperacion: "lectura_calendario_dian", modelo, usage: r.usage }];
  const salida = r.parsed_output;
  if (!salida) throw new Error("La IA no devolvió fechas válidas del calendario. Revisa el archivo o escribe el calendario a mano.");
  return {
    anioLeido: salida.anio,
    filas: salida.vencimientos.map((v) => ({ periodo: v.periodo, ultimoDigito: v.ultimoDigito, fecha: v.fecha.trim() })),
    usos,
  };
}
