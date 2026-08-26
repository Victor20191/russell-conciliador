import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { fmtDate, fmtHora12 } from "@/lib/format";
import TercerosIndexClient, { type CargueTerceroRow } from "./terceros-index-client";

/**
 * Listado de los BALANCES ABIERTOS POR TERCERO (`balance_tercero_encabezado`).
 *
 * Cargue AISLADO del balance normal: no pasa por borradores ni aparece en
 * `/balance`, así que sin esta pantalla la información quedaba invisible. Los
 * conteos de terceros y cuentas se agregan en PostgreSQL —un cargue trae
 * decenas de miles de filas y el listado solo necesita los totales—.
 */
export default async function BalancesPorTerceroPage() {
  await requirePermiso("balance:ver");

  const [alc, eliminarAuth] = await Promise.all([
    alcanceLecturaUsuario(),
    authorizePermiso("balance:eliminar"),
  ]);
  const whereCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };

  const encabezados = await prisma.balanceTerceroEncabezado.findMany({
    where: whereCliente,
    orderBy: [{ ultimaCarga: "desc" }, { id: "desc" }],
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      nit: true,
      periodo: true,
      periodoInicio: true,
      periodoFin: true,
      version: true,
      esOficial: true,
      archivo: true,
      tamanoArchivo: true,
      filasTotales: true,
      cargadoPor: true,
      ultimaCarga: true,
      creadoEn: true,
    },
  });

  // Un solo viaje para todos los agregados del listado: terceros y cuentas
  // ÚNICOS y el saldo final por cargue. `count(distinct …)` no existe en el
  // groupBy de Prisma, de ahí el SQL crudo (parametrizado por los ids visibles).
  const ids = encabezados.map((e) => e.id);
  const agregados = ids.length
    ? await prisma.$queryRaw<
        { encabezado_id: number; terceros: bigint; cuentas: bigint; saldo_final: Prisma.Decimal | null }[]
      >`
        SELECT encabezado_id,
               COUNT(DISTINCT nit_tercero) AS terceros,
               COUNT(DISTINCT cuenta_8)    AS cuentas,
               SUM(saldo_final)            AS saldo_final
          FROM balance_tercero_detalle
         WHERE encabezado_id IN (${Prisma.join(ids)})
         GROUP BY encabezado_id
      `
    : [];
  const agregadoPorId = new Map(
    agregados.map((a) => [
      Number(a.encabezado_id),
      { terceros: Number(a.terceros), cuentas: Number(a.cuentas), saldoFinal: Number(a.saldo_final ?? 0) },
    ]),
  );

  // Versiones por (cliente, período): el mismo archivo recargado suma una versión.
  const versionesPorPeriodo = new Map<string, number>();
  for (const e of encabezados) {
    const clave = `${e.clienteId}|${e.periodo}`;
    versionesPorPeriodo.set(clave, (versionesPorPeriodo.get(clave) ?? 0) + 1);
  }

  const filas: CargueTerceroRow[] = encabezados.map((e) => {
    const agg = agregadoPorId.get(e.id) ?? { terceros: 0, cuentas: 0, saldoFinal: 0 };
    return {
      id: e.id,
      clienteId: e.clienteId,
      clienteNombre: e.nombreCliente,
      clienteNit: e.nit,
      periodo: e.periodo,
      version: e.version,
      versionesPeriodo: versionesPorPeriodo.get(`${e.clienteId}|${e.periodo}`) ?? 1,
      esOficial: e.esOficial,
      archivo: e.archivo,
      tamanoArchivo: e.tamanoArchivo,
      filas: e.filasTotales,
      terceros: agg.terceros,
      cuentas: agg.cuentas,
      saldoFinal: agg.saldoFinal,
      cargadoPor: e.cargadoPor,
      fecha: fmtDate((e.ultimaCarga ?? e.creadoEn).toISOString()),
      hora: fmtHora12((e.ultimaCarga ?? e.creadoEn).toISOString()),
      ordenFecha: (e.ultimaCarga ?? e.creadoEn).toISOString(),
    };
  });

  return (
    <div>
      <PageHeader
        title="Balance por tercero"
        subtitle="Cargues del balance abierto por tercero (CxC/CxP). Conservan el NIT de cada tercero y solo las cuentas de cartera; son la contraparte contable del cruce por tercero de los módulos de Cartera y Cuentas por pagar."
      />
      <TercerosIndexClient filas={filas} puedeEliminar={eliminarAuth.ok} />
    </div>
  );
}
