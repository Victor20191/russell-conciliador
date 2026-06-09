import { BrandMark } from "@/components/icons";
import LoginForm from "./login-form";

export default function LoginPage() {
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

        <div className="text-xs text-[#7C8DA3]">
          © {new Date().getFullYear()} Russell Bedford Colombia · Uso interno
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
