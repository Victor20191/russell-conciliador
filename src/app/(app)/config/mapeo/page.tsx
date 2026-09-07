import prisma from "@/lib/prisma";
import { codigosEstandarConBalances } from "@/lib/balance/asociacion";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import type { StdAccount, StdLogRow, Subgrupo } from "@/lib/balance/tipos-mapeo";
import MapeoClient from "./mapeo-client";

export default async function MapeoPage() {
  await requirePermiso("mapeo:ver");
  const canManage = (await authorizePermiso("mapeo:administrar")).ok;

  const [standard, subgruposRows, logs, lockedStdCodes] = await Promise.all([
    prisma.standardAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.subgrupoEstandar.findMany({ orderBy: { codigo: "asc" } }),
    // Bitácora dedicada: solo se carga para quien puede administrar (los más
    // recientes; la tabla conserva el histórico completo + espejo en /auditoria).
    canManage
      ? prisma.standardAccountLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 })
      : Promise.resolve([]),
    // Códigos de cuenta estándar que YA tienen balances asociados (global): el
    // formulario bloquea el campo de código y el borrado de esas cuentas. Solo
    // se calcula para quien administra el plan.
    canManage ? codigosEstandarConBalances() : Promise.resolve<string[]>([]),
  ]);

  const std: StdAccount[] = standard.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    level: s.level,
    nature: s.nature,
    parent: s.parent,
    critical: s.critical,
    russellAccount: s.russellAccount,
    categoryType: s.categoryType,
    includes: s.includes,
    excludes: s.excludes,
    possibleAccounts: s.possibleAccounts,
    supportingDocuments: s.supportingDocuments,
    controlSupports: s.controlSupports,
    mappingNotes: s.mappingNotes,
  }));
  const stdLogs: StdLogRow[] = logs.map((l) => ({
    id: l.id,
    code: l.code,
    action: l.action,
    user: l.user,
    detail: l.detail,
    createdAt: l.createdAt.toISOString(),
  }));
  const subgrupos: Subgrupo[] = subgruposRows.map((s) => ({
    id: s.id, codigo: s.codigo, nombre: s.nombre, grupo: s.grupo, nombreGrupo: s.nombreGrupo, naturaleza: s.naturaleza,
  }));
  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Plan de cuentas estándar de Russell Bedford y su módulo de conciliación. La homologación del PUC de cada cliente se administra en «Mapeo cuentas cliente»." />
      <MapeoClient std={std} subgrupos={subgrupos} canManage={canManage} logs={stdLogs} lockedStdCodes={lockedStdCodes} />
    </div>
  );
}
