import { Icon } from "@/components/icons";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-ok-500 text-white" : active ? "bg-navy-700 text-white" : "bg-ink-150 text-ink-500"}`}>
              {done ? <Icon name="check" size={12} /> : i + 1}
            </div>
            <span className={`text-[12.5px] ${active ? "font-semibold text-ink-900" : "text-ink-500"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-ink-200" />}
          </div>
        );
      })}
    </div>
  );
}
