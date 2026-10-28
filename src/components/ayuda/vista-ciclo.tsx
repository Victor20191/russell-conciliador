import Link from "next/link";
import { Icon } from "@/components/icons";
import { enlaceDePaso, estaEnPaso, type PasoCiclo } from "@/lib/ayuda/ciclo";
import type { AyudaResuelta } from "@/lib/ayuda/resolver";
import { chipsDeRoles, rolDelUsuarioPuede, rolesDeRegla, type RolesAyuda } from "@/lib/ayuda/roles";

export type VistaCicloProps = {
  pasos: { numero: number; paso: PasoCiclo }[];
  rolesAyuda: RolesAyuda;
  rol: string;
  permisos: readonly string[];
  /** Pantalla y pestaña en las que está el usuario (marcan «estás aquí»). */
  actual: AyudaResuelta | null;
  pestanaActual: string | null;
  /** Módulo para los enlaces de los pasos de módulos. */
  modulo: string;
  puedeAbrir: (permiso: string) => boolean;
  onNavegar?: () => void;
};

/** El ciclo del cliente: los pasos del trabajo en orden, con quién hace cada uno y dónde. */
export default function VistaCiclo(p: VistaCicloProps) {
  return (
    <div>
      <p className="text-[12px] leading-snug text-ink-600">
        El trabajo de un cliente de principio a fin, en el orden en que se hace. Cada paso dice quién lo hace y dónde.
      </p>
      {p.pasos.length === 0 ? (
        <p className="mt-4 text-[12px] text-ink-500">No hay pasos que coincidan.</p>
      ) : (
        <ol className="mt-3 space-y-0">
          {p.pasos.map(({ numero, paso }) => {
            const aqui = estaEnPaso(paso, p.actual, p.pestanaActual);
            const roles = rolesDeRegla(paso.regla, p.rolesAyuda);
            const puede = rolDelUsuarioPuede(paso.regla, p.rol, p.rolesAyuda, p.permisos);
            const enlace = enlaceDePaso(paso, p.modulo);
            return (
              <li key={numero} className="relative flex gap-2.5 pb-3 last:pb-0">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    aqui ? "bg-navy-700 text-white" : "border border-ink-200 bg-white text-ink-600"
                  }`}
                >
                  {numero}
                </span>
                <div className={`min-w-0 flex-1 rounded-md px-2 py-1 ${aqui ? "bg-blue-50" : ""}`}>
                  <div className="flex items-start gap-2">
                    <b className="text-[12.5px] leading-snug text-ink-800">
                      <span className="sr-only">Paso {numero}: </span>
                      {paso.titulo}
                    </b>
                    {aqui && <span className="shrink-0 text-[11px] font-semibold text-navy-700">estás aquí</span>}
                    {puede && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ok-700">
                        <Icon name="check" size={12} />
                        Tu rol puede
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-600">{paso.descripcion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {chipsDeRoles(roles).map((c) => (
                      <span key={c.texto} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                        {c.texto}
                        {c.detalle && <span className="font-normal text-ink-500">{` · ${c.detalle}`}</span>}
                      </span>
                    ))}
                    {enlace && (!enlace.permiso || p.puedeAbrir(enlace.permiso)) && (
                      <Link href={enlace.href} onClick={p.onNavegar} className="ml-auto text-[11.5px] font-medium text-blue-600 hover:underline">
                        Ir a la pantalla
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
