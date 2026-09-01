"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { Card, Chip, PageHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  BotonPantallaCompleta,
  claseScrollTabla,
  propsRegionPantallaCompleta,
  usePantallaCompletaTabla,
} from "@/components/tabla-pantalla-completa";
import { fmt, fmtContable } from "@/lib/format";
import { actualizarAperturaBorrador, actualizarPeriodoBorrador, cargarBorrador, descartarBorrador, aplicarCambiosBorrador, asignarClienteBorrador, guardarNotasDesdeEditor } from "@/app/actions/balance";
import {
  aperturaSugerida,
  etiquetaApertura,
  parsearApertura,
  type AperturaBalance,
} from "@/lib/balance/apertura-balance";
import { SelectorAperturaBalance } from "@/app/(app)/balance/selector-apertura-balance";
import type { ImportBalanceState } from "@/lib/import/balance";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import {
  compararTotalesAgrupacion,
  clasesContablesCompatibles,
  claseContableBorrador,
  construirIndiceReubicacion,
  construirResumenReubicacion,
  contextoTabulador,
  detectarManipulacionesRiesgosas,
  destinosReubicacion,
  esDestinoSugerido,
  normalizarBusquedaCuenta,
  puedeUbicar,
  reclasificarSoloHojas,
  sugerirMovimientosAgrupadora,
  type ContextoNodo,
  type CuentaReubicacion,
  type FilaBorrador,
  type IndiceReubicacion,
  type ManipulacionRiesgosaBorrador,
  type NodoBorrador,
  type RefNodo,
  type ResumenReubicacionFila,
} from "@/lib/balance/borrador";
import { nombreNivelCuenta } from "@/lib/balance/nivel-cuenta";
import type { ValidacionContable } from "@/lib/balance/calcular";
import type { CuentaRef, Hallazgo } from "@/lib/balance/diagnostico";
import {
  esDescuadreAccionable,
  esDescuadreInformativo,
  esMagnitudAccionable,
  type UmbralesAlertas,
} from "@/lib/balance/umbrales-alertas";
import {
  esAlertaNodo,
  estadoValidacionBorrador,
} from "@/lib/balance/alerta-borrador";
import {
  FILTROS_COLUMNAS_BORRADOR_INICIALES,
  filtrarArbolBorradorPorColumnas,
  hayFiltrosColumnasBorrador,
  type FiltrosColumnasBorrador,
} from "@/lib/balance/filtros-borrador";
import { coincideBusquedaCuenta } from "@/lib/balance/busqueda-cuenta";
import {
  OPCIONES_FILTRO_VALIDACION,
  type FiltroValidacionDetalle,
} from "@/lib/balance/filtros-detalle";
import {
  esDescuadreDelArchivoFuente,
  MAX_COMENTARIO_PROMOCION,
} from "@/lib/balance/advertencia-archivo-fuente";
import {
  calcularExplicacionesClaseReubicacion,
  filtrarHallazgosClaseResueltos,
  type ExplicacionClaseReubicacion,
} from "@/lib/balance/conciliacion-reubicaciones";
import {
  construirRevisionesReubicacionBalance,
  nombreClaseContable,
} from "@/lib/balance/revisiones-reubicacion-balance";
import {
  contarPendientes,
  detectarPropagacionesReubicacion,
  type PropagacionReubicacion,
} from "@/lib/balance/reubicacion-repetida";
import { ReubicacionesAprobadasPanel } from "@/components/reubicaciones-aprobadas";
import { AdvertenciaArchivoFuenteDetalle } from "@/components/advertencia-archivo-fuente";
import { notifyActionState, notifySuccess, notifyError, notifyInfo } from "@/lib/client-notifications";
import {
  esFalloTransporteCarga,
  MENSAJE_RECUPERAR_PROMOCION,
} from "@/lib/balance/recuperacion-red";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { NotaOpcionalPromocion } from "./nota-opcional-promocion";
import { useSeleccionFilaTabla } from "@/app/(app)/balance/use-seleccion-fila-tabla";
import {
  acotarRevelado,
  BLOQUE_REVELADO_INCREMENTO,
  BLOQUE_REVELADO_INICIAL,
  revelarHastaIndice,
  siguienteRevelado,
} from "@/components/revelado-progresivo";
import { expandirFilas, type FilasCompactas } from "@/lib/balance/filas-compactas";
import type { RevisionReubicacionStaging } from "@/lib/balance/staging-borrador";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { useHistorialCambios } from "@/lib/ui/use-historial-cambios";
import { DescartarCambiosBoton } from "@/components/descartar-cambios-boton";

/**
 * Fotografía de TODOS los cambios temporales de la pantalla (los que aún no se
 * guardaron en el borrador). Es lo que se apila para poder deshacer solo el
 * último cambio sin perder los anteriores.
 */
export type CambiosBorrador = {
  override: Record<string, "agrupadora" | "movimiento">;
  desacopladas: Record<string, boolean>;
  omitidas: Record<number, boolean>;
  padres: Record<number, number | null>;
  memorizarPadres: Record<number, boolean>;
  soloHojas: boolean;
  autoCorregido: boolean;
};

type Cliente = {
  id: number;
  name: string;
  nit: string;
  notas?: string | null;
  imputarSoloHojas: boolean | null;
};

export function etiquetaPerfilSoloHojas(valor: boolean | null | undefined): string {
  if (valor === true) return "Perfil: solo hojas activo";
  if (valor === false) return "Perfil: forzado desactivado";
  if (valor === null) return "Perfil: detección automática";
  return "Perfil: cliente pendiente";
}

export function ProteccionSubtotalesPanel({
  perfilSoloHojas,
  soloHojas,
  autoCorregido,
  analisis,
  onForzar,
  onDeshacer,
}: {
  perfilSoloHojas: boolean | null | undefined;
  soloHojas: boolean;
  autoCorregido: boolean;
  analisis: { ayuda: boolean; n: number } | null;
  onForzar: () => void;
  onDeshacer: () => void;
}) {
  const analizando = analisis == null;
  const candidatas = analisis?.n ?? 0;
  const hayCandidatas = candidatas > 0;

  return (
    <details className="group mt-2 overflow-hidden rounded-md border border-ok-100 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-2.5 py-2 marker:content-none">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-100 text-ok-700">
            <Icon name="check" size={12} stroke={2} />
          </span>
          <span className="text-[11px] font-semibold text-ink-800">Protección estándar contra subtotales activa</span>
          <span className={`hidden rounded-full border px-2 py-0.5 text-[9.5px] font-semibold sm:inline-flex ${perfilSoloHojas === true ? "border-blue-200 bg-blue-50 text-blue-700" : "border-ink-100 bg-ink-50 text-ink-500"}`}>
            {etiquetaPerfilSoloHojas(perfilSoloHojas)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10.5px] font-semibold text-ink-500 transition hover:text-ink-700">
          {soloHojas ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9.5px] text-blue-700">
              Solo hojas en vista
            </span>
          ) : hayCandidatas ? (
            <span className="rounded-full border border-warn-200 bg-warn-50 px-2 py-0.5 text-[9.5px] text-warn-700">
              {candidatas} candidata{candidatas === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <Icon name="settings" size={11} />
            Ajustes avanzados de jerarquía
          </span>
          <span className="text-ink-400 transition-transform group-open:rotate-90">
            <Icon name="chev-r" size={12} />
          </span>
        </span>
      </summary>
      <div className="border-t border-ink-100 bg-ink-50/60 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${perfilSoloHojas === true ? "border-blue-200 bg-blue-50 text-blue-700" : "border-ink-100 bg-white text-ink-500"}`}>
            {etiquetaPerfilSoloHojas(perfilSoloHojas)}
          </span>
        </div>
        <p className="mt-1 max-w-4xl text-[10.5px] leading-relaxed text-ink-500 sm:mt-0">
          La lectura ya excluye las cuentas padre por jerarquía de código y los subtotales duplicados exactos.
        </p>
        <p className="mt-2 max-w-4xl text-[11px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-700">Forzar modo solo hojas</span> reclasifica por orden y longitud las cuentas que parecen subtotales aunque sus códigos no compartan prefijo. Úsalo solo para exports totalmente jerárquicos; en un balance mixto una cuenta puede tener saldo propio además de sus auxiliares.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {soloHojas ? (
            <button
              type="button"
              onClick={onDeshacer}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-800"
            >
              {autoCorregido ? "Deshacer auto-corrección" : "Quitar modo solo hojas"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onForzar}
              disabled={analizando || !hayCandidatas}
              className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-400"
            >
              {analizando
                ? "Analizando jerarquía…"
                : hayCandidatas
                  ? `Forzar modo solo hojas (${candidatas})`
                  : "Sin subtotales adicionales por reclasificar"}
            </button>
          )}
          <span className="text-[10px] text-ink-400">
            La previsualización no se persiste hasta guardar los cambios.
          </span>
        </div>
      </div>
    </details>
  );
}

/** Resumen legible de los pares pendientes (los dos primeros + «y N más»). */
export function resumirPropagaciones(props: readonly PropagacionReubicacion[]): string {
  const pares = props.map((p) => `${p.codigoHija} → ${p.codigoPadre}`);
  if (pares.length <= 2) return pares.join(" y ");
  return `${pares.slice(0, 2).join(", ")} y ${pares.length - 2} par(es) más`;
}

/**
 * El mismo par cuenta→agrupadora se repite en el archivo (balances por tercero,
 * sucursal o centro de costo) y solo un bloque quedó anidado. Los demás dejan la
 * agrupadora manual vacía y su saldo vuelve a contarse junto al de la cuenta hermana.
 * La propagación NO es automática: se aplica desde aquí, con el mismo emparejamiento
 * por bloque que usan las correcciones memorizadas del cliente.
 */
export function AvisoPropagacionReubicacion({
  propagaciones,
  onAplicar,
}: {
  propagaciones: PropagacionReubicacion[];
  onAplicar: () => void;
}) {
  const n = contarPendientes(propagaciones);
  if (n === 0) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-warn-200 bg-warn-50/70 px-3 py-2 text-[12px] text-warn-800">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-px shrink-0 text-warn-700"><Icon name="warn" size={13} /></span>
        <span>
          <span className="font-semibold">El anidado que hiciste se repite en el archivo.</span>{" "}
          {resumirPropagaciones(propagaciones)}: quedan <span className="font-semibold">{n}</span> ocurrencia(s) en otros bloques sin anidar,
          con la agrupadora vacía y riesgo de contar su saldo dos veces al cargar. Cada una se colgaría de la agrupadora de SU bloque.
        </span>
      </div>
      <button
        type="button"
        onClick={onAplicar}
        className="shrink-0 rounded-md border border-warn-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-warn-800 transition hover:bg-warn-100"
      >
        Anidar en los demás bloques ({n})
      </button>
    </div>
  );
}

export function AvisoAutoCorreccionSoloHojas({ cuentas, onDeshacer }: { cuentas: number; onDeshacer: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-800">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-px font-bold text-ok-700">✓</span>
        <span>
          <span className="font-semibold">Corrección automática de anidado.</span> Se detectó un export jerárquico con doble conteo y se re-anidaron <span className="font-semibold">{cuentas}</span> cuenta(s) por orden. Solo suman las cuentas del último nivel; revisa el resultado y guarda para fijarlo.
        </span>
      </div>
      <button
        type="button"
        onClick={onDeshacer}
        className="shrink-0 rounded-md border border-ok-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ok-700 transition hover:bg-ok-100"
      >
        Deshacer auto-corrección
      </button>
    </div>
  );
}

/** Conserva la confirmación devuelta por la Server Action mientras el refresh de
 *  la ruta reemplaza las props. La versión local manda hasta que el servidor
 *  publique exactamente esa misma revisión en el nuevo payload RSC. */
export function combinarRevisionesReubicacion(
  servidor: RevisionReubicacionStaging[],
  confirmadasLocalmente: RevisionReubicacionStaging[],
): Map<number, RevisionReubicacionStaging> {
  const revisiones = new Map<number, RevisionReubicacionStaging>();
  for (const revision of [...confirmadasLocalmente, ...servidor]) {
    const actual = revisiones.get(revision.filaNum);
    if (!actual || revision.revisadaEn >= actual.revisadaEn) {
      revisiones.set(revision.filaNum, revision);
    }
  }
  return revisiones;
}

export function filtrarReubicacionesPendientes<T extends { filaNum: number }>(
  riesgos: T[],
  revisionesGuardadas: ReadonlyMap<number, RevisionReubicacionStaging>,
): T[] {
  return riesgos.filter((riesgo) => !revisionesGuardadas.has(riesgo.filaNum));
}

export function retirarConfirmacionesLocales(
  padresConfirmados: Record<number, number>,
  revisionesConfirmadas: RevisionReubicacionStaging[],
  filasGuardadas: Iterable<number>,
): {
  padresConfirmados: Record<number, number>;
  revisionesConfirmadas: RevisionReubicacionStaging[];
} {
  const filas = new Set(filasGuardadas);
  return {
    padresConfirmados: Object.fromEntries(
      Object.entries(padresConfirmados).filter(([filaNum]) => !filas.has(Number(filaNum))),
    ),
    revisionesConfirmadas: revisionesConfirmadas.filter((revision) => !filas.has(revision.filaNum)),
  };
}

export type EnfoqueCambioEstructural = {
  origen: number;
  destino: number | null;
  secuencia: number;
};

/**
 * Cada cambio estructural recibe una secuencia nueva aunque afecte dos veces la
 * misma fila. Así React vuelve a ejecutar el enfoque y lleva al usuario a la
 * ubicación recalculada más reciente.
 */
export function siguienteEnfoqueCambioEstructural(
  actual: EnfoqueCambioEstructural | null,
  origen: number,
  destino: number | null = null,
): EnfoqueCambioEstructural {
  return { origen, destino, secuencia: (actual?.secuencia ?? 0) + 1 };
}

/**
 * `override`/`desacopladas` se guardan por CÓDIGO de cuenta, no por fila — pero el
 * enfoque estructural necesita un `filaNum` para ubicar el nodo en el árbol. Se
 * traduce con la PRIMERA fila cruda de cada código (mismo criterio que usa
 * `consolidarAuxiliaresRepetidos` para elegir la fila representativa de un bloque
 * "Cuenta + NIT" en balances por tercero), así el filaNum resuelto coincide con el
 * nodo que el árbol realmente muestra para ese código.
 */
export function construirCodigoAFilaNum(filas: readonly Pick<FilaBorrador, "filaNum" | "codigo">[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const fila of filas) {
    if (!mapa.has(fila.codigo)) mapa.set(fila.codigo, fila.filaNum);
  }
  return mapa;
}

/**
 * Cuenta(s) cuyo cambio temporal difiere entre dos fotografías de `CambiosBorrador`
 * — se usa al deshacer «el último cambio» para saber a qué fila llevar al usuario
 * tras revertirlo (puede quedar en otra sección/grupo: de omitida a activa, o bajo
 * otro padre). El orden de comparación (reclasificación → desacople → omisión →
 * re-parentado) prioriza la fila PROPIA de un cambio sobre las de sus hijas cuando
 * un solo cambio tocó varias filas de golpe (p. ej. convertir una cuenta en
 * agrupadora también reubica sus hijas). Los cambios globales (modo «solo hojas»)
 * no tocan ninguna de las cuatro colecciones por cuenta y devuelven `[]` — no hay
 * una única fila que enfocar, igual que al descartar TODOS los cambios.
 */
export function filasAfectadasPorCambio(
  actual: CambiosBorrador,
  otro: CambiosBorrador,
  codigoAFilaNum: ReadonlyMap<string, number>,
): number[] {
  const filas: number[] = [];
  const agregar = (filaNum: number | undefined) => {
    if (filaNum != null && !filas.includes(filaNum)) filas.push(filaNum);
  };
  const clavesDistintas = (a: Record<string, unknown>, b: Record<string, unknown>): string[] => {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...claves].filter((clave) => a[clave] !== b[clave]);
  };
  for (const codigo of clavesDistintas(actual.override, otro.override)) agregar(codigoAFilaNum.get(codigo));
  for (const codigo of clavesDistintas(actual.desacopladas, otro.desacopladas)) agregar(codigoAFilaNum.get(codigo));
  for (const clave of clavesDistintas(actual.omitidas, otro.omitidas)) agregar(Number(clave));
  for (const clave of clavesDistintas(actual.padres, otro.padres)) agregar(Number(clave));
  return filas;
}

/** Aplica los cambios TEMPORALES (reclasificación / desacople / omitir / re-parentado)
 *  sobre las filas crudas, en memoria (misma lógica que guardar). */
function aplicarCambios(
  filas: FilaBorrador[],
  override: Record<string, "agrupadora" | "movimiento">,
  desacopladas: Record<string, boolean>,
  omitidas: Record<number, boolean>,
  padres: Record<number, number | null>,
): FilaBorrador[] {
  const out = filas.map((f) => ({ ...f }));
  if (Object.keys(override).length > 0) {
    for (const f of out) {
      const ov = override[f.codigo];
      // Aplica la reclasificación a cualquier fila numérica que NO sea «total» (incluye
      // «descuadre», que estructuralmente es un movimiento) y que difiera del destino.
      if (ov && /^\d+$/.test(f.codigo) && f.tipoFila !== "total") {
        f.tipoFila = ov;
        f.tipoFilaForzado = ov;
      }
    }
  }
  if (Object.keys(desacopladas).length > 0) {
    for (const f of out) if (f.codigo in desacopladas) f.desacoplada = desacopladas[f.codigo];
  }
  if (Object.keys(omitidas).length > 0) {
    for (const f of out) if (f.filaNum in omitidas) f.omitida = omitidas[f.filaNum];
  }
  if (Object.keys(padres).length > 0) {
    for (const f of out) if (f.filaNum in padres) f.padreManual = padres[f.filaNum];
  }
  return out;
}

async function cargarBorradorRecuperable(
  previo: ImportBalanceState,
  formData: FormData,
): Promise<ImportBalanceState> {
  try {
    return await cargarBorrador(previo, formData);
  } catch (error) {
    if (esFalloTransporteCarga(error)) {
      return { ok: false, message: MENSAJE_RECUPERAR_PROMOCION };
    }
    throw error;
  }
}

export type VersionHermanaBorrador = {
  loteId: string;
  version: number;
  archivoNombre: string;
  /** Fecha/hora del cargue ya formateada en el servidor. */
  fecha: string;
  /** Apertura declarada de esa versión (`cuenta` | `tercero`); null = sin declarar. */
  apertura: string | null;
};

/**
 * Menú de VERSIONES en borrador del mismo (cliente, período). Vive en la barra
 * del árbol junto a los demás controles: abre cada versión y descarga su Excel
 * crudo sin salir de esta. Solo se monta cuando hay más de una.
 */
function MenuVersionesBorrador({
  loteId,
  hermanos,
}: {
  loteId: string;
  hermanos: VersionHermanaBorrador[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title="Versiones en borrador de este cliente y período"
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
      >
        <Icon name="log" size={12} />
        Versiones
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">
          {hermanos.length}
        </span>
        <Icon name="chev-d" size={11} />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-1 w-[26rem] overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Borradores de este cliente y período
            </div>
            <div className="max-h-72 overflow-y-auto">
              {hermanos.map((h) => {
                const esta = h.loteId === loteId;
                return (
                  <div
                    key={h.loteId}
                    className={`flex items-center gap-2 border-b border-ink-50 px-3 py-2 last:border-0 ${esta ? "bg-blue-50/60" : "hover:bg-ink-50"}`}
                  >
                    <span className="w-14 shrink-0">
                      {esta ? (
                        <Chip label={`v${h.version}`} tone="blue" />
                      ) : (
                        <Link
                          href={`/balance/borradores/${h.loteId}`}
                          className="text-[12px] font-semibold text-blue-500 hover:underline"
                        >
                          v{h.version}
                        </Link>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-ink-700" title={h.archivoNombre}>
                        {h.archivoNombre}
                      </span>
                      <span className="block text-[10.5px] text-ink-400">
                        {h.fecha}
                        {" · "}
                        <span className={parsearApertura(h.apertura) ? "text-ink-500" : undefined}>
                          {etiquetaApertura(h.apertura)}
                        </span>
                        {esta && " · estás aquí"}
                      </span>
                    </span>
                    <a
                      href={`/balance/borradores/${h.loteId}/export`}
                      title={`Descargar el borrador v${h.version} a Excel`}
                      aria-label={`Descargar el borrador v${h.version} a Excel`}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-ink-200 px-1.5 py-1 text-[10.5px] font-semibold text-ink-600 transition hover:border-ok-300 hover:bg-ok-100/40 hover:text-ok-700"
                    >
                      <Icon name="download" size={11} /> Excel
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Notas / observaciones de carga del cliente: particularidades del formato que el
 * equipo anota para recordarlas en cada carga. Se ven y se editan aquí (antes la
 * edición vivía dentro del editor de estructura, que ya no se expone en el borrador).
 */
function NotasCargaCliente({
  notas,
  guardando,
  onGuardar,
}: {
  notas: string | null;
  guardando: boolean;
  onGuardar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const actuales = (notas ?? "").trim();
  const abrir = () => { setTexto(actuales); setEditando(true); };

  if (!editando) {
    return actuales ? (
      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-semibold"><span aria-hidden>📌</span> Notas de carga de este cliente</span>
          <button type="button" onClick={abrir} className="shrink-0 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100">
            Editar
          </button>
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{actuales}</p>
      </div>
    ) : (
      <button type="button" onClick={abrir} className="mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-500 hover:text-blue-700">
        <span aria-hidden>📌</span> Agregar notas de carga de este cliente
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
      <div className="text-[12px] font-semibold text-ink-700">Notas / observaciones de carga del cliente</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
        Particularidades del formato de este cliente para recordar en cada carga (p. ej. «duplica renglones UC/CU — se omite uno»). Se guardan por cliente y aparecen al cargar y revisar; no cambian el cálculo.
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Sin notas para este cliente."
        className="mt-1.5 w-full resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={guardando || texto.trim() === actuales}
          onClick={() => { onGuardar(texto.trim()); setEditando(false); }}
          className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
        >
          {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar notas del cliente"}
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => setEditando(false)}
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function BorradorDetailClient({
  loteId, archivoNombre, nitDetectado, periodoInicial, periodoFinal, aperturaGuardada = null, filasCompactas, porTerceroDetectado, revisionesReubicacion = [], clientes, clienteSugeridoId, clientePersistido = false, correccionesAplicadas, umbrales, version = null, hermanos = [],
}: {
  loteId: string;
  archivoNombre: string;
  nitDetectado: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  /** Apertura ya declarada para este borrador (`cuenta` | `tercero`); null = pendiente. */
  aperturaGuardada?: string | null;
  /** Filas del staging en forma compacta (diccionario + tuplas): reduce ~5× el
   *  payload RSC en balances por tercero de decenas de miles de filas. */
  filasCompactas: FilasCompactas;
  porTerceroDetectado: boolean;
  revisionesReubicacion?: RevisionReubicacionStaging[];
  clientes: Cliente[];
  clienteSugeridoId: number | null;
  /** false = el cliente solo está SUGERIDO por NIT y el lote sigue sin cliente en BD. */
  clientePersistido?: boolean;
  correccionesAplicadas: number;
  /** Umbrales de alerta vigentes (parametrizables en /config/parametros). */
  umbrales: UmbralesAlertas;
  /** Versión de este borrador dentro de su (cliente, período). null = no se agrupa. */
  version?: number | null;
  /** Las demás versiones del mismo (cliente, período), de la más nueva a la más vieja. */
  hermanos?: VersionHermanaBorrador[];
}) {
  const router = useRouter();
  // Una sola expansión por payload; el resto del componente trabaja con las filas
  // completas exactamente como antes.
  const filas = useMemo(() => expandirFilas(filasCompactas), [filasCompactas]);
  const [cargarState, cargarAction, cargando] = useActionState<ImportBalanceState, FormData>(
    cargarBorradorRecuperable,
    {},
  );
  const [descartando, startDescartar] = useTransition();
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [infoFilasExcluidas, setInfoFilasExcluidas] = useState(false); // modal informativo (no se monta hasta abrirlo)
  const [ayudaValidaciones, setAyudaValidaciones] = useState(false); // modal informativo: qué significa cada validación (no se monta hasta abrirlo)
  const [clienteSelId, setClienteSelId] = useState<number | null>(clienteSugeridoId); // sigue las notas del cliente
  const perfilSoloHojas = clientes.find((cliente) => cliente.id === clienteSelId)?.imputarSoloHojas;
  const [periodoIni, setPeriodoIni] = useState(periodoInicial ?? "");
  const [periodoFin, setPeriodoFin] = useState(periodoFinal ?? "");
  const [guardandoPeriodo, startGuardarPeriodo] = useTransition();
  // Apertura DECLARADA del informe (por cuenta / por terceros). Arranca vacía a
  // propósito —aunque la lectura ya tenga una sospecha— para que sea una respuesta
  // del analista y no una heurística heredada sin mirar; la detección se ofrece al
  // lado como sugerencia. Es obligatoria para cargar el balance oficial.
  const [aperturaBalance, setAperturaBalance] = useState<AperturaBalance | null>(
    () => parsearApertura(aperturaGuardada),
  );
  const [guardandoApertura, startGuardarApertura] = useTransition();
  const [comentarioPromocion, setComentarioPromocion] = useState("");
  // Compuerta al entrar: sin cliente detectado por NIT, exige cliente + período
  // antes de operar (para aplicar sus preferencias/notas y no cargar a ciegas).
  const [gateAbierto, setGateAbierto] = useState(clienteSugeridoId == null);

  // Cambios TEMPORALES (en el navegador) hasta Guardar/Descartar.
  const [override, setOverride] = useState<Record<string, "agrupadora" | "movimiento">>({});
  const [desacopladas, setDesacopladas] = useState<Record<string, boolean>>({});
  const [omitidas, setOmitidas] = useState<Record<number, boolean>>({});
  const [padres, setPadres] = useState<Record<number, number | null>>({});
  // Pila de deshacer de esos cambios temporales: «Descartar cambios» pregunta
  // siempre si se deshace SOLO el último o TODOS.
  const historial = useHistorialCambios<CambiosBorrador>();
  const [padresConfirmadosLocalmente, setPadresConfirmadosLocalmente] = useState<Record<number, number>>({});
  const [revisionesConfirmadasLocalmente, setRevisionesConfirmadasLocalmente] = useState<RevisionReubicacionStaging[]>([]);
  const [memorizarPadres, setMemorizarPadres] = useState<Record<number, boolean>>({});
  const [mover, setMover] = useState<{ filaNum: number | null; revisar?: boolean } | null>(null);
  const [gestionarAgrupadora, setGestionarAgrupadora] = useState<{ filaNum: number } | null>(null);
  // Detalle del chip "↳ movida aquí": qué fila se está inspeccionando. El árbol
  // AUTOMÁTICO (sin ningún `padreManual`) para comparar "dónde estaba" se calcula
  // perezoso — solo tras la primera apertura — y queda memoizado.
  const [detalleReubicacion, setDetalleReubicacion] = useState<{ filaNum: number } | null>(null);
  const [huboAperturaReubicacion, setHuboAperturaReubicacion] = useState(false);
  const [enfoqueReubicacion, setEnfoqueReubicacion] = useState<EnfoqueCambioEstructural | null>(null);
  const [soloHojas, setSoloHojas] = useState(false); // export jerárquico: solo cuentan las hojas
  const [autoCorregido, setAutoCorregido] = useState(false); // «solo hojas» se activó por auto-corrección al abrir
  const autoAplicadoRef = useRef(false);
  const [guardando, startGuardar] = useTransition();
  const [aprobandoReubicacion, startAprobarReubicacion] = useTransition();
  // Fotografía del estado ANTES de cada edición, para poder deshacer paso a paso.
  const capturarCambios = (): CambiosBorrador => ({
    override,
    desacopladas,
    omitidas,
    padres,
    memorizarPadres,
    soloHojas,
    autoCorregido,
  });
  const registrarCambio = (descripcion: string) => historial.registrar(capturarCambios(), descripcion);
  const restaurarCambios = (c: CambiosBorrador) => {
    setOverride(c.override);
    setDesacopladas(c.desacopladas);
    setOmitidas(c.omitidas);
    setPadres(c.padres);
    setMemorizarPadres(c.memorizarPadres);
    setSoloHojas(c.soloHojas);
    setAutoCorregido(c.autoCorregido);
  };
  // «Evitar doble conteo de subtotales»: en un export jerárquico (la cuenta y sus subcuentas/auxiliares
  // vienen TODAS como filas), marca como AGRUPADORA toda cuenta con detalle debajo (código
  // más largo por orden) → solo cuentan las hojas. Se expresa como overrides de
  // reclasificación: reversible en pantalla y persistible con «Guardar cambios».
  const overrideEfectivo = useMemo(() => {
    if (!soloHojas) return override;
    const combinado: Record<string, "agrupadora" | "movimiento"> = { ...override };
    for (const f of reclasificarSoloHojas(filas.map((x) => ({ ...x })))) {
      if (!(f.codigo in combinado)) combinado[f.codigo] = "agrupadora";
    }
    return combinado;
  }, [filas, soloHojas, override]);
  const nCambios = Object.keys(overrideEfectivo).length + Object.keys(desacopladas).length + Object.keys(omitidas).length + Object.keys(padres).length;
  const hayCambios = nCambios > 0;
  const padresVista = useMemo(
    () => ({ ...padresConfirmadosLocalmente, ...padres }),
    [padres, padresConfirmadosLocalmente],
  );
  const filasEditadas = useMemo(
    () => aplicarCambios(filas, overrideEfectivo, desacopladas, omitidas, padresVista),
    [filas, overrideEfectivo, desacopladas, omitidas, padresVista],
  );
  // View-model recomputado LOCALMENTE con los cambios temporales (sin tocar la BD).
  const { arbol, validacion, partidaDoble, hallazgos, porTercero: porTerceroCalculado, relistadoGuiones, filasOcultas, clasesCorregidas, nitTachados, filasContabilizadas } = useMemo(
    () => construirVistaBorrador(
      filasEditadas.map((fila) => ({ ...fila })),
      // consolidarAuxiliares: SOLO para la vista — agrupa por auxiliar los balances
      // abiertos por NIT (mismo código repetido). El staging y la exportación no cambian.
      { preservarAgrupadorasForzadas: true, consolidarAuxiliares: true, umbrales },
    ),
    [filasEditadas, umbrales],
  );
  const manipulacionesRiesgosas = useMemo(
    () => detectarManipulacionesRiesgosas(filasEditadas),
    [filasEditadas],
  );
  const revisionesGuardadasPorFila = useMemo(
    () => combinarRevisionesReubicacion(revisionesReubicacion, revisionesConfirmadasLocalmente),
    [revisionesReubicacion, revisionesConfirmadasLocalmente],
  );
  const revisionesGuardadasVigentes = useMemo(() => {
    const padresBase = new Map(filas.map((fila) => [
      fila.filaNum,
      padresConfirmadosLocalmente[fila.filaNum] ?? fila.padreManual ?? null,
    ]));
    return new Map([...revisionesGuardadasPorFila].filter(([filaNum]) =>
      !(filaNum in padres) || padres[filaNum] === padresBase.get(filaNum)));
  }, [filas, padres, padresConfirmadosLocalmente, revisionesGuardadasPorFila]);
  const filasContabilizadasSet = useMemo(
    () => new Set(filasContabilizadas),
    [filasContabilizadas],
  );
  const explicacionesClase = useMemo(
    () => calcularExplicacionesClaseReubicacion(
      manipulacionesRiesgosas,
      new Set(revisionesGuardadasVigentes.keys()),
      filasContabilizadasSet,
      {
        "1": validacion.activoDiff,
        "2": validacion.pasivoDiff,
        "3": validacion.patrimonioDiff,
        "4": validacion.ingresosDiff,
        "5": validacion.gastosDiff,
        "6": validacion.costosDiff,
      },
    ),
    [filasContabilizadasSet, manipulacionesRiesgosas, revisionesGuardadasVigentes, validacion],
  );
  const hallazgosPendientes = useMemo(
    () => filtrarHallazgosClaseResueltos(hallazgos, explicacionesClase),
    [explicacionesClase, hallazgos],
  );
  const manipulacionesPendientes = useMemo(
    () => filtrarReubicacionesPendientes(
      manipulacionesRiesgosas,
      revisionesGuardadasVigentes,
    ),
    [manipulacionesRiesgosas, revisionesGuardadasVigentes],
  );
  const reubicacionesAprobadas = useMemo(
    () => construirRevisionesReubicacionBalance(
      manipulacionesRiesgosas,
      revisionesGuardadasVigentes.values(),
    ),
    [manipulacionesRiesgosas, revisionesGuardadasVigentes],
  );
  const riesgosPorFila = useMemo(
    () => new Map(manipulacionesPendientes.map((riesgo) => [riesgo.filaNum, riesgo])),
    [manipulacionesPendientes],
  );
  const porTercero = porTerceroDetectado || porTerceroCalculado;
  const advertenciaArchivoFuente = esDescuadreDelArchivoFuente(
    validacion,
    partidaDoble,
    hallazgosPendientes,
  );
  const faltaComentarioPromocion =
    advertenciaArchivoFuente && comentarioPromocion.trim().length === 0;
  const guardarPeriodo = (inicio = periodoIni, fin = periodoFin) => {
    if (!inicio || !fin || fin < inicio) return;
    startGuardarPeriodo(async () => {
      const resultado = await actualizarPeriodoBorrador(loteId, inicio, fin);
      if (!resultado.ok) notifyError(resultado.message ?? "No se pudo guardar el período.");
    });
  };
  // La apertura se persiste en cuanto se elige (como el período): así sobrevive a
  // recargas, se ve en el listado de borradores y la promoción no depende de que
  // el navegador la reenvíe.
  const elegirApertura = (valor: string) => {
    const apertura = parsearApertura(valor);
    setAperturaBalance(apertura);
    if (!apertura) return;
    startGuardarApertura(async () => {
      const resultado = await actualizarAperturaBorrador(loteId, apertura);
      if (!resultado.ok) notifyError(resultado.message ?? "No se pudo guardar el tipo de balance.");
    });
  };

  // AUTO-CORRECCIÓN de anidado por orden: en un export jerárquico (subtotales + auxiliares
  // como filas), «solo hojas» re-anida cada auxiliar bajo su subtotal por ORDEN. Se calcula
  // el balance CON y SIN la corrección y solo se propone si VERIFICADAMENTE acerca el activo
  // al total del archivo y reduce descuadres — en un balance mixto no aplica (fail-safe).
  // Corre DIFERIDO (tras el primer pintado): son DOS reconstrucciones completas de la
  // vista, y con un archivo de decenas de miles de filas bloqueaban el primer render.
  const [analisisSoloHojas, setAnalisisSoloHojas] = useState<{ ayuda: boolean; n: number } | null>(null);
  useEffect(() => {
    let cancelado = false;
    const timer = window.setTimeout(() => {
      // GUARD barato antes de reconstruir nada: si la reclasificación no promueve
      // ninguna cuenta, `ayuda` sería false de todos modos (es condición AND) — se
      // ahorra las dos reconstrucciones sin cambiar el veredicto.
      const clon = filas.map((f) => ({ ...f }));
      const promovidas = reclasificarSoloHojas(clon);
      if (promovidas.length === 0) {
        if (!cancelado) setAnalisisSoloHojas({ ayuda: false, n: 0 });
        return;
      }
      const base = construirVistaBorrador(filas.map((f) => ({ ...f })));
      const conSolo = construirVistaBorrador(clon);
      const distBase = base.validacion.activoArchivo != null ? Math.abs(base.validacion.activo - base.validacion.activoArchivo) : Infinity;
      const distSolo = conSolo.validacion.activoArchivo != null ? Math.abs(conSolo.validacion.activo - conSolo.validacion.activoArchivo) : Infinity;
      const ayuda = distBase !== Infinity && distSolo < distBase * 0.5 && conSolo.diagnostico.descuadres < base.diagnostico.descuadres;
      if (!cancelado) setAnalisisSoloHojas({ ayuda, n: promovidas.length });
    }, 60);
    return () => { cancelado = true; window.clearTimeout(timer); };
  }, [filas]);
  // Auto-activa la corrección UNA vez al abrir (si verifica). Reversible: el usuario puede
  // deshacerla desde el aviso o el panel avanzado, y no se vuelve a aplicar (autoAplicadoRef).
  useEffect(() => {
    if (!autoAplicadoRef.current && analisisSoloHojas?.ayuda) {
      autoAplicadoRef.current = true;
      // Queda en el historial para que «descartar el último cambio» también
      // pueda revertirla (además del botón «Deshacer auto-corrección»).
      registrarCambio("Corrección automática: modo «solo hojas»");
      setSoloHojas(true);
      setAutoCorregido(true);
    }
    // `registrarCambio` se recrea en cada render; incluirlo solo re-dispararía el
    // efecto sin efecto real (lo guarda `autoAplicadoRef`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisisSoloHojas]);

  const forzarSoloHojasManualmente = () => {
    // Si el análisis diferido termina después del clic, no debe convertir una
    // decisión manual en «auto-corrección» ni mostrar un origen equivocado.
    autoAplicadoRef.current = true;
    registrarCambio("Activar «solo hojas» (evitar doble conteo de subtotales)");
    setAutoCorregido(false);
    setSoloHojas(true);
  };
  const quitarSoloHojas = () => {
    registrarCambio("Quitar el modo «solo hojas»");
    setSoloHojas(false);
    setAutoCorregido(false);
  };
  const deshacerAutoCorreccion = () => {
    quitarSoloHojas();
    notifyInfo("Corrección automática deshecha. El borrador volvió a la jerarquía original.");
  };

  // Posición de cada nodo en el árbol (hermano anterior + abuelo) para el TABULADOR:
  // el ← (desindentar) sube al abuelo. El → abre el modal "Ubicar" (elegir destino + lote).
  const posiciones = useMemo(() => construirPosiciones(arbol), [arbol]);
  const contexto = useMemo(() => contextoTabulador(arbol), [arbol]);
  const indiceReubicacion = useMemo(() => construirIndiceReubicacion(arbol), [arbol]);

  // ¿El re-parentado manual vigente se repite sin resolver en otros bloques del
  // archivo? El universo son las cuentas del ÁRBOL (sin terceros colapsados ni pies
  // del ERP) y su padre EFECTIVO, así no se propone lo que ya cuelga bien solo.
  const propagacionesReubicacion = useMemo(
    () => detectarPropagacionesReubicacion(
      indiceReubicacion.cuentas,
      new Map(indiceReubicacion.cuentas.map((c) => [c.filaNum, c.padre])),
      new Map(),
    ),
    [indiceReubicacion],
  );
  const aplicarPropagacionesReubicacion = () => {
    const pendientes = propagacionesReubicacion.flatMap((p) => p.pendientes);
    if (pendientes.length === 0) return;
    registrarCambio(`Replicar el anidado en ${pendientes.length} cuenta(s) del mismo bloque`);
    setPadres((actual) => {
      const siguiente = { ...actual };
      for (const p of pendientes) siguiente[p.filaNum] = p.destino;
      return siguiente;
    });
    setMemorizarPadres((actual) => {
      const siguiente = { ...actual };
      for (const p of pendientes) siguiente[p.filaNum] = true;
      return siguiente;
    });
    // Replica en varias cuentas a la vez; enfoca la primera como referencia (igual
    // criterio que «convertir en agrupadora», que también toca varias filas).
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, pendientes[0].filaNum));
    notifyInfo(
      "Anidado replicado",
      `${pendientes.length} cuenta(s) se colgaron de la agrupadora de su propio bloque. Revisa el resultado y guarda para fijarlo.`,
    );
  };

  // Árbol AUTOMÁTICO (ignora todo `padreManual`, actual o de sesión): reconstruye la
  // misma vista con los overrides de reparentado apagados, así el resto del pipeline
  // (colapso de terceros, huérfanas, etc.) queda IGUAL al `arbol` vigente y los
  // `filaNum` siguen siendo comparables. Solo se calcula tras la primera apertura del
  // modal "↳ movida aquí" (`huboAperturaReubicacion`) — nunca en el render de la tabla.
  const arbolOriginal = useMemo(() => {
    if (!huboAperturaReubicacion) return null;
    const sinReparentar = filasEditadas.map((f) => ({ ...f, padreManual: null }));
    return construirVistaBorrador(sinReparentar, { preservarAgrupadorasForzadas: true, consolidarAuxiliares: true, umbrales }).arbol;
  }, [huboAperturaReubicacion, filasEditadas, umbrales]);
  const filasPorNum = useMemo(() => new Map(filas.map((f) => [f.filaNum, f])), [filas]);
  // Traduce override/desacopladas (por código) a un filaNum enfocable — ver
  // `construirCodigoAFilaNum`. Se usa solo al descartar el último cambio.
  const codigoAFilaNum = useMemo(() => construirCodigoAFilaNum(filas), [filas]);
  const abrirDetalleReubicacion = (filaNum: number) => {
    setHuboAperturaReubicacion(true);
    setDetalleReubicacion({ filaNum });
  };
  const resumenReubicacion = useMemo(() => {
    if (!detalleReubicacion) return null;
    const filaNum = detalleReubicacion.filaNum;
    // "pendiente" = solo el override de ESTA sesión trae el padre nuevo (`padres`, sin
    // guardar aún); si no está ahí, el padreManual vigente ya es el que trajo el
    // servidor (guardado en el lote, a mano en una carga previa o re-aplicado por las
    // correcciones memorizadas del cliente).
    const huboOverrideSesion = filaNum in padres;
    const veniaReubicadaDelServidor = filasPorNum.get(filaNum)?.padreManual != null;
    return construirResumenReubicacion(filaNum, arbol, arbolOriginal, huboOverrideSesion, veniaReubicadaDelServidor, correccionesAplicadas);
  }, [detalleReubicacion, padres, filasPorNum, arbol, arbolOriginal, correccionesAplicadas]);

  const onReclasificar = (cuenta: NodoBorrador) => {
    if (cuenta.tipoFila === "movimiento" || cuenta.tipoFila === "descuadre") {
      setGestionarAgrupadora({ filaNum: cuenta.filaNum });
      return;
    }
    registrarCambio(`Reclasificar ${cuenta.codigo} como movimiento`);
    setOverride((o) => ({ ...o, [cuenta.codigo]: "movimiento" }));
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, cuenta.filaNum));
  };
  const onDesacoplar = (filaNum: number, codigo: string, desacopladaAhora: boolean) => {
    registrarCambio(`${desacopladaAhora ? "Reacoplar" : "Desacoplar"} la cuenta ${codigo}`);
    setDesacopladas((d) => ({ ...d, [codigo]: !desacopladaAhora }));
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, filaNum));
  };
  const onOmitir = (filaNum: number, omitidaAhora: boolean) => {
    registrarCambio(`${omitidaAhora ? "Incluir" : "Omitir"} la fila ${filaNum}`);
    setOmitidas((o) => ({ ...o, [filaNum]: !omitidaAhora }));
    // Al «Incluir» de nuevo la fila reaparece en el árbol y sí hay adónde ir; al
    // «Omitir» desaparece y el efecto de enfoque no encuentra nada que resaltar
    // (no-op silencioso), que es el comportamiento correcto en ese caso.
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, filaNum));
  };
  const onUbicar = (filaNum: number) => setMover({ filaNum });
  const aplicarReubicacion = (
    filaNum: number,
    destino: number | null,
  ) => {
    registrarCambio(
      destino == null
        ? `Devolver la fila ${filaNum} a su ubicación automática`
        : `Ubicar la fila ${filaNum} bajo la fila ${destino}`,
    );
    setPadres((m) => ({ ...m, [filaNum]: destino }));
    setMemorizarPadres((actual) => ({
      ...actual,
      [filaNum]: destino != null,
    }));
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, filaNum, destino));
    setMover(null);
  };
  const confirmarReubicacion = (
    filaNum: number,
    destino: number | null,
    revision?: { justificacion: string; memorizar: boolean },
  ) => {
    if (!revision) {
      aplicarReubicacion(filaNum, destino);
      return;
    }
    if (destino == null) return;

    startAprobarReubicacion(async () => {
      const claveFila = String(filaNum);
      const resultado = await aplicarCambiosBorrador(
        loteId,
        {},
        {},
        {},
        { [claveFila]: destino },
        clienteSelId,
        { [claveFila]: revision },
        { [claveFila]: revision.memorizar },
      );
      if (!resultado.ok) {
        notifyError(resultado.message ?? "No se pudo aprobar el movimiento.");
        return;
      }

      setPadresConfirmadosLocalmente((actual) => ({ ...actual, [filaNum]: destino }));
      if (resultado.revisionesReubicacion?.length) {
        setRevisionesConfirmadasLocalmente((actuales) =>
          Array.from(combinarRevisionesReubicacion(actuales, resultado.revisionesReubicacion ?? []).values()),
        );
      }
      setPadres((actual) => {
        const siguiente = { ...actual };
        delete siguiente[filaNum];
        return siguiente;
      });
      setMemorizarPadres((actual) => {
        const siguiente = { ...actual };
        delete siguiente[filaNum];
        return siguiente;
      });
      setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, filaNum, destino));
      setMover(null);
      notifySuccess("Movimiento aprobado. La justificación quedó guardada en auditoría.");
      router.refresh();
    });
  };
  const confirmarAgrupadora = (filaNum: number, seleccionadas: number[]) => {
    const origen = indiceReubicacion.porFila.get(filaNum);
    if (!origen) return;
    const seleccion = new Set(seleccionadas);
    registrarCambio(
      `Convertir ${origen.codigo} en agrupadora con ${seleccion.size} cuenta(s) debajo`,
    );
    setOverride((actual) => ({ ...actual, [origen.codigo]: "agrupadora" }));
    setPadres((actual) => {
      const siguiente = { ...actual };
      for (const cuenta of indiceReubicacion.cuentas) {
        if (cuenta.padreManual === filaNum && !seleccion.has(cuenta.filaNum)) siguiente[cuenta.filaNum] = null;
      }
      for (const hija of seleccion) siguiente[hija] = filaNum;
      return siguiente;
    });
    setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, filaNum));
    setGestionarAgrupadora(null);
  };
  const onDesindentar = (filaNum: number) => {
    const p = posiciones.get(filaNum);
    if (p?.abuelo != null) aplicarReubicacion(filaNum, p.abuelo);
  };
  const descartarTodosLosCambios = () => {
    setOverride({});
    setDesacopladas({});
    setOmitidas({});
    setPadres({});
    setMemorizarPadres({});
    setSoloHojas(false);
    setAutoCorregido(false);
    historial.limpiar();
  };
  const descartarUltimoCambio = () => {
    const entrada = historial.deshacerUltimo();
    if (!entrada) return;
    // La cuenta afectada se calcula ANTES de restaurar (comparando el estado
    // vigente contra la fotografía a la que se vuelve) para saber dónde enfocar
    // tras el descarte: puede reaparecer en otra sección/grupo (de omitida a
    // activa, o bajo otro padre) y el efecto de enfoque expande lo necesario.
    const afectadas = filasAfectadasPorCambio(capturarCambios(), entrada.estado, codigoAFilaNum);
    restaurarCambios(entrada.estado);
    if (afectadas.length > 0) {
      setEnfoqueReubicacion((actual) => siguienteEnfoqueCambioEstructural(actual, afectadas[0]));
    }
    notifyInfo("Último cambio deshecho", entrada.descripcion);
  };
  const guardarCambios = () =>
    startGuardar(async () => {
      // El cliente seleccionado viaja para MEMORIZAR las correcciones en su perfil
      // (si no hay, el servidor lo resuelve por el lote/NIT).
      const r = await aplicarCambiosBorrador(
        loteId,
        overrideEfectivo,
        desacopladas,
        omitidas,
        padres,
        clienteSelId,
        {},
        memorizarPadres,
      );
      if (r.ok) {
        notifySuccess(r.message ?? "Cambios guardados.");
        const filasGuardadas = Object.keys(padres).map(Number);
        if (r.revisionesReubicacion?.length) {
          setRevisionesConfirmadasLocalmente((actuales) =>
            Array.from(combinarRevisionesReubicacion(actuales, r.revisionesReubicacion ?? []).values()),
          );
        }
        if (filasGuardadas.length > 0) {
          setPadresConfirmadosLocalmente((actuales) =>
            retirarConfirmacionesLocales(actuales, [], filasGuardadas).padresConfirmados,
          );
          setRevisionesConfirmadasLocalmente((actuales) =>
            retirarConfirmacionesLocales({}, actuales, filasGuardadas).revisionesConfirmadas,
          );
        }
        setOverride({});
        setDesacopladas({});
        setOmitidas({});
        setPadres({});
        setMemorizarPadres({});
        setSoloHojas(false);
        setAutoCorregido(false);
        historial.limpiar();
        router.refresh();
      }
      else notifyError(r.message ?? "No se pudieron guardar los cambios.");
    });

  // Cliente elegido A MANO (compuerta o selector): se PERSISTE en el lote (el
  // borrador deja de estar «sin cliente» en la lista) y se re-aplican sus
  // correcciones memorizadas (el NIT no lo detectó al leer, así que la
  // re-aplicación automática no corrió). Si cambió algo, se refresca la vista.
  const [asignandoCliente, startAsignarCliente] = useTransition();
  const asignarCliente = (
    cid: number,
    clienteAnterior: number | null = clienteSelId,
    opciones: { silencioso?: boolean } = {},
  ) => {
    startAsignarCliente(async () => {
      const r = await asignarClienteBorrador(loteId, cid);
      if (r.ok) {
        if (!opciones.silencioso) notifySuccess(r.message ?? "Cliente asignado al borrador.");
        if ((r.aplicadas ?? 0) > 0) router.refresh();
      } else {
        setClienteSelId(clienteAnterior);
        if (clienteAnterior == null) setGateAbierto(true);
        if (r.message) notifyError(r.message);
      }
    });
  };

  // Cliente SUGERIDO por NIT pero aún sin persistir en el lote: la pantalla ya lo
  // muestra seleccionado (y la compuerta no se abre), así que el usuario lo da por
  // vinculado. Sin este vínculo el servidor sigue viendo el borrador «sin cliente» y
  // rechaza guardar cambios, notas o el perfil. Se persiste UNA vez al abrir, en
  // silencio; si la sesión no tiene alcance sobre ese cliente, `asignarCliente`
  // revierte la selección y abre la compuerta.
  const autoVinculoRef = useRef(false);
  useEffect(() => {
    if (autoVinculoRef.current || clientePersistido || clienteSugeridoId == null) return;
    autoVinculoRef.current = true;
    asignarCliente(clienteSugeridoId, null, { silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientePersistido, clienteSugeridoId]);

  // Notas / observaciones de carga del cliente (per-cliente).
  const [guardandoNotas, startGuardarNotas] = useTransition();
  const [notasPendientes, setNotasPendientes] = useState<string | null>(null); // a guardar tras elegir cliente
  const guardarNotas = (texto: string, clienteId: number) => {
    startGuardarNotas(async () => {
      const r = await guardarNotasDesdeEditor(loteId, texto, clienteId);
      if (r.ok) { notifySuccess(r.message ?? "Notas guardadas."); router.refresh(); }
      else notifyError(r.message ?? "No se pudieron guardar las notas.");
    });
  };
  const onGuardarNotas = (texto: string) => {
    // Sin cliente aún: se recuerda el texto y se pide el cliente; al confirmarlo se
    // guarda (antes se abría la compuerta pero NO se reintentaba → las notas se perdían).
    if (clienteSelId == null) { setNotasPendientes(texto); setGateAbierto(true); notifyError("Elige el cliente para guardar las notas."); return; }
    guardarNotas(texto, clienteSelId);
  };

  useEffect(() => {
    // El éxito redirige EN EL SERVIDOR (a /balance/[id]) y confirma con FlashToast;
    // aquí solo se notifica el error si la carga falla.
    if (cargarState && cargarState.ok === false) notifyActionState(cargarState, { success: "Balance cargado.", error: "No se pudo cargar el balance." });
    if (cargarState?.message === MENSAJE_RECUPERAR_PROMOCION) {
      // Si el commit terminó antes de perderse la respuesta, el RSC resuelve el
      // lote al balance oficial. Si aún no terminó, el borrador sigue intacto.
      router.refresh();
    }
  }, [cargarState, router]);

  const onDescartar = () =>
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      if (r.ok) { notifySuccess(r.message ?? "Borrador descartado."); router.push("/balance/borradores"); }
      else notifyError(r.message ?? "No se pudo descartar.");
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Borrador${version ? ` v${version}` : ""} · ${archivoNombre}`}
        subtitle="Estructura CRUDA extraída del Excel (sin homologación). Las agrupadoras cuyo total ≠ suma de sus cuentas aparecen subrayadas: ahí está el descuadre."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(nitTachados > 0 || filasOcultas > 0) && (
              // El detalle de por qué se tacharon/ocultaron filas es largo y solo se
              // consulta cuando algo no cuadra: vive tras este botón y el contenido
              // del modal NO se monta hasta que se abre.
              <button
                type="button"
                onClick={() => setInfoFilasExcluidas(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-[12px] font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-800"
              >
                <Icon name="info" size={13} />
                <span><span className="font-semibold">{nitTachados + filasOcultas}</span> fila(s) tachadas y fuera de los cálculos</span>
                <span className="text-ink-400">— ver por qué</span>
              </button>
            )}
          </div>
        }
      />
      {porTercero && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span><span className="font-semibold">Balance abierto por tercero detectado.</span> Se colapsó el detalle de tercero (NIT/cédula) y se concilia por <span className="font-semibold">cuenta</span> — el saldo de cada cuenta ya es la suma de sus terceros. Los cálculos y la carga usan el nivel de cuenta. Si algún tercero no se detectó y quedó como fila, exclúyelo a mano con la <span className="font-semibold text-err-700">✕</span> (omitir).</span>
        </div>
      )}
      {relistadoGuiones > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span><span className="font-semibold">Re-listado con guiones detectado.</span> Se marcaron <span className="font-semibold">{relistadoGuiones}</span> fila(s) con código en notación de guiones (p. ej. <span className="font-mono">1105-05-04</span>) que duplican una cuenta ya listada con su código plano (<span className="font-mono">11050504</span>): se muestran <span className="line-through">tachadas</span> y NO cuentan (se concilia por el código plano). Si alguna hiciera falta, la puedes rescatar con «Incluir».</span>
        </div>
      )}
      {clasesCorregidas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
          <Icon name="warn" size={14} />
          <span>Se corrigieron <span className="font-semibold">{clasesCorregidas}</span> código(s) de clase que el ERP (SIIGO) trajo como número gigante (p. ej. <span className="font-mono">800000000000000</span>), derivando la clase real de sus subcuentas (p. ej. <span className="font-mono">5</span> «Otros Gastos»). Así anida y totaliza bien por clase.</span>
        </div>
      )}
      {infoFilasExcluidas && (
        <Modal
          open
          onClose={() => setInfoFilasExcluidas(false)}
          title="Filas tachadas y fuera de los cálculos"
          size="2xl"
        >
          <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink-700">
            {nitTachados > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
                <Icon name="warn" size={14} />
                <span>Balance por cuenta con detalle de tercero: se tacharon <span className="font-semibold">{nitTachados}</span> fila(s) <span className="font-semibold">NIT</span> que repiten el saldo de su cuenta (el total ya está en la fila «Cuenta»). Se muestran <span className="line-through">tachadas</span> y NO cuentan. Si necesitas alguna, rescátala con «Incluir».</span>
              </div>
            )}
            {filasOcultas > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
                <Icon name="warn" size={14} />
                <span>Se ocultaron <span className="font-semibold">{filasOcultas}</span> fila(s) que no van al balance: pies/notas del ERP (código que no empieza por dígito, como «Procesado en: …», <span className="font-mono">&lt;none&gt;</span> o «Total general»), <span className="font-semibold">cuentas de orden (clase 8 y 9)</span> y <span className="font-semibold">totales de sucursal</span> (código que empieza en 0, como «<span className="font-mono">002 MEDELLIN</span>» en un balance multi-sucursal). Se muestran <span className="line-through">tachadas</span> y NO cuentan. Si necesitas alguna, rescátala con «Incluir».</span>
              </div>
            )}
          </div>
        </Modal>
      )}
      {correccionesAplicadas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-800">
          <span className="mt-px font-bold text-ok-700">✓</span>
          <span>
            <span className="font-semibold">Perfil del cliente aplicado.</span> Se corrigieron <span className="font-semibold">{correccionesAplicadas}</span> fila(s) automáticamente con las correcciones memorizadas de cargas anteriores (reclasificaciones, omisiones, desacoples y re-parentados guardados para este cliente). Revísalas; si haces nuevos ajustes y los guardas, también quedarán memorizados. Un administrador puede verlas, editarlas o borrarlas en <span className="font-semibold">Configuración › Perfiles de carga</span>.
          </span>
        </div>
      )}
      {soloHojas && autoCorregido && (
        <AvisoAutoCorreccionSoloHojas
          cuentas={analisisSoloHojas?.n ?? 0}
          onDeshacer={deshacerAutoCorreccion}
        />
      )}
      {manipulacionesPendientes.length > 0 && (
        <ManipulacionesRiesgosasPanel
          riesgos={manipulacionesPendientes}
          validacion={validacion}
          onRevisar={(filaNum) => setMover({ filaNum, revisar: true })}
          onDeshacer={(filaNum) => aplicarReubicacion(filaNum, null)}
        />
      )}
      {reubicacionesAprobadas.length > 0 && (
        <ReubicacionesAprobadasPanel revisiones={reubicacionesAprobadas} />
      )}
      <ValidacionHeader
        v={validacion}
        pd={partidaDoble}
        ocultarEcuacion={advertenciaArchivoFuente}
        umbrales={umbrales}
        explicacionesClase={explicacionesClase}
        onAyuda={() => setAyudaValidaciones(true)}
      />
      {advertenciaArchivoFuente ? (
        <AdvertenciaArchivoFuente
          diferencia={validacion.ecuacionDiff}
          comentario={comentarioPromocion}
          onComentarioChange={setComentarioPromocion}
        />
      ) : (
        // Sin advertencia obligatoria del archivo fuente no hay razón para negar
        // la nota: una diferencia que ya se explicó en un período anterior (p. ej.
        // "diferencia desde saldo inicial") puede seguir presente aunque esta vez
        // el diagnóstico la clasifique distinto (o no la detecte). Sin este campo
        // el usuario no tenía ningún lugar donde dejar constancia y la próxima
        // versión oficial quedaba sin "Nota aclaratoria adicional".
        <NotaOpcionalPromocion
          comentario={comentarioPromocion}
          onComentarioChange={setComentarioPromocion}
        />
      )}

      {(() => {
        // Partida doble y ecuación ya se ven arriba en el encabezado; el
        // descuadre por clase ya lo muestra cada tarjeta (Δ archivo vs detalle);
        // se omiten aquí para no repetirlos. Queda lo accionable: los nodos que no
        // cuadran con su desglose. La fuente conserva el contexto completo para los
        // cálculos y las correcciones deterministas del borrador.
        const hh = hallazgosPendientes.filter((h) => h.tipo !== "partida_doble" && h.tipo !== "ecuacion" && h.tipo !== "clase");
        const diferenciasClase = hallazgosPendientes.filter((h) => h.tipo === "clase").length;
        // Se monta SIEMPRE, con o sin hallazgos: montarlo y desmontarlo según el resultado
        // movía la tabla ~66 px en cada omisión o reclasificación (los hallazgos cambian con
        // cada edición) y el usuario perdía el punto donde iba. Colapsado su alto es fijo.
        return (
          <DiagnosticoPanel
            hallazgos={hh}
            diferenciasClase={diferenciasClase}
            manipulaciones={manipulacionesPendientes.length}
            onAyuda={() => setAyudaValidaciones(true)}
          />
        );
      })()}
      {ayudaValidaciones && (
        <ModalAyudaValidaciones onClose={() => setAyudaValidaciones(false)} umbrales={umbrales} />
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimiento en borrador (crudo del Excel · sin homologación)</div>
            <div className="flex shrink-0 items-center gap-2">
              {hayCambios && <span className="text-[11px] font-medium text-warn-700">Guarda para incluir tus cambios</span>}
              <a
                href={`/balance/borradores/${loteId}/export`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-2.5 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100"
                title={hayCambios
                  ? "El Excel exporta lo GUARDADO. Guarda tus cambios para que salgan reflejados."
                  : "Exporta a Excel todo el árbol del borrador"}
              >
                <Icon name="download" size={13} /> Exportar a Excel
              </a>
            </div>
          </div>
          <ProteccionSubtotalesPanel
            perfilSoloHojas={perfilSoloHojas}
            soloHojas={soloHojas}
            autoCorregido={autoCorregido}
            analisis={analisisSoloHojas}
            onForzar={forzarSoloHojasManualmente}
            onDeshacer={autoCorregido ? deshacerAutoCorreccion : quitarSoloHojas}
          />
        </div>
        <AvisoPropagacionReubicacion
          propagaciones={propagacionesReubicacion}
          onAplicar={aplicarPropagacionesReubicacion}
        />
        {/* Barra de guardado SIEMPRE presente. Si apareciera solo al haber cambios, el primer
            ajuste empujaría la tabla ~37 px hacia abajo (y al guardar la subiría de vuelta),
            justo mientras el usuario trabaja en ella. Va en UNA sola línea (`truncate`) para
            que su alto no dependa del ancho de la ventana ni del estado. */}
        <div className={`flex items-center gap-2 border-b px-3 py-2 text-[12px] ${hayCambios ? "border-warn-200 bg-warn-50" : "border-ink-100 bg-white"}`}>
          {hayCambios && <Icon name="warn" size={13} />}
          <span
            className="min-w-0 flex-1 truncate"
            title={hayCambios ? `${nCambios} cambio(s) sin guardar — se aplican en pantalla; guárdalos para persistirlos en el borrador.` : undefined}
          >
            {hayCambios ? (
              <>
                <span className="font-semibold text-warn-800">{nCambios} cambio(s) sin guardar</span>
                <span className="text-warn-700"> — se aplican en pantalla; guárdalos para persistirlos en el borrador.</span>
              </>
            ) : (
              <span className="text-ink-400">Sin cambios pendientes.</span>
            )}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={guardarCambios} disabled={!hayCambios || guardando} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-45">
              {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar cambios"}
            </button>
            <DescartarCambiosBoton
              totalCambios={nCambios}
              descripcionUltimo={historial.ultimo?.descripcion ?? null}
              puedeDeshacerUltimo={historial.puedeDeshacer}
              onDescartarUltimo={descartarUltimoCambio}
              onDescartarTodo={descartarTodosLosCambios}
              disabled={!hayCambios || guardando}
              className="rounded-md border border-ink-300 px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-45"
            />
          </div>
        </div>
        <ArbolTabla arbol={arbol} riesgosPorFila={riesgosPorFila} onReclasificar={onReclasificar} onGestionarAgrupadora={(filaNum) => setGestionarAgrupadora({ filaNum })} onDesacoplar={onDesacoplar} onOmitir={onOmitir} posiciones={posiciones} contexto={contexto} onUbicar={onUbicar} onDesindentar={onDesindentar} onVerDetalleReubicacion={abrirDetalleReubicacion} enfoqueReubicacion={enfoqueReubicacion} umbrales={umbrales} loteId={loteId} hermanos={hermanos} />
      </Card>

      {mover != null && (
        <MoverModal
          indice={indiceReubicacion}
          filaNumInicial={mover.filaNum}
          revisarActual={mover.revisar}
          revisionInicial={mover.filaNum == null
            ? null
            : revisionesGuardadasVigentes.get(mover.filaNum)?.justificacion ?? null}
          guardando={aprobandoReubicacion}
          onConfirmar={confirmarReubicacion}
          onClose={() => setMover(null)}
        />
      )}

      {gestionarAgrupadora != null && (
        <GestionarAgrupadoraModal
          indice={indiceReubicacion}
          filaNum={gestionarAgrupadora.filaNum}
          onConfirmar={confirmarAgrupadora}
          onClose={() => setGestionarAgrupadora(null)}
        />
      )}

      {resumenReubicacion && (
        <DetalleReubicacionModal
          resumen={resumenReubicacion}
          riesgo={riesgosPorFila.get(resumenReubicacion.filaNum)}
          onClose={() => setDetalleReubicacion(null)}
        />
      )}

      {gateAbierto && (
        <GateClientePeriodo
          clientes={clientes}
          nitDetectado={nitDetectado}
          clienteSelId={clienteSelId}
          obligatorio={clienteSelId == null}
          periodoIni={periodoIni}
          periodoFin={periodoFin}
          onConfirmar={(cid, ini, fin) => {
            setClienteSelId(cid); setPeriodoIni(ini); setPeriodoFin(fin); setGateAbierto(false);
            guardarPeriodo(ini, fin);
            if (notasPendientes != null) { const t = notasPendientes; setNotasPendientes(null); guardarNotas(t, cid); }
            // Cliente confirmado a mano → se persiste en el lote y se re-aplican
            // sus correcciones memorizadas.
            asignarCliente(cid, clienteSelId);
          }}
          onClose={() => {
            setGateAbierto(false); setNotasPendientes(null);
            // OBLIGATORIO: sin cliente asignado no se trabaja el borrador. Cerrar
            // la compuerta sin elegirlo devuelve a la lista de borradores.
            if (clienteSelId == null) {
              notifyInfo("Cliente obligatorio", "Para revisar o cargar un borrador debes asignarle el cliente (NIT).");
              router.push("/balance/borradores");
            }
          }}
        />
      )}

      {/* Cargar / Descartar */}
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cargar como balance oficial</div>
        <NotasCargaCliente
          notas={clientes.find((c) => c.id === clienteSelId)?.notas ?? null}
          guardando={guardandoNotas}
          onGuardar={onGuardarNotas}
        />
        <form
          id="cargar-balance-oficial"
          action={cargarAction}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="loteId" value={loteId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <SelectorClienteBuscable
              clients={clientes}
              value={clienteSelId}
              onChange={(cid) => {
                const anterior = clienteSelId;
                setClienteSelId(cid);
                // Cambio de cliente a mano → se persiste en el lote (mismo camino
                // que la compuerta). Limpiarlo solo deja el aviso y bloquea la carga.
                if (cid != null && cid !== anterior) asignarCliente(cid, anterior);
              }}
              name="clientId"
              className="sm:col-span-1"
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período desde</span>
              <input type="date" name="periodoInicio" required value={periodoIni} onChange={(e) => setPeriodoIni(e.target.value)} onBlur={() => guardarPeriodo()} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período hasta</span>
              <input type="date" name="periodoFin" required value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} onBlur={() => guardarPeriodo()} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">
                Tipo de balance <span className="text-warn-700">*</span>
              </span>
              <SelectorAperturaBalance
                name="aperturaBalance"
                value={aperturaBalance}
                onChange={elegirApertura}
                disabled={guardandoApertura}
                describedBy="ayuda-tipo-balance"
              />
            </div>
          </div>
          {/* La lectura del archivo ya tiene una sospecha (detección de terceros):
              se ofrece como sugerencia, pero la respuesta la da el analista. */}
          <p id="ayuda-tipo-balance" className="text-[11px] text-ink-500">
            {aperturaBalance ? (
              <>
                Este cargue queda registrado como <span className="font-semibold text-ink-700">{etiquetaApertura(aperturaBalance)}</span>. Se mostrará en las versiones del cliente, en borrador y en el balance oficial.{aperturaBalance === "tercero" ? " Al cargar se capturará además el detalle por tercero (cuenta × NIT) para el cruce por tercero de los módulos." : ""}
              </>
            ) : (
              <>
                <span className="font-semibold text-warn-700">Indica si el archivo es por cuenta o por terceros.</span>{" "}
                Por la estructura leída, Russell sugiere{" "}
                <button
                  type="button"
                  onClick={() => elegirApertura(aperturaSugerida(porTercero))}
                  className="font-semibold text-blue-500 underline decoration-dotted underline-offset-2 hover:text-blue-600"
                >
                  {etiquetaApertura(aperturaSugerida(porTercero))}
                </button>
                {porTercero ? " (se detectó detalle por tercero)." : " (no se detectó detalle por tercero)."}
              </>
            )}
          </p>
          {(asignandoCliente || guardandoPeriodo || guardandoApertura) && (
            <div className="text-[11.5px] font-medium text-ink-500">
              <EstadoProcesando>
                {asignandoCliente
                  ? "Vinculando cliente"
                  : guardandoPeriodo
                    ? "Guardando período"
                    : "Guardando tipo de balance"}
              </EstadoProcesando>
            </div>
          )}
          {clienteSelId == null && (
            <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-warn-700">
              {nitDetectado ? <>NIT detectado <span className="font-mono">{nitDetectado}</span> sin cliente coincidente.</> : <>No se detectó el cliente.</>}
              <button type="button" onClick={() => setGateAbierto(true)} className="rounded border border-warn-300 bg-warn-50 px-2 py-0.5 font-semibold text-warn-700 hover:bg-warn-100">
                Elegir cliente y período
              </button>
            </span>
          )}
          {cargarState?.message && !cargarState.ok && <p className="text-[12px] font-medium text-err-700">{cargarState.message}</p>}
          {hayCambios && <p className="text-[11.5px] font-medium text-warn-700">Tienes cambios sin guardar: guárdalos o descártalos antes de cargar (el balance se carga desde lo guardado).</p>}
          {faltaComentarioPromocion ? (
            <p className="text-[11.5px] font-medium text-warn-700">
              Escribe el comentario obligatorio en la advertencia del archivo fuente para continuar.
            </p>
          ) : null}
          {manipulacionesPendientes.length > 0 ? (
            <p className="text-[11.5px] font-medium text-err-700">
              Revisa y justifica {manipulacionesPendientes.length} reubicación(es) entre clases contables antes de cargar.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={cargando || asignandoCliente || guardandoPeriodo || guardandoApertura || hayCambios || clienteSelId == null || !periodoIni || !periodoFin || aperturaBalance == null || faltaComentarioPromocion || manipulacionesPendientes.length > 0}
              title={
                clienteSelId == null || !periodoIni || !periodoFin
                  ? "Falta el cliente o el período"
                  : aperturaBalance == null
                    ? "Indica si el balance es por cuenta o por terceros"
                  : hayCambios
                    ? "Guarda o descarta los cambios antes de cargar"
                    : faltaComentarioPromocion
                      ? "Falta el comentario obligatorio"
                      : manipulacionesPendientes.length > 0
                        ? "Hay reubicaciones entre clases contables pendientes de revisión"
                      : undefined
              }
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {cargando
                ? <EstadoProcesando>Cargando</EstadoProcesando>
                : cargarState?.message === MENSAJE_RECUPERAR_PROMOCION
                  ? "Comprobar y continuar"
                  : "Cargar balance"}
            </button>
            {confirmarDescarte ? (
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={onDescartar} disabled={descartando} className="rounded-md bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-200 disabled:opacity-60">
                  {descartando ? <EstadoProcesando>Descartando</EstadoProcesando> : "Confirmar descarte"}
                </button>
                <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmarDescarte(true)} className="rounded-md border border-err-200 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-50">
                Descartar borrador
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---- Encabezado de validación (mismas tarjetas del borrador del modal) ----
function ValidacionHeader({
  v,
  pd,
  ocultarEcuacion,
  umbrales,
  explicacionesClase,
  onAyuda,
}: {
  v: ValidacionContable;
  pd: { debitos: number; creditos: number; diff: number; cuadra: boolean };
  ocultarEcuacion: boolean;
  umbrales: UmbralesAlertas;
  explicacionesClase: ReadonlyMap<string, ExplicacionClaseReubicacion>;
  onAyuda: () => void;
}) {
  const ecOk = v.ecuacionCuadra;
  const pdInformativo = !pd.cuadra && esDescuadreInformativo(pd.diff, umbrales);
  const ecInformativo = !ecOk && esDescuadreInformativo(v.ecuacionDiff, umbrales);
  const tonoPartida = pd.cuadra
    ? "border-ok-100 bg-ok-100/40 text-ok-700"
    : pdInformativo
      ? "border-err-100 bg-err-100/30 text-err-500"
      : "border-warn-200 bg-warn-50 text-warn-700";
  const tonoEcuacion = ecOk
    ? "border-ok-100 bg-ok-100/40 text-ok-700"
    : ecInformativo
      ? "border-err-100 bg-err-100/30 text-err-500"
      : "border-warn-200 bg-warn-50 text-warn-700";
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validación del balance</span>
        <button
          type="button"
          onClick={onAyuda}
          aria-label="Qué significa cada validación de esta pantalla"
          title="Qué significa cada validación de esta pantalla"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:text-ink-700"
        >
          <Icon name="info" size={13} />
        </button>
      </div>
      <div className={`rounded-md border px-3 py-2 text-[12px] ${tonoPartida}`}>
        <span className="font-semibold">{pd.cuadra ? "Cuadra:" : pdInformativo ? "Diferencia informativa:" : "No coinciden:"}</span> partida doble · débitos <span className="font-semibold">{fmt(pd.debitos)}</span> vs créditos <span className="font-semibold">{fmt(pd.creditos)}</span> · diferencia <span className="font-semibold">{fmt(pd.diff)}</span>
        {pdInformativo && <span> · menor a {fmt(umbrales.descuadre)}, no cuenta como alerta</span>}
      </div>
      {ocultarEcuacion ? null : (
        <div className={`rounded-md border px-3 py-2 text-[12px] ${tonoEcuacion}`}>
          <span className="font-semibold">{ecOk ? "Cuadra:" : ecInformativo ? "Diferencia informativa:" : "No cuadra:"}</span> Activo = Pasivo + Patrimonio + Resultado · diferencia <span className="font-semibold">{fmt(v.ecuacionDiff)}</span>
          {ecInformativo ? <span> · menor a {fmt(umbrales.descuadre)}, no cuenta como alerta</span> : null}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ClaseCard label="Activo" calc={v.activo} archivo={v.activoArchivo} cuadra={v.activoCuadra} diff={v.activoDiff} umbrales={umbrales} explicacion={explicacionesClase.get("1")} />
        <ClaseCard label="Pasivo" calc={v.pasivo} archivo={v.pasivoArchivo} cuadra={v.pasivoCuadra} diff={v.pasivoDiff} umbrales={umbrales} explicacion={explicacionesClase.get("2")} />
        <ClaseCard label="Patrimonio" calc={v.patrimonio} archivo={v.patrimonioArchivo} cuadra={v.patrimonioCuadra} diff={v.patrimonioDiff} umbrales={umbrales} explicacion={explicacionesClase.get("3")} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniDato k="Ingresos" v={v.ingresos} archivo={v.ingresosArchivo} cuadra={v.ingresosCuadra} diff={v.ingresosDiff} umbrales={umbrales} explicacion={explicacionesClase.get("4")} />
        <MiniDato k="Gastos" v={v.gastos} archivo={v.gastosArchivo} cuadra={v.gastosCuadra} diff={v.gastosDiff} umbrales={umbrales} explicacion={explicacionesClase.get("5")} />
        <MiniDato k="Costos" v={v.costos} archivo={v.costosArchivo} cuadra={v.costosCuadra} diff={v.costosDiff} umbrales={umbrales} explicacion={explicacionesClase.get("6")} />
        <MiniDato k="Resultado" v={v.resultado} archivo={v.resultadoArchivo} cuadra={v.resultadoCuadra} diff={v.resultadoDiff} umbrales={umbrales} />
      </div>
    </div>
  );
}

// ---- Modal explicativo: qué verifica cada bloque de esta pantalla ----
// Pensado para un revisor contable: sin nombres de archivos ni funciones, solo
// el criterio de cada chequeo. Se abre desde el icono ⓘ del resumen superior
// y desde el del panel «Diagnóstico del descuadre» (misma puerta de entrada).
function ModalAyudaValidaciones({ onClose, umbrales }: { onClose: () => void; umbrales: UmbralesAlertas }) {
  return (
    <Modal open onClose={onClose} title="Cómo leer las validaciones del borrador" size="2xl">
      <div className="flex flex-col gap-4 text-[12.5px] leading-relaxed text-ink-700">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Chequeos globales (arriba)</h3>
          <ul className="mt-1.5 flex flex-col gap-2">
            <li>
              <span className="font-semibold text-ink-800">«Cuadra: partida doble»</span> — compara la suma de todos los débitos contra la suma de todos los créditos de las cuentas de detalle (el nivel más desagregado) del archivo cargado. Si coinciden, la partida doble cuadra.
            </li>
            <li>
              <span className="font-semibold text-ink-800">«Cuadra: Activo = Pasivo + Patrimonio + Resultado»</span> — aplica la ecuación contable sobre los saldos ya calculados a partir del detalle.
            </li>
            <li>
              <span className="font-semibold text-ink-800">Las tarjetas por clase</span> (Activo, Pasivo, Patrimonio, Ingresos, Gastos, Costos, Resultado) — comparan el total que se calculó sumando el detalle cargado contra el total que trae el propio archivo para esa clase. Cuando coinciden se muestra «✓ archivo … — cruza».
            </li>
          </ul>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Panel «Diagnóstico del descuadre»</h3>
          <p className="mt-1.5">
            Este panel puede mostrar hallazgos <span className="font-semibold">aunque arriba todo diga «Cuadra»</span>. La razón es que los chequeos de arriba son <span className="font-semibold">globales</span> (se calculan con el detalle completo y se comparan contra el archivo), mientras que el diagnóstico también revisa la <span className="font-semibold">consistencia interna de cada agrupadora</span>: si el total que la agrupadora declara coincide con la suma de las cuentas que cuelgan de ella.
          </p>
          <p className="mt-1.5">
            Una agrupadora puede quedar descuadrada por dentro sin que eso mueva ningún total global — por ejemplo, cuando una subcuenta quedó marcada como un subtotal repetido o le falta anidarse bajo su agrupadora: mientras tanto su aporte al padre se cuenta en cero y no altera la suma general, pero si se carga así, ese saldo corre el riesgo de contarse dos veces (o de no quedar reflejado donde corresponde).
          </p>
          <p className="mt-1.5">
            En general, un hallazgo de este tipo señala <span className="font-semibold">trabajo de estructura pendiente</span> (anidar la cuenta en su agrupadora, reubicarla o, si corresponde, omitirla) más que un error del archivo en sí. El resto de hallazgos del panel corresponden a los mismos tres chequeos globales de arriba (partida doble, ecuación contable y total por clase) cuando quedan sin explicar.
          </p>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Umbrales de alerta</h3>
          <p className="mt-1.5">
            Solo se reportan como alerta accionable las diferencias por encima de los umbrales configurados en <span className="font-semibold">Configuración › Parámetros</span> (hoy: {fmt(umbrales.descuadre)} para descuadres y {fmt(umbrales.naturaleza)} para saldos de naturaleza contraria). Las diferencias menores se muestran igual, marcadas como <span className="font-semibold">informativas</span>, pero no cuentan como alerta.
          </p>
        </section>
      </div>
    </Modal>
  );
}

function AdvertenciaArchivoFuente({
  diferencia,
  comentario,
  onComentarioChange,
}: {
  diferencia: number;
  comentario: string;
  onComentarioChange: (comentario: string) => void;
}) {
  const [comentarioAbierto, setComentarioAbierto] = useState(false);
  const [comentarioBorrador, setComentarioBorrador] = useState(comentario);
  const comentarioListo = comentario.trim().length > 0;
  const comentarioBorradorListo = comentarioBorrador.trim().length > 0;

  const abrirComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(true);
  };

  const cerrarComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(false);
  };

  const guardarComentario = () => {
    const comentarioLimpio = comentarioBorrador.trim();
    if (!comentarioLimpio) return;
    onComentarioChange(comentarioLimpio);
    setComentarioAbierto(false);
  };

  return (
    <>
      <input
        type="hidden"
        form="cargar-balance-oficial"
        name="comentarioPromocion"
        value={comentario}
      />
      <AdvertenciaArchivoFuenteDetalle
        diferencia={diferencia}
        resumida
        accion={
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={abrirComentario}
            className={`inline-flex w-full shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold shadow-sm transition sm:ml-auto sm:w-auto ${
              comentarioListo
                ? "border-ok-200 bg-white text-ok-700 hover:bg-ok-50"
                : "border-warn-200 bg-white text-warn-700 hover:bg-warn-50"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name={comentarioListo ? "check" : "msg"} size={14} />
              {comentarioListo ? "Comentario agregado" : "Comentario de aprobación"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${
                comentarioListo
                  ? "bg-ok-100 text-ok-700"
                  : "bg-err-100 text-err-700"
              }`}
            >
              {comentarioListo ? "Listo" : "Obligatorio"}
            </span>
            <Icon name="chev-r" size={12} />
          </button>
        }
        detalle={
          <Modal
            open={comentarioAbierto}
            onClose={cerrarComentario}
            title="Comentario de aprobación"
            size="lg"
            footer={
              <>
                <button
                  type="button"
                  onClick={cerrarComentario}
                  className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarComentario}
                  disabled={!comentarioBorradorListo}
                  className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar comentario
                </button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border border-warn-100 bg-[#fffaf0] px-3 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white">
                  <Icon name="warn" size={17} stroke={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
                    Justificación obligatoria
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-600">
                    El archivo no cumple la ecuación contable. Deja constancia de la
                    revisión antes de cargarlo como balance oficial.
                  </p>
                  <div className="mt-2 inline-flex rounded-md border border-warn-100 bg-white px-2.5 py-1.5 text-[11.5px] text-ink-600">
                    Diferencia del archivo:&nbsp;
                    <span className="font-semibold tabular-nums text-warn-800">
                      {fmt(diferencia)}
                    </span>
                  </div>
                </div>
              </div>

              <label htmlFor="comentario-promocion-balance" className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-700">
                  Argumento de aprobación
                  <span className="rounded-full bg-err-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-err-700">
                    Obligatorio
                  </span>
                </span>
                <textarea
                  id="comentario-promocion-balance"
                  autoFocus
                  required
                  maxLength={MAX_COMENTARIO_PROMOCION}
                  rows={6}
                  value={comentarioBorrador}
                  onChange={(event) => setComentarioBorrador(event.target.value)}
                  aria-describedby="ayuda-comentario-promocion contador-comentario-promocion"
                  placeholder="Ej.: Diferencia revisada y confirmada con el cliente; corresponde al archivo fuente."
                  className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700 outline-none transition placeholder:text-ink-400 focus:border-warn-500 focus:ring-2 focus:ring-warn-100"
                />
              </label>

              <div className="flex items-start justify-between gap-3">
                <p
                  id="ayuda-comentario-promocion"
                  className="max-w-sm text-[10.5px] leading-relaxed text-ink-500"
                >
                  El comentario quedará visible junto con esta advertencia en la versión oficial.
                </p>
                <div
                  id="contador-comentario-promocion"
                  className="shrink-0 text-[10px] tabular-nums text-ink-400"
                >
                  {comentarioBorrador.length}/{MAX_COMENTARIO_PROMOCION}
                </div>
              </div>
            </div>
          </Modal>
        }
      />
    </>
  );
}

function ClaseCard({ label, calc, archivo, cuadra, diff, umbrales, explicacion }: { label: string; calc: number; archivo: number | null; cuadra: boolean | null; diff: number | null; umbrales: UmbralesAlertas; explicacion?: ExplicacionClaseReubicacion }) {
  const informativo = cuadra === false && esDescuadreInformativo(diff, umbrales);
  const resuelta = cuadra === true || explicacion?.resuelta === true;
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : resuelta ? "border-ok-100 bg-ok-100/40" : informativo ? "border-err-100 bg-err-100/30" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-3 py-2 ${tono}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink-800">{fmt(calc)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10.5px] text-ink-400">solo calculado (sin total en archivo)</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10.5px] text-ok-700">✓ archivo {fmt(archivo)} — cruza</div>
      ) : explicacion?.resuelta ? (
        <div className="mt-0.5 text-[10.5px] text-ok-700">
          ✓ archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)} explicada por {explicacion.filas.length} {explicacion.filas.length === 1 ? "reubicación aprobada" : "reubicaciones aprobadas"} · residual {fmt(explicacion.residual)}
        </div>
      ) : (
        <div className={`mt-0.5 text-[10.5px] ${informativo ? "text-err-500" : "text-err-700"}`}>
          archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}
          {explicacion ? ` · residual ${fmt(explicacion.residual)}` : ""}
          {informativo ? " · informativo" : ""}
        </div>
      )}
    </div>
  );
}

function MiniDato({ k, v, archivo, cuadra, diff, umbrales, explicacion }: { k: string; v: number; archivo: number | null; cuadra: boolean | null; diff: number | null; umbrales: UmbralesAlertas; explicacion?: ExplicacionClaseReubicacion }) {
  const informativo = cuadra === false && esDescuadreInformativo(diff, umbrales);
  const resuelta = cuadra === true || explicacion?.resuelta === true;
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : resuelta ? "border-ok-100 bg-ok-100/40" : informativo ? "border-err-100 bg-err-100/30" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${tono}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{k}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-700">{fmt(v)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10px] text-ink-400">solo calculado</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10px] text-ok-700">✓ archivo {fmt(archivo)}</div>
      ) : explicacion?.resuelta ? (
        <div className="mt-0.5 text-[10px] text-ok-700">
          ✓ archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)} explicada · residual {fmt(explicacion.residual)}
        </div>
      ) : (
        <div className={`mt-0.5 text-[10px] ${informativo ? "text-err-500" : "text-err-700"}`}>
          archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}
          {explicacion ? ` · residual ${fmt(explicacion.residual)}` : ""}
          {informativo ? " · informativo" : ""}
        </div>
      )}
    </div>
  );
}

function ManipulacionesRiesgosasPanel({
  riesgos,
  validacion,
  onRevisar,
  onDeshacer,
}: {
  riesgos: ManipulacionRiesgosaBorrador[];
  validacion: ValidacionContable;
  onRevisar: (filaNum: number) => void;
  onDeshacer: (filaNum: number) => void;
}) {
  const diferenciaClase = (clase: string): number | null => ({
    "1": validacion.activoDiff,
    "2": validacion.pasivoDiff,
    "3": validacion.patrimonioDiff,
    "4": validacion.ingresosDiff,
    "5": validacion.gastosDiff,
    "6": validacion.costosDiff,
    "7": validacion.costosDiff,
  }[clase] ?? null);

  return (
    <section className="overflow-hidden rounded-lg border border-l-4 border-err-200 border-l-err-500 bg-err-50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-err-700">
            Control de manipulaciones manuales
          </div>
          <p className="mt-0.5 text-[12.5px] font-semibold text-ink-800">
            {riesgos.length} reubicación(es) riesgosa(s) pendiente(s) de revisión
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-600">
            Estas cuentas conservan su código, pero fueron movidas manualmente a una masa contable distinta.
          </p>
        </div>
        <span className="rounded-full border border-err-200 bg-white px-2 py-1 text-[10px] font-semibold text-err-700">
          Bloquea la carga
        </span>
      </div>
      <div className="border-t border-black/5 bg-white/70">
        {riesgos.map((riesgo) => {
          const clasesQueExplica = [riesgo.claseOrigen, riesgo.claseDestino]
            .filter((clase, indice, todas) => todas.indexOf(clase) === indice)
            .filter((clase) => {
              const diferencia = diferenciaClase(clase);
              return diferencia != null && Math.abs(Math.abs(diferencia) - Math.abs(riesgo.monto)) <= 1;
            })
            .map(nombreClaseContable);
          return (
            <div key={riesgo.filaNum} className="flex flex-col gap-2 border-t border-ink-100 px-4 py-3 first:border-t-0 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-500">{riesgo.codigoCrudo || riesgo.codigo}</span>
                  <span className="text-[12px] font-semibold text-ink-800">{riesgo.nombre}</span>
                  <span className="rounded border border-err-200 bg-err-50 px-1.5 py-0.5 text-[10px] font-semibold text-err-700">
                    {nombreClaseContable(riesgo.claseOrigen)} → {nombreClaseContable(riesgo.claseDestino)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-600">
                  Saldo <span className="font-semibold tabular-nums">{fmt(riesgo.monto)}</span> · destino manual{" "}
                  <span className="font-semibold">{riesgo.destino.codigoCrudo || riesgo.destino.codigo} {riesgo.destino.nombre}</span>
                </div>
                {clasesQueExplica.length > 0 && (
                  <div className="mt-1 text-[10.5px] font-medium text-err-700">
                    Este saldo explica el 100% de la diferencia visible en {clasesQueExplica.join(" y ")}.
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => onRevisar(riesgo.filaNum)} className="rounded-md border border-warn-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-warn-800 hover:bg-warn-50">
                  Revisar y justificar
                </button>
                <button type="button" onClick={() => onDeshacer(riesgo.filaNum)} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
                  Deshacer y no repetir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Diagnóstico determinista del descuadre (colapsado por defecto) ----
function DiagnosticoPanel({ hallazgos, diferenciasClase, manipulaciones, onAyuda }: { hallazgos: Hallazgo[]; diferenciasClase: number; manipulaciones: number; onAyuda: () => void }) {
  const [abierto, setAbierto] = useState(false);
  // Cuentas expandidas DENTRO del panel (una por hallazgo, por índice) — el detalle de
  // cuenta(s) es aditivo: el resumen (título + monto + detalle) sigue viéndose igual.
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  // Sin hallazgos el panel NO desaparece (movería la tabla en cada edición): cambia a tono
  // verde y deja de ser desplegable. Colapsado, ambos estados miden lo mismo.
  const total = hallazgos.length + diferenciasClase + manipulaciones;
  const hay = total > 0;
  // Solo los hallazgos tipo "nodo" traen cuenta(s) para detallar (código/nombre/montos);
  // partida doble, ecuación y clase ya muestran su explicación completa en el resumen.
  const indicesConDetalle = useMemo(
    () => hallazgos.reduce<number[]>((acc, h, i) => { if (h.nodo) acc.push(i); return acc; }, []),
    [hallazgos],
  );
  const toggleUno = (i: number) => setExpandidos((prev) => {
    const siguiente = new Set(prev);
    if (siguiente.has(i)) siguiente.delete(i); else siguiente.add(i);
    return siguiente;
  });
  const expandirTodo = () => setExpandidos(new Set(indicesConDetalle));
  const colapsarTodo = () => setExpandidos(new Set());
  const hayContenidoExpandido = indicesConDetalle.some((indice) => expandidos.has(indice));
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${hay ? "border-err-100 bg-err-100/40" : "border-ok-100 bg-ok-100/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            disabled={!hay}
            aria-expanded={hay ? abierto : undefined}
            className={`flex min-w-0 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider ${hay ? "text-err-700" : "cursor-default text-ok-700"}`}
          >
            <Icon name={hay ? chevronDivulgacion(abierto) : "check"} size={14} />
            Diagnóstico del descuadre
            <span className={`ml-1 rounded-full border bg-white px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${hay ? "border-err-100 text-err-700" : "border-ok-100 text-ok-700"}`}>
              {hay ? total : "sin hallazgos"}
            </span>
          </button>
          <button
            type="button"
            onClick={onAyuda}
            aria-label="Qué significa este diagnóstico"
            title="Qué significa este diagnóstico"
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition ${hay ? "text-err-400 hover:text-err-700" : "text-ok-500 hover:text-ok-700"}`}
          >
            <Icon name="info" size={13} />
          </button>
        </div>
        {hay && abierto && indicesConDetalle.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={expandirTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">
              <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Expandir todo
            </button>
            <button type="button" onClick={colapsarTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">
              <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Colapsar todo
            </button>
          </div>
        )}
      </div>
      {hay && abierto && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {diferenciasClase > 0 && (
            <li className="rounded-md border border-err-100 bg-white px-3 py-2 text-[12px]">
              <div className="font-semibold text-ink-800">{diferenciasClase} diferencia(s) por clase contable</div>
              <div className="mt-0.5 text-[11.5px] text-ink-600">Se muestran en las tarjetas superiores para comparar el archivo con el detalle calculado.</div>
            </li>
          )}
          {manipulaciones > 0 && (
            <li className="rounded-md border border-err-100 bg-white px-3 py-2 text-[12px]">
              <div className="font-semibold text-ink-800">{manipulaciones} reubicación(es) manual(es) entre clases</div>
              <div className="mt-0.5 text-[11.5px] text-ink-600">Revisa el control de manipulaciones mostrado arriba.</div>
            </li>
          )}
          {hallazgos.map((h, i) => {
            const tono = h.severidad === "alta" ? "border-err-100" : "border-warn-100";
            const tieneDetalle = h.nodo != null;
            const expandido = expandidos.has(i);
            return (
              <li key={i} className={`rounded-md border bg-white px-3 py-2 text-[12px] ${tono}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink-800">{h.titulo} <span className="font-normal text-ink-500">· {fmt(h.monto)}</span></div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{h.detalle}</div>
                  </div>
                  {tieneDetalle && (
                    <button
                      type="button"
                      onClick={() => toggleUno(i)}
                      aria-expanded={expandido}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[10.5px] font-medium text-ink-600 hover:bg-ink-50"
                    >
                      <Icon name={chevronDivulgacion(expandido)} size={11} />
                      {expandido ? "Ocultar cuentas" : "Ver cuentas"}
                    </button>
                  )}
                </div>
                {tieneDetalle && expandido && <DetalleCuentasHallazgo hallazgo={h} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Detalle de cuenta(s) de un hallazgo tipo "nodo": el nodo con descuadre, las cuentas HOJA
// (nivel más desagregado disponible del archivo — típicamente Auxiliar/8 dígitos) que cuelgan
// de él, y la cuenta candidata en otra rama si se detectó una de magnitud equivalente. Se
// muestra al expandir la alerta para no obligar a buscar la cuenta en el listado principal.
function DetalleCuentasHallazgo({ hallazgo }: { hallazgo: Hallazgo }) {
  const filas: { rol: string; cuenta: CuentaRef; destacada?: boolean }[] = [];
  if (hallazgo.nodo) filas.push({ rol: "Nodo con descuadre", cuenta: hallazgo.nodo });
  for (const cuenta of hallazgo.cuentas ?? []) filas.push({ rol: nombreNivelCuenta(cuenta.codigo), cuenta });
  if (hallazgo.candidato) filas.push({ rol: "Candidata en otra rama", cuenta: hallazgo.candidato, destacada: true });
  const restantes = (hallazgo.cuentasTotal ?? 0) - (hallazgo.cuentas?.length ?? 0);

  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-ink-100">
      <table className="w-full min-w-[600px] text-[11px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50 text-[10px] uppercase tracking-wide text-ink-500">
            <th className="px-2 py-1 text-left font-semibold">Cuenta</th>
            <th className="px-2 py-1 text-left font-semibold">Nombre</th>
            <th className="px-2 py-1 text-left font-semibold">Rol</th>
            <th className="px-2 py-1 text-right font-semibold">Saldo anterior</th>
            <th className="px-2 py-1 text-right font-semibold">Débitos</th>
            <th className="px-2 py-1 text-right font-semibold">Créditos</th>
            <th className="px-2 py-1 text-right font-semibold">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={`border-t border-ink-100 ${f.destacada ? "bg-blue-50/60" : ""}`}>
              <td className="whitespace-nowrap px-2 py-1 font-mono text-ink-700">{f.cuenta.codigo}</td>
              <td className="max-w-[220px] truncate px-2 py-1 text-ink-700" title={f.cuenta.nombre}>{f.cuenta.nombre || "—"}</td>
              <td className="whitespace-nowrap px-2 py-1 text-ink-500">{f.rol}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmtContable(f.cuenta.saldoInicial)}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmtContable(f.cuenta.debitos)}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmtContable(f.cuenta.creditos)}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums font-semibold text-ink-800">{fmtContable(f.cuenta.saldoFinal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {restantes > 0 && (
        <div className="border-t border-ink-100 bg-ink-50 px-2 py-1 text-[10.5px] text-ink-500">
          y {restantes} cuenta(s) más — usa el filtro «Alertas» del listado principal para verlas todas.
        </div>
      )}
    </div>
  );
}

// ---- Árbol crudo (agrupadora / movimiento, descuadre subrayado) ----

/**
 * Ayuda al pasar el mouse: aparece al instante (el `title` nativo del navegador tarda ~1 s
 * y se siente lento en el árbol). Portal + `position: fixed` para no quedar recortada por
 * el `overflow` de la tabla del borrador.
 */
function AyudaInstantanea({
  texto,
  className,
  children,
}: {
  texto: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const mostrar = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = 320;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - maxW - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 96 && r.top > spaceBelow;
    setTip({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  };

  return (
    <>
      <span
        ref={ref}
        className={className}
        tabIndex={0}
        onMouseEnter={mostrar}
        onMouseLeave={() => setTip(null)}
        onFocus={mostrar}
        onBlur={() => setTip(null)}
      >
        {children}
      </span>
      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tip.left,
              top: tip.top,
              zIndex: 80,
              maxWidth: 320,
              transform: tip.above ? "translateY(-100%)" : undefined,
            }}
            className="pointer-events-none rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-[11px] leading-snug text-white shadow-lg"
          >
            {texto}
          </div>,
          document.body,
        )}
    </>
  );
}

export function NombreCuentaArbol({
  nombre,
  omitida,
  descuadrado,
  descuadreAccionable,
  umbralDescuadre,
}: {
  nombre: string;
  omitida: boolean;
  descuadrado: boolean;
  descuadreAccionable: boolean;
  umbralDescuadre: number;
}) {
  if (!descuadrado) {
    return (
      <span className={`text-[12px] ${omitida ? "text-ink-400 line-through" : "text-ink-800"}`} title={nombre}>
        {nombre}
      </span>
    );
  }

  const className = `text-[12px] ${omitida ? "text-ink-400 line-through" : descuadreAccionable ? "font-semibold text-err-700 underline decoration-err-500 decoration-2 underline-offset-2" : "font-medium text-err-500 underline decoration-err-100 decoration-1 underline-offset-2"}`;

  if (!descuadreAccionable) {
    return (
      <AyudaInstantanea
        className={`cursor-help ${className}`}
        texto={`${nombre} — Δ informativo (menor a ${fmt(umbralDescuadre)}): se muestra, pero no cuenta como alerta ni en el diagnóstico superior.`}
      >
        {nombre}
      </AyudaInstantanea>
    );
  }

  return (
    <span className={className}>{nombre}</span>
  );
}

export { esAlertaNodo } from "@/lib/balance/alerta-borrador";

// Posición de cada nodo para el TABULADOR: `prev` = filaNum del hermano anterior (para
// indentar → colgarlo de él); `abuelo` = filaNum del abuelo (para desindentar → subirlo).
type Posicion = { prev: number | null; abuelo: number | null };
function construirPosiciones(arbol: NodoBorrador[]): Map<number, Posicion> {
  const m = new Map<number, Posicion>();
  const rec = (nodos: NodoBorrador[], abuelo: number | null, padre: number | null) => {
    nodos.forEach((n, i) => {
      m.set(n.filaNum, { prev: i > 0 ? nodos[i - 1].filaNum : null, abuelo });
      rec(n.hijos, padre, n.filaNum);
    });
  };
  rec(arbol, null, null);
  return m;
}
const tipoVisibleCuenta = (cuenta: CuentaReubicacion) =>
  `${nombreNivelCuenta(cuenta.codigo)} · ${cuenta.tipoFila === "agrupadora" ? "Agrupadora" : "Movimiento"}`;

const rutaVisibleCuenta = (cuenta: CuentaReubicacion) =>
  cuenta.ruta.slice(-3).map((p) => `${p.codigoCrudo} ${p.nombre}`).join(" › ");

const columnasComparacionAgrupadora = [
  ["saldoInicial", "Saldo anterior"],
  ["debitos", "Débito"],
  ["creditos", "Crédito"],
  ["saldoFinal", "Saldo actual"],
] as const;

export function SaldoActualMovimientoAgrupadora({ saldo }: { saldo: number }) {
  const saldoFormateado = fmtContable(saldo);
  return (
    <span className="col-start-2 flex shrink-0 items-baseline gap-1.5 sm:col-start-auto sm:min-w-32 sm:flex-col sm:items-end sm:gap-0 sm:text-right">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
        Saldo actual
      </span>
      <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink-800">{saldoFormateado}</span>
    </span>
  );
}

/** Conversión manual Movimiento → Agrupadora, con sugerencia y control informativo. */
export function GestionarAgrupadoraModal({ indice, filaNum, onConfirmar, onClose }: {
  indice: IndiceReubicacion;
  filaNum: number;
  onConfirmar: (filaNum: number, seleccionadas: number[]) => void;
  onClose: () => void;
}) {
  const origen = indice.porFila.get(filaNum) ?? null;
  const sugeridas = useMemo(() => sugerirMovimientosAgrupadora(indice, filaNum), [indice, filaNum]);
  const hijasManuales = useMemo(
    () => indice.cuentas.filter((cuenta) => cuenta.padreManual === filaNum).map((cuenta) => cuenta.filaNum),
    [indice, filaNum],
  );
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(
    () => new Set([...hijasManuales, ...sugeridas]),
  );
  const [buscar, setBuscar] = useState("");
  const busqueda = useDeferredValue(normalizarBusquedaCuenta(buscar));
  const candidatas = useMemo(() => {
    const filas = indice.cuentas.filter((cuenta) =>
      cuenta.filaNum !== filaNum &&
      cuenta.tipoFila === "movimiento" &&
      !cuenta.omitida &&
      !cuenta.subtotalDuplicado &&
      (busqueda === "" || cuenta.busqueda.includes(busqueda)),
    );
    return filas
      .sort((a, b) => {
        const selA = seleccionadas.has(a.filaNum);
        const selB = seleccionadas.has(b.filaNum);
        if (selA !== selB) return selA ? -1 : 1;
        const sugA = sugeridas.includes(a.filaNum);
        const sugB = sugeridas.includes(b.filaNum);
        if (sugA !== sugB) return sugA ? -1 : 1;
        return a.filaNum - b.filaNum;
      })
      .slice(0, 120);
  }, [indice, filaNum, busqueda, seleccionadas, sugeridas]);
  const filasSeleccionadas = useMemo(
    () => [...seleccionadas].map((id) => indice.porFila.get(id)).filter((cuenta): cuenta is CuentaReubicacion => !!cuenta),
    [seleccionadas, indice],
  );
  const comparacion = useMemo(
    () => origen ? compararTotalesAgrupacion(origen, filasSeleccionadas) : null,
    [origen, filasSeleccionadas],
  );

  if (!origen) return null;
  const alternar = (id: number) => setSeleccionadas((actual) => {
    const siguiente = new Set(actual);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    return siguiente;
  });
  const aplicarSugerencia = () => setSeleccionadas(new Set(sugeridas));
  const footer = (
    <>
      <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Cancelar</button>
      <button
        type="button"
        onClick={() => onConfirmar(filaNum, [...seleccionadas].sort((a, b) => a - b))}
        className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
      >
        {origen.tipoFila === "agrupadora" ? "Actualizar agrupadora" : "Convertir en agrupadora"}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title="Convertir cuenta en agrupadora" size="3xl" footer={footer}>
      <div className="space-y-4 text-[12px]">
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-500">{origen.codigoCrudo}</span>
            <span className="font-semibold text-ink-800">{origen.nombre}</span>
            <span className="rounded border border-blue-200 bg-white px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-navy-700">
              {nombreNivelCuenta(origen.codigo)} · Agrupadora manual
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-600">
            Ajuste manual de auditoría. No modifica la lectura automática ni el análisis de IA. Puedes dejarla sin movimientos o elegir cualquiera de los movimientos del borrador.
          </p>
        </div>

        <div className={`rounded-md border px-3 py-2 ${sugeridas.length > 0 ? "border-ok-200 bg-ok-100/40 text-ok-800" : "border-warn-200 bg-warn-50 text-warn-800"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>
              {sugeridas.length > 0
                ? <><span className="font-semibold">Sugerencia encontrada:</span> {sugeridas.length} movimiento(s) consecutivo(s) suman los cuatro valores de esta cuenta.</>
                : <><span className="font-semibold">Sin coincidencia exacta automática.</span> Busca y selecciona manualmente los movimientos que deseas anidar.</>}
            </span>
            {sugeridas.length > 0 && (
              <button type="button" onClick={aplicarSugerencia} className="shrink-0 rounded-md border border-ok-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-ok-700 hover:bg-ok-100">
                Usar sugerencia
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimientos que quedarán debajo</span>
            <span className="text-[10.5px] text-ink-400">{seleccionadas.size} seleccionado(s) · puede ser 0</span>
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-2">
            <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-ink-400 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
              <Icon name="search" size={14} />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar movimiento por código o nombre…" className="w-full bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400" />
            </div>
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto" role="listbox" aria-label="Movimientos que se anidarán">
              {candidatas.map((cuenta) => {
                const elegida = seleccionadas.has(cuenta.filaNum);
                const sugerida = sugeridas.includes(cuenta.filaNum);
                return (
                  <label key={cuenta.filaNum} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-2 sm:grid-cols-[auto_6rem_minmax(0,1fr)_8rem] ${elegida ? "border-blue-300 bg-blue-50" : "border-transparent bg-white hover:border-blue-200 hover:bg-blue-50/50"}`}>
                    <input className="row-span-3 self-start sm:row-span-1 sm:self-center" type="checkbox" checked={elegida} onChange={() => alternar(cuenta.filaNum)} />
                    <span className="min-w-0 truncate font-mono text-[11px] text-ink-500">{cuenta.codigoCrudo}</span>
                    <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:col-start-auto sm:flex-nowrap">
                      <span className="min-w-32 flex-1 truncate font-medium text-ink-800 sm:min-w-0" title={cuenta.nombre}>{cuenta.nombre}</span>
                      {sugerida && <span className="shrink-0 rounded-full bg-ok-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ok-700">Sugerido</span>}
                      <span className="shrink-0 rounded border border-blue-100 bg-blue-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-navy-700">{nombreNivelCuenta(cuenta.codigo)} · Movimiento</span>
                    </span>
                    <SaldoActualMovimientoAgrupadora saldo={cuenta.saldoFinal} />
                  </label>
                );
              })}
              {candidatas.length === 0 && <div className="px-3 py-6 text-center text-ink-400">No encontramos movimientos con esa búsqueda.</div>}
            </div>
          </div>
        </div>

        {comparacion && (
          <div>
            <div className={`mb-2 rounded-md border px-3 py-2 ${comparacion.coincide ? "border-ok-200 bg-ok-100/40 text-ok-800" : "border-warn-200 bg-warn-50 text-warn-800"}`}>
              <span className="font-semibold">{comparacion.coincide ? "Los cuatro valores coinciden." : "Los valores seleccionados no coinciden completamente."}</span>{" "}
              Este control es informativo y no impide convertir ni guardar la cuenta.
            </div>
            <div className="overflow-hidden rounded-lg border border-ink-200">
              <table className="w-full border-collapse text-[11px]">
                <thead className="bg-ink-50 text-ink-500">
                  <tr><th className="px-3 py-2 text-left font-semibold">Control</th><th className="px-3 py-2 text-right font-semibold">Cuenta</th><th className="px-3 py-2 text-right font-semibold">Seleccionados</th><th className="px-3 py-2 text-right font-semibold">Diferencia</th></tr>
                </thead>
                <tbody>
                  {columnasComparacionAgrupadora.map(([campo, etiqueta]) => (
                    <tr key={campo} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium text-ink-700">{etiqueta}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(comparacion.objetivo[campo])}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(comparacion.seleccion[campo])}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Math.abs(comparacion.diferencias[campo]) <= 1 ? "text-ok-700" : "text-warn-800"}`}>{fmtContable(comparacion.diferencias[campo])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Modal único: desde la acción global busca origen; desde la fila lo preselecciona. */
function MoverModal({ indice, filaNumInicial, revisarActual = false, revisionInicial, guardando = false, onConfirmar, onClose }: {
  indice: IndiceReubicacion;
  filaNumInicial: number | null;
  revisarActual?: boolean;
  revisionInicial: string | null;
  guardando?: boolean;
  onConfirmar: (filaNum: number, destino: number | null, revision?: { justificacion: string; memorizar: boolean }) => void;
  onClose: () => void;
}) {
  const [origenId, setOrigenId] = useState<number | null>(filaNumInicial);
  const [destinoId, setDestinoId] = useState<number | null>(() => {
    if (!revisarActual || filaNumInicial == null) return null;
    return indice.porFila.get(filaNumInicial)?.padreManual ?? null;
  });
  const [buscarOrigen, setBuscarOrigen] = useState("");
  const [buscarDestino, setBuscarDestino] = useState("");
  const [justificacion, setJustificacion] = useState(revisionInicial ?? "");
  const [memorizar, setMemorizar] = useState(false);
  const busquedaOrigen = useDeferredValue(normalizarBusquedaCuenta(buscarOrigen));
  const busquedaDestino = useDeferredValue(normalizarBusquedaCuenta(buscarDestino));
  const origen = origenId == null ? null : indice.porFila.get(origenId) ?? null;
  const destinos = useMemo(() => origenId == null ? [] : destinosReubicacion(indice, origenId), [indice, origenId]);
  const origenesVisibles = useMemo(() => {
    const lista = busquedaOrigen === "" ? indice.cuentas : indice.cuentas.filter((c) => c.busqueda.includes(busquedaOrigen));
    return lista.slice(0, 60);
  }, [busquedaOrigen, indice]);
  const destinosVisibles = useMemo(() => {
    const lista = busquedaDestino === "" ? destinos : destinos.filter((c) => c.busqueda.includes(busquedaDestino));
    return lista.slice(0, 80);
  }, [busquedaDestino, destinos]);
  const destino = destinoId == null ? null : indice.porFila.get(destinoId) ?? null;
  const cruceRiesgoso = !!origen && !!destino
    && (origen.tipoFila === "movimiento" || origen.tipoFila === "descuadre")
    && !origen.omitida
    && !clasesContablesCompatibles(
      claseContableBorrador(origen.codigo),
      claseContableBorrador(destino.codigo),
    );
  const revisionValida = !cruceRiesgoso || justificacion.trim().length >= 10;

  const elegirOrigen = (filaNum: number) => {
    setOrigenId(filaNum);
    setDestinoId(null);
    setBuscarOrigen("");
    setBuscarDestino("");
  };

  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={guardando} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">Cancelar</button>
      {origen?.padreManual != null && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => onConfirmar(origen.filaNum, null)}
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          Revertir movimiento cta
        </button>
      )}
      <button
        type="button"
        disabled={!origen || !destino || !revisionValida || guardando}
        onClick={() => {
          if (!origen || !destino || !revisionValida) return;
          onConfirmar(
            origen.filaNum,
            destino.filaNum,
            cruceRiesgoso ? { justificacion: justificacion.trim(), memorizar } : undefined,
          );
        }}
        className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {guardando
          ? <EstadoProcesando>Aprobando</EstadoProcesando>
          : cruceRiesgoso
            ? "Aprobar movimiento"
            : "Reubicar cuenta"}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title="Reubicar cuenta en el árbol" size="2xl" footer={footer}>
      <div className="flex flex-col gap-4 text-[12.5px]">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">1. Cuenta que se moverá</span>
            {origen && (
              <button type="button" onClick={() => { setOrigenId(null); setDestinoId(null); }} className="text-[11px] font-semibold text-blue-700 hover:underline">
                Cambiar cuenta
              </button>
            )}
          </div>
          {origen ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-ink-500">{origen.codigoCrudo}</span>
                <span className="font-semibold text-ink-800">{origen.nombre}</span>
                <span className={`rounded border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide ${origen.tipoFila === "agrupadora" ? "border-ink-200 bg-white text-ink-600" : "border-blue-200 bg-blue-100 text-navy-700"}`}>{tipoVisibleCuenta(origen)}</span>
                {origen.descendientes.length > 0 && <Chip label={`Moverá también ${origen.descendientes.length} descendiente(s)`} tone="blue" />}
              </div>
              {rutaVisibleCuenta(origen) && <div className="mt-1 truncate text-[10.5px] text-ink-500">Ubicación actual: {rutaVisibleCuenta(origen)}</div>}
            </div>
          ) : (
            <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-2">
              <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-ink-400 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                <Icon name="search" size={14} />
                <input autoFocus value={buscarOrigen} onChange={(e) => setBuscarOrigen(e.target.value)} placeholder="Buscar la cuenta por código o nombre…" className="w-full bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400" />
              </div>
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto" role="listbox" aria-label="Cuentas disponibles para mover">
                {origenesVisibles.map((c) => (
                  <button key={c.filaNum} type="button" onClick={() => elegirOrigen(c.filaNum)} className="flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left hover:border-blue-200 hover:bg-blue-50">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-ink-500">{c.codigoCrudo}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{c.nombre}</span>
                    <span className="shrink-0 rounded border border-ink-150 bg-white px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">{tipoVisibleCuenta(c)}</span>
                  </button>
                ))}
                {origenesVisibles.length === 0 && <div className="px-3 py-6 text-center text-ink-400">No encontramos cuentas con esa búsqueda.</div>}
              </div>
            </div>
          )}
        </div>

        {origen && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">2. Anidar bajo una agrupadora</span>
              <span className="text-[10.5px] text-ink-400">{destinos.length} destino(s) válido(s)</span>
            </div>
            <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-2">
              <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-ink-400 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                <Icon name="search" size={14} />
                <input value={buscarDestino} onChange={(e) => setBuscarDestino(e.target.value)} placeholder="Buscar agrupadora por código o nombre…" className="w-full bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400" />
              </div>
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Agrupadoras de destino">
                {destinosVisibles.map((c) => {
                  const sugerido = esDestinoSugerido(origen, c);
                  const elegido = destinoId === c.filaNum;
                  return (
                    <label key={c.filaNum} className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition ${elegido ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "border-transparent bg-white hover:border-blue-200 hover:bg-blue-50/60"}`}>
                      <input type="radio" name="destino-reubicacion" checked={elegido} onChange={() => setDestinoId(c.filaNum)} className="mt-0.5" />
                      <span className="w-24 shrink-0 font-mono text-[11px] text-ink-500">{c.codigoCrudo}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-800" title={c.nombre}>{c.nombre}</span>
                        {rutaVisibleCuenta(c) && <span className="block truncate text-[10.5px] text-ink-400">{rutaVisibleCuenta(c)}</span>}
                      </span>
                      {sugerido && <span className="shrink-0 rounded-full bg-ok-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ok-700">Sugerido</span>}
                      <span className="shrink-0 rounded border border-ink-150 bg-ink-50 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">{tipoVisibleCuenta(c)}</span>
                    </label>
                  );
                })}
                {destinosVisibles.length === 0 && <div className="px-3 py-6 text-center text-ink-400">No hay agrupadoras válidas para esta búsqueda.</div>}
              </div>
            </div>
          </div>
        )}

        {origen && destino && (
          <>
            {cruceRiesgoso ? (
              <div className="rounded-md border border-err-200 bg-err-50 px-3 py-3 text-[11.5px] text-err-800">
                <div className="flex items-start gap-2">
                  <Icon name="warn" size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Esta reubicación cruza clases contables</div>
                    <p className="mt-0.5">
                      {origen.codigoCrudo} pertenece a {nombreClaseContable(claseContableBorrador(origen.codigo))} y quedará bajo {nombreClaseContable(claseContableBorrador(destino.codigo))}. Esto puede trasladar el saldo de una masa contable a otra.
                    </p>
                  </div>
                </div>
                <label className="mt-3 block">
                  <span className="font-semibold">Justificación excepcional</span>
                  <textarea
                    value={justificacion}
                    onChange={(event) => setJustificacion(event.target.value)}
                    maxLength={600}
                    rows={3}
                    placeholder="Explica por qué esta ubicación es correcta (mínimo 10 caracteres)…"
                    className="mt-1 w-full resize-y rounded-md border border-err-200 bg-white px-2.5 py-2 text-[12px] text-ink-800 outline-none focus:border-err-400"
                  />
                </label>
                <label className="mt-2 flex items-start gap-2 text-ink-700">
                  <input type="checkbox" checked={memorizar} onChange={(event) => setMemorizar(event.target.checked)} className="mt-0.5" />
                  <span>Aplicar esta ubicación también en próximas cargas del cliente. Déjalo desmarcado si es una excepción de este archivo.</span>
                </label>
                {!revisionValida && <div className="mt-1 font-medium text-err-700">La justificación debe tener al menos 10 caracteres.</div>}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11.5px] text-blue-800">
                <Icon name="move-tree" size={14} className="mt-0.5 shrink-0" />
                <span><span className="font-semibold">{origen.codigoCrudo} {origen.nombre}</span> quedará bajo <span className="font-semibold">{destino.codigoCrudo} {destino.nombre}</span>. Al confirmar, la tabla abrirá esa rama y resaltará la nueva ubicación.</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

type AccionMenuCuenta = {
  id: string;
  icono: IconName;
  etiqueta: string;
  descripcion: string;
  ejecutar: () => void;
  deshabilitada?: boolean;
  tono?: "normal" | "peligro";
};

function MenuAccionesCuenta({
  filaNum,
  codigo,
  nombre,
  acciones,
}: {
  filaNum: number;
  codigo: string;
  nombre: string;
  acciones: AccionMenuCuenta[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcionActiva, setDescripcionActiva] = useState<string | null>(null);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const opcionesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = `acciones-cuenta-${filaNum}`;

  const cerrar = () => {
    setAbierto(false);
    setDescripcionActiva(null);
  };

  const abrirOCerrar = () => {
    if (abierto) {
      cerrar();
      return;
    }
    const rect = botonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margen = 8;
    const ancho = Math.min(288, window.innerWidth - margen * 2);
    const altoEstimado = Math.min(
      window.innerHeight - margen * 2,
      Math.max(168, acciones.length * 38 + 88),
    );
    const left = Math.min(
      Math.max(margen, rect.right - ancho),
      window.innerWidth - ancho - margen,
    );
    const topDebajo = rect.bottom + 4;
    const top = topDebajo + altoEstimado <= window.innerHeight - margen
      ? topDebajo
      : Math.max(margen, rect.top - altoEstimado - 4);
    setPosicion({ top, left });
    setAbierto(true);
  };

  useEffect(() => {
    if (!abierto) return;
    const frame = window.requestAnimationFrame(() => {
      opcionesRef.current.find((opcion) => opcion && !opcion.disabled)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrarAfuera = (event: PointerEvent) => {
      const objetivo = event.target as Node;
      if (!botonRef.current?.contains(objetivo) && !menuRef.current?.contains(objetivo)) cerrar();
    };
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cerrar();
      botonRef.current?.focus();
    };
    const cerrarAlMoverVista = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      cerrar();
    };
    document.addEventListener("pointerdown", cerrarAfuera);
    document.addEventListener("keydown", cerrarConEscape);
    window.addEventListener("resize", cerrarAlMoverVista);
    window.addEventListener("scroll", cerrarAlMoverVista, true);
    return () => {
      document.removeEventListener("pointerdown", cerrarAfuera);
      document.removeEventListener("keydown", cerrarConEscape);
      window.removeEventListener("resize", cerrarAlMoverVista);
      window.removeEventListener("scroll", cerrarAlMoverVista, true);
    };
  }, [abierto]);

  const navegarMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const opciones = opcionesRef.current.filter(
      (opcion): opcion is HTMLButtonElement => !!opcion && !opcion.disabled,
    );
    if (opciones.length === 0) return;
    const actual = opciones.indexOf(document.activeElement as HTMLButtonElement);
    let siguiente: number | null = null;
    if (event.key === "ArrowDown") siguiente = actual < 0 ? 0 : (actual + 1) % opciones.length;
    if (event.key === "ArrowUp") siguiente = actual < 0 ? opciones.length - 1 : (actual - 1 + opciones.length) % opciones.length;
    if (event.key === "Home") siguiente = 0;
    if (event.key === "End") siguiente = opciones.length - 1;
    if (event.key === "Tab") cerrar();
    if (siguiente == null) return;
    event.preventDefault();
    opciones[siguiente]?.focus();
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        aria-label={`Acciones de la cuenta ${codigo} ${nombre}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={menuId}
        title="Más acciones"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          abrirOCerrar();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !abierto) {
            event.preventDefault();
            abrirOCerrar();
          }
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <Icon name="more" size={15} />
      </button>
      {abierto && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Acciones de ${codigo} ${nombre}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={navegarMenu}
          style={{ top: posicion.top, left: posicion.left }}
          className="fixed z-[80] max-h-[calc(100vh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-ink-200 bg-white p-1.5 text-left shadow-xl ring-1 ring-navy-900/5"
        >
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Acciones de cuenta
          </div>
          <div className="flex flex-col">
            {acciones.map((accion, indice) => (
              <button
                key={accion.id}
                ref={(elemento) => { opcionesRef.current[indice] = elemento; }}
                type="button"
                role="menuitem"
                disabled={accion.deshabilitada}
                aria-describedby={`${menuId}-descripcion`}
                onMouseEnter={() => setDescripcionActiva(accion.descripcion)}
                onMouseLeave={() => setDescripcionActiva(null)}
                onFocus={() => setDescripcionActiva(accion.descripcion)}
                onClick={() => {
                  if (accion.deshabilitada) return;
                  cerrar();
                  accion.ejecutar();
                }}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  accion.tono === "peligro"
                    ? "text-err-700 hover:bg-err-50 focus:bg-err-50"
                    : "text-ink-700 hover:bg-blue-50 hover:text-blue-800 focus:bg-blue-50 focus:text-blue-800"
                } focus:outline-none`}
              >
                <Icon name={accion.icono} size={14} className="shrink-0" />
                <span>{accion.etiqueta}</span>
                <span className="sr-only">. {accion.descripcion}</span>
              </button>
            ))}
          </div>
          <div
            id={`${menuId}-descripcion`}
            className="mt-1 min-h-12 rounded-md border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[10.5px] leading-snug text-blue-800"
          >
            {descripcionActiva ?? "Pasa el cursor o enfoca una opción para ver qué hace."}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ArbolTabla({ arbol, riesgosPorFila, onReclasificar, onGestionarAgrupadora, onDesacoplar, onOmitir, posiciones, contexto, onUbicar, onDesindentar, onVerDetalleReubicacion, enfoqueReubicacion, umbrales, loteId, hermanos = [] }: { arbol: NodoBorrador[]; riesgosPorFila: Map<number, ManipulacionRiesgosaBorrador>; onReclasificar: (cuenta: NodoBorrador) => void; onGestionarAgrupadora: (filaNum: number) => void; onDesacoplar: (filaNum: number, codigo: string, desacopladaAhora: boolean) => void; onOmitir: (filaNum: number, omitidaAhora: boolean) => void; posiciones: Map<number, Posicion>; contexto: Map<number, ContextoNodo>; onUbicar: (filaNum: number) => void; onDesindentar: (filaNum: number) => void; onVerDetalleReubicacion: (filaNum: number) => void; enfoqueReubicacion: EnfoqueCambioEstructural | null; umbrales: UmbralesAlertas; loteId: string; hermanos?: VersionHermanaBorrador[] }) {
  const { filaSeleccionada, setFilaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  const tablaRef = useRef<HTMLDivElement>(null);
  const sentinelaRef = useRef<HTMLTableRowElement | null>(null); // sensor de scroll: al entrar en vista, revela el próximo bloque
  const pendienteEnfoqueRef = useRef<number | null>(null); // fila a enfocar cuando quede revelada
  const [destinoDestacado, setDestinoDestacado] = useState<number | null>(null);
  // Expande por defecto los niveles altos y TODA rama con descuadre (para verlo).
  // Un solo recorrido post-orden: cada nodo sabe si su subárbol descuadra sin
  // re-visitar descendientes (con 50k+ filas el chequeo por nodo se multiplicaba).
  const expandidosInicial = useMemo(() => {
    const s = new Set<number>();
    const rec = (n: NodoBorrador): boolean => {
      let descuadra = n.descuadre != null && n.descuadre !== 0;
      for (const h of n.hijos) if (rec(h)) descuadra = true;
      if ((n.codigo.length > 0 && n.codigo.length <= 2) || descuadra) s.add(n.filaNum);
      return descuadra;
    };
    arbol.forEach(rec);
    return s;
  }, [arbol]);
  const [abiertos, setAbiertos] = useState<Set<number>>(expandidosInicial);
  const toggle = (k: number) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const codigosConHijos = useMemo(() => { const s = new Set<number>(); const rec = (n: NodoBorrador) => { if (n.hijos.length > 0) s.add(n.filaNum); n.hijos.forEach(rec); }; arbol.forEach(rec); return s; }, [arbol]);
  const expandirTodo = () => { setAbiertos(new Set(codigosConHijos)); reiniciarRevelado(); };
  const contraerTodo = () => { setAbiertos(new Set()); reiniciarRevelado(); };

  // Una fila que pasa a ser AGRUPADORA (al pulsar «⇄ Agrupadora») se traga como hijas las
  // filas siguientes de código más largo. Como nació sin hijos, no está en `abiertos`: la
  // rama aparecería COLAPSADA y esas filas desaparecerían de golpe — la tabla se encoge, el
  // scroll salta y parece que el botón no hizo nada. Toda fila que GANE hijos se abre sola.
  const conHijosPrevioRef = useRef(codigosConHijos);
  useEffect(() => {
    const nuevas = [...codigosConHijos].filter((k) => !conHijosPrevioRef.current.has(k));
    conHijosPrevioRef.current = codigosConHijos;
    if (nuevas.length > 0) setAbiertos((prev) => new Set([...prev, ...nuevas]));
  }, [codigosConHijos]);

  // ---- Filtros del árbol: búsqueda, alertas, nivel máximo y columnas. ----
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"todo" | "alertas">("todo");
  const [nivelMax, setNivelMax] = useState(0); // 0 = todos; 2/4/6/8 = hasta ese nivel
  const [filtrosColumnas, setFiltrosColumnas] = useState<FiltrosColumnasBorrador>({
    ...FILTROS_COLUMNAS_BORRADOR_INICIALES,
  });
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  const filtrosColumnasActivos = hayFiltrosColumnasBorrador(filtrosColumnas);

  // El árbol se lee para calcular la ruta a expandir, pero va por REF y NO en dependencias:
  // se reconstruye con cualquier edición (omitir, reclasificar, invertir, «solo hojas», o el
  // refresco al guardar), y tenerlo como dependencia hacía que cada ✕ volviera a ejecutar el
  // enfoque —scroll a la última cuenta reubicada y reseteo de búsqueda y filtros, el usuario
  // perdía dónde iba— y cancelara los temporizadores en curso. El efecto de sincronía va
  // ANTES para que el enfoque lea siempre el árbol del mismo commit.
  const arbolRef = useRef(arbol);
  useEffect(() => { arbolRef.current = arbol; }, [arbol]);

  // Enfoca la fila tras cualquier cambio estructural que pueda modificar su posición
  // (reparentar, reclasificar o desacoplar). `secuencia` permite repetir la acción sobre
  // la misma cuenta y volver a desplazarse a su ubicación recalculada.
  useEffect(() => {
    if (!enfoqueReubicacion) return;
    const abrir = new Set<number>();
    const buscarRuta = (nodos: NodoBorrador[], objetivo: number, ruta: number[]): boolean => {
      for (const n of nodos) {
        const actual = [...ruta, n.filaNum];
        if (n.filaNum === objetivo) { actual.forEach((id) => abrir.add(id)); return true; }
        if (buscarRuta(n.hijos, objetivo, actual)) return true;
      }
      return false;
    };
    buscarRuta(arbolRef.current, enfoqueReubicacion.origen, []);
    if (enfoqueReubicacion.destino != null) buscarRuta(arbolRef.current, enfoqueReubicacion.destino, []);

    const prepararFrame = window.requestAnimationFrame(() => {
      setQ("");
      setVista("todo");
      setNivelMax(0);
      setFiltrosColumnas({ ...FILTROS_COLUMNAS_BORRADOR_INICIALES });
      setFilaSeleccionada(String(enfoqueReubicacion.origen));
      setDestinoDestacado(enfoqueReubicacion.destino);
      setAbiertos((prev) => new Set([...prev, ...abrir]));
      // El scroll corre cuando el bloque que contiene la fila ya quedó montado.
      pendienteEnfoqueRef.current = enfoqueReubicacion.origen;
    });

    const flashTimer = window.setTimeout(() => setDestinoDestacado(null), 2600);
    return () => { window.cancelAnimationFrame(prepararFrame); window.clearTimeout(flashTimer); };
  }, [enfoqueReubicacion, setFilaSeleccionada]);
  const needle = q.trim().toLowerCase();
  const matchQ = (n: NodoBorrador) => coincideBusquedaCuenta([n.codigo], n.nombre, needle);
  const filtrando = needle !== "" || vista !== "todo" || nivelMax > 0 || filtrosColumnasActivos;
  const nAlertas = useMemo(() => { let n = 0; const rec = (x: NodoBorrador) => { if (esAlertaNodo(x, umbrales) || riesgosPorFila.has(x.filaNum)) n++; x.hijos.forEach(rec); }; arbol.forEach(rec); return n; }, [arbol, riesgosPorFila, umbrales]);

  // Poda del árbol según los filtros (conserva ancestros de las coincidencias).
  // Los filtros de columna se encadenan al final, igual que en el detalle del balance.
  const arbolVisible = useMemo(() => {
    const nivelOk = (x: NodoBorrador) => nivelMax === 0 || !/^\d+$/.test(x.codigo) || x.codigo.length <= nivelMax;
    const alerta = (x: NodoBorrador) => esAlertaNodo(x, umbrales) || riesgosPorFila.has(x.filaNum);
    const selfMatch = (x: NodoBorrador) => matchQ(x) && (vista !== "alertas" || alerta(x));
    // `bajoAlerta` = el nodo cuelga de una fila que alertó. En la vista «Alertas» esos
    // descendientes se CONSERVAN aunque no alerten ellos mismos: el Δ de una agrupadora
    // solo se puede evidenciar viendo las cuentas de movimiento/auxiliares que lo componen.
    // Sigue respetándose el nivel máximo (N2/N4/N6/N8), que es un control explícito.
    const podar = (nodos: NodoBorrador[], bajoAlerta: boolean): NodoBorrador[] => {
      const out: NodoBorrador[] = [];
      for (const x of nodos) {
        if (!nivelOk(x)) continue;
        const propio = bajoAlerta || selfMatch(x);
        const hijos = podar(x.hijos, propio && vista === "alertas");
        if (propio || hijos.length > 0) out.push({ ...x, hijos });
      }
      return out;
    };
    const base = (needle !== "" || vista !== "todo" || nivelMax > 0)
      ? podar(arbol, false)
      : arbol;
    return filtrarArbolBorradorPorColumnas(base, filtrosColumnas, umbrales, riesgosPorFila);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbol, q, vista, nivelMax, filtrosColumnas, riesgosPorFila, umbrales]);
  // Sólo cuentan ramas raíz que están desplegando contenido visible. Los filtros
  // fuerzan abiertas las ramas resultantes sin modificar el Set persistente.
  const hayContenidoExpandido = arbolVisible.some(
    (nodo) =>
      nodo.hijos.length > 0 &&
      (filtrando || abiertos.has(nodo.filaNum)),
  );

  // Filas VISIBLES aplanadas (respetando expansión y filtros). NO se omite ningún
  // dato: los cálculos usan el árbol completo y todas las filas están disponibles;
  // lo que se acota es cuántas se MONTAN en el DOM a la vez (ver revelado abajo).
  const filasVisibles = useMemo(() => {
    const out: { nodo: NodoBorrador; depth: number; padreCodigo: string | null }[] = [];
    const rec = (n: NodoBorrador, depth: number, padreCodigo: string | null) => {
      out.push({ nodo: n, depth, padreCodigo });
      if (n.hijos.length > 0 && (filtrando || abiertos.has(n.filaNum))) {
        for (const h of n.hijos) rec(h, depth + 1, n.codigo);
      }
    };
    arbolVisible.forEach((r) => rec(r, 0, null));
    return out;
  }, [arbolVisible, filtrando, abiertos]);
  const totalFilasVisibles = filasVisibles.length;

  // Revelado progresivo por bloques (desplazamiento continuo, sin páginas ni
  // selector de tamaño): el DOM solo monta un bloque inicial acotado. Pintar
  // decenas de miles de <tr> de una vez («Expandir todo» o una búsqueda amplia en
  // un balance por tercero de 50k+ filas) congelaba la pestaña — el bloque inicial
  // conserva esa misma protección; el sensor de scroll (más abajo) va revelando el
  // resto mientras el usuario avanza, sin recortar la vista con una paginación.
  const [cantidadRevelada, setCantidadRevelada] = useState(BLOQUE_REVELADO_INICIAL);
  const revelado = acotarRevelado(cantidadRevelada, totalFilasVisibles);
  const hayMasFilas = revelado < totalFilasVisibles;
  const filasReveladas = filasVisibles.slice(0, revelado);
  const reiniciarRevelado = () => setCantidadRevelada(BLOQUE_REVELADO_INICIAL);
  const revelarMasFilas = () => setCantidadRevelada((actual) => siguienteRevelado(actual, totalFilasVisibles, BLOQUE_REVELADO_INCREMENTO));
  const actualizarFiltroColumna = <K extends keyof FiltrosColumnasBorrador>(
    columna: K,
    valor: FiltrosColumnasBorrador[K],
  ) => {
    setFiltrosColumnas((actuales) => ({ ...actuales, [columna]: valor }));
    reiniciarRevelado();
  };
  const limpiarFiltrosColumnas = () => {
    setFiltrosColumnas({ ...FILTROS_COLUMNAS_BORRADOR_INICIALES });
    reiniciarRevelado();
  };

  // Sensor de scroll: cuando el centinela al final de la tabla entra en vista,
  // revela el próximo bloque. Se reconecta si cambia si hay más por revelar o el
  // total (p. ej. tras un filtro); el nodo centinela conserva su posición en el DOM
  // mientras exista (React reutiliza el elemento entre renders).
  useEffect(() => {
    if (!hayMasFilas) return;
    const contenedor = tablaRef.current;
    const nodo = sentinelaRef.current;
    if (!contenedor || !nodo || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) revelarMasFilas();
      },
      { root: contenedor, rootMargin: "600px 0px" },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayMasFilas, totalFilasVisibles]);

  // Enfoque tras una reubicación (paso 1): la fila pudo caer más abajo de lo ya
  // revelado, así que primero se monta su bloque. El resaltado ya está fijado.
  useEffect(() => {
    const objetivo = pendienteEnfoqueRef.current;
    if (objetivo == null) return;
    const idx = filasVisibles.findIndex((f) => f.nodo.filaNum === objetivo);
    if (idx < 0 || idx < revelado) return; // fuera de la lista o ya montada
    setCantidadRevelada((actual) => revelarHastaIndice(idx, actual, totalFilasVisibles, BLOQUE_REVELADO_INCREMENTO));
  }, [filasVisibles, revelado, totalFilasVisibles]);

  // Paso 2: el scroll va contra el DOM ya montado, SIN temporizador y SIN animación.
  // Antes se hacía con `setTimeout` + `behavior: "smooth"` y la fila se quedaba
  // resaltada pero fuera de la vista: el cleanup del efecto cancelaba el temporizador
  // en cuanto llegaba otro commit dentro de la espera (el sensor de scroll revelando
  // el bloque siguiente basta), y un desplazamiento animado tampoco sobrevive a los
  // cambios de altura que provoca ese revelado. El salto directo es inmune a ambos.
  // Sin dependencias: la fila puede montarse uno o dos renders después, y el ref hace
  // inocuo el resto de ejecuciones.
  useEffect(() => {
    const objetivo = pendienteEnfoqueRef.current;
    if (objetivo == null) return;
    const fila = tablaRef.current?.querySelector<HTMLTableRowElement>(`tr[data-selection-key="${objetivo}"]`);
    if (!fila) return;
    pendienteEnfoqueRef.current = null;
    fila.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  });

  const filaTr = ({ nodo: n, depth, padreCodigo }: { nodo: NodoBorrador; depth: number; padreCodigo: string | null }) => {
    const hasHijos = n.hijos.length > 0;
    const esMatch = needle !== "" && matchQ(n);
    const open = filtrando ? true : abiertos.has(n.filaNum); // filtrado → todo expandido
    const esMov = n.tipoFila === "movimiento" || n.tipoFila === "descuadre";
    const esAgrupadora = n.tipoFila === "agrupadora";
    const descuadrado = n.descuadre != null && n.descuadre !== 0;
    const descuadreAccionable = esDescuadreAccionable(n.descuadre, umbrales);
    // Magnitud: un débito o crédito que vino con signo CONTRARIO al dominante de su
    // columna se subió en negativo. Es informativo (el saldo es correcto); no hay acción.
    const magnitudAcc = esMagnitudAccionable(n.debitos) || esMagnitudAccionable(n.creditos);
    const magnitudContraria = esMov && (n.debitos < 0 || n.creditos < 0);
    // Desacople: ya desacoplada (permite REACOPLAR), o cuelga de una agrupadora que NO
    // es su prefijo (candidata a DESACOPLAR: el ERP la ubicó bajo un grupo de código
    // ajeno). Solo aplica a movimientos con código numérico.
    const numero = /^\d+$/.test(n.codigo);
    const desacopladaAhora = !!n.desacoplada;
    const bajoAjena = numero && padreCodigo != null && /^\d+$/.test(padreCodigo) && !n.codigo.startsWith(padreCodigo);
    const puedeDesacoplar = esMov && numero && (desacopladaAhora || bajoAjena);
    // Omitir: la fila se conserva pero no cuenta en los cálculos ni se carga al balance.
    // Aplica a MOVIMIENTOS (lo que suma) y a filas TOTAL/pie del reporte (p. ej.
    // «Totales Prueba»), que ya no cuentan pero se pueden marcar/excluir del export.
    const omitida = !!n.omitida;
    // Omitir aplica a movimientos y a filas TOTAL/pie. Además, CUALQUIER fila ya omitida
    // muestra «Incluir» para RESCATARLA — incluye las agrupadoras del re-listado con
    // guiones que se marcaron tachadas automáticamente.
    const puedeOmitir = esMov || n.tipoFila === "total" || omitida;
    // Tabulador (re-parentado manual): → abre el modal "Ubicar" (elegir destino + mover
    // hermanas en lote) si la fila está mal ubicada; ← sube un nivel (al abuelo).
    const pos = numero ? posiciones.get(n.filaNum) : undefined;
    const ctxFila = numero ? contexto.get(n.filaNum) : undefined;
    const puedeUbicarFila = puedeUbicar(ctxFila);
    const puedeDesindentar = !!pos && pos.abuelo != null;
    const reparentada = n.padreManual != null;
    const riesgoClase = riesgosPorFila.get(n.filaNum);
    const estadoVisualFila = esMatch
      ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
      : reparentada
        ? "bg-blue-100/70 ring-1 ring-inset ring-blue-300 hover:bg-blue-100"
        : esMov
          ? "hover:bg-ink-50/60"
          : "bg-ink-50/40";
    const accionesCuenta: AccionMenuCuenta[] = [];
    if (numero && n.tipoFila !== "total") {
      accionesCuenta.push({
        id: "reubicar",
        icono: "move-tree",
        etiqueta: "Reubicar cuenta",
        descripcion: "Abre el selector para mover esta cuenta bajo cualquier agrupadora válida del borrador.",
        ejecutar: () => onUbicar(n.filaNum),
      });
      accionesCuenta.push({
        id: "reclasificar",
        icono: esMov ? "folder" : "play",
        etiqueta: esMov ? "Convertir en agrupadora" : "Convertir en movimiento",
        descripcion: esMov
          ? "Convierte la cuenta en agrupadora para organizar movimientos debajo de ella."
          : "Convierte la cuenta en movimiento para que su saldo se cargue directamente.",
        ejecutar: () => onReclasificar(n),
      });
    }
    if (esAgrupadora && n.tipoFilaForzado === "agrupadora") {
      accionesCuenta.push({
        id: "gestionar-movimientos",
        icono: "plus",
        etiqueta: "Gestionar movimientos",
        descripcion: "Permite seleccionar o ajustar las cuentas que quedarán debajo de esta agrupadora manual.",
        ejecutar: () => onGestionarAgrupadora(n.filaNum),
      });
    }
    if (puedeDesacoplar) {
      accionesCuenta.push({
        id: "desacoplar",
        icono: "link",
        etiqueta: desacopladaAhora ? "Reacoplar cuenta" : "Desacoplar cuenta",
        descripcion: desacopladaAhora
          ? "Vuelve a colgar la cuenta de la agrupadora indicada por el orden original del archivo."
          : `Saca la cuenta de ${padreCodigo ?? "la agrupadora actual"} para ubicarla bajo su padre real por código.`,
        ejecutar: () => onDesacoplar(n.filaNum, n.codigo, desacopladaAhora),
      });
    }
    if (puedeOmitir) {
      accionesCuenta.push({
        id: "omitir",
        icono: omitida ? "check" : "x",
        etiqueta: omitida ? "Incluir de nuevo" : "Omitir del cálculo",
        descripcion: omitida
          ? "Incluye nuevamente este registro en los cálculos y en la carga del balance."
          : "Excluye este registro de los cálculos y de la carga, pero lo conserva en el archivo crudo.",
        ejecutar: () => onOmitir(n.filaNum, omitida),
        tono: omitida ? "normal" : "peligro",
      });
    }
    if (puedeUbicarFila || puedeDesindentar || reparentada) {
      accionesCuenta.push({
        id: "subir-nivel",
        icono: "chev-l",
        etiqueta: "Subir un nivel (←)",
        descripcion: "Mueve esta fila a la agrupadora superior de su ubicación actual.",
        ejecutar: () => onDesindentar(n.filaNum),
        deshabilitada: !puedeDesindentar,
      });
      accionesCuenta.push({
        id: "anidar",
        icono: "chev-r",
        etiqueta: "Mover bajo agrupadora (→)",
        descripcion: "Elige una agrupadora de destino para anidar esta fila en una rama diferente.",
        ejecutar: () => onUbicar(n.filaNum),
        deshabilitada: !puedeUbicarFila,
      });
    }
    return (
      <tr
        key={n.filaNum}
        data-selection-key={n.filaNum}
        data-selected={filaSeleccionada === String(n.filaNum) ? "true" : undefined}
        data-move-target={destinoDestacado === n.filaNum ? "true" : undefined}
        className={`border-t border-ink-100 transition-colors ${esAgrupadora ? "font-semibold" : ""} ${omitida ? "opacity-45" : ""} ${estadoVisualFila}`}
      >
        <td className={`px-2 py-1 align-top ${reparentada ? "border-l-[3px] border-l-blue-500" : ""}`}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 + depth * 16 }}>
            {hasHijos ? (
              <button onClick={() => toggle(n.filaNum)} className="text-ink-400 hover:text-ink-700"><Icon name={chevronDivulgacion(open)} size={13} /></button>
            ) : (
              <span className="inline-block w-[13px]" />
            )}
            <span className="font-mono text-[11px] text-ink-500">{n.codigoCrudo || "—"}</span>
            {numero && !n.subtotalDuplicado && n.tipoFila !== "total" && (
              <span
                title={`Nivel contable: ${nombreNivelCuenta(n.codigo)} · tipo interno: ${esMov ? "Movimiento" : "Agrupadora"}`}
                className={`rounded border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide ${esMov ? "border-blue-100 bg-blue-100 text-navy-700" : "border-ink-100 bg-ink-100 text-ink-600"}`}
              >
                {nombreNivelCuenta(n.codigo)} · {esMov ? "Movimiento" : "Agrupadora"}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <NombreCuentaArbol
              nombre={n.nombre}
              omitida={omitida}
              descuadrado={descuadrado}
              descuadreAccionable={descuadreAccionable}
              umbralDescuadre={umbrales.descuadre}
            />
            {omitida && <Chip label="Omitida · no cuenta" tone="warn" />}
            {riesgoClase && (
              <span
                title={`Reubicación manual entre ${nombreClaseContable(riesgoClase.claseOrigen)} y ${nombreClaseContable(riesgoClase.claseDestino)}. Debe revisarse antes de cargar.`}
                className="rounded border border-err-200 bg-err-50 px-1.5 py-0.5 text-[10px] font-semibold text-err-700"
              >
                Clase cruzada {riesgoClase.claseOrigen}→{riesgoClase.claseDestino}
              </span>
            )}
            {n.subtotalDuplicado ? (
              <span title="Subtotal de 6 díg cuyo detalle de 8 díg (mismas 4 columnas) está mal-numerado. No se carga: su detalle ya lleva el valor.">
                <Chip label="Subtotal duplicado · no se carga" tone="warn" />
              </span>
            ) : n.tipoFila === "total" ? (
              <Chip label="Total" tone="ink" />
            ) : null}
            {descuadrado && (
              <AyudaInstantanea
                className={`cursor-help rounded px-1.5 py-0.5 text-[10.5px] ${descuadreAccionable ? "font-semibold text-err-700" : "border border-err-100 bg-err-100/35 font-medium text-err-500"}`}
                texto={descuadreAccionable
                  ? `Δ subrayado = total del archivo (${fmt(n.saldoFinal)}) − suma de sus ${n.hijos.length} cuentas (por prefijo de código) = ${fmt(n.descuadre!)}. El subtotal no cuadra con su desglose: puede ser una cuenta faltante, o que el ERP numere el detalle sin anidar por código (el subtotal y su detalle no comparten prefijo — la plata está, pero en otra rama).`
                  : `Δ informativo = ${fmt(n.descuadre!)} (menor a ${fmt(umbrales.descuadre)}). Se muestra para referencia, pero no cuenta como alerta ni en el diagnóstico superior.`}
              >
                Δ {fmt(n.descuadre!)}
              </AyudaInstantanea>
            )}
            {esAgrupadora && n.tipoFilaForzado === "agrupadora" && !hasHijos && (
              <span title="La decisión manual se conserva. Si permanece vacía al cargar el balance oficial, su propio saldo se tratará como movimiento para evitar que se pierda dinero.">
                <Chip label="Agrupadora manual sin movimientos" tone="warn" />
              </span>
            )}
            {magnitudContraria && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10.5px] ${magnitudAcc ? "border border-warn-300 bg-warn-50 font-semibold text-warn-700" : "border border-warn-100 bg-warn-50/50 font-medium text-warn-600"}`}
                title={`Vino con signo CONTRARIO al dominante de su columna y se subió en negativo (déb ${fmt(n.debitos)} / créd ${fmt(n.creditos)}). Alerta de MAGNITUD: el saldo es correcto; verifica que la naturaleza de la cuenta sea la esperada.`}
              >
                ± magnitud
              </span>
            )}
            {reparentada && (
              <button
                type="button"
                onClick={() => onVerDetalleReubicacion(n.filaNum)}
                title="Ver el detalle de esta reubicación: dónde estaba, dónde quedó y de dónde vino el cambio."
                className="inline-flex cursor-pointer rounded-full transition hover:opacity-80"
              >
                <Chip label="↳ movida aquí" tone="blue" />
              </button>
            )}
            {accionesCuenta.length > 0 && (
              <MenuAccionesCuenta
                filaNum={n.filaNum}
                codigo={n.codigoCrudo || n.codigo}
                nombre={n.nombre}
                acciones={accionesCuenta}
              />
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmtContable(n.saldoInicial)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmtContable(n.debitos)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmtContable(n.creditos)}</td>
        <td className={`whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-800 ${esAgrupadora ? "font-semibold" : esMov ? "font-normal" : "font-medium"}`}>{fmtContable(n.saldoFinal)}</td>
        <td className="whitespace-nowrap px-2 py-1 align-top">{celdaValidacionBorrador(n, umbrales, riesgosPorFila)}</td>
      </tr>
    );
  };

  // Toggle: clic selecciona; segundo clic sobre el activo vuelve al default
  // (nivel 0 = «Todos», vista «todo»). Así se puede deseleccionar N2/N4/… o
  // Alertas sin tener que pulsar el botón neutro a mano.
  const nivelBtn = (v: number, label: string) => (
    <button
      type="button"
      aria-pressed={nivelMax === v}
      onClick={() => {
        setNivelMax((prev) => (prev === v ? 0 : v));
        reiniciarRevelado();
      }}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${nivelMax === v ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}
    >
      {label}
    </button>
  );
  const vistaBtn = (v: typeof vista, label: string, count?: number) => (
    <button
      type="button"
      aria-pressed={vista === v}
      onClick={() => {
        setVista((prev) => (prev === v ? "todo" : v));
        reiniciarRevelado();
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ${vista === v ? "bg-navy-700 text-white" : "text-ink-600 hover:bg-ink-100"}`}
    >
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${vista === v ? "bg-white/20" : "bg-warn-100 text-warn-700"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Tabla de movimiento del borrador" data-filtros-vista="todo-alertas"
      {...propsRegionPantallaCompleta(pantallaCompleta)}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-ink-400">
          <Icon name="search" size={13} />
          <input value={q} onChange={(e) => { setQ(e.target.value); reiniciarRevelado(); }} placeholder="Buscar código o cuenta…" className="w-44 bg-transparent text-[12px] text-ink-700 outline-none placeholder:text-ink-400" />
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {nivelBtn(0, "Todos")}{nivelBtn(2, "N2")}{nivelBtn(4, "N4")}{nivelBtn(6, "N6")}{nivelBtn(8, "N8")}
        </div>
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        {vistaBtn("todo", "Todo")}
        {vistaBtn("alertas", "Alertas", nAlertas)}
        {filtrosColumnasActivos && (
          <button
            type="button"
            onClick={limpiarFiltrosColumnas}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Icon name="x" size={11} /> Limpiar columnas
          </button>
        )}
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        {hermanos.length > 1 && <MenuVersionesBorrador loteId={loteId} hermanos={hermanos} />}
        <button type="button" onClick={expandirTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"><Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Expandir todo</button>
        <button type="button" onClick={contraerTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"><Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Contraer todo</button>
        <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
      </div>
      <div ref={tablaRef} className={claseScrollTabla(pantallaCompleta)}>
        <table className="balance-detail-row-hover tabla-encabezado-fijo w-full text-[11px]">
          <thead className="text-ink-500">
            <tr className="text-left text-[11px] uppercase tracking-wider">
              <th className="min-w-40 px-2 py-1.5 font-semibold">
                Código
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Código"
                  value={filtrosColumnas.codigo}
                  onChange={(valor) => actualizarFiltroColumna("codigo", valor)}
                  placeholder="Buscar código"
                />
              </th>
              <th className="min-w-56 px-2 py-1.5 font-semibold">
                Cuenta
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Cuenta"
                  value={filtrosColumnas.cuenta}
                  onChange={(valor) => actualizarFiltroColumna("cuenta", valor)}
                  placeholder="Buscar cuenta"
                />
              </th>
              <th className="min-w-36 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Saldo ant.
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Saldo anterior"
                  value={filtrosColumnas.saldoAnterior}
                  onChange={(valor) => actualizarFiltroColumna("saldoAnterior", valor)}
                  placeholder="Ej. > 1000000"
                  numerico
                />
              </th>
              <th className="min-w-32 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Débito
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Débito"
                  value={filtrosColumnas.debito}
                  onChange={(valor) => actualizarFiltroColumna("debito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th className="min-w-32 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Crédito
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Crédito"
                  value={filtrosColumnas.credito}
                  onChange={(valor) => actualizarFiltroColumna("credito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th className="min-w-36 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Saldo actual
                <FiltroTextoColumnaBorrador
                  ariaLabel="Filtrar la columna Saldo actual"
                  value={filtrosColumnas.saldo}
                  onChange={(valor) => actualizarFiltroColumna("saldo", valor)}
                  placeholder="Ej. < 0"
                  numerico
                />
              </th>
              <th className="min-w-40 px-2 py-1.5 font-semibold">
                Validación
                <select
                  value={filtrosColumnas.validacion}
                  onChange={(evento) => actualizarFiltroColumna(
                    "validacion",
                    evento.target.value as FiltroValidacionDetalle,
                  )}
                  aria-label="Filtrar la columna Validación"
                  className={CLASE_FILTRO_COLUMNA_BORRADOR}
                >
                  {OPCIONES_FILTRO_VALIDACION.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                  ))}
                </select>
              </th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {filasReveladas.length > 0 ? filasReveladas.map(filaTr) : (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[12px] text-ink-400">
                  {filtrosColumnasActivos
                    ? "Sin cuentas que coincidan con los filtros de columna."
                    : q.trim()
                      ? "Sin cuentas que coincidan con la búsqueda."
                      : vista !== "todo"
                        ? "Sin alertas para este filtro."
                        : "Sin cuentas para este filtro."}
                </td>
              </tr>
            )}
            {hayMasFilas && (
              // Centinela del scroll continuo: sin contenido ni datos de selección
              // (no participa en clic/selección de fila), solo dispara el siguiente bloque.
              <tr ref={sentinelaRef} aria-hidden="true">
                <td colSpan={7} className="h-px p-0" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white px-3 py-2">
        <div className="text-[12px] text-ink-500">
          {totalFilasVisibles === 0 ? "Sin resultados" : `Mostrando ${filasReveladas.length} de ${totalFilasVisibles}`}
        </div>
        {hayMasFilas && (
          <button
            type="button"
            onClick={revelarMasFilas}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1.5 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
          >
            <Icon name="chev-d" size={12} /> Cargar más filas
          </button>
        )}
      </div>
    </div>
  );
}

const CLASE_FILTRO_COLUMNA_BORRADOR =
  "mt-1 block h-7 w-full rounded-md border border-ink-200 bg-white px-2 text-[11px] font-normal normal-case tracking-normal text-ink-700 outline-none placeholder:text-ink-400 focus:border-blue-400";

function celdaValidacionBorrador(
  nodo: NodoBorrador,
  umbrales: UmbralesAlertas,
  riesgos: { has(filaNum: number): boolean },
): ReactNode {
  const estado = estadoValidacionBorrador(nodo, umbrales, riesgos);
  if (estado === "ok") return <Chip label="OK" tone="ok" />;
  if (estado === "alerta") return <Chip label="Alerta" tone="err" />;
  if (estado === "informativa") {
    return (
      <span className="inline-flex items-center rounded border border-err-100 bg-err-100/35 px-1.5 py-0.5 text-[10px] font-medium text-err-500">
        Informativo
      </span>
    );
  }
  return null;
}

function FiltroTextoColumnaBorrador({
  ariaLabel,
  value,
  onChange,
  placeholder,
  numerico = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  numerico?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numerico ? "decimal" : "search"}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${CLASE_FILTRO_COLUMNA_BORRADOR} ${numerico ? "text-right" : "text-left"}`}
    />
  );
}

/** Sangría (px) por nivel de profundidad en la escalera de una posición del árbol. */
const SANGRIA_NIVEL_REUBICACION = 22;

/** Marca, nivel por nivel, desde dónde dejan de coincidir dos posiciones del árbol: los
 *  niveles del prefijo común se pintan neutros y los que difieren se resaltan. */
function nivelesComparados(ruta: RefNodo[], otra: RefNodo[] | null): { nodo: RefNodo; distinto: boolean }[] {
  let comun = 0;
  if (otra) {
    while (comun < ruta.length && comun < otra.length && ruta[comun].filaNum === otra[comun].filaNum) comun++;
  } else {
    comun = ruta.length;
  }
  return ruta.map((nodo, i) => ({ nodo, distinto: i >= comun }));
}

/** Una posición del árbol como escalera VERTICAL: un nivel por línea, sangrado según su
 *  profundidad, con la cuenta reubicada como último peldaño. Las dos posiciones del modal
 *  ("Dónde estaba" / "Dónde quedó") comparten sangría, así que los niveles que coinciden
 *  quedan alineados uno debajo del otro y se ve de un vistazo dónde se abre la diferencia.
 *  `ruta` `null` = no se pudo ubicar la fila en ese árbol; `[]` = era raíz. */
function RutaReubicacion({
  ruta,
  otraRuta,
  cuenta,
  vacioLabel,
  tono,
}: {
  ruta: RefNodo[] | null;
  otraRuta: RefNodo[] | null;
  cuenta: RefNodo;
  vacioLabel: string;
  tono: "origen" | "destino";
}) {
  if (ruta == null) {
    return <p className="text-[12px] text-ink-400">No fue posible reconstruir esta posición.</p>;
  }
  const niveles = nivelesComparados(ruta, otraRuta);
  const resalte = tono === "destino" ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700";
  return (
    <div>
      {ruta.length === 0 && <p className="mb-1 text-[12px] text-ink-500">{vacioLabel}</p>}
      <ol className="space-y-0.5">
        {niveles.map(({ nodo, distinto }, i) => (
          <li key={nodo.filaNum} style={{ paddingLeft: i * SANGRIA_NIVEL_REUBICACION }}>
            <div className={`flex items-start gap-2 rounded px-1.5 py-1 ${distinto ? resalte : "text-ink-600"}`}>
              <span aria-hidden className="w-3 shrink-0 font-mono text-[11px] leading-5 text-ink-300">{i > 0 ? "└" : ""}</span>
              <span className="shrink-0 font-mono text-[11px] leading-5 tabular-nums opacity-80">{nodo.codigoCrudo || nodo.codigo || "—"}</span>
              <span className="text-[12px] font-medium leading-5">{nodo.nombre}</span>
            </div>
          </li>
        ))}
        <li style={{ paddingLeft: ruta.length * SANGRIA_NIVEL_REUBICACION }}>
          <div className="flex items-start gap-2 rounded-md border border-blue-400 bg-blue-50 px-1.5 py-1">
            <span aria-hidden className="w-3 shrink-0 font-mono text-[11px] leading-5 text-blue-400">{ruta.length > 0 ? "└" : ""}</span>
            <span className="shrink-0 font-mono text-[11px] leading-5 tabular-nums text-navy-600">{cuenta.codigoCrudo || cuenta.codigo || "—"}</span>
            <span className="text-[12px] font-semibold leading-5 text-navy-800">{cuenta.nombre}</span>
          </div>
        </li>
      </ol>
    </div>
  );
}

/**
 * Detalle del chip "↳ movida aquí": explica dónde estaba la fila en el árbol AUTOMÁTICO
 * del archivo (sin ningún `padreManual`), dónde quedó en el árbol vigente, y de dónde
 * vino el cambio (override sin guardar de esta sesión / ya guardado en el borrador,
 * posiblemente por las correcciones memorizadas del perfil del cliente). Advierte además
 * si la reubicación cruza de clase contable (misma detección que el resto del borrador).
 */
function DetalleReubicacionModal({
  resumen,
  riesgo,
  onClose,
}: {
  resumen: ResumenReubicacionFila;
  riesgo: ManipulacionRiesgosaBorrador | undefined;
  onClose: () => void;
}) {
  const { cuenta, procedencia } = resumen;
  return (
    <Modal open onClose={onClose} title="Detalle de la reubicación" size="xl">
      <div className="space-y-4 text-[12.5px]">
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[12px] text-ink-500">{cuenta.codigoCrudo || cuenta.codigo}</span>
            <span className="text-[13.5px] font-semibold text-ink-800">{cuenta.nombre}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["Saldo anterior", cuenta.saldoInicial],
              ["Débitos", cuenta.debitos],
              ["Créditos", cuenta.creditos],
              ["Saldo actual", cuenta.saldoFinal],
            ] as const).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="rounded border border-ink-150 bg-white px-2 py-1.5">
                <div className="text-[10.5px] uppercase tracking-wide text-ink-400">{etiqueta}</div>
                <div className="mt-0.5 whitespace-nowrap tabular-nums font-semibold text-ink-800">{fmtContable(valor)}</div>
              </div>
            ))}
          </div>
        </div>

        <section className="overflow-hidden rounded-md border border-ink-150">
          <header className="border-b border-ink-150 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Dónde estaba · archivo original
          </header>
          <div className="px-3 py-2.5">
            <RutaReubicacion
              ruta={resumen.rutaOriginal}
              otraRuta={resumen.rutaActual}
              cuenta={cuenta}
              tono="origen"
              vacioLabel="Nivel superior del archivo — no tenía ninguna agrupadora encima."
            />
          </div>
        </section>

        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <span className="h-px flex-1 bg-ink-150" />
          <Icon name="chev-d" size={12} />
          se movió a
          <span className="h-px flex-1 bg-ink-150" />
        </div>

        <section className="overflow-hidden rounded-md border border-ink-150">
          <header className="border-b border-ink-150 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Dónde quedó · posición actual
          </header>
          <div className="px-3 py-2.5">
            <RutaReubicacion
              ruta={resumen.rutaActual}
              otraRuta={resumen.rutaOriginal}
              cuenta={cuenta}
              tono="destino"
              vacioLabel="Quedó en el nivel superior del árbol, sin ninguna agrupadora encima."
            />
          </div>
        </section>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Origen del cambio</div>
          <div className="mt-1.5 flex flex-col items-start gap-1.5 sm:flex-row sm:gap-2.5">
            {procedencia.estado === "pendiente" ? (
              <>
                <span className="shrink-0"><Chip label="Pendiente en esta sesión" tone="warn" /></span>
                <p className="text-[12px] leading-5 text-ink-600">
                  Se movió en esta pantalla y todavía no se guardó. Usa «Guardar cambios» para persistirlo en el borrador; «Descartar cambios» la devuelve a su posición anterior.
                </p>
              </>
            ) : (
              <>
                <span className="shrink-0"><Chip label="Guardada en el borrador" tone="ok" /></span>
                <p className="text-[12px] leading-5 text-ink-600">
                  Esta posición ya está guardada en el staging del lote.
                  {procedencia.posibleCorreccionAutomatica && (
                    <>
                      {" "}Como este cliente tiene correcciones memorizadas de cargas anteriores, es posible que se haya aplicado sola desde su perfil (Configuración › Perfiles de carga) en vez de haberse movido a mano en esta carga.
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>

        {riesgo && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] leading-5 text-err-700">
            <span className="font-semibold">Advertencia: cruce de clase contable.</span>{" "}
            Esta reubicación mueve la cuenta de {nombreClaseContable(riesgo.claseOrigen)} a {nombreClaseContable(riesgo.claseDestino)}. Debe revisarse y aprobarse antes de cargar el balance.
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Compuerta al entrar al borrador cuando NO se detectó el cliente por NIT: exige
 * elegir cliente + período antes de operar, para que apliquen sus preferencias/
 * notas y no se cargue el balance a ciegas. Se cierra solo con la X/Cancelar.
 * Con `obligatorio` (aún no hay cliente asignado) cerrarla sin elegir devuelve a
 * la lista de borradores: el cliente es requisito para trabajar el borrador.
 */
function GateClientePeriodo({
  clientes, nitDetectado, clienteSelId, obligatorio, periodoIni, periodoFin, onConfirmar, onClose,
}: {
  clientes: Cliente[];
  nitDetectado: string | null;
  clienteSelId: number | null;
  obligatorio: boolean;
  periodoIni: string;
  periodoFin: string;
  onConfirmar: (clienteId: number, ini: string, fin: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(clienteSelId ? String(clienteSelId) : "");
  const [ini, setIni] = useState(periodoIni);
  const [fin, setFin] = useState(periodoFin);
  const listo = !!sel && !!ini && !!fin && fin >= ini;
  return (
    <Modal
      open
      onClose={onClose}
      title="Selecciona el cliente y el período"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
            {obligatorio ? "Volver a borradores" : "Cancelar"}
          </button>
          <button
            type="button"
            disabled={!listo}
            onClick={() => onConfirmar(Number(sel), ini, fin)}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            Continuar
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px]">
        <p className="text-ink-600">
          {nitDetectado ? <>El NIT detectado <span className="font-mono">{nitDetectado}</span> no coincide con ningún cliente.</> : <>No se detectó el cliente (NIT) en el archivo.</>}{" "}
          Elige el cliente y el período para aplicar sus preferencias y notas de carga, y poder cargar el balance.
        </p>
        {obligatorio && (
          <p className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-[12px] font-medium text-warn-800">
            Asignar el cliente es <span className="font-semibold">obligatorio</span>: sin él no se puede revisar ni cargar el borrador. Búscalo por nombre o NIT en el selector; el borrador quedará vinculado a ese cliente.
          </p>
        )}
        <SelectorClienteBuscable
          clients={clientes}
          value={sel ? Number(sel) : null}
          onChange={(clientId) => setSel(clientId == null ? "" : String(clientId))}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período desde</span>
            <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período hasta</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
          </label>
        </div>
        {!!ini && !!fin && fin < ini && <p className="text-[11.5px] font-medium text-err-700">El período hasta no puede ser anterior al período desde.</p>}
      </div>
    </Modal>
  );
}
