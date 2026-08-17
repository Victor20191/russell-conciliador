"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearNovedadInterna } from "@/app/actions/soporte";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import { ADJUNTOS_MAX } from "@/lib/soporte-estados";
import { catalogoUbicacionesNovedad } from "@/lib/soporte-rutas";

const INPUT =
  "rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition placeholder:text-ink-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function ErrorCampo({ mensajes }: { mensajes?: string[] }) {
  return mensajes?.[0] ? <p className="text-xs text-err-700">{mensajes[0]}</p> : null;
}

export default function NuevaNovedadForm({ storageReady }: { storageReady: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [state, action, pending] = useActionState(crearNovedadInterna, undefined);
  const [previews, setPreviews] = useState<string[]>([]);
  const [rutaClave, setRutaClave] = useState("");
  const catalogo = catalogoUbicacionesNovedad();
  const rutaElegida = catalogo.find((ruta) => ruta.clave === rutaClave);
  const menus = rutaElegida?.menus ?? [];
  const menuUnico = menus.length === 1 ? menus[0]!.clave : "";

  useEffect(() => {
    notifyActionState(state, {
      success: state?.code ? `Novedad ${state.code} enviada.` : "Novedad enviada.",
      error: "No se pudo enviar la novedad.",
    });
    if (state?.ok && state.ticketId) {
      router.push(`/reportes/${state.ticketId}`);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, [previews]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    for (const url of previews) URL.revokeObjectURL(url);
    const files = Array.from(e.target.files ?? []).slice(0, ADJUNTOS_MAX);
    setPreviews(files.map((file) => URL.createObjectURL(file)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
      >
        Nueva novedad
      </button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Montar una novedad"
        size="xl"
        footer={
          <button
            type="submit"
            form="nueva-novedad"
            disabled={pending}
            className="rounded-md bg-navy-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Enviando</EstadoProcesando> : "Enviar a Xentria"}
          </button>
        }
      >
        <form id="nueva-novedad" action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Ruta *
              <select
                name="routeKey"
                required
                value={rutaClave}
                onChange={(e) => setRutaClave(e.target.value)}
                className={INPUT}
              >
                <option value="">Selecciona la ruta</option>
                {(["Trabajo", "Configuración"] as const).map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {catalogo
                      .filter((ruta) => ruta.grupo === grupo)
                      .map((ruta) => (
                        <option key={ruta.clave} value={ruta.clave}>
                          {ruta.etiqueta}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <ErrorCampo mensajes={state?.errors?.routeKey} />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Menú *
              <select
                key={rutaClave || "sin-ruta"}
                name="menuKey"
                required
                disabled={!rutaElegida}
                defaultValue={menuUnico}
                className={`${INPUT} disabled:bg-ink-50 disabled:text-ink-400`}
              >
                <option value="">{rutaElegida ? "Selecciona el menú" : "Primero elige la ruta"}</option>
                {menus.map((menu) => (
                  <option key={menu.clave} value={menu.clave}>
                    {menu.etiqueta}
                  </option>
                ))}
              </select>
              <ErrorCampo mensajes={state?.errors?.menuKey} />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Asunto *
            <input
              name="subject"
              required
              minLength={5}
              maxLength={160}
              className={INPUT}
              placeholder="Ej. No puedo cargar el balance de marzo"
            />
            <ErrorCampo mensajes={state?.errors?.subject} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Descripción *
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={7}
              className={INPUT}
              placeholder="Describe qué estabas haciendo, qué ocurrió y qué esperabas ver."
            />
            <ErrorCampo mensajes={state?.errors?.description} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Imágenes de la novedad
            </span>
            {storageReady ? (
              <>
                <input
                  name="adjuntos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={onPick}
                  className="text-[12.5px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-700"
                />
                <p className="text-[11px] text-ink-500">
                  Hasta {ADJUNTOS_MAX} capturas en JPG, PNG o WEBP. Máximo 4 MB cada una.
                </p>
                {previews.length > 0 && (
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {previews.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" className="h-20 w-full rounded-md object-cover" />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-md border border-warn-100 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
                El almacenamiento de imágenes no está configurado. Puedes enviar la descripción y adjuntar capturas cuando el administrador lo habilite.
              </p>
            )}
          </div>

          {state?.message && !state.ok && (
            <div className="rounded-md border border-err-100 bg-err-100 px-3.5 py-2.5 text-xs font-medium text-err-700" role="alert">
              {state.message}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
