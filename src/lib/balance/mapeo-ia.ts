// Tercer barrido del mapeo al plan estándar Russell: las cuentas que el barrido
// exacto (prefijo 6 díg.) y el determinista por descripción no resolvieron se
// envían a Claude para homologarlas por significado. Devuelve, por código de
// cuenta del cliente, la cuenta estándar (6 díg.) sugerida + su coincidencia.
import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODELO_EXTRACCION } from "@/lib/anthropic";

export type CuentaPendiente = { code: string; name: string };
export type CuentaPlan = { code: string; name: string; russell: string; posibles: string };
export type Asignacion = { std: string | null; coincidencia: number | null };

// Estructura sin campos nullable (usa "" para «sin match») → no roza el límite
// de 16 parámetros con uniones de Structured Outputs.
const MapeoIASchema = z.object({
  asignaciones: z.array(
    z.object({
      cuentaCliente: z.string(),
      cuenta6Russell: z.string(), // "" si ninguna cuenta estándar corresponde
      coincidencia: z.number(), // 0..100 (confianza)
    }),
  ),
});

const SYSTEM = [
  "Eres un especialista en homologación del PUC colombiano al plan de cuentas estándar de Russell Bedford.",
  "Para cada cuenta del cliente, elige la cuenta estándar (código de 6 dígitos) cuyo significado corresponda mejor, respetando la CLASE (primer dígito) y la naturaleza.",
  "Usa el nombre, la cuenta Russell y los sinónimos del plan. Si ninguna corresponde con confianza razonable, deja `cuenta6Russell` vacío («»).",
  "`coincidencia` es tu confianza 0-100. No inventes códigos: usa solo códigos presentes en el plan.",
].join(" ");

const TAM_LOTE = 80; // cuentas por llamada (acota el tamaño de salida)

/**
 * Mapea por IA las cuentas pendientes contra el plan. Procesa en lotes y memoiza
 * el plan en el prompt de sistema (cache). Best-effort: si una llamada falla, ese
 * lote queda sin asignar (el cargue continúa con lo que sí se resolvió).
 */
export async function mapearPorIA(pendientes: CuentaPendiente[], plan: CuentaPlan[]): Promise<Map<string, Asignacion>> {
  const out = new Map<string, Asignacion>();
  if (pendientes.length === 0 || plan.length === 0) return out;

  const client = getAnthropic();
  const planTexto = plan.map((p) => `${p.code} | ${p.name} | russell: ${p.russell} | sinónimos: ${p.posibles}`).join("\n");
  const validos = new Set(plan.map((p) => p.code));
  // Prompt caching: el breakpoint va en el ÚLTIMO bloque de `system` (el plan, ~29-38K
  // tokens según el modelo) y cachea TODO el prefijo —SYSTEM + plan— de una vez. No se
  // marca SYSTEM por separado: sus ~220 tokens quedan bajo el mínimo cacheable (2048 en
  // Sonnet 4.6, 4096 en Opus 4.x) y no formarían entrada propia. El plan es idéntico en
  // cada lote y entre cargas → se escribe una vez y se lee (~0,1× del costo) en las
  // llamadas siguientes dentro del TTL.
  const system = [
    { type: "text" as const, text: SYSTEM },
    {
      type: "text" as const,
      text: `PLAN ESTÁNDAR RUSSELL (código | nombre | russell | sinónimos):\n${planTexto}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  for (let i = 0; i < pendientes.length; i += TAM_LOTE) {
    const lote = pendientes.slice(i, i + TAM_LOTE);
    const lista = lote.map((p) => `${p.code} | ${p.name}`).join("\n");
    try {
      const r = await client.messages.parse({
        model: MODELO_EXTRACCION,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system,
        messages: [{ role: "user", content: [{ type: "text", text: `CUENTAS DEL CLIENTE A MAPEAR (código | nombre):\n${lista}\n\nDevuelve una asignación por cada cuenta del cliente.` }] }],
        output_config: { format: zodOutputFormat(MapeoIASchema) },
      });
      for (const a of r.parsed_output?.asignaciones ?? []) {
        const std = a.cuenta6Russell && validos.has(a.cuenta6Russell) ? a.cuenta6Russell : null;
        out.set(a.cuentaCliente, { std, coincidencia: std ? Math.round(Math.max(0, Math.min(100, a.coincidencia))) : null });
      }
    } catch {
      // Lote fallido: se omite; las cuentas quedan sin mapear.
    }
  }
  return out;
}
