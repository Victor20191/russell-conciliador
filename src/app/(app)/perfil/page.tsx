import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader } from "@/components/ui";
import { urlAvatar } from "@/lib/avatares";
import { almacenamientoDisponible } from "@/lib/storage/objetos";
import PerfilFotoClient from "./perfil-foto-client";

// Perfil del usuario en sesión. Hoy se centra en la foto de perfil (autoservicio):
// cualquier usuario puede subir o quitar su propia foto.
export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Mi perfil"
        subtitle="Tu información de cuenta y tu foto de perfil."
      />
      <PerfilFotoClient
        name={user.name}
        email={user.email}
        role={user.role}
        initials={user.initials}
        avatarUrl={urlAvatar(user)}
        storageReady={almacenamientoDisponible()}
      />
    </div>
  );
}
