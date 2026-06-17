"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { importarClientes } from "@/app/actions/import-clientes";
import type { ImportClientesState } from "@/lib/import/clientes";
import type { ErrorImport } from "@/lib/import/maestros";

export function ImportClientesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
      >
        <Icon name="doc" size={13} /> Importar desde Excel
      </button>
      {open && <ImportClientesModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportClientesModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportClientesState, FormData>(
    importarClientes,
    {},
  );
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar clientes desde Excel"
      size="2xl"
      footer={
        state?.ok ? (
          <button
            onClick={onClose}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            Cerrar
          </button>
        ) : (
          <button
            type="submit"
            form="import-clientes-form"
            disabled={pending || !fileName}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Importando…" : "Importar"}
          </button>
        )
      }
    >
      {state?.ok && state.resumen ? (
        <ResultadoOk resumen={state.resumen} />
      ) : (
        <form id="import-clientes-form" action={formAction} className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube <span className="font-semibold">Plantilla_Importacion_Clientes.xlsx</span>. Cada fila crea
            un cliente con su tipo, ERP, sector, responsables (Socio, Gerente, Senior, Staff por nombre),
            módulos y formatos DIAN. Las personas deben existir ya (impórtalas primero como maestros). No
            se importa nada si hay errores.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Archivo Excel (.xlsx)</span>
            <input
              type="file"
              name="archivo"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
            />
          </label>
          {state?.message && <p className="text-[12px] font-medium text-err-700">{state.message}</p>}
          {state?.errores && state.errores.length > 0 && <ErroresTabla errores={state.errores} />}
        </form>
      )}
    </Modal>
  );
}

function ResultadoOk({ resumen }: { resumen: NonNullable<ImportClientesState["resumen"]> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Se crearon <span className="font-semibold">{resumen.creados}</span> cliente(s).
      </div>
      <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
        <span className="text-[11px] font-semibold text-ink-500">Códigos asignados</span>
        <p className="mt-1 font-mono text-[12px] text-ink-700">{resumen.codigos.join(" · ")}</p>
      </div>
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
