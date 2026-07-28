// Lectura CACHEADA del staging de un lote de borrador (encabezado aparte: ese se
// lee fresco). Releer decenas de miles de filas de la BD remota en cada visita a
// la página del borrador es lo más caro del render; el staging solo cambia en un
// puñado de acciones conocidas (guardar cambios, re-aplicar correcciones,
// reprocesar, promover, descartar), que invalidan el tag del lote con
// `invalidarStagingBorrador`. `revalidate` acota además cualquier desfase a 5
// minutos como cinturón de seguridad. Los datos devueltos son IDÉNTICOS a la
// lectura directa — el caché solo evita repetir el trabajo.
//
// Nota (Vercel): el Data Cache limita el tamaño por entrada; un lote gigantesco
// puede exceder el límite y simplemente no cachearse (Next lo omite con warning y
// la página sigue leyendo de BD). Los lotes típicos sí se benefician.
import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import type { FilaBorrador } from "./borrador";
import { colapsarTerceros, esBalancePorTercero, esBalancePorTerceroSufijo } from "./terceros";
import { compactarFilas, type FilasCompactas } from "./filas-compactas";

const tagStagingBorrador = (loteId: string) => `borrador-staging:${loteId}`;

/**
 * Invalida la lectura cacheada del staging de un lote (llamar tras CUALQUIER
 * escritura). `updateTag` expira AL INSTANTE (read-your-own-writes): el refresh
 * que sigue a «Guardar cambios» debe ver el staging nuevo, nunca el cacheado.
 * Best-effort: solo existe dentro de una Server Action; si algún día se llamara
 * fuera, el `revalidate` de la lectura acota el desfase y la operación no se cae.
 */
export function invalidarStagingBorrador(loteId: string): void {
  try {
    updateTag(tagStagingBorrador(loteId));
  } catch {
    /* best-effort */
  }
}

type FilaStagingBD = {
  filaNum: number;
  codigo: string;
  codigoCrudo: string;
  nombre: string;
  nivel: number | null;
  tipoFila: string;
  tipoFilaForzado: string | null;
  saldoInicial: unknown;
  debitos: unknown;
  creditos: unknown;
  saldoFinal: unknown;
  desacoplada: boolean;
  omitida: boolean | null;
  padreManual: number | null;
  justificacionReubicacion: string | null;
  reubicacionRevisadaPor: string | null;
  reubicacionRevisadaPorId: number | null;
  reubicacionRevisadaEn: Date | null;
};

function lecturaPorTercero(heuristicas: unknown): boolean {
  return (
    heuristicas != null &&
    typeof heuristicas === "object" &&
    !Array.isArray(heuristicas) &&
    (heuristicas as Record<string, unknown>).porTercero === true
  );
}

export type StagingBorrador = {
  /** Filas del borrador COMPACTAS (diccionario + tuplas), con los terceros NIT ya
   *  colapsados si aplica. Van tal cual al cliente, que las expande — así el Data
   *  Cache guarda la forma pequeña y la compactación corre una vez, no por visita. */
  filasCompactas: FilasCompactas;
  /** El archivo viene abierto por tercero (heurística de lectura ∪ NIT ∪ sufijo). */
  porTercero: boolean;
  /** Solo las pocas reubicaciones que ya fueron revisadas; viajan separadas para no
   *  engordar cada tupla del balance con cuatro campos casi siempre nulos. */
  revisionesReubicacion: RevisionReubicacionStaging[];
};

export type RevisionReubicacionStaging = {
  filaNum: number;
  justificacion: string;
  revisadaPor: string | null;
  revisadaPorId: number | null;
  revisadaEn: string;
};

async function leerStagingBorrador(loteId: string): Promise<StagingBorrador | null> {
  // La huella diagnóstica permite reconocer de antemano los archivos abiertos por
  // tercero y filtrar las filas NIT/cédula EN PostgreSQL: evita mover y serializar
  // decenas de miles de filas que se descartarían de inmediato. Los formatos con
  // NIT en el sufijo se conservan crudos y los consolida el cliente (idéntica
  // previsualización de inversiones/reclasificaciones).
  const diagnostico = await prisma.balanceLecturaDiagnostico.findFirst({
    where: { loteId },
    orderBy: { creadoEn: "desc" },
    select: { heuristicas: true },
  });
  const porTerceroDetectado = lecturaPorTercero(diagnostico?.heuristicas);

  const filasStaging: FilaStagingBD[] = porTerceroDetectado
    ? await prisma.$queryRaw<FilaStagingBD[]>`
        SELECT
          fila_num AS "filaNum",
          codigo_crudo AS "codigoCrudo",
          codigo,
          nombre,
          nivel,
          tipo_fila AS "tipoFila",
          tipo_fila_forzado AS "tipoFilaForzado",
          saldo_inicial AS "saldoInicial",
          debitos,
          creditos,
          saldo_final AS "saldoFinal",
          desacoplada,
          omitida,
          padre_manual AS "padreManual",
          justificacion_reubicacion AS "justificacionReubicacion",
          reubicacion_revisada_por AS "reubicacionRevisadaPor",
          reubicacion_revisada_por_id AS "reubicacionRevisadaPorId",
          reubicacion_revisada_en AS "reubicacionRevisadaEn"
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
          tipoFilaForzado: true,
          saldoInicial: true,
          debitos: true,
          creditos: true,
          saldoFinal: true,
          desacoplada: true,
          omitida: true,
          padreManual: true,
          justificacionReubicacion: true,
          reubicacionRevisadaPor: true,
          reubicacionRevisadaPorId: true,
          reubicacionRevisadaEn: true,
        },
      });
  if (filasStaging.length === 0) return null;

  // Filas CRUDAS del staging → view-model en el cliente. Decimal de Prisma → number.
  const filasCrudas: FilaBorrador[] = filasStaging.map((f) => ({
    filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
    // TRI-ESTADO durable: null (BD) = «sin tocar» → undefined; true = omitida;
    // false = RESCATADA a mano (el auto-marcado del re-listado la respeta).
    tipoFila: f.tipoFila as FilaBorrador["tipoFila"],
    tipoFilaForzado: f.tipoFilaForzado === "agrupadora" || f.tipoFilaForzado === "movimiento" ? f.tipoFilaForzado : null,
    desacoplada: f.desacoplada, omitida: f.omitida ?? undefined, padreManual: f.padreManual,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));
  // La misma exclusión de NIT/cédula que antes hacía el navegador, completada en el
  // servidor. Esas filas no eran editables ni visibles.
  const porTerceroNit = esBalancePorTercero(filasCrudas);
  const filas = porTerceroNit ? colapsarTerceros(filasCrudas) : filasCrudas;
  const porTerceroSufijo = esBalancePorTerceroSufijo(filas);
  const revisionesReubicacion = filasStaging.flatMap<RevisionReubicacionStaging>((f) =>
    f.justificacionReubicacion && f.reubicacionRevisadaEn
      ? [{
          filaNum: f.filaNum,
          justificacion: f.justificacionReubicacion,
          revisadaPor: f.reubicacionRevisadaPor,
          revisadaPorId: f.reubicacionRevisadaPorId,
          revisadaEn: f.reubicacionRevisadaEn.toISOString(),
        }]
      : [],
  );

  return {
    filasCompactas: compactarFilas(filas),
    porTercero: porTerceroDetectado || porTerceroNit || porTerceroSufijo,
    revisionesReubicacion,
  };
}

// El Data Cache rechaza entradas de más de 2 MB (con un unhandledRejection en cada
// visita). La forma compacta de 20k filas queda muy por debajo del límite; un lote
// mayor (balance por tercero gigante) se lee directo de BD, sin caché.
const MAX_FILAS_CACHE = 20_000;

/**
 * Staging del lote para la página del borrador, cacheado por lote (Data Cache,
 * tag `borrador-staging:<loteId>`) cuando su tamaño lo permite. `null` si el lote
 * no tiene filas — decidido con un COUNT previo, fuera del caché, para no dejar
 * un «404» cacheado si el staging aún no existía. El JSON del caché conserva el
 * tri-estado `omitida` de la forma compacta (0/1/2).
 */
export async function stagingBorradorLote(loteId: string): Promise<StagingBorrador | null> {
  const total = await prisma.balanceImportacionStaging.count({ where: { loteId } });
  if (total === 0) return null;
  if (total > MAX_FILAS_CACHE) return leerStagingBorrador(loteId);
  return unstable_cache(
    () => leerStagingBorrador(loteId),
    ["borrador-staging", loteId],
    { tags: [tagStagingBorrador(loteId)], revalidate: 300 },
  )();
}
