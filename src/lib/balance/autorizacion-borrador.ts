import "server-only";

import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { verifySession } from "@/lib/dal";
import {
  alcanceLecturaUsuario,
  type AlcanceLectura,
} from "@/lib/rbac/contexto";
import { nucleoNit } from "@/lib/nit";

export type ReferenciaAccesoBorrador = {
  clienteId: number | null;
  cargadoPorId: number | null;
};

export type ContextoAccesoBorrador = {
  usuarioId: number;
  alcance: AlcanceLectura;
};

export type ClienteReferenciaBorrador = {
  id: number;
  name: string;
  nit: string;
};

export type VinculoClienteBorrador =
  | {
      tipo: "asignado";
      id: number;
      nombre: string | null;
      nit: string | null;
    }
  | {
      tipo: "sugerido";
      id: number;
      nombre: string;
      nit: string;
    }
  | {
      tipo: "sin_cliente";
    };

/**
 * Contexto del usuario actual para lecturas y acciones sobre borradores.
 * `alcance.todos` es la única vía global; para el resto manda la cartera.
 */
export const contextoAccesoBorradorActual = cache(
  async (): Promise<ContextoAccesoBorrador> => {
    const [sesion, alcance] = await Promise.all([
      verifySession(),
      alcanceLecturaUsuario(),
    ]);
    return { usuarioId: sesion.userId, alcance };
  },
);

/**
 * Un borrador asignado pertenece al alcance de su cliente. Si todavía no tiene
 * cliente, solo lo ve un usuario global o quien lo cargó. El NIT detectado y su
 * posible sugerencia NO conceden acceso.
 */
export function puedeVerBorrador(
  borrador: ReferenciaAccesoBorrador,
  contexto: ContextoAccesoBorrador,
): boolean {
  if (borrador.clienteId != null) {
    return (
      contexto.alcance.todos
      || contexto.alcance.clientIds.includes(borrador.clienteId)
    );
  }
  return (
    contexto.alcance.todos
    || borrador.cargadoPorId === contexto.usuarioId
  );
}

/** Filtro equivalente para resolver la visibilidad directamente en PostgreSQL. */
export function filtroLotesVisibles(
  contexto: ContextoAccesoBorrador,
): Prisma.BalanceImportacionLoteWhereInput {
  if (contexto.alcance.todos) return {};
  return {
    OR: [
      { clienteId: { in: contexto.alcance.clientIds } },
      { clienteId: null, cargadoPorId: contexto.usuarioId },
    ],
  };
}

/**
 * Resuelve cómo debe presentarse el cliente sin mezclar estados:
 * - `asignado`: `clienteId` está persistido en el lote;
 * - `sugerido`: el lote sigue sin cliente y hay una única coincidencia por NIT;
 * - `sin_cliente`: no existe una coincidencia inequívoca.
 */
export function resolverVinculoClienteBorrador(
  lote: { clienteId: number | null; nitDetectado: string | null },
  clientes: readonly ClienteReferenciaBorrador[],
): VinculoClienteBorrador {
  if (lote.clienteId != null) {
    const cliente = clientes.find((c) => c.id === lote.clienteId);
    return {
      tipo: "asignado",
      id: lote.clienteId,
      nombre: cliente?.name ?? null,
      nit: cliente?.nit ?? null,
    };
  }

  const nucleoDetectado = nucleoNit(lote.nitDetectado ?? "");
  if (nucleoDetectado.length < 5) return { tipo: "sin_cliente" };

  const coincidencias = clientes.filter(
    (cliente) => nucleoNit(cliente.nit) === nucleoDetectado,
  );
  if (coincidencias.length !== 1) return { tipo: "sin_cliente" };

  return {
    tipo: "sugerido",
    id: coincidencias[0].id,
    nombre: coincidencias[0].name,
    nit: coincidencias[0].nit,
  };
}
