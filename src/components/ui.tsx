import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-ink-150 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
      <h2 className="text-[13px] font-semibold text-ink-800">{title}</h2>
      {right}
    </div>
  );
}

export function Chip({
  label,
  tone = "ink",
}: {
  label: string;
  tone?: "ok" | "warn" | "err" | "ink" | "blue" | "ai";
}) {
  const tones: Record<string, string> = {
    ok: "bg-ok-100 text-ok-700",
    warn: "bg-warn-100 text-warn-700",
    err: "bg-err-100 text-err-700",
    ink: "bg-ink-100 text-ink-600",
    blue: "bg-blue-100 text-navy-700",
    ai: "bg-ai-100 text-ai-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "ink",
  valueClassName = "text-2xl",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "err" | "ink" | "blue";
  /** Clases del valor (p. ej. tamaño): se ajusta para montos completos largos. */
  valueClassName?: string;
}) {
  const accent: Record<string, string> = {
    ok: "text-ok-700",
    warn: "text-warn-700",
    err: "text-err-700",
    ink: "text-ink-900",
    blue: "text-blue-500",
  };
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-1.5 break-words font-mono font-semibold ${valueClassName} ${accent[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-ink-500">{hint}</div>}
    </Card>
  );
}

export function ModulePlaceholder({
  icon,
  title,
  description,
  bullets,
}: {
  icon: IconName;
  title: string;
  description: string;
  bullets?: string[];
}) {
  return (
    <Card className="p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
          <Icon name={icon} size={22} />
        </div>
        <div>
          <h2 className="font-serif text-xl text-ink-900">{title}</h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-600">
            {description}
          </p>
          {bullets && (
            <ul className="mt-4 space-y-1.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13px] text-ink-700">
                  <span className="text-ok-500"><Icon name="check" size={14} /></span>
                  {b}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 inline-flex items-center gap-2 rounded-md bg-warn-100 px-3 py-1.5 text-[12px] font-medium text-warn-700">
            <Icon name="warn" size={13} />
            Módulo enrutado — UI detallada en migración progresiva desde el prototipo
          </div>
        </div>
      </div>
    </Card>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-blue-500 hover:underline"
    >
      <Icon name="chev-l" size={13} />
      {label}
    </Link>
  );
}

export function EmptyState({
  icon = "doc",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Icon name={icon} size={20} />
      </div>
      <div className="text-[13.5px] font-semibold text-ink-800">{title}</div>
      {description && (
        <p className="max-w-sm text-[12.5px] text-ink-500">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
