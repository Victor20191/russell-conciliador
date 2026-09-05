import prisma from "@/lib/prisma";
import { codigosEstandarConBalances } from "@/lib/balance/asociacion";
import { leerProcedenciaMapeo } from "@/lib/balance/procedencia-mapeo";
import { completarJerarquiaCliente, consolidarPucCliente } from "@/lib/balance/catalogo-puc-cliente";
import { Prisma } from "@/generated/prisma/client";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import MapeoClient, {
  type Account,
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

  // Memoria de mapeo por cliente (pestaña "Mapeo balance/cliente"): clienteId del
  // cliente seleccionado + flag de escritura (la action revalida el alcance real).
  const clienteRow = cliente ? balances.find((b) => b.nombreCliente === cliente) ?? null : null;
  const clienteId = clienteRow?.clienteId ?? null;
  const clienteNit = clienteRow?.nit ?? null;
  const [puedeMapear, accounts, standard, subgruposRows, logs, lockedStdCodes, historicas, originales] = await Promise.all([
    clienteId
      ? authorizePermiso("balance:crear", { clientId: clienteId }).then((result) => result.ok)
      : Promise.resolve(false),
    clienteId
      ? prisma.clientAccount.findMany({
          where: { clienteId },
          orderBy: [{ order: "asc" }, { code: "asc" }],
          select: { id: true, code: true, name: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoPor: true, actualizadoEn: true, procedenciaMapeo: true },
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
    // Incluye códigos de cargas históricas que aún no estén en la memoria. La
    // deduplicación se hace en PostgreSQL, sin traer todas las filas al proceso.
    clienteId
      ? prisma.$queryRaw<Array<{ id: number; code: string; name: string; cuenta6Russell: string | null; coincidencia: Prisma.Decimal | null; actualizadoEn: Date; balanceId: number; periodo: string; version: string }>>(Prisma.sql`
          SELECT DISTINCT ON (d.cuenta_8)
            d.id, d.cuenta_8 AS code, d.nombre_cuenta AS name,
            d.cuenta_6_russell AS "cuenta6Russell",
            d.porcentaje_coincidencia AS coincidencia, d.editado_en AS "actualizadoEn",
            e.id AS "balanceId", e.periodo, e.version
          FROM balance_prueba_detalle d
          JOIN balance_prueba_encabezado e ON e.id = d.encabezado_id
          WHERE e.cliente_id = ${clienteId}
          ORDER BY d.cuenta_8, e.creado_en DESC, e.id DESC, d.id DESC
        `)
      : Promise.resolve([]),
    clienteId
      ? prisma.$queryRaw<Array<{ id: number; code: string; name: string; periodo: string; version: string }>>(Prisma.sql`
          SELECT DISTINCT ON (cuenta->>'codigo') e.id, cuenta->>'codigo' AS code,
            cuenta->>'nombre' AS name, e.periodo, e.version
          FROM balance_prueba_encabezado e
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(e.puc_cliente) = 'array' THEN e.puc_cliente ELSE '[]'::jsonb END
          ) cuenta
          WHERE e.cliente_id = ${clienteId}
          ORDER BY cuenta->>'codigo', e.creado_en DESC, e.id DESC
        `)
      : Promise.resolve([]),
  ]);

  const acc: Account[] = completarJerarquiaCliente(consolidarPucCliente(
    accounts.map(({ procedenciaMapeo, ...a }) => ({ ...a, procedencia: leerProcedenciaMapeo(procedenciaMapeo), coincidencia: a.coincidencia != null ? Number(a.coincidencia) : null, actualizadoEn: a.actualizadoEn?.toISOString() ?? null })),
    historicas.map((a) => ({ ...a, procedencia: { fuente: "historico" as const, balance_id: a.balanceId, periodo: a.periodo, version: a.version }, coincidencia: a.coincidencia != null ? Number(a.coincidencia) : null, actualizadoEn: a.actualizadoEn.toISOString(), origenMapeo: null, actualizadoPor: null })),
    originales.map((a) => ({ ...a, cuenta6Russell: null, coincidencia: null, origenMapeo: null, actualizadoPor: null, actualizadoEn: null, procedencia: { fuente: "historico" as const, balance_id: a.id, periodo: a.periodo, version: a.version } })),
  ));
  const idsOrigen = [...new Set(acc.flatMap((a) => a.procedencia?.balance_id ? [a.procedencia.balance_id] : []))];
  const origenes = clienteId && idsOrigen.length ? await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId, id: { in: idsOrigen } }, select: { id: true, periodo: true, version: true },
  }) : [];
  const porOrigen = new Map(origenes.map((o) => [o.id, o]));
  for (const a of acc) {
    if (!a.procedencia?.balance_id) continue;
    const origen = porOrigen.get(a.procedencia.balance_id);
    a.balanceDisponible = !!origen;
    if (origen) a.procedencia = { ...a.procedencia, periodo: origen.periodo, version: origen.version };
  }

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
      <PageHeader title="Mapeo plan estándar" subtitle="Configuración de las cuentas del PUC del cliente contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient key={clienteId} clientNames={clientNames} cliente={cliente} accounts={acc} std={std} subgrupos={subgrupos} canManage={canManage} logs={stdLogs} lockedStdCodes={lockedStdCodes} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} />
    </div>
  );
}
