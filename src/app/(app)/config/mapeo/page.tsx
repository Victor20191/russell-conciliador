import prisma from "@/lib/prisma";
import { codigosEstandarConBalances } from "@/lib/balance/asociacion";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario, getMatriz } from "@/lib/rbac/contexto";
import { tienePermiso } from "@/lib/rbac/permisos";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader } from "@/components/ui";
import MapeoClient, {
  type Account,
  type RussellOpt,
  type StdAccount,
  type StdLogRow,
  type Subgrupo,
  type MapeoClienteRow,
} from "./mapeo-client";

export default async function MapeoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requirePermiso("mapeo:ver");
  const sp = await searchParams;
  // El selector ofrece SOLO los clientes de la cartera del usuario; el `cliente`
  // elegido (searchParams) se valida contra esa lista, de modo que no puede
  // consultarse el plan de cuentas de un cliente ajeno por la URL.
  const alc = await alcanceLecturaUsuario();
  const balances = await prisma.balancePruebaEncabezado.findMany({
    where: alc.todos ? {} : { clienteId: { in: alc.clientIds } },
    select: { clienteId: true, nombreCliente: true },
    distinct: ["clienteId"],
    orderBy: { nombreCliente: "asc" },
  });
  const clientNames = [...new Set(balances.map((b) => b.nombreCliente))];
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");

  // Solo el Administrador parametriza el plan estándar (gate `mapeo:administrar`).
  // El flag controla la UI; la autoridad real sigue siendo el gate de la action.
  const user = await getCurrentUser();
  const matriz = await getMatriz();
  const canManage = user ? tienePermiso(matriz, user.role, "mapeo:administrar") : false;
  // Memoria de mapeo por cliente (pestaña "Mapeo balance/cliente"): clienteId del
  // cliente seleccionado + flag de escritura (la action revalida el alcance real).
  const clienteMatches = cliente
    ? await prisma.client.findMany({ where: { name: cliente }, select: { id: true }, take: 2 })
    : [];
  const clienteId =
    clienteMatches.length === 1 &&
    balances.some((b) => b.clienteId === clienteMatches[0].id)
      ? clienteMatches[0].id
      : null;
  const puedeMapear = clienteId
    ? (await authorizePermiso("balance:crear", { clientId: clienteId })).ok
    : false;

  const [accounts, options, standard, subgruposRows, logs, lockedStdCodes, mapeoRows] = await Promise.all([
    clienteId
      ? prisma.clientAccount.findMany({
          where: { clientName: cliente },
          include: { russellOption: { select: { code: true } } },
          orderBy: { order: "asc" },
        })
      : Promise.resolve([]),
    prisma.russellOption.findMany({ orderBy: { code: "asc" } }),
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
    clienteId ? prisma.mapeoBalanceCliente.findMany({ where: { clienteId }, orderBy: { cuenta6: "asc" } }) : Promise.resolve([]),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, russellCode: a.russellOption?.code ?? null }));
  const opts: RussellOpt[] = options.map((o) => ({ code: o.code, name: o.name, module: o.module }));
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
    cuenta6: r.cuenta6,
    cuenta6Russell: r.cuenta6Russell,
    nombreRussell: stdNombre.get(r.cuenta6Russell) ?? null,
    coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null,
    origen: r.origen,
    actualizadoPor: r.actualizadoPor,
    actualizadoEn: r.actualizadoEn.toISOString(),
  }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} options={opts} std={std} subgrupos={subgrupos} canManage={canManage} logs={stdLogs} lockedStdCodes={lockedStdCodes} mapeoCliente={mapeoCliente} clienteId={clienteId} puedeMapear={puedeMapear} />
    </div>
  );
}
