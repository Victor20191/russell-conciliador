"use client";

export type ClientNotificationTone = "success" | "error" | "info";

export type ClientNotification = {
  id: string;
  tone: ClientNotificationTone;
  title: string;
  message?: string;
};

type NotificationInput = Omit<ClientNotification, "id">;

const EVENT_NAME = "russell:client-notification";

function emit(input: NotificationInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ClientNotification>(EVENT_NAME, {
      detail: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...input,
      },
    }),
  );
}

export function notifySuccess(title: string, message?: string): void {
  emit({ tone: "success", title, message });
}

export function notifyError(title: string, message?: string): void {
  emit({ tone: "error", title, message });
}

export function notifyInfo(title: string, message?: string): void {
  emit({ tone: "info", title, message });
}

export function subscribeClientNotifications(
  handler: (notification: ClientNotification) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    handler((event as CustomEvent<ClientNotification>).detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function notifyActionState(
  state: { ok?: boolean; message?: string; errors?: Record<string, string[] | undefined> } | null | undefined,
  messages: { success: string; error: string },
): void {
  if (state?.ok === true) {
    notifySuccess(messages.success);
    return;
  }
  if (state?.ok === false) {
    const fieldError = state.errors
      ? Object.values(state.errors).flat().filter(Boolean)[0]
      : undefined;
    notifyError(state.message ?? fieldError ?? messages.error);
  }
}
