// Tercer barrido del mapeo al plan estándar Russell: las cuentas que el barrido
// exacto (prefijo 6 díg.) y el determinista por descripción no resolvieron se
// envían a Claude para homologarlas por significado. Devuelve, por código de
// cuenta del cliente, la cuenta estándar (6 díg.) sugerida + su coincidencia.
import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, conReintentoSinTemperatura } from "@/lib/anthropic";
import { completarJsonEstructuradoGemini } from "@/lib/gemini";
import { CASCADA_MAPEO } from "@/lib/ia/modelos";
import { getPromptContenido, CLAVE_MAPEO } from "@/lib/ia/prompts";
import { modeloIABalance, proveedorIABalance, usoTokensGemini, type ProveedorIABalance } from "@/lib/ia/proveedor-balance";
import { conConcurrencia } from "@/lib/paralelo";
import type { UsoIA } from "@/lib/ia/uso";

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

const TAM_LOTE = 80; // cuentas por llamada (acota el tamaño de salida)

// Lotes 2..N de un mismo tier se lanzan en paralelo (la caché del plan ya está
// caliente tras el lote 1). Configurable por entorno sin tocar código.
const CONCURRENCIA_LOTES = Math.max(1, Number(process.env.ANTHROPIC_MAPEO_CONCURRENCIA ?? 4));
const CONCURRENCIA_LOTES_GEMINI = Math.max(1, Number(process.env.GEMINI_MAPEO_CONCURRENCIA ?? 2));

type BloqueSistema = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/**
 * Mapea por IA un conjunto de cuentas con UN modelo, en lotes, memoizando el plan
 * en el prompt de sistema (prompt caching). El PRIMER lote va solo y en serie —
 * escribe la caché del plan (~29-38K tokens) UNA vez—; los siguientes la leen y
 * se lanzan con concurrencia acotada (lanzarlos todos junto al primero
 * multiplicaría el `cache_creation`). Best-effort: si una llamada falla, ese
 * lote queda sin asignar. `loteBase` desfasa el `loteIndice` reportado para que
 * cada tier de la cascada registre lotes con índices únicos.
 */
async function mapearConModelo(
  pendientes: CuentaPendiente[],
  modelo: string,
  system: BloqueSistema[],
  validos: Set<string>,
  loteBase: number,
  usosOut?: UsoIA[],
): Promise<Map<string, Asignacion>> {
  const client = getAnthropic();
  const res = new Map<string, Asignacion>();
  const lotes: CuentaPendiente[][] = [];
  for (let i = 0; i < pendientes.length; i += TAM_LOTE) lotes.push(pendientes.slice(i, i + TAM_LOTE));

  const procesarLote = async (lote: CuentaPendiente[], indice: number): Promise<void> => {
    const lista = lote.map((p) => `${p.code} | ${p.name}`).join("\n");
    try {
      const r = await conReintentoSinTemperatura(
        (ajustes) =>
          client.messages.parse({
            model: modelo,
            max_tokens: 8000,
            ...ajustes,
            system,
            messages: [{ role: "user", content: [{ type: "text", text: `CUENTAS DEL CLIENTE A MAPEAR (código | nombre):\n${lista}\n\nDevuelve una asignación por cada cuenta del cliente.` }] }],
            output_config: { format: zodOutputFormat(MapeoIASchema) },
          }),
        modelo,
      );
      usosOut?.push({ tipoOperacion: "mapeo_ia", modelo, usage: r.usage, loteIndice: loteBase + indice, cuentasLote: lote.length });
      for (const a of r.parsed_output?.asignaciones ?? []) {
        const std = a.cuenta6Russell && validos.has(a.cuenta6Russell) ? a.cuenta6Russell : null;
        res.set(a.cuentaCliente, { std, coincidencia: std ? Math.round(Math.max(0, Math.min(100, a.coincidencia))) : null });
      }
    } catch {
      // Lote fallido: se omite; las cuentas quedan sin mapear en este tier.
    }
  };

  if (lotes.length > 0) {
    await procesarLote(lotes[0], 0); // calienta la caché del plan de este tier
    if (lotes.length > 1) {
      await conConcurrencia(lotes.slice(1), CONCURRENCIA_LOTES, (lote, i) => procesarLote(lote, i + 1));
    }
  }
  return res;
}

/**
 * Variante económica para desarrollo/pruebas. Gemini recibe el mismo plan y el
 * mismo esquema validado, pero usa un único modelo y no depende de la cascada ni
 * de la caché específica de Anthropic.
 */
async function mapearConGemini(
  pendientes: CuentaPendiente[],
  systemTexto: string,
  planTexto: string,
  validos: Set<string>,
  usosOut?: UsoIA[],
  proveedorIA?: ProveedorIABalance,
): Promise<Map<string, Asignacion>> {
  const modelo = modeloIABalance(proveedorIA);
  const system = `${systemTexto}\n\nPLAN ESTÁNDAR RUSSELL (código | nombre | russell | sinónimos):\n${planTexto}`;
  const res = new Map<string, Asignacion>();
  const lotes: CuentaPendiente[][] = [];
  for (let i = 0; i < pendientes.length; i += TAM_LOTE) lotes.push(pendientes.slice(i, i + TAM_LOTE));

  await conConcurrencia(lotes, CONCURRENCIA_LOTES_GEMINI, async (lote, indice) => {
    const lista = lote.map((p) => `${p.code} | ${p.name}`).join("\n");
    try {
      const r = await completarJsonEstructuradoGemini(
        {
          model: modelo,
          system,
          prompt: `CUENTAS DEL CLIENTE A MAPEAR (código | nombre):\n${lista}\n\nDevuelve una asignación por cada cuenta del cliente.`,
          maxTokens: 8000,
          temperature: 0,
        },
        MapeoIASchema,
      );
      usosOut?.push({
        tipoOperacion: "mapeo_ia",
        modelo,
        usage: usoTokensGemini(r.usage),
        loteIndice: indice,
        cuentasLote: lote.length,
      });
      for (const a of r.data.asignaciones) {
        const std = a.cuenta6Russell && validos.has(a.cuenta6Russell) ? a.cuenta6Russell : null;
        res.set(a.cuentaCliente, {
          std,
          coincidencia: std ? Math.round(Math.max(0, Math.min(100, a.coincidencia))) : null,
        });
      }
    } catch {
      // Best-effort: el barrido determinista conserva la cuenta sin homologar.
    }
  });
  return res;
}

/**
 * Mapea por IA las cuentas pendientes contra el plan, en CASCADA de modelos
 * (Haiku → Sonnet → Opus, ver `src/lib/ia/modelos.ts`): el tier barato barre las
 * obvias y solo las que quedan por debajo del umbral de confianza escalan al
 * modelo más capaz. Conserva la MEJOR asignación (mayor `coincidencia`) vista en
 * cualquier tier. Best-effort: lo que ningún tier resuelva queda sin mapear.
 *
 * Las cuentas conocidas ya se resolvieron antes por la caché SQL (`cuentas_cliente`)
 * y los barridos deterministas; aquí solo llegan las cuentas NUEVAS.
 *
 * `usosOut` (opcional): acumula el `usage` (tokens) de cada lote/tier para que la
 * Server Action registre el consumo de IA, sin acoplar este módulo a la BD.
 */
export async function mapearPorIA(
  pendientes: CuentaPendiente[],
  plan: CuentaPlan[],
  usosOut?: UsoIA[],
  proveedorSeleccionado?: ProveedorIABalance,
): Promise<Map<string, Asignacion>> {
  const out = new Map<string, Asignacion>();
  if (pendientes.length === 0 || plan.length === 0) return out;

  // Prompt de sistema vigente (editable por el Superadministrador, BD → fábrica).
  const systemTexto = await getPromptContenido(CLAVE_MAPEO);
  const planTexto = plan.map((p) => `${p.code} | ${p.name} | russell: ${p.russell} | sinónimos: ${p.posibles}`).join("\n");
  const validos = new Set(plan.map((p) => p.code));

  // Proveedor YA autorizado por la frontera; sin valor explícito, compuerta de entorno.
  const proveedorIA = proveedorSeleccionado ?? proveedorIABalance();
  if (proveedorIA === "gemini") {
    return mapearConGemini(pendientes, systemTexto, planTexto, validos, usosOut, proveedorIA);
  }
  // Prompt caching: el breakpoint va en el ÚLTIMO bloque de `system` (el plan, ~29-38K
  // tokens según el modelo) y cachea TODO el prefijo —SYSTEM + plan— de una vez. No se
  // marca SYSTEM por separado: sus ~220 tokens quedan bajo el mínimo cacheable (2048 en
  // Sonnet 4.6, 4096 en Opus 4.x) y no formarían entrada propia. El plan es idéntico en
  // cada lote → se escribe una vez por modelo y se lee (~0,1× del costo) en los lotes
  // siguientes de ese tier dentro del TTL (la caché es por-modelo).
  const system: BloqueSistema[] = [
    { type: "text", text: systemTexto },
    {
      type: "text",
      text: `PLAN ESTÁNDAR RUSSELL (código | nombre | russell | sinónimos):\n${planTexto}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  let restantes = pendientes;
  let loteBase = 0;
  for (const { modelo, umbralEscalar } of CASCADA_MAPEO) {
    if (restantes.length === 0) break;
    const res = await mapearConModelo(restantes, modelo, system, validos, loteBase, usosOut);
    loteBase += Math.ceil(restantes.length / TAM_LOTE);

    const aunPendientes: CuentaPendiente[] = [];
    for (const p of restantes) {
      const a = res.get(p.code);
      const previa = out.get(p.code);
      // Conserva la mejor asignación (mayor coincidencia) entre tiers.
      if (a?.std && (a.coincidencia ?? 0) >= (previa?.coincidencia ?? -1)) out.set(p.code, a);
      const mejor = out.get(p.code);
      // Escala al siguiente tier si la mejor coincidencia sigue bajo el umbral.
      if (!mejor?.std || (mejor.coincidencia ?? 0) < umbralEscalar) aunPendientes.push(p);
    }
    restantes = aunPendientes;
  }
  return out;
}
