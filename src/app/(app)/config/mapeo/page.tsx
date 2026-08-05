import prisma from "@/lib/prisma";
import { codigosEstandarConBalances } from "@/lib/balance/asociacion";
import { ORIGEN_MANUAL_CUENTA } from "@/lib/balance/mapeo-cliente-config";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import MapeoClient, {
  type Account,
  type StdAccount,
  type StdLogRow,
  type Subgrupo,
  type MapeoClienteRow,
} from "./mapeo-client";

export default async function MapeoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requirePermiso("mapeo:ver");
  // El selector ofrece SOLO los clientes de la cartera del usuario; el `cliente`
  // elegido (searchParams) se valida contra esa lista, de modo que no puede
  // consultarse el plan de cuentas de un cliente ajeno por la URL.
  const [sp, alc, administrarAuth] = await Promise.all([
    searchParams,
    alcanceLecturaUsuario(),
    authorizePermiso("mapeo:administrar"),
  ]);
  const canManage = administrarAuth.ok;

  // Estas lecturas globales no dependen del cliente elegido. Se inician antes
  // del selector para solaparlas con la consulta de balances.
  const standardPromise = prisma.standardAccount.findMany({ orderBy: { code: "asc" } });
  const subgruposPromise = prisma.subgrupoEstandar.findMany({ orderBy: { codigo: "asc" } });
  const logsPromise = canManage
    ? prisma.standardAccountLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 })
    : Promise.resolve([]);
  const lockedStdCodesPromise = canManage
    ? codigosEstandarConBalances()
    : Promise.resolve<string[]>([]);

  const balances = await prisma.balancePruebaEncabezado.findMany({
    where: alc.todos ? {} : { clienteId: { in: alc.clientIds } },
    select: { clienteId: true, nombreCliente: true, nit: true },
    distinct: ["clienteId"],
    orderBy: { nombreCliente: "asc" },
  });
  const clientNames = [...new Set(balances.map((b) => b.nombreCliente))];
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");

  // Memoria de mapeo por cliente (pestaña "Mapeo balance/cliente"): clienteId del
  // cliente seleccionado + flag de escritura (la action revalida el alcance real).
  const clienteRow = cliente ? balances.find((b) => b.nombreCliente === cliente) ?? null : null;
  const clienteId = clienteRow?.clienteId ?? null;
  const clienteNit = clienteRow?.nit ?? null;
  const [puedeMapear, accounts, standard, subgruposRows, logs, lockedStdCodes, mapeoRows] = await Promise.all([
    clienteId
      ? authorizePermiso("balance:crear", { clientId: clienteId }).then((result) => result.ok)
      : Promise.resolve(false),
    clienteId
      ? prisma.clientAccount.findMany({
          where: { clienteId },
          orderBy: [{ order: "asc" }, { code: "asc" }],
        })
      : Promise.resolve([]),
    standardPromise,
    subgruposPromise,
    // Bitácora dedicada: solo se carga para quien puede administrar (los más
    // recientes; la tabla conserva el histórico completo + espejo en /auditoria).
    logsPromise,
    // Códigos de cuenta estándar que YA tienen balances asociados (global): el
    // formulario bloquea el campo de código y el borrado de esas cuentas. Solo
    // se calcula para quien administra el plan.
    lockedStdCodesPromise,
    // Memoria de mapeo: las reglas por grupo (nivel 6) + las EXCEPCIONES por
    // cuenta que dejó una homologación con alcance «solo esta cuenta» (nivel 8),
    // para que se puedan revisar y deshacer desde aquí.
    clienteId
      ? prisma.clientAccount.findMany({
          where: {
            clienteId,
            cuenta6Russell: { not: null },
            OR: [{ level: 6 }, { origenMapeo: ORIGEN_MANUAL_CUENTA }],
          },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, level: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoPor: true, actualizadoEn: true },
        })
      : Promise.resolve([]),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, cuenta6Russell: a.cuenta6Russell, coincidencia: a.coincidencia != null ? Number(a.coincidencia) : null, origenMapeo: a.origenMapeo }));
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
  // Memoria de mapeo del cliente seleccionado: cuenta_6 del cliente → cuenta
  // estándar Russell (con su nombre), origen y % de coincidencia.
  const stdNombre = new Map(std.map((s) => [s.code, s.name]));
  const mapeoCliente: MapeoClienteRow[] = mapeoRows.map((r) => ({
    id: r.id,
    cuenta6: r.code,
    nombreCuenta: r.name,
    nivel: r.level,
    cuenta6Russell: r.cuenta6Russell ?? "",
    nombreRussell: r.cuenta6Russell ? (stdNombre.get(r.cuenta6Russell) ?? null) : null,
    coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null,
    origen: r.origenMapeo ?? "automatico",
    actualizadoPor: r.actualizadoPor,
    actualizadoEn: r.actualizadoEn ? r.actualizadoEn.toISOString() : "",
  }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} std={std} subgrupos={subgrupos} canManage={canManage} logs={stdLogs} lockedStdCodes={lockedStdCodes} mapeoCliente={mapeoCliente} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} />
    </div>
  );
}
