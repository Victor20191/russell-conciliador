import Link from "next/link";
import { FranjaMarca, LogoRussellBedford } from "@/components/marca";
import SoporteForm from "./soporte-form";

export default function SoportePage() {
  return (
    <main className="flex min-h-screen flex-col bg-ink-50">
      <header className="bg-navy-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-5 sm:px-8">
          {/* El padding del logo es su espacio libre (§4.2): nada se lee junto al nombre. */}
          <LogoRussellBedford variante="blanco" ancho={140} prioridad className="-ml-7" />
          <Link
            href="/login"
            className="rounded-md border border-navy-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-600"
          >
            Acceso administrativo
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-16">
        <div className="self-start lg:sticky lg:top-10">
          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-navy-800">
            Mesa de ayuda · Acceso libre
          </span>
          <h1 className="mt-5 max-w-lg text-4xl font-light leading-tight text-navy-800 sm:text-5xl">
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
            <h2 className="text-2xl font-light text-navy-800">Reportar un ticket</h2>
            <p className="mt-1.5 text-sm text-ink-500">Los campos marcados son obligatorios.</p>
          </div>
          <SoporteForm />
        </div>
      </section>
      {/* Franja institucional al pie, sobre fondo claro (como el membrete del manual). */}
      <FranjaMarca className="mt-auto h-1.5" />
    </main>
  );
}
