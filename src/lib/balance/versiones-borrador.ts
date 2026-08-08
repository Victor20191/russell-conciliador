import { nucleoNit } from "@/lib/nit";
import { etiquetaPeriodo } from "./periodo";

/**
 * Versionado de BORRADORES por (cliente, período).
 *
 * A diferencia del balance oficial —cuya versión se persiste en
 * `balance_prueba_encabezado.version` al promover—, la versión del borrador se
 * DERIVA al leer. Un lote es efímero (vive hasta que se promueve o se descarta)
 * y su cliente y su período son editables desde la propia pantalla: persistir un
 * número lo dejaría desincronizado en cuanto el revisor corrigiera cualquiera de
 * los dos. Derivarlo garantiza que la numeración siempre refleja los borradores
 * vivos, y no exige columna ni migración.
 *
 * La numeración es CRONOLÓGICA ascendente dentro del grupo: el cargue más
 * antiguo es v1. Es independiente de la versión que el balance recibirá al
 * promoverse (esa la asigna `persistirCargue` contando las versiones oficiales
 * ya existentes del período).
 */

export type BorradorVersionable = {
  loteId: string;
  /** Cliente ya resuelto (asignado en BD o sugerido por NIT). null = sin cliente. */
  clienteId: number | null;
  nitDetectado: string | null;
  /** Rango del período en ISO `YYYY-MM-DD`. */
  periodoInicio: string | null;
  periodoFin: string | null;
  /** ISO de creación; ordena la numeración. */
  creadoEn: string | null;
};

export type VersionBorrador = {
  /** Posición cronológica dentro del grupo, 1-based. */
  version: number;
  /** Total de versiones vivas del mismo (cliente, período). */
  versionesGrupo: number;
  /** null = el borrador aún no tiene cliente/período con qué agruparse. */
  claveGrupo: string | null;
};

/**
 * Clave de agrupación: cliente (id resuelto o, si aún no lo hay, el núcleo del
 * NIT detectado) + período mensual normalizado. Sin cliente identificable o sin
 * período no hay grupo: el borrador queda suelto, como hoy.
 */
export function claveGrupoBorrador(borrador: BorradorVersionable): string | null {
  const nucleo = nucleoNit(borrador.nitDetectado ?? "");
  const cliente = borrador.clienteId != null
    ? `c:${borrador.clienteId}`
    : nucleo.length >= 5
      ? `n:${nucleo}`
      : null;
  if (!cliente) return null;
  if (!borrador.periodoInicio || !borrador.periodoFin) return null;
  return `${cliente}|${etiquetaPeriodo(borrador.periodoInicio, borrador.periodoFin)}`;
}

function marcaTiempo(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Asigna a cada borrador su versión dentro del grupo. Los que no se agrupan
 * quedan como «v1 de 1» con `claveGrupo: null`, de modo que la vista puede
 * omitir el distintivo sin ramificar.
 */
export function asignarVersionesBorrador(
  borradores: readonly BorradorVersionable[],
): Map<string, VersionBorrador> {
  const grupos = new Map<string, BorradorVersionable[]>();
  const versiones = new Map<string, VersionBorrador>();

  for (const borrador of borradores) {
    const clave = claveGrupoBorrador(borrador);
    if (!clave) {
      versiones.set(borrador.loteId, { version: 1, versionesGrupo: 1, claveGrupo: null });
      continue;
    }
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(borrador);
    else grupos.set(clave, [borrador]);
  }

  for (const [clave, grupo] of grupos) {
    // Cronológico ascendente; desempate estable por loteId cuando dos cargues
    // comparten timestamp (o ninguno lo tiene).
    const ordenado = [...grupo].sort(
      (a, b) =>
        marcaTiempo(a.creadoEn) - marcaTiempo(b.creadoEn)
        || a.loteId.localeCompare(b.loteId),
    );
    ordenado.forEach((borrador, i) => {
      versiones.set(borrador.loteId, {
        version: i + 1,
        versionesGrupo: ordenado.length,
        claveGrupo: clave,
      });
    });
  }

  return versiones;
}
