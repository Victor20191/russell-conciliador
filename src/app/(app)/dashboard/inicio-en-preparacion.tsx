import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FlashToast } from "@/components/flash-toast";
import { authorizePermiso } from "@/lib/rbac";
import { workNav, configSecciones, type NavItem } from "@/lib/nav";

/**
 * Lo que ve en `/dashboard` quien tiene «Inicio» en desarrollo (20/Oct/2026): sus indicadores
 * aún no son reales, pero `/dashboard` es la página de llegada de todos (login, raíz y cualquier
 * permiso denegado), así que no puede redirigir. Muestra una bienvenida sin cifras y accesos a las
 * áreas de Trabajo que el usuario puede abrir, más la Mesa de ayuda; cada acceso pasa por el mismo
 * permiso y la misma publicación que el menú lateral.
 */
export default async function InicioEnPreparacion({ nombre, pwd }: { nombre: string; pwd?: string }) {
  const candidatos: NavItem[] = [
    ...workNav.filter((it) => it.href !== "/dashboard"),
    ...configSecciones.flatMap((s) => s.items).filter((it) => it.href === "/reportes"),
  ];
  const visibles = await Promise.all(
    candidatos.map(async (it) => (!it.permiso || (await authorizePermiso(it.permiso)).ok ? it : null)),
  );
  const accesos = visibles.filter((it): it is NavItem => it != null);

  return (
    <div>
      {pwd === "1" && <FlashToast tone="success" title="Contraseña actualizada correctamente." clearParam="pwd" />}
      <PageHeader
        title={`Hola, ${nombre}`}
        subtitle="El resumen de inicio está en preparación. Mientras tanto, entra a tu trabajo desde aquí o desde el menú."
      />
      {accesos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accesos.map((it) => (
            <Link key={it.href} href={it.href} className="group">
              <Card className="flex items-center gap-3 p-4 transition group-hover:border-blue-200 group-hover:bg-blue-50/40">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ink-50 text-navy-700">
                  <Icon name={it.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-800">{it.label}</span>
                <Icon name="chev-r" size={14} className="text-ink-400" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
