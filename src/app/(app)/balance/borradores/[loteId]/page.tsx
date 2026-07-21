import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { BackLink } from "@/components/ui";
import type { FilaBorrador } from "@/lib/balance/borrador";
import { SpecCargaBalanceSchema } from "@/lib/definitions";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import {
  colapsarTerceros,
  esBalancePorTercero,
  esBalancePorTerceroSufijo,
} from "@/lib/balance/terceros";
import BorradorDetailClient from "./borrador-detail-client";

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

type FilaStagingBD = {
  filaNum: number;
  codigo: string;
  codigoCrudo: string;
  nombre: string;
  nivel: number | null;
  tipoFila: string;
  saldoInicial: unknown;
  debitos: unknown;
  creditos: unknown;
  saldoFinal: unknown;
  desacoplada: boolean;
  omitida: boolean | null;
  padreManual: number | null;
};

function lecturaPorTercero(heuristicas: unknown): boolean {
  return (
    heuristicas != null &&
    typeof heuristicas === "object" &&
    !Array.isArray(heuristicas) &&
    (heuristicas as Record<string, unknown>).porTercero === true
  );
}

export default async function BorradorDetailPage({ params }: { params: Promise<{ loteId: string }> }) {
  await requirePermiso("balance:crear");
  const { loteId } = await params;

  // El staging es la fuente del borrador; el encabezado (si existe) solo enriquece
  // la metadata. Los lotes «huérfanos» (sin encabezado) se abren igual. La huella
  // diagnóstica permite reconocer de antemano los archivos abiertos por tercero.
  const [lote, diagnostico] = await Promise.all([
    prisma.balanceImportacionLote.findUnique({ where: { loteId } }),
    prisma.balanceLecturaDiagnostico.findFirst({
      where: { loteId },
      orderBy: { creadoEn: "desc" },
      select: { heuristicas: true },
    }),
  ]);
  const porTerceroDetectado = lecturaPorTercero(diagnostico?.heuristicas);

  // En balances por tercero, las filas NIT/cédula nunca aparecen en el árbol:
  // la cuenta padre ya contiene su total. Filtrarlas en PostgreSQL evita mover y
  // serializar decenas de miles de filas que el cliente descartaría de inmediato.
  // Los formatos con NIT en el sufijo se conservan aquí y se consolidan abajo.
  const filasStaging: FilaStagingBD[] = porTerceroDetectado
    ? await prisma.$queryRaw<FilaStagingBD[]>`
        SELECT
          fila_num AS "filaNum",
          codigo_crudo AS "codigoCrudo",
          codigo,
          nombre,
          nivel,
          tipo_fila AS "tipoFila",
          saldo_inicial AS "saldoInicial",
          debitos,
          creditos,
          saldo_final AS "saldoFinal",
          desacoplada,
          omitida,
          padre_manual AS "padreManual"
        FROM balance_importacion_staging
        WHERE lote_id = ${loteId}
          AND NOT (
            tipo_fila <> 'agrupadora'
            AND (
              (BTRIM(nombre) = codigo AND LENGTH(codigo) >= 5)
              OR (
                codigo !~ '^[0-9]+$'
                AND BTRIM(codigo_crudo) ~ '[0-9]'
                AND BTRIM(codigo_crudo) ~ '^[A-Za-z0-9.\\-]{7,}[[:space:]]+.*[A-Za-zÁÉÍÓÚÑáéíóúñ]'
              )
              OR (
                BTRIM(codigo_crudo) !~ '^[0-9]'
                AND BTRIM(codigo_crudo) ~* 'gen[eé]rico'
              )
            )
          )
        ORDER BY fila_num
      `
    : await prisma.balanceImportacionStaging.findMany({
        where: { loteId },
        orderBy: { filaNum: "asc" },
        select: {
          filaNum: true,
          codigo: true,
          codigoCrudo: true,
          nombre: true,
          nivel: true,
          tipoFila: true,
          saldoInicial: true,
          debitos: true,
          creditos: true,
          saldoFinal: true,
          desacoplada: true,
          omitida: true,
          padreManual: true,
        },
      });
  if (filasStaging.length === 0) notFound();

  // Se inicia mientras se normalizan las filas; para archivos grandes evita
  // esperar a terminar todo el trabajo de CPU antes de consultar la cartera.
  const alcancePromise = alcanceLecturaUsuario();

  // Spec de extracción usado (si se guardó): habilita el editor de estructura en el
  // borrador (re-adjuntando el archivo). Puede faltar (carga por plantilla sin spec).
  const specParsed = lote?.specJson ? SpecCargaBalanceSchema.safeParse(lote.specJson) : null;
  const spec: SpecCarga | null = specParsed?.success ? (specParsed.data as SpecCarga) : null;

  // Filas CRUDAS del staging → al cliente, que recomputa el view-model (árbol +
  // validaciones + hallazgos) y aplica los cambios TEMPORALES antes de guardar.
  // Decimal de Prisma → number.
  const filasCrudas: FilaBorrador[] = filasStaging.map((f) => ({
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
    // TRI-ESTADO durable: null (BD) = «sin tocar» → undefined; true = omitida;
    // false = RESCATADA a mano (el auto-marcado del re-listado la respeta).
    tipoFila: f.tipoFila as FilaBorrador["tipoFila"], desacoplada: f.desacoplada, omitida: f.omitida ?? undefined, padreManual: f.padreManual,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));
  // La misma exclusión de NIT/cédula que antes hacía el navegador se completa
  // en el servidor. Esas filas no eran editables ni visibles. Los formatos con
  // NIT en el sufijo permanecen crudos para conservar idéntica la previsualización
  // de inversiones/reclasificaciones y el cliente los consolida como siempre.
  const porTerceroNit = esBalancePorTercero(filasCrudas);
  const filas = porTerceroNit ? colapsarTerceros(filasCrudas) : filasCrudas;
  const porTerceroSufijo = esBalancePorTerceroSufijo(filas);

  // Clientes de la cartera para el selector de carga + cliente sugerido por NIT.
  const alc = await alcancePromise;
  const filtroIds = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [clientes, notasRows] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    // Notas de carga por cliente (particularidades del formato) para avisar al revisar.
    prisma.ajustesCargaBalance.findMany({
      where: { ...filtroIds, observaciones: { not: null } },
      select: { clienteId: true, observaciones: true },
    }),
  ]);
  const notasPorCliente = new Map(notasRows.map((r) => [r.clienteId, r.observaciones]));
  const core = soloDigitos(lote?.nitDetectado ?? "").slice(0, 9);
  const clientePorNitId = core.length >= 5 ? (clientes.find((c) => soloDigitos(c.nit).slice(0, 9) === core)?.id ?? null) : null;
  // El cliente ya ASIGNADO al lote (al leer por NIT o a mano en la compuerta) manda
  // sobre la re-detección por NIT; debe estar en la cartera visible del usuario.
  const clienteAsignadoId = lote?.clienteId != null && clientes.some((c) => c.id === lote.clienteId) ? lote.clienteId : null;
  const clienteSugeridoId = clienteAsignadoId ?? clientePorNitId;

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance/borradores" label="Volver a borradores" /></div>
      {/* El encabezado lo pinta el cliente: el botón de «filas tachadas» va en su
          misma fila y su contador depende de los cambios en memoria del borrador. */}
      <BorradorDetailClient
        loteId={loteId}
        archivoNombre={lote?.archivoNombre ?? "(sin encabezado)"}
        nitDetectado={lote?.nitDetectado ?? null}
        periodoInicial={lote?.periodoInicial ? fechaCalendarioISO(lote.periodoInicial) : null}
        periodoFinal={lote?.periodoFinal ? fechaCalendarioISO(lote.periodoFinal) : null}
        filas={filas}
        porTerceroDetectado={porTerceroDetectado || porTerceroNit || porTerceroSufijo}
        clientes={clientes.map((c) => ({ id: c.id, name: c.name, nit: c.nit, notas: notasPorCliente.get(c.id) ?? null }))}
        clienteSugeridoId={clienteSugeridoId}
        spec={spec}
        correccionesAplicadas={lote?.correccionesAplicadas ?? 0}
      />
    </div>
  );
}
