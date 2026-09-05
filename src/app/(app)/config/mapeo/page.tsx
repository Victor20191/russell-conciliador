import prisma from "@/lib/prisma";
import { codigosEstandarConBalances } from "@/lib/balance/asociacion";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import MapeoClient, {
  type Account,
  type BalancesCliente,
  type StdAccount,
  type StdLogRow,
  type Subgrupo,
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

  // clienteId del cliente seleccionado + flag de escritura (la action revalida el
  // alcance real).
  const clienteRow = cliente ? balances.find((b) => b.nombreCliente === cliente) ?? null : null;
  const clienteId = clienteRow?.clienteId ?? null;
  const clienteNit = clienteRow?.nit ?? null;
  const [puedeMapear, accounts, standard, subgruposRows, logs, lockedStdCodes, totalBalances, balancesCongelados] = await Promise.all([
    clienteId
      ? authorizePermiso("balance:crear", { clientId: clienteId }).then((result) => result.ok)
      : Promise.resolve(false),
    // PUC COMPLETO del cliente, a todos los niveles que use (acumulado de todas sus
    // cargas: el volcado del PUC nunca borra filas), con su memoria de mapeo. Es la
    // ÚNICA fuente de la pestaña «Mapeo balance/cliente», que edita en cualquier
    // nivel. Antes la vista editable solo cargaba nivel 4/6 y las excepciones ya
    // declaradas, y una auxiliar (8+ dígitos) solo se podía corregir desde un balance
    // que la contuviera —buscándola balance por balance—. Orden por código: cada
    // grupo queda seguido de sus auxiliares (árbol).
    clienteId
      ? prisma.clientAccount.findMany({ where: { clienteId }, orderBy: { code: "asc" } })
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
    // Balances cargados del cliente: lo que «Reaplicar a balances cargados» recorre
    // (los congelados se omiten y se informan).
    clienteId ? prisma.balancePruebaEncabezado.count({ where: { clienteId } }) : Promise.resolve(0),
    clienteId ? prisma.balancePruebaEncabezado.count({ where: { clienteId, estaCongelado: true } }) : Promise.resolve(0),
  ]);

  const acc: Account[] = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    level: a.level,
    name: a.name,
    cuenta6Russell: a.cuenta6Russell,
    coincidencia: a.coincidencia != null ? Number(a.coincidencia) : null,
    origenMapeo: a.origenMapeo,
    actualizadoPor: a.actualizadoPor,
    actualizadoEn: a.actualizadoEn?.toISOString() ?? null,
  }));
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
  const balancesCliente: BalancesCliente = { total: totalBalances, congelados: balancesCongelados };

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} std={std} subgrupos={subgrupos} canManage={canManage} logs={stdLogs} lockedStdCodes={lockedStdCodes} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} balancesCliente={balancesCliente} />
    </div>
  );
}
