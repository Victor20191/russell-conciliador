import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader, BackLink, Card, EmptyState } from "@/components/ui";
import { parseId } from "@/lib/ids";
import { etiquetaApertura } from "@/lib/balance/apertura-balance";
import { construirComparacionCuentasTerceros, resumirComparacionTerceros } from "@/lib/balance/visor-terceros";
import { construirArbolVisorTerceros } from "@/lib/balance/arbol-visor-terceros";
import { leerIdentidadTercero, completarNombresDelMismoArchivo } from "@/lib/balance/identidad-tercero";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import TercerosClient from "./terceros-client";

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
        select: { id: true, version: true, archivo: true, filasTotales: true, origenExtraccion: true },
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

  const comparaciones = vinculado ? construirComparacionCuentasTerceros(filasBalance, filasTercero) : [];
  const [estandar, subgrupos] = vinculado ? await Promise.all([
    getCuentasEstandar(),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true, grupo: true, nombreGrupo: true } }),
  ]) : [[], []];
  const arbol = construirArbolVisorTerceros(comparaciones, estandar, {
    nombre4: new Map(subgrupos.map((s) => [s.codigo, s.nombre])),
    nombre2: new Map(subgrupos.map((s) => [s.grupo, s.nombreGrupo])),
  });

  return (
    <div>
      <div className="mb-3"><BackLink href={`/balance/${id}`} label="Volver al balance" /></div>
      <PageHeader
        title="Balance por terceros"
        subtitle={`${balance.nombreCliente} · ${balance.periodo} · versión ${balance.version} · apertura ${etiquetaApertura(balance.aperturaBalance)}`}
      />

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
        />
      )}
    </div>
  );
}
