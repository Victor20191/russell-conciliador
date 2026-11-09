import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, conReintentoSinTemperatura, MODELO_EXTRACCION } from "@/lib/anthropic";
import { getPromptContenido } from "@/lib/ia/prompts";
import { CLAVE_CALENDARIO_DIAN } from "@/lib/ia/prompts-catalogo";
import type { UsoIA } from "@/lib/ia/uso";
import { CLAVES_CALENDARIO, completarPares, FORMULARIOS_CALENDARIO, type FormularioCalendario, type VencimientoDian } from "./calendario";

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
  const instruccion = `Año del calendario: ${anio}. Formulario: ${def.etiqueta} (${def.periodos} ${def.periodos === 1 ? "período" : "períodos"}). ${def.instruccionPdf} Devuelve las fechas límite en el esquema pedido.`;
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
    filas: completarPares(formulario, salida.vencimientos.map((v) => ({ periodo: v.periodo, ultimoDigito: v.ultimoDigito, fecha: v.fecha.trim() }))),
    usos,
  };
}

/**
 * Lee del mismo PDF todos los formularios con calendario (Retención en la fuente e IVA bimestral,
 * cuatrimestral y anual): una llamada por sección, en paralelo. Una sección que falla no tumba las
 * demás: queda en `fallidos` con su motivo.
 */
export async function leerCalendarioCompletoConIA(
  pdfBase64: string,
  anio: number,
): Promise<{ lecturas: { formulario: FormularioCalendario; anioLeido: number; filas: VencimientoDian[] }[]; fallidos: { formulario: FormularioCalendario; error: unknown }[]; usos: UsoIA[] }> {
  const resultados = await Promise.allSettled(CLAVES_CALENDARIO.map((formulario) => leerCalendarioDianConIA(pdfBase64, anio, formulario)));
  const lecturas: { formulario: FormularioCalendario; anioLeido: number; filas: VencimientoDian[] }[] = [];
  const fallidos: { formulario: FormularioCalendario; error: unknown }[] = [];
  const usos: UsoIA[] = [];
  resultados.forEach((r, i) => {
    const formulario = CLAVES_CALENDARIO[i];
    if (r.status === "fulfilled") {
      lecturas.push({ formulario, anioLeido: r.value.anioLeido, filas: r.value.filas });
      usos.push(...r.value.usos);
    } else {
      fallidos.push({ formulario, error: r.reason });
    }
  });
  return { lecturas, fallidos, usos };
}
