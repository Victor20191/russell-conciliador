import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { parseId } from "@/lib/ids";
import { etiquetaApertura } from "@/lib/balance/apertura-balance";
import { construirComparacionCuentasTerceros, resumirComparacionTerceros } from "@/lib/balance/visor-terceros";
import { construirArbolVisorTerceros } from "@/lib/balance/arbol-visor-terceros";
import { leerIdentidadTercero, completarNombresDelMismoArchivo } from "@/lib/balance/identidad-tercero";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { PREFIJOS_TERCERO_CONSERVADOS, describirGruposTercero } from "@/lib/balance/staging-tercero";
import TercerosClient from "./terceros-client";
import Link from "next/link";

/**
 * Visor interno de SOLO LECTURA: compara el detalle del balance por cuenta (esta
 * versión) contra su balance por tercero LIGADO (mismo `loteId`, ver CLAUDE.md
 * § «Balance por tercero») para verificar que la homologación al plan estándar
 * Russell se replicó correctamente en el detalle por tercero, y que el saldo
 * consolidado de los terceros cuadra con el saldo oficial de cada cuenta.
 *
 * No es una pantalla de carga ni de edición: no toca staging, no persiste nada,
 * no cambia la política de congelado. Mismo gate que `/balance/[id]`.
 */
export default async function BalanceTercerosPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("balance:ver");
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();

  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id },
    select: {
      id: true, clienteId: true, nombreCliente: true, periodo: true, version: true,
      loteId: true, aperturaBalance: true,
    },
  });
  if (!balance) notFound();

  // Alcance por cartera: MISMA verificación que `/balance/[id]` — se exige ANTES
  // de cargar cualquier detalle (fail-closed). Quien no alcanza el cliente no ve
  // ni siquiera si existe un balance por tercero vinculado.
  await requirePermiso("balance:ver", { clientId: balance.clienteId });

  const filasBalanceRaw = await prisma.balancePruebaDetalle.findMany({
    where: { encabezadoId: id },
    select: {
      cuenta8: true, nombreCuenta: true, cuenta6Russell: true,
      saldoInicial: true, debitos: true, creditos: true, saldoFinal: true,
    },
  });

  // Vínculo estricto por loteId — la MISMA llave que usa `capturarBalanceTerceroEnTransaccion`
  // al promover el borrador. Cargues sin loteId (anteriores al esquema) no tienen nada
  // que resolver: no se inventa una correspondencia por cliente/período.
  const encabezadoTercero = balance.loteId
    ? await prisma.balanceTerceroEncabezado.findUnique({
        where: { loteId: balance.loteId, clienteId: balance.clienteId },
        select: { id: true, version: true, archivo: true, filasTotales: true, origenExtraccion: true, creadoEn: true },
      })
    : null;

  const filasTerceroRaw = encabezadoTercero
    ? await prisma.balanceTerceroDetalle.findMany({
        where: { encabezadoId: encabezadoTercero.id },
        select: {
          cuenta8: true, nombreCuenta: true, nitTercero: true, nombreTercero: true, cuenta6Russell: true,
          identidadTercero: true,
          saldoInicial: true, debitos: true, creditos: true, saldoFinal: true,
        },
      })
    : [];

  const tieneDetalleBalance = filasBalanceRaw.length > 0;
  const vinculado = tieneDetalleBalance && encabezadoTercero != null;

  // Motivo por el que NO hay comparación posible, en orden de la causa más básica a
  // la más específica. Nunca se inventa un vínculo: sin evidencia, se reporta incompleto.
  const motivoSinVinculo = !tieneDetalleBalance
    ? "Esta versión del balance no tiene detalle propio cargado. Abre otra versión con detalle para revisar sus terceros."
    : !balance.loteId
      ? "Este cargue antiguo no conserva el vínculo con su detalle por tercero."
      : !encabezadoTercero
        ? "No se encontró un balance por tercero capturado para este cargue. Puede que la apertura declarada no fuera «Por terceros», o que el archivo careciera de detalle recuperable por tercero al promoverlo (ver la bitácora del balance)."
        : null;

  const filasBalance = filasBalanceRaw.map((f) => ({
    cuenta8: f.cuenta8,
    nombreCuenta: f.nombreCuenta,
    cuenta6Russell: f.cuenta6Russell,
    saldoInicial: Number(f.saldoInicial),
    debitos: Number(f.debitos),
    creditos: Number(f.creditos),
    saldoFinal: Number(f.saldoFinal),
  }));
  const filasTercero = completarNombresDelMismoArchivo(filasTerceroRaw.map((f) => ({
    cuenta8: f.cuenta8,
    nombreCuenta: f.nombreCuenta,
    nitTercero: f.nitTercero,
    nombreTercero: f.nombreTercero,
    identidadTercero: leerIdentidadTercero(f.identidadTercero),
    cuenta6Russell: f.cuenta6Russell,
    saldoInicial: Number(f.saldoInicial),
    debitos: Number(f.debitos),
    creditos: Number(f.creditos),
    saldoFinal: Number(f.saldoFinal),
  })));

  const comparaciones = vinculado ? construirComparacionCuentasTerceros(filasBalance, filasTercero, encabezadoTercero?.creadoEn) : [];
  const [estandar, subgrupos] = vinculado ? await Promise.all([
    getCuentasEstandar(),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true, grupo: true, nombreGrupo: true } }),
  ]) : [[], []];
  const arbol = construirArbolVisorTerceros(comparaciones, estandar, {
    nombre4: new Map(subgrupos.map((s) => [s.codigo, s.nombre])),
    nombre2: new Map(subgrupos.map((s) => [s.grupo, s.nombreGrupo])),
  });

  // Grupos de la captura con terceros de verdad (la fila propia de cada cuenta no trae NIT ni nombre)
  // que la regla de hoy no guarda: los guardó una regla anterior (antes del 22/Sep, todas las cuentas;
  // del 22/Sep al 9/Nov, también los ingresos).
  const otrosGruposConTerceros = [...new Set(
    filasTerceroRaw.filter((f) => f.nitTercero || f.nombreTercero).map((f) => f.cuenta8.replace(/\D/g, "").slice(0, 2)),
  )].filter((g) => g.length === 2 && !PREFIJOS_TERCERO_CONSERVADOS.includes(g)).sort((a, b) => Number(a) - Number(b));

  return (
    <div>
      {/* Volver al detalle tiene que verse tanto como «Ver por terceros» en el balance. */}
      <div className="mb-3">
        <Link
          href={`/balance/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-navy-300 bg-navy-50 px-3 py-1.5 text-[12.5px] font-semibold text-navy-800 transition hover:border-navy-600"
        >
          <Icon name="chev-l" size={13} /> Volver al balance
        </Link>
      </div>
      <PageHeader
        title="Balance por terceros"
        subtitle={`${balance.nombreCliente} · ${balance.periodo} · versión ${balance.version} · apertura ${etiquetaApertura(balance.aperturaBalance)}`}
      />

      {/* Siempre a la vista: sin él, una cuenta «Sin desagregar» parece un error del sistema. Si la
          captura es de una regla anterior y trae terceros de otros grupos, se dice cuáles. */}
      <div role="note" className="mb-4 flex items-start gap-3 rounded-lg border border-navy-300 bg-navy-50 px-4 py-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-white">
          <Icon name="users" size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-navy-800">
            El sistema solo guarda y muestra los terceros de las cuentas de los grupos {describirGruposTercero(PREFIJOS_TERCERO_CONSERVADOS)}.
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-700">
            Las demás cuentas se ven con su total y aparecen como «Sin desagregar»: no es un error.
          </p>
          {otrosGruposConTerceros.length > 0 && (
            <p className="mt-1 text-[11.5px] text-ink-500">
              Este balance se cargó con una regla anterior y también trae terceros de los grupos {describirGruposTercero(otrosGruposConTerceros)}.
            </p>
          )}
        </div>
      </div>

      <p className="mb-4 text-[12px] text-ink-500">
        La comparación de saldos finales con los demás balances de la misma fecha de corte está en{" "}
        <Link href={`/balance/${id}#corte`} className="font-medium text-blue-600 hover:underline">Balances del mismo corte</Link>.
      </p>

      {motivoSinVinculo ? (
        <Card>
          <EmptyState icon="info" title="Sin balance por tercero vinculado" description={motivoSinVinculo} />
        </Card>
      ) : (
        <TercerosClient
          arbol={arbol}
          resumen={resumirComparacionTerceros(comparaciones)}
          fuenteTercero={{
            version: encabezadoTercero!.version,
            archivo: encabezadoTercero!.archivo ?? "—",
            filas: encabezadoTercero!.filasTotales,
            origen: encabezadoTercero!.origenExtraccion ?? "—",
          }}
          gruposConTerceros={[...PREFIJOS_TERCERO_CONSERVADOS, ...otrosGruposConTerceros]}
          detalleHref={`/balance/${id}`}
        />
      )}
    </div>
  );
}
