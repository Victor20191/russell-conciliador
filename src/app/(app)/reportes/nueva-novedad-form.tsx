"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearNovedadInterna } from "@/app/actions/soporte";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import { ADJUNTOS_MAX } from "@/lib/soporte-estados";
import { catalogoUbicacionesNovedad, type RutaNovedad } from "@/lib/soporte-rutas";
import type { SupportTicketInternalCreateState } from "@/lib/definitions";

const INPUT =
  "rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition placeholder:text-ink-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function ErrorCampo({ mensajes }: { mensajes?: string[] }) {
  return mensajes?.[0] ? <p className="text-xs text-err-700">{mensajes[0]}</p> : null;
}

export default function NuevaNovedadForm({
  storageReady,
  catalogo = catalogoUbicacionesNovedad(),
}: {
  storageReady: boolean;
  catalogo?: RutaNovedad[];
}) {
  const router = useRouter();
  const archivosRef = useRef<File[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [rutaClave, setRutaClave] = useState("");
  const [menuClave, setMenuClave] = useState("");
  const [previews, setPreviews] = useState<{ src: string; nombre: string }[]>([]);
  const rutaElegida = catalogo.find((ruta) => ruta.clave === rutaClave);
  const menus = rutaElegida?.menus ?? [];

  function enviarNovedad(
    prev: SupportTicketInternalCreateState | undefined,
    formData: FormData,
  ) {
    const enForm = formData
      .getAll("adjuntos")
      .filter((valor): valor is File => valor instanceof File && valor.size > 0);
    if (enForm.length === 0 && archivosRef.current.length > 0) {
      formData.delete("adjuntos");
      for (const archivo of archivosRef.current) formData.append("adjuntos", archivo);
    }
    return crearNovedadInterna(prev, formData);
  }

  const [state, dispatch, pending] = useActionState(enviarNovedad, undefined);

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

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, ADJUNTOS_MAX);
    if (files.length === 0) return;
    archivosRef.current = files;
    let pendientes = files.length;
    const leidas: { src: string; nombre: string; orden: number }[] = [];
    files.forEach((file, orden) => {
      const reader = new FileReader();
      reader.onload = () => {
        leidas.push({ src: String(reader.result ?? ""), nombre: file.name, orden });
        pendientes -= 1;
        if (pendientes === 0) {
          setPreviews(leidas.sort((a, b) => a.orden - b.orden).map(({ src, nombre }) => ({ src, nombre })));
        }
      };
      reader.onerror = () => {
        pendientes -= 1;
        if (pendientes === 0) {
          setPreviews(leidas.sort((a, b) => a.orden - b.orden).map(({ src, nombre }) => ({ src, nombre })));
        }
      };
      reader.readAsDataURL(file);
    });
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
        size="3xl"
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
        <form id="nueva-novedad" action={dispatch} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Ruta *
              <select
                name="routeKey"
                required
                value={rutaClave}
                onChange={(e) => {
                  const siguiente = e.target.value;
                  setRutaClave(siguiente);
                  const ruta = catalogo.find((item) => item.clave === siguiente);
                  setMenuClave(ruta?.menus.length === 1 ? ruta.menus[0]!.clave : "");
                }}
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
                name="menuKey"
                required
                disabled={!rutaElegida}
                value={menuClave}
                onChange={(e) => setMenuClave(e.target.value)}
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
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
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
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
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
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  multiple
                  onChange={onPick}
                  className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-600 focus:outline-none"
                />
                <p className="text-[11px] text-ink-500">
                  Hasta {ADJUNTOS_MAX} imágenes en JPG, PNG, WEBP, GIF o SVG. Máximo 4 MB cada una.
                </p>
                {previews.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                    {previews.map((preview) => (
                      <figure key={preview.nombre} className="overflow-hidden rounded-md border border-ink-150 bg-ink-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview.src}
                          alt={preview.nombre}
                          className="h-28 w-full bg-navy-800 object-contain p-2"
                        />
                        <figcaption className="truncate px-2 py-1 text-[11px] text-ink-500">{preview.nombre}</figcaption>
                      </figure>
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
