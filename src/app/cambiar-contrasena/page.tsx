import { verifySession } from "@/lib/dal";
import CambiarContrasenaForm from "./cambiar-contrasena-form";

export default async function CambiarContrasenaPage() {
  await verifySession(); // exige sesión válida; no está bajo (app), así que no hay loop de redirección
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-2xl text-ink-900">Cambia tu contraseña</h1>
        <p className="mt-1.5 mb-7 text-sm text-ink-500">
          Por seguridad, debes establecer una nueva contraseña antes de continuar.
        </p>
        <CambiarContrasenaForm />
      </div>
    </div>
  );
}
