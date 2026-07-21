"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/modal";
import { createChange, updateChange, deleteChange } from "@/app/actions/novedades";
import { notifyActionState } from "@/lib/client-notifications";
import { MODULOS_PLATAFORMA } from "@/lib/rbac/modulos-plataforma";
import { Campo, ErroresInline, INPUT_CLS, BTN_GUARDAR, BTN_ELIMINAR } from "./campos";
import type { ChangeRow, VersionRow } from "./novedades-client";

const TIPOS: { value: string; label: string }[] = [
  { value: "nueva", label: "Nueva funcionalidad" },
  { value: "mejora", label: "Mejora" },
  { value: "correccion", label: "Corrección" },
  { value: "seguridad", label: "Seguridad" },
];

const ESTADOS: { value: string; label: string }[] = [
  { value: "disponible", label: "Disponible" },
  { value: "en_desarrollo", label: "En desarrollo" },
  { value: "planeada", label: "Planeada" },
];

export function ChangeForm({
  versions,
  versionId,
  change,
  onClose,
}: {
  versions: VersionRow[];
  versionId: number;
  change: ChangeRow | null;
  onClose: () => void;
}) {
  const editar = change != null;
  const accion = editar ? updateChange : createChange;
  const [state, action, pending] = useActionState(accion, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: editar ? "Cambio actualizado." : "Cambio agregado.",
      error: "No se pudo guardar el cambio.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, editar]);

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={editar ? "Editar cambio" : "Agregar cambio"}
      footer={
        <button type="submit" form="change-form" disabled={pending} className={BTN_GUARDAR}>
          {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      }
    >
      <form id="change-form" action={action} className="flex flex-col gap-4">
        {editar && <input type="hidden" name="id" value={change.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Versión">
            <select name="versionId" defaultValue={String(change?.versionId ?? versionId)} className={INPUT_CLS}>
              {versions.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  v{v.number} · {v.title}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Tipo de cambio">
            <select name="type" defaultValue={change?.type ?? "nueva"} className={INPUT_CLS}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Título" full>
            <input
              name="title"
              defaultValue={change?.title ?? ""}
              required
              placeholder="Nombre de la funcionalidad o cambio"
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Descripción (qué cambió)" full>
            <textarea
              name="description"
              defaultValue={change?.description ?? ""}
              required
              rows={3}
              placeholder="Explica brevemente en qué consiste."
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Módulo (opcional)">
            <select name="moduleKey" defaultValue={change?.moduleKey ?? ""} className={INPUT_CLS}>
              <option value="">— Ninguno —</option>
              {MODULOS_PLATAFORMA.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Estado de la funcionalidad">
            <select name="featureStatus" defaultValue={change?.featureStatus ?? "disponible"} className={INPUT_CLS}>
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Ruta para probar (opcional)" hint='Ruta interna. Ej. "/balance", "/config/mapeo".' full>
            <input
              name="route"
              defaultValue={change?.route ?? ""}
              placeholder="/balance"
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Cómo se opera (opcional)" hint="Un paso por línea; se numeran automáticamente." full>
            <textarea
              name="howTo"
              defaultValue={change?.howTo ?? ""}
              rows={4}
              placeholder={"Abre el módulo desde el menú\nCarga el archivo\nConfirma el resultado"}
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Ejemplo práctico (opcional)" full>
            <textarea
              name="example"
              defaultValue={change?.example ?? ""}
              rows={3}
              placeholder="Un caso concreto de uso."
              className={INPUT_CLS}
            />
          </Campo>

          <Campo label="Orden" hint="Menor = primero dentro de la versión.">
            <input name="order" type="number" defaultValue={change?.order ?? 0} className={INPUT_CLS} />
          </Campo>
        </div>

        <ErroresInline state={state} />
      </form>
    </Modal>
  );
}

export function DeleteChangeForm({
  change,
  onClose,
}: {
  change: ChangeRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(deleteChange, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Cambio eliminado.",
      error: "No se pudo eliminar el cambio.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar cambio"
      footer={
        <button type="submit" form="delete-change-form" disabled={pending} className={BTN_ELIMINAR}>
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar"}
        </button>
      }
    >
      <form id="delete-change-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={change.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar el cambio <strong>{change.title}</strong>. Esta acción no se puede deshacer.
        </p>
        <ErroresInline state={state} />
      </form>
    </Modal>
  );
}
