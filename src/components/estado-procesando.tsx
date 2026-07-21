import type { ReactNode } from "react";

export function EstadoProcesando({
  children,
  etiqueta,
}: {
  children?: ReactNode;
  etiqueta?: string;
}) {
  const nombreAccesible =
    etiqueta ?? (typeof children === "string" ? children : "Procesando");

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={nombreAccesible}
      className="inline-flex items-baseline"
    >
      <span aria-hidden="true" className="inline-flex items-baseline">
        {children ? <span>{children}</span> : null}
        <span
          className={
            children
              ? "ml-0.5 inline-flex w-[1.05em] items-baseline justify-between"
              : "inline-flex w-[1.05em] items-baseline justify-between"
          }
        >
          <span className="processing-dot">.</span>
          <span className="processing-dot">.</span>
          <span className="processing-dot">.</span>
        </span>
      </span>
    </span>
  );
}
