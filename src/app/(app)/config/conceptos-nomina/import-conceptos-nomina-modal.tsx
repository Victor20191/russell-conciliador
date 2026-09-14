"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { importarCatalogoConceptosErp, importarConceptosNomina } from "@/app/actions/import-conceptos-nomina";
import { notifyActionState } from "@/lib/client-notifications";
import type { ImportConceptosNominaState } from "@/lib/import/conceptos-nomina";
import type { ErrorImport } from "@/lib/import/maestros";

export type ClienteOpcionConceptos = { id: number; name: string; nit: string };

const CLASE_BOTON = "inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50";
const CLASE_ARCHIVO = "rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white";

export function ImportConceptosNominaButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={CLASE_BOTON}>
        <Icon name="doc" size={13} /> Cargar plantilla Excel
      </button>
      {open && <ImportConceptosNominaModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function ImportCatalogoErpButton({ clientes }: { clientes: ClienteOpcionConceptos[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={CLASE_BOTON}>
        <Icon name="doc" size={13} /> Cargar catálogo del ERP
      </button>
      {open && <ImportCatalogoErpModal clientes={clientes} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportConceptosNominaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportConceptosNominaState, FormData>(
    importarConceptosNomina,
    {},
  );
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    notifyActionState(state, {
      success: "Conceptos de nómina importados.",
      error: "No se pudieron importar los conceptos.",
    });
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar conceptos de nómina desde la plantilla"
      size="2xl"
      footer={
        // Sin «Cerrar» tras éxito: la X del header ya cierra (convención de modales).
        state?.ok ? undefined : (
          <button
            type="submit"
            form="import-conceptos-nomina-form"
            disabled={pending || !fileName}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Importando</EstadoProcesando> : "Importar"}
          </button>
        )
      }
    >
      {state?.ok && state.resumen ? (
        <ResultadoOk resumen={state.resumen} avisos={state.avisos} />
      ) : (
        <form id="import-conceptos-nomina-form" action={formAction} className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube <span className="font-semibold">Plantilla_Conceptos_Nomina.xlsx</span>. Cada fila asocia
            un <span className="font-semibold">concepto de nómina</span> de un cliente con su{" "}
            <span className="font-semibold">grupo de cuenta contable</span> y la{" "}
            <span className="font-semibold">cuenta contable del cliente</span> (o la Russell de 6): la
            plataforma la lleva a la cuenta Russell con la homologación del balance. Cliente, código,
            nombre y cuenta son obligatorios; el grupo y el centro de costo, opcionales. Varias
            cuentas van en la misma fila separadas con «;». Cada concepto (y centro) reemplaza sus
            cuentas anteriores; los que no vengan quedan intactos. No se importa nada si hay errores.
          </p>
          <a
            href="/config/conceptos-nomina/plantilla"
            download="Plantilla_Conceptos_Nomina.xlsx"
            className="inline-flex w-fit self-end items-center gap-1.5 rounded-md border border-ink-200 bg-ink-50 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-white"
          >
            <Icon name="download" size={13} /> Descargar plantilla Excel
          </a>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Archivo Excel (.xlsx)</span>
            <input
              type="file"
              name="archivo"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className={CLASE_ARCHIVO}
            />
          </label>
          {state?.message && <p className="text-[12px] font-medium text-err-700">{state.message}</p>}
          {state?.errores && state.errores.length > 0 && <ErroresTabla errores={state.errores} />}
        </form>
      )}
    </Modal>
  );
}

/**
 * Catálogo tal como lo imprime el ERP (RF-NOM-07): SIIGO «Informe conceptos de nómina», INCODOL
 * «Equivalencias», NOMINAI «Maestro de conceptos»… El cliente se elige aquí porque el archivo no
 * lo trae; la hoja se detecta por contenido y se puede forzar por nombre.
 */
function ImportCatalogoErpModal({ clientes, onClose }: { clientes: ClienteOpcionConceptos[]; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportConceptosNominaState, FormData>(
    importarCatalogoConceptosErp,
    {},
  );
  const [fileName, setFileName] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(clientes.length === 1 ? clientes[0].id : null);

  useEffect(() => {
    notifyActionState(state, {
      success: "Catálogo del ERP importado.",
      error: "No se pudo importar el catálogo.",
    });
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar el catálogo de conceptos del ERP"
      size="2xl"
      footer={
        state?.ok ? undefined : (
          <button
            type="submit"
            form="import-catalogo-erp-form"
            disabled={pending || !fileName || clienteId == null}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Importando</EstadoProcesando> : "Importar"}
          </button>
        )
      }
    >
      {state?.ok && state.resumen ? (
        <ResultadoOk resumen={state.resumen} avisos={state.avisos} />
      ) : (
        <form id="import-catalogo-erp-form" action={formAction} className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube el informe de conceptos <span className="font-semibold">tal como lo exporta el ERP</span>{" "}
            (SIIGO «Informe conceptos de nómina», «Equivalencias», «Maestro de conceptos», «Cuentas»…):
            hace falta una hoja con el <span className="font-semibold">código del concepto</span> y su{" "}
            <span className="font-semibold">cuenta contable</span>; el nombre, el tipo y el centro de
            costo se toman si vienen. La cuenta del cliente se lleva a Russell con la homologación del
            balance (o por su estructura PUC); las de clase «00» y las de deducciones se guardan por
            su subcuenta. Cada concepto (y centro) reemplaza sus cuentas anteriores.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
            <SelectorClienteBuscable clients={clientes} value={clienteId} onChange={setClienteId} name="clienteId" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Catálogo del ERP (.xlsx, .xls o .csv)</span>
            <input
              type="file"
              name="archivo"
              accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className={CLASE_ARCHIVO}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Hoja (opcional)</span>
            <input
              type="text"
              name="hoja"
              placeholder="Se detecta sola; escribe el nombre exacto solo si eligió otra"
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400 focus:border-blue-400"
            />
          </label>
          {state?.message && <p className="text-[12px] font-medium text-err-700">{state.message}</p>}
          {state?.errores && state.errores.length > 0 && <ErroresTabla errores={state.errores} />}
        </form>
      )}
    </Modal>
  );
}

function ResultadoOk({ resumen, avisos }: { resumen: NonNullable<ImportConceptosNominaState["resumen"]>; avisos?: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Se cargaron <span className="font-semibold">{resumen.conceptos}</span> concepto(s) de{" "}
        <span className="font-semibold">{resumen.clientes}</span> cliente(s), con{" "}
        <span className="font-semibold">{resumen.cuentas}</span> cuenta(s)
        {resumen.sinRussell > 0 ? <>, {resumen.sinRussell} de ellas sin cuenta Russell (cruzan por subcuenta o son de control)</> : null}.
      </div>
      <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
        {resumen.actualizados > 0
          ? `${resumen.actualizados} concepto(s) ya existían y quedaron con lo que traía el archivo.`
          : "Todos los conceptos del archivo eran nuevos."}
      </div>
      {avisos && avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-warn-500/40 bg-warn-100/40 px-3 py-2 text-[12px] text-warn-700">
          {avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}

function ErroresTabla({ errores }: { errores: ErrorImport[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-err-700">
        {errores.length} problema(s) encontrados — nada se importó:
      </span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Problema</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila || "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
