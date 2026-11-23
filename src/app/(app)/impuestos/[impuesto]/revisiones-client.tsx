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
import { crearRevisionImpuesto, eliminarRevisionImpuesto } from "@/app/actions/impuestos-revisiones";
import { Icon } from "@/components/icons";
import type { ActionState } from "@/lib/definitions";
import { BuscadorListado, FiltroEstadoListado } from "@/app/(app)/modulos/[codigo]/listado-compartido";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { descripcionCorte, fechaCorteTexto, impuestoPorClave, nombreCorte, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "@/lib/impuestos/impuestos-dian";
import { etiquetaPeriodo, mesesCorteValidos, mesesPorPeriodo, periodosEsperados } from "@/lib/impuestos/periodicidad";
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

/** Cuántos períodos van hasta el corte: «8 meses», «4 bimestres», «1 año». */
const UNIDAD_PERIODO: Readonly<Record<string, [string, string]>> = {
  Mensual: ["mes", "meses"],
  Bimestral: ["bimestre", "bimestres"],
  Trimestral: ["trimestre", "trimestres"],
  Cuatrimestral: ["cuatrimestre", "cuatrimestres"],
  Semestral: ["semestre", "semestres"],
  Anual: ["año", "años"],
};
const cuantosPeriodos = (periodicidad: string, n: number) => {
  const [uno, varios] = UNIDAD_PERIODO[periodicidad] ?? ["período", "períodos"];
  return `${n} ${n === 1 ? uno : varios}`;
};

export default function RevisionesClient({
  impuestoClave,
  revisiones,
  clientes,
  puedeCrear,
  eliminables,
  anioActual,
}: {
  impuestoClave: ClaveImpuesto;
  revisiones: RevisionResumen[];
  clientes: ClienteRevision[];
  puedeCrear: boolean;
  /** Las revisiones que quien consulta puede eliminar (permiso, alcance de escritura y sin firme). */
  eliminables: number[];
  anioActual: number;
}) {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoRevision | null>(null);
  const conteo = useMemo(() => contarRevisionesPorEstado(revisiones), [revisiones]);
  const visibles = useMemo(() => filtrarRevisiones(revisiones, busqueda, estado), [revisiones, busqueda, estado]);
  const clientesVisibles = new Set(visibles.map((r) => r.clienteId)).size;
  const hayRevisiones = revisiones.length > 0;
  const puedeEliminarAlguna = eliminables.length > 0;
  const [eliminando, setEliminando] = useState<RevisionResumen | null>(null);

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
          <p className="px-4 py-6 text-[12.5px] text-ink-500">Todavía no hay revisiones de {impuesto.nombre}{puedeCrear ? ". Crea la primera con «Nueva revisión»." : "."}</p>
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
                <th className="px-3 py-2">Fecha de corte</th>
                <th className="px-3 py-2 text-right">Formularios del año</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creada</th>
                {puedeEliminarAlguna && <th className="w-12 px-3 py-2"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-3 py-2">
                    <Link href={`/impuestos/${impuesto.slug}/${r.id}`} className="font-semibold text-navy-800 hover:underline">{r.nombreCliente}</Link>
                    <div className="tabular-nums text-[11px] text-ink-400">NIT {r.nitCliente}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.anio}</td>
                  <td className="px-3 py-2">{nombreCorte(r.anio, r.mesCorte, { conAnio: false })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.confirmados} confirmados{r.porConfirmar > 0 && <span className="ml-1 text-warn-700">· {r.porConfirmar} por confirmar</span>}
                  </td>
                  <td className="px-3 py-2"><Chip label={etiquetaEstadoRevision(estadoRevision(r))} tone={estadoRevision(r) === "en_firme" ? "ok" : "blue"} /></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{fmtDateTime(r.creadoEn)}{r.creadoPor ? ` · ${r.creadoPor}` : ""}</td>
                  {puedeEliminarAlguna && (
                    <td className="px-3 py-2 text-right">
                      {eliminables.includes(r.id) && (
                        <button
                          type="button"
                          onClick={() => setEliminando(r)}
                          title="Eliminar revisión"
                          aria-label={`Eliminar la revisión de ${r.nombreCliente} ${r.anio}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-err-200 text-err-600 transition hover:bg-err-50 hover:text-err-700"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {abierto && <NuevaRevisionModal impuesto={impuesto} clientes={clientes} anioActual={anioActual} onClose={() => setAbierto(false)} />}
      {eliminando && <EliminarRevisionModal impuesto={impuesto} revision={eliminando} onClose={() => setEliminando(null)} />}
    </div>
  );
}

/** Confirma la eliminación de una revisión desde la lista. Los formularios del cliente y el año se conservan. */
function EliminarRevisionModal({ impuesto, revision, onClose }: { impuesto: ImpuestoDian; revision: RevisionResumen; onClose: () => void }) {
  const router = useRouter();
  const [state, action, eliminando] = useActionState<ActionState, FormData>(eliminarRevisionImpuesto, {});
  useEffect(() => {
    notifyActionState(state, { success: "Revisión eliminada.", error: "No se pudo eliminar la revisión." });
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);
  return (
    <Modal open onClose={onClose} title="Eliminar revisión" size="md" footer={
      <button
        type="submit"
        form="eliminar-revision"
        disabled={eliminando}
        className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-err-400 disabled:opacity-60"
      >
        {eliminando ? <EstadoProcesando>Eliminando</EstadoProcesando> : <><Icon name="trash" size={14} /> Sí, eliminar</>}
      </button>
    }>
      <form id="eliminar-revision" action={action} className="flex flex-col gap-2 text-[12.5px] text-ink-700">
        <input type="hidden" name="id" value={revision.id} />
        <p>
          Se elimina la revisión de {impuesto.nombre} de <span className="font-semibold text-ink-900">{revision.nombreCliente}</span>: {descripcionCorte(revision.anio, revision.mesCorte)}.
        </p>
        <p className="text-ink-500">
          Los formularios del cliente y el año se conservan, porque los usan las otras revisiones del año. La eliminación queda en la bitácora.
        </p>
      </form>
    </Modal>
  );
}

function NuevaRevisionModal({ impuesto, clientes, anioActual, onClose }: { impuesto: ImpuestoDian; clientes: ClienteRevision[]; anioActual: number; onClose: () => void }) {
  const router = useRouter();
  const [state, action, creando] = useActionState<ResultadoRevision, FormData>(crearRevisionImpuesto, {});
  const [clienteId, setClienteId] = useState("");
  const [anio, setAnio] = useState(String(anioActual));
  // El corte: «Precierre» hasta el mes que se elija o «Cierre» a diciembre; sin elegir, no se crea.
  const [tipoCorte, setTipoCorte] = useState<"" | "precierre" | "cierre">("");
  const [mesPrecierre, setMesPrecierre] = useState("");
  const [periodicidadElegida, setPeriodicidadElegida] = useState("");
  // RST: un cliente sin la marca del Régimen Simple se confirma aquí (y su ficha queda en Sí).
  const [confirmaRegimen, setConfirmaRegimen] = useState(false);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión creada.", error: "No se pudo crear la revisión." });
    if (state.ok && state.id) router.push(`/impuestos/${impuesto.slug}/${state.id}`);
  }, [state, router, impuesto.slug]);

  const cliente = clientes.find((c) => String(c.id) === clienteId) ?? null;
  // Una sola periodicidad (Retención): no se pregunta. IVA: la de la ficha del cliente o, si no la tiene, la que se elija aquí.
  const unica = impuesto.periodicidades.length === 1 ? impuesto.periodicidades[0] : null;
  const deLaFicha = cliente?.periodicidad ?? null;
  const periodicidad = unica ?? deLaFicha ?? (periodicidadElegida || null);
  const pidePeriodicidad = !unica && cliente != null && deLaFicha == null;
  // El corte cierra un período. Meses de precierre: los que cierran uno antes de diciembre (con periodicidad anual, ninguno).
  const mesesPrecierre = periodicidad ? mesesCorteValidos(periodicidad).filter((m) => m < 12) : [];
  const soloCierre = !!periodicidad && mesesPrecierre.length === 0;
  const tipo = tipoCorte === "precierre" && soloCierre ? "" : tipoCorte;
  const mesCorte = tipo === "cierre" ? 12 : tipo === "precierre" && mesesPrecierre.includes(Number(mesPrecierre)) ? Number(mesPrecierre) : null;
  const anioCorte = Number(anio);
  // «Agosto» con periodicidad mensual; «Agosto (bimestre 04)» con las demás (corto, para que quepa al frente de la pregunta).
  const opcionMes = (m: number) => {
    const nombre = NOMBRES_MES[m - 1];
    const meses = periodicidad ? mesesPorPeriodo(periodicidad) : 1;
    return meses === 1 || !periodicidad ? nombre : `${nombre} (${etiquetaPeriodo(periodicidad, m / meses).split(" · ")[0].toLowerCase()})`;
  };
  const queSeRevisa = mesCorte && periodicidad
    ? `Se revisan los formularios ${impuesto.declaracion.codigo} y 490 ${mesCorte === 1 ? "de enero" : `de enero a ${NOMBRES_MES[mesCorte - 1].toLowerCase()}`} de ${anioCorte}${periodicidad === "Anual" ? "" : ` (${cuantosPeriodos(periodicidad, periodosEsperados(periodicidad, mesCorte).length)})`}. El balance debe tener corte al ${fechaCorteTexto(anioCorte, mesCorte)}.`
    : null;
  const pideConfirmarRegimen = impuesto.requiereRegimenSimple && cliente != null && !cliente.regimenSimple;
  // En RST, primero los clientes con la marca del Régimen Simple (en orden alfabético, como llegan).
  const opcionesClientes = impuesto.requiereRegimenSimple ? [...clientes].sort((a, b) => Number(b.regimenSimple) - Number(a.regimenSimple)) : clientes;

  const anios = [anioActual, anioActual - 1, anioActual - 2];
  return (
    <Modal open onClose={onClose} title={`Nueva revisión de ${impuesto.nombre}`} size="xl" footer={
      <button type="submit" form="nueva-revision" disabled={creando || !clienteId || !periodicidad || mesCorte == null || (pideConfirmarRegimen && !confirmaRegimen)} className={BOTON_PRIMARIO}>
        {creando ? <EstadoProcesando>Creando</EstadoProcesando> : "Crear revisión"}
      </button>
    }>
      <form id="nueva-revision" action={action} className="flex flex-col gap-4 text-[12.5px]">
        <input type="hidden" name="impuesto" value={impuesto.clave} />
        <input type="hidden" name="clienteId" value={clienteId} />
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Cliente</span>
          <SelectBuscable
            opciones={opcionesClientes.map((c) => ({
              value: String(c.id),
              label: c.nombre,
              sublabel: impuesto.requiereRegimenSimple ? `NIT ${c.nit} · ${c.regimenSimple ? "Régimen Simple" : "Sin la marca de Régimen Simple"}` : `NIT ${c.nit}`,
            }))}
            value={clienteId}
            onChange={(v) => {
              setClienteId(v);
              setConfirmaRegimen(false);
            }}
            placeholder="Busca el cliente"
          />
        </label>
        {impuesto.requiereRegimenSimple && cliente && (
          cliente.regimenSimple ? (
            <p className="text-ink-600">El cliente tiene la marca <span className="font-semibold text-ink-800">Régimen Simple de Tributación</span> en su ficha. Los anticipos son siempre bimestrales.</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
              <span>
                <span className="font-semibold">{cliente.nombre}</span> tiene «Régimen Simple de Tributación» en No en su ficha. Los anticipos bimestrales solo aplican a los clientes del Régimen Simple.
              </span>
              <label className="flex items-start gap-2 text-ink-800">
                <input type="checkbox" name="confirmaRegimenSimple" value="1" checked={confirmaRegimen} onChange={(e) => setConfirmaRegimen(e.target.checked)} className="mt-0.5" />
                <span>Confirmo que este cliente pertenece al Régimen Simple de Tributación. Su ficha quedará en Sí.</span>
              </label>
            </div>
          )
        )}
        {!unica && cliente && (
          deLaFicha ? (
            <p className="text-ink-600">Periodicidad de {impuesto.nombre} en la ficha del cliente: <span className="font-semibold text-ink-800">{deLaFicha}</span>.</p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-ink-700">Periodicidad de {impuesto.nombre}</span>
              <span className="text-[11.5px] text-ink-500">El cliente no la tiene en su ficha: la que elijas queda guardada allí.</span>
              <select
                name="periodicidad"
                value={periodicidadElegida}
                onChange={(e) => setPeriodicidadElegida(e.target.value)}
                className="h-9 w-56 rounded-md border border-ink-200 bg-white px-2"
              >
                <option value="">Elige la periodicidad</option>
                {impuesto.periodicidades.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )
        )}
        <label className="flex w-32 flex-col gap-1">
          <span className="font-semibold text-ink-700">Año</span>
          <select name="anio" value={anio} onChange={(e) => setAnio(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold text-ink-700">¿Qué vas a revisar?</legend>
          <div className="flex items-center gap-2">
            <label className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap ${soloCierre ? "text-ink-400" : ""}`}>
              <input type="radio" name="tipoCorte" checked={tipo === "precierre"} disabled={soloCierre} onChange={() => setTipoCorte("precierre")} />
              Precierre, con fecha de corte hasta el período:
            </label>
            <select
              value={soloCierre ? "" : mesPrecierre}
              onChange={(e) => {
                setMesPrecierre(e.target.value);
                if (e.target.value) setTipoCorte("precierre");
              }}
              disabled={!periodicidad || soloCierre}
              aria-label="Mes de la fecha de corte del precierre"
              className="h-8 min-w-0 rounded-md border border-ink-200 bg-white px-2 disabled:bg-ink-50 disabled:text-ink-400"
            >
              <option value="">{periodicidad ? "Elige el mes" : "Elige primero la periodicidad"}</option>
              {mesesPrecierre.map((m) => <option key={m} value={m}>{opcionMes(m)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="tipoCorte" checked={tipo === "cierre"} onChange={() => setTipoCorte("cierre")} />
            Cierre, con fecha de corte al 31 de diciembre
          </label>
          {!periodicidad && (
            <span className="text-[11.5px] text-ink-500">
              {pidePeriodicidad ? "Elige la periodicidad: el precierre tiene que cerrar uno de sus períodos." : "Elige el cliente: los meses del precierre dependen de su periodicidad."}
            </span>
          )}
          {soloCierre && <span className="text-[11.5px] text-ink-500">Con periodicidad {periodicidad?.toLowerCase()} solo hay cierre a diciembre.</span>}
          {queSeRevisa && <p className="rounded-md bg-navy-50 px-3 py-2 text-[12px] text-navy-800">{queSeRevisa}</p>}
          <span className="text-[11.5px] text-ink-500">
            Elige el último mes de la información que vas a revisar, no el mes en que haces el precierre: si en septiembre revisas hasta agosto, elige agosto.
          </span>
          <input type="hidden" name="mesCorte" value={mesCorte ?? ""} />
        </fieldset>
      </form>
    </Modal>
  );
}
