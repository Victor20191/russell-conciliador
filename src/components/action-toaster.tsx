"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import {
  subscribeClientNotifications,
  type ClientNotification,
} from "@/lib/client-notifications";

const MAX_VISIBLE = 4;
const TTL_MS = 5200;

export function ActionToaster() {
  const [items, setItems] = useState<ClientNotification[]>([]);

  useEffect(() => {
    return subscribeClientNotifications((notification) => {
      setItems((current) => [notification, ...current].slice(0, MAX_VISIBLE));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== notification.id));
      }, TTL_MS);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((item) => {
        const isError = item.tone === "error";
        const isSuccess = item.tone === "success";
        return (
          <div
            key={item.id}
            role={isError ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2.5 shadow-lg ${
              isError
                ? "border-err-100 text-err-700"
                : isSuccess
                  ? "border-ok-100 text-ok-700"
                  : "border-blue-100 text-navy-700"
            }`}
          >
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                isError ? "bg-err-100" : isSuccess ? "bg-ok-100" : "bg-blue-100"
              }`}
            >
              <Icon name={isError ? "warn" : isSuccess ? "check" : "bell"} size={13} />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">{item.title}</span>
              {item.message && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-600">
                  {item.message}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label="Cerrar notificación"
              onClick={() => setItems((current) => current.filter((n) => n.id !== item.id))}
              className="ml-auto rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
