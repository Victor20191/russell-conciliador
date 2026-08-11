import { z } from "zod";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { guardarParteArchivoBalance } from "@/lib/balance/archivo-temporal-servidor";
import { BALANCE_UPLOAD_CHUNK_BYTES } from "@/lib/balance/limites-archivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
  loteId: z.string().uuid(),
  numero: z.coerce.number().int().positive(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ loteId: string; numero: string }> },
) {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return Response.json({ message: authz.message }, { status: 403 });
  const usuario = await getCurrentUser();
  if (!usuario) return Response.json({ message: "Sesión no válida." }, { status: 401 });
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return Response.json({ message: "Fragmento no válido." }, { status: 400 });

  const cabeceraLongitud = request.headers.get("content-length");
  const longitud = cabeceraLongitud == null ? null : Number(cabeceraLongitud);
  if (longitud != null && (!Number.isFinite(longitud) || longitud <= 0 || longitud > BALANCE_UPLOAD_CHUNK_BYTES)) {
    return Response.json({ message: "El tamaño del fragmento no es válido." }, { status: 413 });
  }
  const contenido = new Uint8Array(await request.arrayBuffer());
  if (contenido.byteLength > BALANCE_UPLOAD_CHUNK_BYTES) {
    return Response.json({ message: "El fragmento supera el límite permitido." }, { status: 413 });
  }
  const resultado = await guardarParteArchivoBalance({
    loteId: parsed.data.loteId,
    usuarioId: usuario.id,
    numero: parsed.data.numero,
    contenido,
  });
  return Response.json(resultado, {
    status: resultado.ok ? 200 : resultado.status,
    headers: { "Cache-Control": "no-store" },
  });
}
