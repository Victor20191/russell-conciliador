"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { freezeBalance } from "@/app/actions/balance";

export function FreezeBalanceButton({ id }: { id: number }) {
  const router = useRouter();

  return (
    <ActionForm
      action={freezeBalance}
      successMessage="Balance congelado como oficial."
      errorMessage="No se pudo congelar el balance."
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
            <Icon name="check" size={14} /> {pending ? "Congelando…" : "Congelar como oficial"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
