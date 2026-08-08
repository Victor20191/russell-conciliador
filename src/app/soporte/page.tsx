import Link from "next/link";
import { BrandMark } from "@/components/icons";
import SoporteForm from "./soporte-form";

export default function SoportePage() {
  return (
    <main className="min-h-screen bg-ink-50">
      <header className="border-b border-white/10 bg-navy-800 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandMark size={32} />
            <div className="font-serif text-base leading-tight">
              Russell Bedford
              <small className="block font-sans text-[9.5px] font-medium uppercase tracking-[0.18em] text-[#8FA0B5]">
                Mesa de ayuda
              </small>
            </div>
          </div>
          <Link
            href="/login"
            className="rounded-md border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Acceso administrativo
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-16">
        <div className="self-start lg:sticky lg:top-10">
          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
            Acceso libre
          </span>
          <h1 className="mt-5 max-w-lg font-serif text-4xl leading-tight text-ink-900 sm:text-5xl">
            Cuéntanos cómo podemos ayudarte
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-ink-600">
            No necesitas una cuenta. Registra tu nombre y apellido, describe la solicitud y conserva el enlace privado que recibirás para consultar la respuesta del técnico.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-ink-700">
            {[
              "Completa tus datos y el detalle del caso.",
              "Recibe un código y un enlace privado de seguimiento.",
              "Consulta allí cómo fue solucionada tu solicitud.",
            ].map((texto, index) => (
              <div key={texto} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="pt-0.5">{texto}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-ink-150 bg-paper p-5 shadow-lg sm:p-8">
          <div className="mb-6">
            <h2 className="font-serif text-2xl text-ink-900">Reportar un ticket</h2>
            <p className="mt-1.5 text-sm text-ink-500">Los campos marcados son obligatorios.</p>
          </div>
          <SoporteForm />
        </div>
      </section>
    </main>
  );
}
