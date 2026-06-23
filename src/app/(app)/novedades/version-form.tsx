"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/modal";
import { createVersion, updateVersion, deleteVersion } from "@/app/actions/novedades";
import { notifyActionState } from "@/lib/client-notifications";
import { Campo, ErroresInline, INPUT_CLS, BTN_GUARDAR, BTN_ELIMINAR } from "./campos";
import type { VersionRow } from "./novedades-client";

export function VersionForm({
  mode,
  version,
  onClose,
}: {
  mode: "create" | "edit";
  version?: VersionRow;
  onClose: () => void;
}) {
  const accion = mode === "edit" ? updateVersion : createVersion;
  const [state, action, pending] = useActionState(accion, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: mode === "edit" ? "Versión actualizada." : "Versión creada.",
      error: "No se pudo guardar la versión.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, mode]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? "Editar versión" : "Nueva versión"}
      footer={
        <button type="submit" form="version-form" disabled={pending} className={BTN_GUARDAR}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      }
    >
      <form id="version-form" action={action} className="flex flex-col gap-4">
        {mode === "edit" && version && <input type="hidden" name="id" value={version.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Número de versión" hint='Único. Ej. "1.3.0"'>
            <input
              name="number"
              defaultValue={version?.number ?? ""}
              required
              placeholder="1.3.0"
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Estado">
            <select name="status" defaultValue={version?.status ?? "borrador"} className={INPUT_CLS}>
              <option value="borrador">Borrador</option>
              <option value="publicada">Publicada</option>
            </select>
          </Campo>

          <Campo label="Título" full>
            <input
              name="title"
              defaultValue={version?.title ?? ""}
              required
              placeholder="Nombre de la versión"
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Resumen (opcional)" full>
            <textarea
              name="summary"
              defaultValue={version?.summary ?? ""}
              rows={2}
              placeholder="Una línea sobre el foco de esta versión."
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Orden" hint="Mayor = más arriba en el timeline.">
            <input
              name="order"
              type="number"
              defaultValue={version?.order ?? 0}
              className={INPUT_CLS}
            />
          </Campo>
        </div>

        <ErroresInline state={state} />
      </form>
    </Modal>
  );
}

export function DeleteVersionForm({
  version,
  onClose,
}: {
  version: VersionRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(deleteVersion, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Versión eliminada.",
      error: "No se pudo eliminar la versión.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar versión"
      footer={
        <button type="submit" form="delete-version-form" disabled={pending} className={BTN_ELIMINAR}>
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-version-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={version.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar la versión <strong>v{version.number} · {version.title}</strong>. Esta acción
          no se puede deshacer y borrará también sus{" "}
          <strong>{version.changes.length} cambio(s)</strong> documentado(s).
        </p>
        <ErroresInline state={state} />
      </form>
    </Modal>
  );
}
