"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SelectBuscable } from "@/components/select-buscable";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { crearRevisionRetencion } from "@/app/actions/impuestos-retencion";
import { BuscadorListado, FiltroEstadoListado } from "@/app/(app)/modulos/[codigo]/listado-compartido";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { opcionesPeriodicidad } from "@/lib/impuestos/periodicidad";
import {
  contarRevisionesPorEstado,
  ESTADOS_REVISION,
  estadoRevision,
  etiquetaEstadoRevision,
  filtrarRevisiones,
  type EstadoRevision,
} from "@/lib/impuestos/retencion/listado";
import type { ClienteRevision, RevisionResumen } from "@/lib/impuestos/retencion/revision-servidor";
import type { ResultadoRevision } from "@/lib/impuestos/retencion/tipos";

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";

const etiquetaCorte = (mes: number) => (mes === 9 ? "Precierre · septiembre" : mes === 12 ? "Cierre · diciembre" : `Corte · ${NOMBRES_MES[mes - 1]?.toLowerCase()}`);

export default function RevisionesClient({
  revisiones,
  clientes,
  puedeCrear,
  anioActual,
}: {
  revisiones: RevisionResumen[];
  clientes: ClienteRevision[];
  puedeCrear: boolean;
  anioActual: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoRevision | null>(null);
  const conteo = useMemo(() => contarRevisionesPorEstado(revisiones), [revisiones]);
  const visibles = useMemo(() => filtrarRevisiones(revisiones, busqueda, estado), [revisiones, busqueda, estado]);
  const clientesVisibles = new Set(visibles.map((r) => r.clienteId)).size;
  const hayRevisiones = revisiones.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {(hayRevisiones || puedeCrear) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hayRevisiones && <BuscadorListado busqueda={busqueda} setBusqueda={setBusqueda} etiqueta="Buscar por cliente, NIT o año" />}
          {puedeCrear && <button type="button" onClick={() => setAbierto(true)} className={`ml-auto ${BOTON_PRIMARIO}`}>Nueva revisión</button>}
        </div>
      )}
      {hayRevisiones && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Revisiones</span>
          <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">{visibles.length}</span>
          <span className="text-[11px] text-ink-400">{clientesVisibles === 1 ? "1 cliente" : `${clientesVisibles} clientes`}</span>
          <div className="ml-auto">
            <FiltroEstadoListado estado={estado} setEstado={setEstado} conteo={conteo} opciones={ESTADOS_REVISION} />
          </div>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        {!hayRevisiones ? (
          <p className="px-4 py-6 text-[12.5px] text-ink-500">Todavía no hay revisiones de Retención en la fuente{puedeCrear ? ". Crea la primera con «Nueva revisión»." : "."}</p>
        ) : visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            {estado
              ? `No se encontraron revisiones en estado «${etiquetaEstadoRevision(estado)}»${busqueda.trim() ? " con esa búsqueda" : ""}.`
              : "No se encontraron revisiones con ese cliente, NIT o año."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Año</th>
                <th className="px-3 py-2">Corte</th>
                <th className="px-3 py-2 text-right">Formularios del año</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creada</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-3 py-2">
                    <Link href={`/impuestos/retencion/${r.id}`} className="font-semibold text-navy-800 hover:underline">{r.nombreCliente}</Link>
                    <div className="tabular-nums text-[11px] text-ink-400">NIT {r.nitCliente}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.anio}</td>
                  <td className="px-3 py-2">{etiquetaCorte(r.mesCorte)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.confirmados} confirmados{r.porConfirmar > 0 && <span className="ml-1 text-warn-700">· {r.porConfirmar} por confirmar</span>}
                  </td>
                  <td className="px-3 py-2"><Chip label={etiquetaEstadoRevision(estadoRevision(r))} tone={estadoRevision(r) === "en_firme" ? "ok" : "blue"} /></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{fmtDateTime(r.creadoEn)}{r.creadoPor ? ` · ${r.creadoPor}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {abierto && <NuevaRevisionModal clientes={clientes} anioActual={anioActual} onClose={() => setAbierto(false)} />}
    </div>
  );
}

function NuevaRevisionModal({ clientes, anioActual, onClose }: { clientes: ClienteRevision[]; anioActual: number; onClose: () => void }) {
  const router = useRouter();
  const [state, action, creando] = useActionState<ResultadoRevision, FormData>(crearRevisionRetencion, {});
  const [clienteId, setClienteId] = useState("");
  const [anio, setAnio] = useState(String(anioActual));
  const [mesCorte, setMesCorte] = useState("9");
  const cliente = useMemo(() => clientes.find((c) => String(c.id) === clienteId) ?? null, [clientes, clienteId]);
  const [periodicidad, setPeriodicidad] = useState("Mensual");
  // Al elegir el cliente se propone su periodicidad (ajuste en render).
  const [clientePrevio, setClientePrevio] = useState(clienteId);
  if (clienteId !== clientePrevio) {
    setClientePrevio(clienteId);
    if (cliente) setPeriodicidad(cliente.periodicidad);
  }
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión creada.", error: "No se pudo crear la revisión." });
    if (state.ok && state.id) router.push(`/impuestos/retencion/${state.id}`);
  }, [state, router]);

  const anios = [anioActual, anioActual - 1, anioActual - 2];
  return (
    <Modal open onClose={onClose} title="Nueva revisión de Retención en la fuente" size="xl" footer={
      <button type="submit" form="nueva-revision" disabled={creando || !clienteId} className={BOTON_PRIMARIO}>
        {creando ? <EstadoProcesando>Creando</EstadoProcesando> : "Crear revisión"}
      </button>
    }>
      <form id="nueva-revision" action={action} className="flex flex-col gap-4 text-[12.5px]">
        <input type="hidden" name="clienteId" value={clienteId} />
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Cliente</span>
          <SelectBuscable
            opciones={clientes.map((c) => ({ value: String(c.id), label: c.nombre, sublabel: `NIT ${c.nit}` }))}
            value={clienteId}
            onChange={setClienteId}
            placeholder="Busca el cliente"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink-700">Año</span>
            <select name="anio" value={anio} onChange={(e) => setAnio(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2">
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold text-ink-700">¿A qué corte se revisa?</legend>
            <div className="flex flex-wrap items-center gap-3">
              {[{ mes: "9", label: "Precierre · septiembre" }, { mes: "12", label: "Cierre · diciembre" }].map((o) => (
                <label key={o.mes} className="flex items-center gap-1.5">
                  <input type="radio" name="mesCorteAtajo" checked={mesCorte === o.mes} onChange={() => setMesCorte(o.mes)} />
                  {o.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5">
                Otro mes
                <select value={mesCorte} onChange={(e) => setMesCorte(e.target.value)} className="h-8 rounded-md border border-ink-200 bg-white px-2">
                  {NOMBRES_MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
            </div>
            <input type="hidden" name="mesCorte" value={mesCorte} />
          </fieldset>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Periodicidad de Retención en la fuente del cliente</span>
          <select name="periodicidad" value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} className="h-9 w-56 rounded-md border border-ink-200 bg-white px-2">
            {opcionesPeriodicidad("RETEFUENTE").map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-[11.5px] text-ink-500">
            Confírmala: la mayoría de clientes declara cada mes. Define qué formularios se esperan hasta el corte{cliente && cliente.periodicidad !== periodicidad ? " y quedará también en la ficha del cliente" : ""}.
          </span>
        </label>
      </form>
    </Modal>
  );
}
