import Link from "next/link";

// Pestañas de un módulo: «Cargados» (`/modulos/[codigo]`, lo oficial) y
// «Borradores» (`/modulos/[codigo]/borradores`, lo pendiente de confirmar).
// Son enlaces reales —cada pestaña es su propia ruta con su `loading.tsx`— y
// la activa la decide la página, no el pathname del cliente. La pestaña de
// borradores exige `modulos_datos:crear`, igual que su pantalla: los roles de
// consulta no la ven.
export type PestanaModulo = "cargados" | "borradores";

export function PestanasModulo({
  moduloCodigo,
  activa,
  borradoresPendientes,
  puedeVerBorradores,
}: {
  moduloCodigo: string;
  activa: PestanaModulo;
  /** Lotes por confirmar dentro del alcance del usuario (contador de la pestaña). */
  borradoresPendientes: number;
  puedeVerBorradores: boolean;
}) {
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;
  const pestanas: { id: PestanaModulo; label: string; href: string; contador?: number }[] = [
    { id: "cargados", label: "Cargados", href: ruta },
    ...(puedeVerBorradores
      ? [{ id: "borradores" as const, label: "Borradores", href: `${ruta}/borradores`, contador: borradoresPendientes }]
      : []),
  ];
  if (pestanas.length < 2) return null;

  return (
    <nav aria-label="Secciones del módulo" className="mb-5 flex items-center gap-1 border-b border-ink-150">
      {pestanas.map((p) => {
        const esActiva = p.id === activa;
        return (
          <Link
            key={p.id}
            href={p.href}
            aria-current={esActiva ? "page" : undefined}
            className={`-mb-px inline-flex items-center border-b-2 px-3 py-2 text-[12.5px] font-semibold ${
              esActiva ? "border-navy-700 text-navy-700" : "border-transparent text-ink-500 hover:text-ink-700"
            }`}
          >
            {p.label}
            {p.contador != null && p.contador > 0 && (
              <span className="ml-1.5 rounded-full bg-warn-100 px-1.5 text-[10px] font-bold text-warn-700">{p.contador}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
