import { BrandMark } from "@/components/icons";
import LoginForm from "./login-form";
import { anioColombia } from "@/lib/fecha-hora";
import { etiquetaVersion } from "@/lib/version-app";
import { getVersionApp } from "@/lib/version-app-servidor";

export default async function LoginPage() {
  const versionApp = await getVersionApp();
  const versionLabel = etiquetaVersion(versionApp.number);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between bg-navy-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={34} />
          <div className="font-serif text-lg leading-tight">
            Russell Bedford
            <small className="block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-[#7C8DA3]">
              Conciliador
            </small>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="font-serif text-3xl leading-snug">
            Plataforma de conciliación y diagnóstico contable y tributario
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#A9B6C8]">
            Balance de comprobación, conciliaciones, impuestos DIAN y auditoría
            — en un solo flujo de trabajo asistido por IA.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 text-xs text-[#7C8DA3]">
          <span>© {anioColombia()} Russell Bedford Colombia · Uso interno</span>
          {versionLabel ? (
            <span
              title={versionApp.title ?? undefined}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium tracking-wide text-[#A9B6C8]"
            >
              {versionLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex items-center justify-center bg-ink-50 p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={30} />
            <div className="font-serif text-base">Russell Bedford</div>
          </div>

          <h2 className="font-serif text-2xl text-ink-900">Iniciar sesión</h2>
          <p className="mt-1.5 mb-7 text-sm text-ink-500">
            Ingresa con tu cuenta corporativa para continuar.
          </p>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
