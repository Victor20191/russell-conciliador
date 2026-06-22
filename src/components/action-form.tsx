"use client";

import { useRef, useState, useTransition } from "react";
import {
  notifyError,
  notifySuccess,
} from "@/lib/client-notifications";

type ActionResult = void | { ok?: boolean; message?: string };

export function ActionForm({
  action,
  successMessage,
  errorMessage,
  className,
  resetOnSuccess = false,
  showInlineError = true,
  onSuccess,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage: string;
  errorMessage: string;
  className?: string;
  resetOnSuccess?: boolean;
  showInlineError?: boolean;
  onSuccess?: () => void;
  children: (pending: boolean) => React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        ref={formRef}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          setError(null);
          startTransition(async () => {
            try {
              const result = await action(formData);
              if (result && result.ok === false) {
                const message = result.message ?? errorMessage;
                setError(message);
                notifyError(message);
                return;
              }
              notifySuccess(result?.message ?? successMessage);
              if (resetOnSuccess) form.reset();
              onSuccess?.();
            } catch (e) {
              const message = e instanceof Error && e.message ? e.message : errorMessage;
              setError(message);
              notifyError(message);
            }
          });
        }}
      >
        {children(pending)}
      </form>
      {showInlineError && error && (
        <p role="alert" className="mt-1 text-[11.5px] font-medium text-err-700">
          {error}
        </p>
      )}
    </>
  );
}
