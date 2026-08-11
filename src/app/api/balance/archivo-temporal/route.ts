import { z } from "zod";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import {
  completarArchivoBalanceTemporal,
  iniciarArchivoBalanceTemporal,
} from "@/lib/balance/archivo-temporal-servidor";
import { mensajeTamanoBalanceNoPermitido } from "@/lib/balance/limites-archivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IniciarSchema = z.object({
  operacion: z.literal("iniciar"),
  loteId: z.string().uuid(),
  nombreArchivo: z.string().trim().min(1).max(255),
  tipoContenido: z.string().trim().max(160).default("application/octet-stream"),
  tamanoBytes: z.number().int().positive(),
});
const CompletarSchema = z.object({
  operacion: z.literal("completar"),
  loteId: z.string().uuid(),
});
const SolicitudSchema = z.discriminatedUnion("operacion", [IniciarSchema, CompletarSchema]);

export async function POST(request: Request) {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return Response.json({ message: authz.message }, { status: 403 });
  const usuario = await getCurrentUser();
  if (!usuario) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ message: "La solicitud de carga no es válida." }, { status: 400 });
  }
  const parsed = SolicitudSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return Response.json({ message: "La solicitud de carga no es válida." }, { status: 400 });
  }

  if (parsed.data.operacion === "iniciar") {
    const errorTamano = mensajeTamanoBalanceNoPermitido(
      parsed.data.nombreArchivo,
      parsed.data.tamanoBytes,
    );
    if (errorTamano) return Response.json({ message: errorTamano }, { status: 413 });
    const resultado = await iniciarArchivoBalanceTemporal({
      loteId: parsed.data.loteId,
      usuarioId: usuario.id,
      nombreArchivo: parsed.data.nombreArchivo,
      tipoContenido: parsed.data.tipoContenido,
      tamanoBytes: parsed.data.tamanoBytes,
    });
    return Response.json(resultado, {
      status: resultado.ok ? 200 : resultado.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const resultado = await completarArchivoBalanceTemporal({
    loteId: parsed.data.loteId,
    usuarioId: usuario.id,
  });
  return Response.json(resultado, {
    status: resultado.ok ? 200 : resultado.status,
    headers: { "Cache-Control": "no-store" },
  });
}
