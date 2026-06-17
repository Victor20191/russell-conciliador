"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { importarMaestros } from "@/app/actions/import-maestros";
import type { ErrorImport, ImportMaestrosState } from "@/lib/import/maestros";

export function ImportMaestrosButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 transition hover:bg-ink-50"
      >
        Importar maestros
      </button>
      {open && <ImportMaestrosModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportMaestrosModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportMaestrosState, FormData>(
    importarMaestros,
    {},
  );
  const [fileName, setFileName] = useState("");

  // Al crear los usuarios, refresca la tabla de la página (server component).
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar maestros de personas"
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
            form="import-maestros-form"
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
        <form id="import-maestros-form" action={formAction} className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube <span className="font-semibold">Plantilla_Maestros_Personas.xlsx</span> con las hojas{" "}
            <span className="font-medium">Socios, Gerentes, Seniors y Staff</span>. Cada persona se crea
            como usuario (el rol lo define la hoja) con una contraseña temporal que deberá cambiar en su
            primer ingreso. No se importa nada si hay errores.
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

function ResultadoOk({
  resumen,
}: {
  resumen: NonNullable<ImportMaestrosState["resumen"]>;
}) {
  const orden = ["Socio", "Gerente", "Senior", "Staff"];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Se crearon <span className="font-semibold">{resumen.creados}</span> personas:{" "}
        {orden
          .filter((r) => resumen.porRol[r])
          .map((r) => `${resumen.porRol[r]} ${r}`)
          .join(" · ")}
        .
      </div>
      <div className="rounded-md border border-warn-100 bg-warn-100/40 p-3">
        <p className="text-[11.5px] font-semibold text-warn-700">
          Contraseña temporal (cópiala ahora, no se vuelve a mostrar)
        </p>
        <p className="mt-1 text-[11px] text-ink-500">
          Es la misma para todas las personas creadas. Cada una deberá cambiarla en su primer ingreso.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 font-mono text-[13px] text-ink-800">
            {resumen.passwordTemporal}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(resumen.passwordTemporal)}
            className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Copiar
          </button>
        </div>
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
              <th className="px-2.5 py-1.5 font-semibold">Hoja</th>
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Problema</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2.5 py-1.5 text-ink-600">{e.hoja}</td>
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
