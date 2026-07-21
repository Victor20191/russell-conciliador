"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import { actualizarMiFoto, eliminarMiFoto } from "@/app/actions/perfil";
import { notifyActionState } from "@/lib/client-notifications";

export default function PerfilFotoClient({
  name,
  email,
  role,
  initials,
  avatarUrl,
  storageReady,
}: {
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarUrl: string | null;
  storageReady: boolean;
}) {
  const router = useRouter();
  // `version` remonta el uploader tras cada cambio (limpia input y vista previa
  // sin tener que setState dentro de un effect); `router.refresh()` actualiza la
  // foto del servidor y el avatar del sidebar.
  const [version, setVersion] = useState(0);
  const onChanged = useCallback(() => {
    setVersion((v) => v + 1);
    router.refresh();
  }, [router]);

  return (
    <Card className="max-w-2xl">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6">
        <FotoUploader
          key={version}
          name={name}
          initials={initials}
          avatarUrl={avatarUrl}
          storageReady={storageReady}
          onChanged={onChanged}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:pt-1">
          <div className="text-[15px] font-semibold text-ink-800">{name}</div>
          <div className="text-[12.5px] text-ink-500">{email}</div>
          <div className="mt-0.5 inline-flex w-fit items-center rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            {role}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FotoUploader({
  name,
  initials,
  avatarUrl,
  storageReady,
  onChanged,
}: {
  name: string;
  initials: string;
  avatarUrl: string | null;
  storageReady: boolean;
  onChanged: () => void;
}) {
  const [subir, subirAction, subiendo] = useActionState(actualizarMiFoto, {});
  const [quitar, quitarAction, quitando] = useActionState(eliminarMiFoto, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  // Libera el object URL de la vista previa al desmontar (incluido el remonte).
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    notifyActionState(subir, {
      success: "Foto de perfil actualizada.",
      error: "No se pudo actualizar la foto.",
    });
    if (subir?.ok) onChanged();
  }, [subir, onChanged]);

  useEffect(() => {
    notifyActionState(quitar, {
      success: "Foto de perfil eliminada.",
      error: "No se pudo eliminar la foto.",
    });
    if (quitar?.ok) onChanged();
  }, [quitar, onChanged]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f?.name ?? "");
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  const mostrado = preview ?? avatarUrl;

  return (
    <div className="flex w-full flex-col gap-4 sm:max-w-xs">
      <div className="flex flex-col items-center gap-2">
        <Avatar src={mostrado} initials={initials} name={name} size={112} />
        {preview && <span className="text-[11px] font-medium text-ai-700">Vista previa</span>}
      </div>

      {!storageReady && (
        <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2 text-[12px] text-warn-700">
          El almacenamiento de fotos aún no está configurado. Pídele al
          administrador que defina las variables S3 (S3/MinIO/R2).
        </div>
      )}

      <form action={subirAction} className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium text-ink-600">
            Foto de perfil (JPG, PNG o WEBP · máx. 4 MB)
          </span>
          <input
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={!storageReady}
            onChange={onPick}
            className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white disabled:opacity-60"
          />
        </label>
        {subir?.message && (
          <p className="text-[12px] font-medium text-err-700">{subir.message}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!storageReady || subiendo || !fileName}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
          >
            <Icon name="upload" size={13} />
            {subiendo ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar foto"}
          </button>
        </div>
      </form>

      {avatarUrl && (
        <form action={quitarAction}>
          <button
            type="submit"
            disabled={quitando}
            className="inline-flex items-center gap-1.5 rounded-md border border-err-100 bg-err-100/60 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 transition hover:bg-err-100 disabled:opacity-60"
          >
            <Icon name="x" size={13} />
            {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Quitar foto"}
          </button>
          {quitar?.message && (
            <p className="mt-1 text-[12px] font-medium text-err-700">{quitar.message}</p>
          )}
        </form>
      )}
    </div>
  );
}
