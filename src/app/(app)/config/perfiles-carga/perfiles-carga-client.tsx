"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Card, CardHeader, Chip } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmtDate } from "@/lib/format";
import {
  FUENTE_BALANCE,
  etiquetaFuente,
  type FilaMemoriaCarga,
} from "@/lib/perfiles-carga/filas-memoria";
import { limpiarMemoriaCargaCliente } from "@/app/actions/perfiles-carga";
import { limpiarMemoriaCargaModuloCliente } from "@/app/actions/perfiles-carga-modulos";
import { AjustesCargaModal } from "./ajustes-carga-modal";
import { AjustesCargaModuloModal } from "./ajustes-carga-modulo-modal";

/** Fila del tablero: un cliente en UNA fuente (balance o un módulo). */
export type ClienteMemoriaRow = FilaMemoriaCarga;

function normalizarBusqueda(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Tablero de administración de la memoria de carga de UNA fuente: el balance o un
 * módulo (Inventarios, Cartera, CxP, Ingresos, Activos Fijos, Nómina). Cada fuente
 * tiene su propia pantalla en el submenú lateral «Perfiles de carga»; aquí se
 * listan SUS clientes con memoria — cuántos formatos, correcciones (solo balance)
 * y preferencias tienen guardados — con el mismo panel de gestión (ver / editar /
 * borrar). Todas las fuentes se administran EXACTAMENTE igual: mismos botones,
 * mismo modal por fuente, mismo borrado total; solo cambia qué se memoriza en cada
 * una. Nunca se mezclan en una sola lista.
 */
type GestionMemoria = {
  fila: ClienteMemoriaRow;
  modo: "ver" | "editar";
};

/** Base compartida de los botones de la columna Acciones (mismo tamaño fila a fila). */
const BOTON_ACCION =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition";

const claveFila = (f: ClienteMemoriaRow) => `${f.id}:${f.fuente}`;

export default function PerfilesCargaClient({
  fuente,
  rows,
  totalClientes,
}: {
  /** Fuente de esta pantalla: `balance` o el código de un módulo (INV, CAR, …). */
  fuente: string;
  /** Filas de esa fuente (solo clientes con memoria). */
  rows: ClienteMemoriaRow[];
  totalClientes: number;
}) {
  const router = useRouter();
  const esBalance = fuente === FUENTE_BALANCE;
  const etiqueta = etiquetaFuente(fuente);
  const [busqueda, setBusqueda] = useState("");
  // Ver (solo lectura) o editar la memoria de una fuente del cliente. El ojo abre
  // en «ver»; el lápiz abre en «editar». Desde la vista se puede pasar a editar.
  const [gestionando, setGestionando] = useState<GestionMemoria | null>(null);
  // Fila cuya memoria se va a borrar por completo. La confirmación va en un
  // modal propio (no `confirm()`) porque el borrado arrasa con formatos,
  // correcciones y preferencias de esa fuente a la vez y conviene enumerar qué se pierde.
  const [borrando, setBorrando] = useState<ClienteMemoriaRow | null>(null);
  const [enProceso, iniciarBorrado] = useTransition();

  const confirmarBorrado = () => {
    const objetivo = borrando;
    if (!objetivo) return;
    iniciarBorrado(async () => {
      const res = objetivo.fuente === FUENTE_BALANCE
        ? await limpiarMemoriaCargaCliente(objetivo.id)
        : await limpiarMemoriaCargaModuloCliente(objetivo.id, objetivo.fuente);
      if (res.ok) {
        notifySuccess(res.message ?? "Memoria de carga borrada.");
        setBorrando(null);
        router.refresh();
      } else {
        notifyError(res.message ?? "No se pudo borrar la memoria de carga.");
      }
    });
  };

  // Defensa: solo filas de ESTA fuente (nunca se mezclan en una lista).
  const filasFuente = useMemo(() => rows.filter((r) => r.fuente === fuente), [rows, fuente]);

  const totales = useMemo(
    () => ({
      clientes: filasFuente.length,
      perfiles: filasFuente.reduce((suma, r) => suma + r.perfiles, 0),
      correcciones: filasFuente.reduce((suma, r) => suma + (r.correcciones ?? 0), 0),
      preferencias: filasFuente.filter((r) => r.tienePreferencias).length,
    }),
    [filasFuente],
  );

  // La pantalla lista SOLO clientes con memoria guardada en esta fuente, siempre. La
  // memoria la crea el flujo de trabajo (cargar y ajustar borradores de balance o de
  // módulos), no esta pantalla: sin nada guardado no hay qué administrar aquí.
  const buscando = busqueda.trim() !== "";
  const filtrados = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    if (!termino) return filasFuente;
    const nitBuscado = busqueda.replace(/\D/g, "");
    return filasFuente.filter((r) => {
      const nitNumerico = r.nit.replace(/\D/g, "");
      return (
        normalizarBusqueda(r.name).includes(termino)
        || normalizarBusqueda(r.code).includes(termino)
        || normalizarBusqueda(r.nit).includes(termino)
        || (nitBuscado.length > 0 && nitNumerico.includes(nitBuscado))
      );
    });
  }, [busqueda, filasFuente]);

  const pg = usePagination(filtrados, 50);

  const columnas = esBalance ? 7 : 6;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumen
          etiqueta="Clientes con memoria"
          valor={totales.clientes}
          detalle={`de ${totalClientes} cliente(s) · ${etiqueta.toLowerCase()}`}
        />
        <Resumen
          etiqueta="Formatos memorizados"
          valor={totales.perfiles}
          detalle={esBalance ? "cargas que se procesan sin IA" : "cargas que aplican el mapeo memorizado"}
        />
        {esBalance ? (
          <Resumen
            etiqueta="Correcciones por cuenta"
            valor={totales.correcciones}
            detalle="ajustes que se re-aplican solos"
          />
        ) : (
          <Resumen
            etiqueta="Preferencias configuradas"
            valor={totales.preferencias}
            detalle="clientes con hoja preferida o notas"
          />
        )}
      </div>

      <Card>
        <CardHeader
          title={`Memoria de carga de ${etiqueta.toLowerCase()} por cliente`}
          right={
            <span className="text-[11px] text-ink-400">
              {esBalance
                ? "Los formatos y las correcciones se crean solos al cargar y revisar balances."
                : `Los formatos se crean solos al leer archivos en Módulos › ${etiqueta}.`}
            </span>
          }
        />
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                pg.resetToFirstPage();
              }}
              placeholder="Buscar por código, NIT o razón social…"
              aria-label="Buscar clientes por código, NIT o razón social"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
            />
            {busqueda.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  pg.resetToFirstPage();
                }}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <span className="text-[11px] text-ink-400">
            Solo clientes con memoria · más recientes primero
          </span>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2 font-semibold">Cliente</th>
                <th className="px-4 py-2 font-semibold">ERP</th>
                <th className="px-4 py-2 text-right font-semibold">Formatos</th>
                {esBalance && <th className="px-4 py-2 text-right font-semibold">Correcciones</th>}
                <th className="px-4 py-2 font-semibold">Preferencias</th>
                <th className="px-4 py-2 font-semibold">Último uso</th>
                <th className="px-4 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    {buscando
                      ? `Ningún cliente con memoria de ${etiqueta.toLowerCase()} coincide con ese código, NIT o razón social.`
                      : esBalance
                        ? "Todavía ningún cliente tiene formatos, correcciones ni preferencias de balance guardadas. Se crean solas al cargar un balance y ajustar su borrador."
                        : `Todavía ningún cliente tiene formatos ni preferencias de ${etiqueta.toLowerCase()} guardados. Los formatos se crean solos al leer un archivo en Módulos › ${etiqueta}.`}
                  </td>
                </tr>
              )}
              {pg.pageItems.map((r) => (
                <tr key={claveFila(r)} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink-800">{r.name}</div>
                    <div className="flex flex-wrap gap-x-2 font-mono text-[11px] text-ink-400">
                      <span>{r.code}</span>
                      <span>NIT {r.nit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{r.erpName ?? <span className="text-ink-400">Sin ERP</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700">{r.perfiles}</td>
                  {esBalance && (
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700">{r.correcciones ?? 0}</td>
                  )}
                  <td className="px-4 py-2.5">
                    <Chip
                      label={r.tienePreferencias ? "Configuradas" : "Auto"}
                      tone={r.tienePreferencias ? "blue" : "ink"}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{r.ultimoUso ? fmtDate(r.ultimoUso) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setGestionando({ fila: r, modo: "ver" })}
                        title={esBalance
                          ? "Ver formatos, correcciones y preferencias (solo lectura)"
                          : "Ver formatos y preferencias (solo lectura)"}
                        aria-label={`Ver la memoria de carga de ${r.fuenteLabel} de ${r.name}`}
                        className={`${BOTON_ACCION} border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900`}
                      >
                        <Icon name="eye" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGestionando({ fila: r, modo: "editar" })}
                        title={esBalance
                          ? "Editar formatos, correcciones y preferencias de este cliente"
                          : "Editar formatos y preferencias de este cliente"}
                        aria-label={`Editar la memoria de carga de ${r.fuenteLabel} de ${r.name}`}
                        className={`${BOTON_ACCION} border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100`}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setBorrando(r)}
                        title={`Eliminar TODA la memoria de carga de ${r.fuenteLabel} de este cliente`}
                        aria-label={`Eliminar la memoria de carga de ${r.fuenteLabel} de ${r.name}`}
                        className={`${BOTON_ACCION} border-ink-200 bg-white text-ink-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </Card>

      <Modal
        open={borrando !== null}
        onClose={() => { if (!enProceso) setBorrando(null); }}
        title={`Borrar la memoria de carga de ${borrando?.fuenteLabel ?? "la fuente"}`}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBorrando(null)}
              disabled={enProceso}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarBorrado}
              disabled={enProceso}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <Icon name="trash" size={13} />
              {enProceso ? "Borrando…" : "Borrar todo"}
            </button>
          </>
        }
      >
        {borrando && (
          <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
            <p>
              Se borrará <strong>toda</strong> la memoria de carga de{" "}
              <strong>{borrando.fuenteLabel}</strong> de{" "}
              <strong>{borrando.name}</strong> <span className="font-mono text-[11px] text-ink-400">({borrando.code})</span>:
            </p>
            <ul className="flex flex-col gap-1 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px]">
              <li>· {borrando.perfiles} formato(s) memorizado(s)</li>
              {borrando.correcciones != null && <li>· {borrando.correcciones} corrección(es) por cuenta</li>}
              <li>· {borrando.tienePreferencias ? "Las preferencias de carga configuradas" : "Sin preferencias configuradas"}</li>
            </ul>
            <p className="text-ink-500">
              {borrando.fuente === FUENTE_BALANCE
                ? "La próxima carga de balance de este cliente volverá a detectar la estructura del archivo con IA y no aplicará ningún ajuste automático por cuenta. Los balances y borradores ya cargados no se tocan."
                : `La próxima carga de ${borrando.fuenteLabel.toLowerCase()} de este cliente volverá a sugerir el mapeo de columnas desde cero. Los datos y borradores ya cargados no se tocan.`}
              {" "}Esta acción no se puede deshacer.
            </p>
          </div>
        )}
      </Modal>

      {gestionando && gestionando.fila.fuente === FUENTE_BALANCE && (
        <AjustesCargaModal
          key={`perfiles-${claveFila(gestionando.fila)}-${gestionando.modo}`}
          cliente={{
            id: gestionando.fila.id,
            name: gestionando.fila.name,
            nit: gestionando.fila.nit,
          }}
          modo={gestionando.modo}
          onPasarAEditar={() =>
            setGestionando((actual) =>
              actual ? { ...actual, modo: "editar" } : actual,
            )
          }
          onClose={() => setGestionando(null)}
        />
      )}
      {gestionando && gestionando.fila.fuente !== FUENTE_BALANCE && (
        <AjustesCargaModuloModal
          key={`perfiles-${claveFila(gestionando.fila)}-${gestionando.modo}`}
          cliente={{
            id: gestionando.fila.id,
            name: gestionando.fila.name,
            nit: gestionando.fila.nit,
          }}
          moduloCodigo={gestionando.fila.fuente}
          moduloLabel={gestionando.fila.fuenteLabel}
          modo={gestionando.modo}
          onPasarAEditar={() =>
            setGestionando((actual) =>
              actual ? { ...actual, modo: "editar" } : actual,
            )
          }
          onClose={() => setGestionando(null)}
        />
      )}
    </div>
  );
}

function Resumen({ etiqueta, valor, detalle }: { etiqueta: string; valor: number; detalle: string }) {
  return (
    <div className="rounded-lg border border-ink-150 bg-white px-4 py-3 shadow-sm">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">{etiqueta}</div>
      <div className="mt-1 font-serif text-2xl tabular-nums text-ink-900">{valor}</div>
      <div className="text-[11px] text-ink-400">{detalle}</div>
    </div>
  );
}
