"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { sendToReviewer } from "@/app/actions/reconciliation";

export function SendToReviewerButton({ id }: { id: number }) {
  const router = useRouter();

  return (
    <ActionForm
      action={sendToReviewer}
      successMessage="Conciliación enviada a revisor."
      errorMessage="No se pudo enviar a revisor."
      showInlineError={false}
      onSuccess={() => router.refresh()}
    >
      {(pending) => (
        <>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            <Icon name="send" size={14} /> {pending ? <EstadoProcesando>Enviando</EstadoProcesando> : "Enviar a revisor"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
