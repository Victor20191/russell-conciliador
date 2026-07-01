import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, BackLink } from "@/components/ui";
import { calcularBalance, construirValidacionContable, type CuentaCruda } from "@/lib/balance/calcular";
import { marcarSubtotalesDuplicados, reclasificarRepetidos } from "@/lib/balance/extraccion/transformar";
import { construirArbolBorrador, type FilaBorrador } from "@/lib/balance/borrador";
import BorradorDetailClient from "./borrador-detail-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export default async function BorradorDetailPage({ params }: { params: Promise<{ loteId: string }> }) {
  await requirePermiso("balance:crear");
  const { loteId } = await params;

  // El staging es la fuente del borrador; el encabezado (si existe) solo enriquece
  // la metadata. Los lotes «huérfanos» (sin encabezado) se abren igual.
  const [lote, filasStaging] = await Promise.all([
    prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
    prisma.balanceImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } }),
  ]);
  if (filasStaging.length === 0) notFound();

  // Filas crudas → árbol (sin homologación). Decimal de Prisma → number.
  const filas: FilaBorrador[] = filasStaging.map((f) => ({
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
    tipoFila: f.tipoFila as FilaBorrador["tipoFila"],
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));
  // Reclasifica códigos repetidos (encabezado+movimiento) antes de derivar el
  // conjunto imputable y el árbol (muta `tipoFila` de `filas`).
  reclasificarRepetidos(filas);
  const arbol = construirArbolBorrador(filas);

  // Validación contable (mismas tarjetas del borrador del modal): movimiento →
  // calcularBalance (consolida por código) vs totales del archivo (clase 1/2/3).
  const movimiento = filas.filter((f) => f.tipoFila === "movimiento");
  const dupSubtotales = marcarSubtotalesDuplicados(movimiento);
  const importReady: CuentaCruda[] = movimiento
    .filter((f) => !dupSubtotales.has(f))
    .map((f) => ({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos }));
  const calc = calcularBalance(importReady, []);
  const totalArchivo = (clase: string) => {
    const fs = filas.filter((f) => f.codigo === clase);
    return fs.length > 0 ? fs.reduce((s, f) => s + f.saldoFinal, 0) : null;
  };
  // Costos del archivo = clase 6 (costo de ventas) + clase 7 (costo de producción).
  const costosArchivo = [totalArchivo("6"), totalArchivo("7")].filter((v): v is number => v != null);
  const validacion = construirValidacionContable(calc, {
    activo: totalArchivo("1"), pasivo: totalArchivo("2"), patrimonio: totalArchivo("3"),
    ingresos: totalArchivo("4"), gastos: totalArchivo("5"),
    costos: costosArchivo.length > 0 ? costosArchivo.reduce((s, v) => s + v, 0) : null,
  });
  // Partida doble (débitos = créditos) del movimiento, con el margen ±$1000. Se
  // toman los totales que USA `diffMov` (detalle ya depurado por `calcularBalance`),
  // no la suma cruda de `importReady`: así débitos − créditos = la diferencia mostrada.
  const partidaDoble = {
    debitos: calc.totalDebe,
    creditos: calc.totalHaber,
    diff: calc.diffMov,
    cuadra: calc.movimientosCuadran,
  };

  // Clientes de la cartera para el selector de carga + cliente sugerido por NIT.
  const alc = await alcanceLecturaUsuario();
  const clientes = await prisma.client.findMany({
    where: alc.todos ? {} : { id: { in: alc.clientIds } },
    select: { id: true, name: true, nit: true },
    orderBy: { name: "asc" },
  });
  const core = soloDigitos(lote?.nitDetectado ?? "").slice(0, 9);
  const clienteSugeridoId = core.length >= 5 ? (clientes.find((c) => soloDigitos(c.nit).slice(0, 9) === core)?.id ?? null) : null;

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance/borradores" label="Volver a borradores" /></div>
      <PageHeader
        title={`Borrador · ${lote?.archivoNombre ?? "(sin encabezado)"}`}
        subtitle="Estructura CRUDA extraída del Excel (sin homologación). Las agrupadoras cuyo total ≠ suma de sus hijos aparecen subrayadas: ahí está el descuadre."
      />
      <BorradorDetailClient
        loteId={loteId}
        archivoNombre={lote?.archivoNombre ?? "(sin encabezado)"}
        nitDetectado={lote?.nitDetectado ?? null}
        periodoInicial={lote?.periodoInicial ?? null}
        periodoFinal={lote?.periodoFinal ?? null}
        arbol={arbol}
        validacion={validacion}
        partidaDoble={partidaDoble}
        clientes={clientes.map((c) => ({ id: c.id, name: c.name, nit: c.nit }))}
        clienteSugeridoId={clienteSugeridoId}
      />
    </div>
  );
}
