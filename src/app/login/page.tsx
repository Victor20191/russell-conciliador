import { FranjaMarca, LogoRussellBedford, MotivoGlobo } from "@/components/marca";
import LoginForm from "./login-form";
import { anioColombia } from "@/lib/fecha-hora";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca: logotipo blanco sobre el azul institucional (§1.2). El
          globo grande y recortado es un motivo decorativo (§4.1), lejos del
          espacio libre del logo. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-800 text-white lg:flex">
        <MotivoGlobo
          variante="blanco"
          tamano={520}
          className="absolute -right-40 -bottom-44 opacity-20"
        />
        <div className="relative">
          <LogoRussellBedford variante="blanco" ancho={220} prioridad />
        </div>

        <div className="relative max-w-lg px-11">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-navy-400">
            Conciliador
          </p>
          <h1 className="mt-3 text-[32px] font-light leading-snug">
            Plataforma de conciliación y diagnóstico contable y tributario
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-navy-100">
            Balance de comprobación, conciliaciones, impuestos DIAN y auditoría
            — en un solo flujo de trabajo asistido por IA.
          </p>
        </div>

        <div className="relative px-11 pb-8 text-xs text-navy-400">
          © {anioColombia()} Russell Bedford Colombia · Uso interno
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex flex-col bg-ink-50">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <LogoRussellBedford variante="azul" ancho={170} espacioLibre={false} className="my-[34px]" prioridad />
            </div>

            <h2 className="text-2xl font-light text-navy-800">Iniciar sesión</h2>
            <p className="mt-1.5 mb-7 text-sm text-ink-500">
              Ingresa con tu cuenta corporativa para continuar.
            </p>

            <LoginForm />
          </div>
        </div>
        {/* La franja va sobre fondo claro, como en las diapositivas del manual:
            sobre el panel azul se perdería su tramo Space Blue. */}
        <FranjaMarca className="h-2" />
      </div>
    </div>
  );
}
