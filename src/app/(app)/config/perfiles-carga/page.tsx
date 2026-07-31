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
 * global, así que se listan todos los clientes. El orden es por actividad
 * reciente (último perfil/corrección/preferencia creado o editado primero).
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
      _max: { ultimoUsoEn: true, actualizadoEn: true },
    }),
    prisma.correccionCargaBalance.groupBy({
      by: ["clienteId"],
      _count: { _all: true },
      _max: { actualizadoEn: true },
    }),
    // OJO: la sola existencia de la fila NO significa «preferencias
    // configuradas»: `asegurarPerfilBaseCliente` (balance.ts) crea un perfil
    // base con todo en null en la PRIMERA carga de cada cliente. Solo cuenta si
    // hay algún valor real; `estandar` se ignora porque es fijo (NIF).
    prisma.ajustesCargaBalance.findMany({
      select: {
        clienteId: true,
        hojaPreferida: true,
        convencionCredito: true,
        agregarPorTercero: true,
        imputarSoloHojas: true,
        observaciones: true,
        actualizadoEn: true,
      },
    }),
  ]);

  const perfiles = new Map(perfilesPorCliente.map((p) => [p.clienteId, p]));
  const correcciones = new Map(correccionesPorCliente.map((c) => [c.clienteId, c]));
  const conPreferencias = new Set(
    ajustes
      .filter((a) =>
        a.hojaPreferida != null
        || a.convencionCredito != null
        || a.agregarPorTercero != null
        || a.imputarSoloHojas != null
        || (a.observaciones != null && a.observaciones.trim() !== ""),
      )
      .map((a) => a.clienteId),
  );
  // Fecha más reciente de edición real de preferencias (solo filas con valor).
  const preferenciasActualizadas = new Map(
    ajustes
      .filter((a) => conPreferencias.has(a.clienteId))
      .map((a) => [a.clienteId, a.actualizadoEn] as const),
  );

  /** Ms del evento más reciente (crear/editar perfil, corrección o preferencia). */
  function msActividadReciente(clienteId: number): number {
    const fechas = [
      perfiles.get(clienteId)?._max.actualizadoEn,
      correcciones.get(clienteId)?._max.actualizadoEn,
      preferenciasActualizadas.get(clienteId),
    ].filter((d): d is Date => d instanceof Date);
    if (fechas.length === 0) return 0;
    return Math.max(...fechas.map((d) => d.getTime()));
  }

  const rows: ClienteMemoriaRow[] = clientes
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      nit: c.nit,
      erpName: c.erp?.name ?? null,
      perfiles: perfiles.get(c.id)?._count._all ?? 0,
      ultimoUso: perfiles.get(c.id)?._max.ultimoUsoEn?.toISOString() ?? null,
      correcciones: correcciones.get(c.id)?._count._all ?? 0,
      tienePreferencias: conPreferencias.has(c.id),
      // Interno al sort; no se envía al cliente (se omite abajo).
      _actividadMs: msActividadReciente(c.id),
    }))
    // Más reciente primero; desempate alfabético por razón social.
    .sort((a, b) => b._actividadMs - a._actividadMs || a.name.localeCompare(b.name, "es"))
    .map(({ _actividadMs: _, ...row }) => row);

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
