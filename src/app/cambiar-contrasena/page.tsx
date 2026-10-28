import { verifySession } from "@/lib/dal";
import { FranjaMarca, LogoRussellBedford } from "@/components/marca";
import CambiarContrasenaForm from "./cambiar-contrasena-form";

export default async function CambiarContrasenaPage() {
  await verifySession(); // exige sesión válida; no está bajo (app), así que no hay loop de redirección
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Fuera del menú lateral, la página lleva el logotipo con su espacio libre (§4.2). */}
          <LogoRussellBedford variante="azul" ancho={170} espacioLibre={false} className="mb-[34px]" prioridad />
          <h1 className="text-2xl font-light text-navy-800">Cambia tu contraseña</h1>
          <p className="mt-1.5 mb-7 text-sm text-ink-500">
            Por seguridad, debes establecer una nueva contraseña antes de continuar.
          </p>
          <CambiarContrasenaForm />
        </div>
      </div>
      <FranjaMarca className="h-2" />
    </div>
  );
}
