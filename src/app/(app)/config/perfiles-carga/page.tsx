import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import PerfilesCargaClient, { type ClienteMemoriaRow } from "./perfiles-carga-client";

/**
 * Configuración › Perfiles de carga — administración CENTRAL de la memoria de
 * lectura de balances (formatos por huella, correcciones por cuenta y
 * preferencias por cliente).
 *
 * Es parametrización técnica de la plataforma: sale de la ficha del cliente y de
 * las pantallas de balance y vive aquí, tras `perfiles_carga:administrar`
 * (Administrador y Superadministrador). Los administradores tienen alcance
 * global, así que se listan todos los clientes.
 */
export default async function PerfilesCargaPage() {
  await requirePermiso("perfiles_carga:administrar");

  const [clientes, perfilesPorCliente, correccionesPorCliente, ajustes] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, nit: true, erp: { select: { name: true } } },
    }),
    prisma.perfilCargaBalance.groupBy({
      by: ["clienteId"],
      _count: { _all: true },
      _max: { ultimoUsoEn: true },
    }),
    prisma.correccionCargaBalance.groupBy({
      by: ["clienteId"],
      _count: { _all: true },
    }),
    prisma.ajustesCargaBalance.findMany({ select: { clienteId: true } }),
  ]);

  const perfiles = new Map(perfilesPorCliente.map((p) => [p.clienteId, p]));
  const correcciones = new Map(correccionesPorCliente.map((c) => [c.clienteId, c._count._all]));
  const conPreferencias = new Set(ajustes.map((a) => a.clienteId));

  const rows: ClienteMemoriaRow[] = clientes.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    nit: c.nit,
    erpName: c.erp?.name ?? null,
    perfiles: perfiles.get(c.id)?._count._all ?? 0,
    ultimoUso: perfiles.get(c.id)?._max.ultimoUsoEn?.toISOString() ?? null,
    correcciones: correcciones.get(c.id) ?? 0,
    tienePreferencias: conPreferencias.has(c.id),
  }));

  return (
    <div>
      <PageHeader
        title="Perfiles de carga de balances"
        subtitle="Cómo lee la plataforma el archivo de cada cliente: formatos memorizados, correcciones por cuenta y preferencias de carga."
      />
      <PerfilesCargaClient clients={rows} />
    </div>
  );
}
