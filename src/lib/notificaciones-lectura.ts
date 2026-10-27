import "server-only";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import {
  clienteDeBalance,
  clienteDeConciliacion,
  clienteDeLoteModulo,
  clienteDeModuloDato,
} from "@/lib/rbac/contexto";

type AlcanceNotificacion = {
  userId: number | null;
  clientId: number | null;
  entityType: string | null;
  entityId: number | null;
};

/** Revalida la cartera actual: recibir un aviso ayer no concede acceso hoy. */
async function puedeLeerNotificacion(n: AlcanceNotificacion, userId: number): Promise<boolean> {
  if (n.userId !== userId) return false;
  let clienteId: number | null;
  switch (n.entityType) {
    case "balance":
      clienteId = n.entityId == null ? n.clientId : await clienteDeBalance(n.entityId);
      break;
    case "conciliaciones":
      clienteId = n.entityId == null ? null : await clienteDeConciliacion(n.entityId);
      break;
    case "modulos_datos":
      clienteId = n.entityId == null ? null : await clienteDeModuloDato(n.entityId);
      break;
    case "modulos_borrador":
      clienteId = n.entityId == null ? null : await clienteDeLoteModulo(n.entityId);
      break;
    case "clientes":
      clienteId = n.entityId;
      break;
    case "dian":
      // DIAN es una plantilla global en el modelo actual, sin cliente asociado.
      return (await authorizePermiso("dian:ver")).ok;
    default:
      return false;
  }
  // No delegar un cliente desconocido al bypass de los roles globales.
  if (!clienteId || !Number.isSafeInteger(clienteId)) return false;
  // El texto fue creado para ese cliente. Mover una entidad no debe trasladar
  // avisos históricos a una cartera distinta, aunque la entidad actual sea visible.
  if (n.clientId !== clienteId) return false;
  if (!(await authorizePermiso(`${n.entityType}:ver`, { clientId: clienteId, modo: "lectura" })).ok) return false;
  if (n.entityType === "modulos_borrador") {
    return (await authorizePermiso("modulos_datos:crear", { clientId: clienteId, modo: "escritura" })).ok;
  }
  return true;
}

export async function listarNotificacionesActuales() {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");
  let cursor: number | undefined;
  const visibles = [];
  // Paginar antes de filtrar evita que avisos cuyo acceso fue revocado oculten
  // los avisos autorizados más antiguos. Cada consulta sigue siendo acotada.
  while (visibles.length < 20) {
    const candidatas = await prisma.notification.findMany({
      where: { userId: session.userId, unread: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true, kind: true, who: true, text: true, target: true,
        createdAt: true, unread: true,
        userId: true, clientId: true, entityType: true, entityId: true,
      },
    });
    for (const n of candidatas) {
      if (!(await puedeLeerNotificacion(n, session.userId))) continue;
      // DTO explícito: ni identificadores internos ni permisos pasan al navegador.
      visibles.push({ id: n.id, kind: n.kind, who: n.who, text: n.text, target: n.target, createdAt: n.createdAt, unread: n.unread });
      if (visibles.length === 20) break;
    }
    if (candidatas.length < 100) break;
    cursor = candidatas[candidatas.length - 1].id;
  }
  return visibles;
}
