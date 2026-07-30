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
import { limpiarMemoriaCargaCliente } from "@/app/actions/perfiles-carga";
import { AjustesCargaModal } from "./ajustes-carga-modal";

export type ClienteMemoriaRow = {
  id: number;
  code: string;
  name: string;
  nit: string;
  erpName: string | null;
  perfiles: number;
  ultimoUso: string | null;
  correcciones: number;
  tienePreferencias: boolean;
};

function normalizarBusqueda(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Tablero de administración de la memoria de carga: un cliente por fila con
 * cuántos formatos, correcciones y preferencias tiene guardados, y el panel de
 * gestión (mismo editor de estructura que antes vivía en la ficha del cliente).
 */
export default function PerfilesCargaClient({ clients }: { clients: ClienteMemoriaRow[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [gestionando, setGestionando] = useState<ClienteMemoriaRow | null>(null);
  // Cliente cuya memoria se va a borrar por completo. La confirmación va en un
  // modal propio (no `confirm()`) porque el borrado arrasa con formatos,
  // correcciones y preferencias a la vez y conviene enumerar qué se pierde.
  const [borrando, setBorrando] = useState<ClienteMemoriaRow | null>(null);
  const [enProceso, iniciarBorrado] = useTransition();

  const confirmarBorrado = () => {
    const objetivo = borrando;
    if (!objetivo) return;
    iniciarBorrado(async () => {
      const res = await limpiarMemoriaCargaCliente(objetivo.id);
      if (res.ok) {
        notifySuccess(res.message ?? "Memoria de carga borrada.");
        setBorrando(null);
        router.refresh();
      } else {
        notifyError(res.message ?? "No se pudo borrar la memoria de carga.");
      }
    });
  };

  const conMemoria = (c: ClienteMemoriaRow) =>
    c.perfiles > 0 || c.correcciones > 0 || c.tienePreferencias;

  const totales = useMemo(
    () => ({
      clientes: clients.filter(conMemoria).length,
      perfiles: clients.reduce((suma, c) => suma + c.perfiles, 0),
      correcciones: clients.reduce((suma, c) => suma + c.correcciones, 0),
    }),
    [clients],
  );

  // La pantalla lista SOLO clientes con memoria guardada, siempre. La memoria la
  // crea el flujo de trabajo (carga y ajustes del borrador de balance), no esta
  // pantalla: un cliente sin nada guardado no tiene qué administrar aquí.
  const buscando = busqueda.trim() !== "";
  const filtrados = useMemo(() => {
    const conDatos = clients.filter(conMemoria);
    const termino = normalizarBusqueda(busqueda);
    if (!termino) return conDatos;
    const nitBuscado = busqueda.replace(/\D/g, "");
    return conDatos.filter((c) => {
      const nitNumerico = c.nit.replace(/\D/g, "");
      return (
        normalizarBusqueda(c.name).includes(termino)
        || normalizarBusqueda(c.code).includes(termino)
        || normalizarBusqueda(c.nit).includes(termino)
        || (nitBuscado.length > 0 && nitNumerico.includes(nitBuscado))
      );
    });
  }, [busqueda, clients]);

  const pg = usePagination(filtrados, 50);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumen
          etiqueta="Clientes con memoria"
          valor={totales.clientes}
          detalle={`de ${clients.length} cliente(s)`}
        />
        <Resumen
          etiqueta="Formatos memorizados"
          valor={totales.perfiles}
          detalle="cargas que se procesan sin IA"
        />
        <Resumen
          etiqueta="Correcciones por cuenta"
          valor={totales.correcciones}
          detalle="ajustes que se re-aplican solos"
        />
      </div>

      <Card>
        <CardHeader
          title="Memoria de carga por cliente"
          right={
            <span className="text-[11px] text-ink-400">
              Los formatos y las correcciones se crean solos al cargar y revisar balances.
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
            Solo clientes con memoria guardada
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
                <th className="px-4 py-2 text-right font-semibold">Correcciones</th>
                <th className="px-4 py-2 font-semibold">Preferencias</th>
                <th className="px-4 py-2 font-semibold">Último uso</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    {buscando
                      ? "Ningún cliente con memoria guardada coincide con ese código, NIT o razón social."
                      : "Todavía ningún cliente tiene formatos, correcciones ni preferencias guardadas. Se crean solas al cargar un balance y ajustar su borrador."}
                  </td>
                </tr>
              )}
              {pg.pageItems.map((c) => (
                <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink-800">{c.name}</div>
                    <div className="flex flex-wrap gap-x-2 font-mono text-[11px] text-ink-400">
                      <span>{c.code}</span>
                      <span>NIT {c.nit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{c.erpName ?? <span className="text-ink-400">Sin ERP</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700">{c.perfiles}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700">{c.correcciones}</td>
                  <td className="px-4 py-2.5">
                    <Chip
                      label={c.tienePreferencias ? "Configuradas" : "Auto"}
                      tone={c.tienePreferencias ? "blue" : "ink"}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{c.ultimoUso ? fmtDate(c.ultimoUso) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setBorrando(c)}
                        title="Borrar TODA la memoria de carga de este cliente: formatos, correcciones y preferencias"
                        aria-label={`Borrar la memoria de carga de ${c.name}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        <Icon name="trash" size={13} />
                        Borrar todo
                      </button>
                      <button
                        type="button"
                        onClick={() => setGestionando(c)}
                        title="Ver y editar los formatos, correcciones y preferencias memorizadas para este cliente"
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                      >
                        <Icon name="ai" size={13} />
                        Administrar
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
        title="Borrar la memoria de carga del cliente"
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
              <strong>{borrando.name}</strong> <span className="font-mono text-[11px] text-ink-400">({borrando.code})</span>:
            </p>
            <ul className="flex flex-col gap-1 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px]">
              <li>· {borrando.perfiles} formato(s) memorizado(s)</li>
              <li>· {borrando.correcciones} corrección(es) por cuenta</li>
              <li>· {borrando.tienePreferencias ? "Las preferencias de carga configuradas" : "Sin preferencias configuradas"}</li>
            </ul>
            <p className="text-ink-500">
              La próxima carga de este cliente volverá a detectar la estructura del archivo con IA y no
              aplicará ningún ajuste automático por cuenta. Los balances y borradores ya cargados no se tocan.
              Esta acción no se puede deshacer.
            </p>
          </div>
        )}
      </Modal>

      {gestionando && (
        <AjustesCargaModal
          key={`perfiles-${gestionando.id}`}
          cliente={{ id: gestionando.id, name: gestionando.name, nit: gestionando.nit }}
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
