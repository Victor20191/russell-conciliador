// Diagnóstico ASISTIDO por IA del descuadre de un borrador. Bajo demanda (botón).
// El modelo NO recibe el archivo crudo (1.700+ filas): recibe los HALLAZGOS ya
// calculados por la capa determinista (`diagnostico.ts`) + la estructura compacta
// de agrupadoras. Así la llamada es barata, rápida y ATERRIZADA en hechos, y el
// modelo solo debe correlacionarlos, explicarlos en lenguaje contable y sugerir la
// corrección — no re-derivar nada. Puro respecto a BD/sesión: acumula el `usage`
// en `usosOut` y la Server Action lo persiste con `registrarConsumoIA`.
import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, conReintentoSinTemperatura, MODELO_EXTRACCION } from "@/lib/anthropic";
import type { UsoIA } from "@/lib/ia/uso";
import type { Hallazgo } from "./diagnostico";
import type { AgrupadoraRef } from "./borrador-vm";

export const DiagnosticoIASchema = z.object({
  resumen: z.string().describe("Una o dos frases: qué está causando el descuadre, en lenguaje de contador."),
  hipotesis: z
    .array(
      z.object({
        titulo: z.string().describe("Título corto de la hipótesis."),
        explicacion: z.string().describe("Por qué ocurre, correlacionando los hallazgos."),
        cuentas: z.array(z.string()).describe("Códigos de cuenta implicados (de la estructura dada)."),
        correccion: z.string().describe("Qué revisar o corregir en el ERP/archivo para cuadrar."),
        confianza: z.number().min(0).max(100).describe("Confianza 0–100 en esta hipótesis."),
      }),
    )
    .describe("Hipótesis ordenadas de mayor a menor confianza."),
});
export type DiagnosticoIA = z.infer<typeof DiagnosticoIASchema>;

const SYSTEM = `Eres un auditor contable colombiano experto en el Plan Único de Cuentas (PUC, Decreto 2650) y en balances de comprobación.

Recibes hallazgos DETERMINISTAS ya calculados (partida doble, ecuación contable, diferencias por clase contra el archivo, y nodos agrupadores cuyo total ≠ la suma de sus hijos) y una lista compacta de las cuentas AGRUPADORAS con su saldo y su descuadre (Δ). No tienes el detalle completo: NO inventes cuentas ni montos que no estén en los datos.

Tu tarea: correlacionar los hallazgos y proponer hipótesis CONCRETAS de la causa del descuadre, citando los códigos de cuenta implicados y la corrección a aplicar en el ERP o el archivo. Patrones frecuentes en estos ERP:
- Cuenta mal clasificada o con el signo invertido (aparece en la clase equivocada).
- Detalle "desacoplado": el ERP ubicó una cuenta bajo una agrupadora que no le corresponde por código (el subtotal y su detalle no comparten prefijo; la plata está pero en otra rama).
- Subtotal duplicado de su detalle; cuenta faltante; o descuadre real del archivo origen (la partida doble no cuadra en la fuente).
- El Resultado es derivado (ingresos − gastos − costos): su diferencia la explican esas clases, no una cuenta propia.

Sé breve y accionable. Si un hallazgo ya es autoexplicativo, dilo sin adornos. No repitas literalmente los hallazgos: agrégales valor (causa probable + corrección).`;

/**
 * Llama a Claude para diagnosticar el descuadre. Devuelve las hipótesis o `null`
 * si no hay nada que analizar. Acumula el `usage` en `usosOut`.
 */
export async function diagnosticarConIA(
  hallazgos: Hallazgo[],
  agrupadoras: AgrupadoraRef[],
  modelo: string = MODELO_EXTRACCION,
  usosOut?: UsoIA[],
): Promise<DiagnosticoIA | null> {
  if (hallazgos.length === 0) return null;
  const client = getAnthropic();
  const hall = hallazgos
    .map((h, i) => `${i + 1}. [${h.tipo}] ${h.titulo} · monto ${h.monto}\n   ${h.detalle}`)
    .join("\n");
  // Estructura compacta: solo agrupadoras (las hojas son miles). Se priorizan las
  // que tienen descuadre y se limita el volumen para acotar el costo.
  const conDesc = agrupadoras.filter((a) => a.descuadre != null && a.descuadre !== 0);
  const resto = agrupadoras.filter((a) => a.descuadre == null || a.descuadre === 0).slice(0, 300);
  const estructura = [...conDesc, ...resto]
    .map((a) => `${a.codigo} | ${a.nombre} | saldo ${a.saldoFinal}${a.descuadre ? ` | Δ ${a.descuadre}` : ""}`)
    .join("\n");

  const r = await conReintentoSinTemperatura(
    (ajustes) =>
      client.messages.parse({
        model: modelo,
        max_tokens: 4000,
        ...ajustes,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `HALLAZGOS DETERMINISTAS (ya calculados):\n${hall}\n\nAGRUPADORAS (código | nombre | saldo | Δ):\n${estructura}\n\nAnaliza y devuelve hipótesis de la causa del descuadre con las cuentas implicadas y la corrección.`,
              },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(DiagnosticoIASchema) },
      }),
    modelo,
  );
  usosOut?.push({ tipoOperacion: "diagnostico_ia", modelo, usage: r.usage });
  return r.parsed_output ?? null;
}
