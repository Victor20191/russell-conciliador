"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";

export type Observed = { title: string; shortTitle: string; summary: string; riesgos: string[]; oportunidades: string[] };
export type Evaluated = { mercantil: string[]; tributario: string[]; otros: string[] };
export type PresData = { id: number; clientName: string; nit: string; title: string; year: string; presented: string; preparedBy: string; positives: string[]; observed: Observed[]; evaluated: Evaluated };

type Slide =
  | { type: "cover" }
  | { type: "index" }
  | { type: "positives"; items: string[]; page: number; total: number }
  | { type: "observed-list"; items: Observed[] }
  | { type: "observed-detail"; obs: Observed; num: number }
  | { type: "closing" };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildSlides(d: PresData): Slide[] {
  const slides: Slide[] = [{ type: "cover" }, { type: "index" }];
  const pos = chunk(d.positives, 10);
  pos.forEach((items, i) => slides.push({ type: "positives", items, page: i + 1, total: pos.length }));
  slides.push({ type: "observed-list", items: d.observed });
  d.observed.forEach((obs, i) => slides.push({ type: "observed-detail", obs, num: i + 1 }));
  slides.push({ type: "closing" });
  return slides;
}

export default function VisorClient({ data }: { data: PresData }) {
  const router = useRouter();
  const slides = useMemo(() => buildSlides(data), [data]);
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") setI((x) => Math.min(slides.length - 1, x + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setI((x) => Math.max(0, x - 1));
      else if (e.key === "Escape") router.push("/requerimientos/presentaciones");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, router]);

  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const s = Math.min((el.clientWidth - 32) / 1280, (el.clientHeight - 32) / 720, 1);
      setScale(s > 0 ? s : 0.1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="-m-6 flex h-[calc(100vh-49px)] flex-col bg-navy-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2 text-[#C9D4E2]">
        <button onClick={() => router.push("/requerimientos/presentaciones")} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] hover:bg-white/10"><Icon name="chev-l" size={14} /> Salir</button>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{data.title} · {data.year}</div>
          <div className="truncate text-[11px] text-[#7C8DA3]">{data.clientName} · NIT {data.nit} · {slides.length} slides</div>
        </div>
        <button disabled title="Exportación — fase posterior" className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1.5 text-[12px] font-semibold text-[#5E7290]"><Icon name="download" size={13} /> Descargar PDF</button>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div className="origin-center shadow-lg" style={{ width: 1280, height: 720, transform: `scale(${scale})` }}>
          <SlideView slide={slides[i]} data={data} idx={i + 1} total={slides.length} />
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-2.5">
        <button onClick={() => go(0)} disabled={i === 0} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-l" size={15} className="-mr-2" /><Icon name="chev-l" size={15} /></button>
        <button onClick={() => go(i - 1)} disabled={i === 0} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-l" size={16} /></button>
        <span className="font-mono text-[12px] text-[#C9D4E2]">{pad(i + 1)} / {pad(slides.length)}</span>
        <div className="flex items-center gap-1.5">
          {slides.map((_, n) => <button key={n} onClick={() => go(n)} className={`h-2 w-2 rounded-full ${n === i ? "bg-blue-400" : "bg-white/25 hover:bg-white/50"}`} />)}
        </div>
        <button onClick={() => go(i + 1)} disabled={i === slides.length - 1} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-r" size={16} /></button>
        <button onClick={() => go(slides.length - 1)} disabled={i === slides.length - 1} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-r" size={15} className="-mr-2" /><Icon name="chev-r" size={15} /></button>
      </div>
    </div>
  );
}

function SlideView({ slide, data, idx, total }: { slide: Slide; data: PresData; idx: number; total: number }) {
  const pageno = `${String(idx).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const base = "relative flex h-full w-full flex-col bg-white";
  const tag = (t: string) => <div className="text-[15px] font-semibold uppercase tracking-[0.15em] text-blue-500">{t}</div>;
  const footer = <div className="absolute bottom-7 right-12 font-mono text-[13px] text-ink-300">{pageno}</div>;

  if (slide.type === "cover") {
    return (
      <div className="relative flex h-full w-full flex-col justify-center bg-navy-900 px-20 text-white">
        <div className="absolute right-12 top-10 font-serif text-[80px] font-light text-white/10">{data.year}</div>
        <div className="mb-6"><BrandMark size={48} /></div>
        <div className="text-[16px] uppercase tracking-[0.2em] text-blue-400">Informe ejecutivo · Auditoría {data.year}</div>
        <h1 className="mt-4 max-w-3xl font-serif text-[52px] leading-tight">{data.title}</h1>
        <div className="mt-8 text-[20px] font-semibold">{data.clientName}</div>
        <div className="text-[15px] text-[#9099a7]">NIT {data.nit}</div>
        <div className="mt-2 text-[14px] text-[#7C8DA3]">{data.presented} · {data.preparedBy}</div>
      </div>
    );
  }
  if (slide.type === "index") {
    const col = (title: string, items: string[]) => (
      <div className="flex-1"><div className="mb-2 text-[15px] font-semibold text-navy-700">{title}</div><ul className="space-y-1 text-[13px] text-ink-600">{items.map((x, k) => <li key={k} className="flex gap-1.5"><span className="text-blue-400">·</span>{x}</li>)}</ul></div>
    );
    return (
      <div className={`${base} px-16 py-12`}>
        <div className="mb-1 flex items-center gap-2"><BrandMark size={22} /><span className="text-[13px] text-ink-500">{data.clientName}</span></div>
        {tag("01 · Aspectos evaluados")}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Alcance de la revisión {data.year}</h2>
        <div className="mt-6 flex gap-10">{col("Mercantil", data.evaluated.mercantil)}{col("Tributario", data.evaluated.tributario)}{col("Otros aspectos", data.evaluated.otros)}</div>
        {footer}
      </div>
    );
  }
  if (slide.type === "positives") {
    return (
      <div className={`${base} px-16 py-12`}>
        {tag(`02 · Aspectos positivos · ${slide.page}/${slide.total}`)}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Aspectos positivos</h2>
        <div className="mt-6 grid flex-1 grid-cols-2 gap-x-10 gap-y-3 text-[14px] text-ink-700">
          {slide.items.map((x, k) => <div key={k} className="flex gap-2.5"><span className="mt-0.5 text-ok-500"><Icon name="check" size={16} /></span><span>{x}</span></div>)}
        </div>
        {footer}
      </div>
    );
  }
  if (slide.type === "observed-list") {
    return (
      <div className={`${base} px-16 py-12`}>
        {tag("03 · Aspectos observados")}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Aspectos observados</h2>
        <div className="mt-6 flex flex-1 flex-col gap-3 text-ink-700">
          {slide.items.map((o, k) => (
            <div key={k} className="flex gap-3 border-b border-ink-100 pb-2.5"><span className="font-mono text-[20px] font-semibold text-warn-500">{String(k + 1).padStart(2, "0")}</span><div><div className="text-[15px] font-semibold text-ink-800">{o.title}</div><div className="text-[12.5px] text-ink-500">{o.summary.length > 180 ? o.summary.slice(0, 180) + "…" : o.summary}</div></div></div>
          ))}
        </div>
        {footer}
      </div>
    );
  }
  if (slide.type === "observed-detail") {
    const o = slide.obs;
    return (
      <div className={`${base} px-16 py-12`}>
        <div className="absolute right-12 top-10 font-serif text-[72px] font-light text-ink-100">{String(slide.num).padStart(2, "0")}</div>
        {tag(`Aspecto observado · ${String(slide.num).padStart(2, "0")}`)}
        <h2 className="mt-1 max-w-2xl font-serif text-[30px] text-ink-900">{o.shortTitle || o.title.toUpperCase()}</h2>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-700">{o.summary}</p>
        <div className="mt-5 grid flex-1 grid-cols-2 gap-6">
          <div className="rounded-lg border border-warn-100 bg-warn-100/40 p-4"><div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-warn-700"><Icon name="warn" size={14} /> Riesgos asociados</div><ul className="space-y-1.5 text-[12.5px] text-ink-700">{o.riesgos.filter(Boolean).map((r, k) => <li key={k} className="flex gap-1.5"><span className="text-warn-500">·</span>{r}</li>)}</ul></div>
          <div className="rounded-lg border border-ok-100 bg-ok-100/40 p-4"><div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ok-700"><Icon name="check" size={14} /> Oportunidades de mejora</div><ul className="space-y-1.5 text-[12.5px] text-ink-700">{o.oportunidades.filter(Boolean).map((r, k) => <li key={k} className="flex gap-1.5"><span className="text-ok-500">·</span>{r}</li>)}</ul></div>
        </div>
        {footer}
      </div>
    );
  }
  // closing
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-navy-900 text-center text-white">
      <BrandMark size={48} />
      <div className="mt-4 text-[14px] uppercase tracking-[0.2em] text-[#7C8DA3]">{data.preparedBy}</div>
      <h1 className="mt-4 font-serif text-[64px]">Gracias.</h1>
      <div className="mt-4 text-[13px] text-[#9099a7]">contacto@russellbedford.co · Calle 100 · Bogotá D.C. · Colombia</div>
    </div>
  );
}
