"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";
import { cargarFotosUsuarios, type CargarFotosState } from "@/app/actions/cargar-fotos";
import { notifyActionState } from "@/lib/client-notifications";

export function CargarFotosButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 transition hover:bg-ink-50"
      >
        <Icon name="upload" size={14} /> Cargar fotos (ZIP)
      </button>
      {open && <CargarFotosModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CargarFotosModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CargarFotosState, FormData>(
    cargarFotosUsuarios,
    {},
  );
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    notifyActionState(state, {
      success: "Fotos cargadas.",
      error: "No se pudieron cargar las fotos.",
    });
    if (state?.ok) router.refresh();
  }, [state, router]);

  const hayResumen = Boolean(state?.resumen);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar fotos de usuarios (carga masiva)"
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
            form="cargar-fotos-form"
            disabled={pending || !fileName}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Cargando</EstadoProcesando> : "Cargar fotos"}
          </button>
        )
      }
    >
      {state?.ok && state.resumen ? (
        <ResultadoOk resumen={state.resumen} />
      ) : (
        <form id="cargar-fotos-form" action={formAction} className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube un archivo <span className="font-semibold">.zip</span> con las fotos. Cada imagen debe
            llamarse con la <span className="font-semibold">cédula</span> del usuario, por ejemplo{" "}
            <code className="rounded bg-ink-100 px-1 font-mono text-[11.5px]">52123456.jpg</code>. Formatos
            admitidos: JPG, PNG o WEBP (máx. 4 MB cada una). Las personas deben existir ya como usuarios.
            Los sufijos de copia como <code className="rounded bg-ink-100 px-1 font-mono text-[11.5px]">-1</code>{" "}
            solo se aceptan cuando el prefijo coincide con una cédula existente.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-ink-600">Archivo ZIP (.zip)</span>
            <input
              type="file"
              name="archivo"
              accept=".zip,application/zip,application/x-zip-compressed"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
            />
          </label>
          {state?.message && (
            <p className="text-[12px] font-medium text-err-700">{state.message}</p>
          )}
          {/* Si falló pero hay resumen (p. ej. 0 asignadas), muestra el detalle igual. */}
          {!state?.ok && hayResumen && <DetalleResumen resumen={state!.resumen!} />}
        </form>
      )}
    </Modal>
  );
}

function ResultadoOk({ resumen }: { resumen: NonNullable<CargarFotosState["resumen"]> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Se asignaron <span className="font-semibold">{resumen.asignadas}</span> foto(s) de perfil.
      </div>
      <DetalleResumen resumen={resumen} />
    </div>
  );
}

function DetalleResumen({ resumen }: { resumen: NonNullable<CargarFotosState["resumen"]> }) {
  const bloques: { titulo: string; items: string[] }[] = [
    {
      titulo: "Nombres ajustados automáticamente",
      items: resumen.ajustesNombre.map((i) => `${i.archivo} → cédula ${i.cedula}`),
    },
    {
      titulo: "Sin usuario (la cédula no coincide)",
      items: resumen.sinUsuario,
    },
    {
      titulo: "Imágenes inválidas",
      items: resumen.invalidas.map((i) => `${i.archivo} — ${i.motivo}`),
    },
    {
      titulo: "Cédula repetida en el ZIP (se usó la primera)",
      items: resumen.duplicados,
    },
    {
      titulo: "Archivos ignorados (no son imágenes)",
      items: resumen.ignorados,
    },
  ].filter((b) => b.items.length > 0);

  if (bloques.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {bloques.map((b) => (
        <div key={b.titulo} className="rounded-md border border-ink-150">
          <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[11.5px] font-semibold text-ink-600">
            {b.titulo} · {b.items.length}
          </div>
          <ul className="max-h-40 overflow-y-auto px-3 py-1.5 text-[11.5px] text-ink-700">
            {b.items.map((it, i) => (
              <li key={i} className="border-b border-ink-50 py-0.5 font-mono last:border-0">
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
