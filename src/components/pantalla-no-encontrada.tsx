import Link from "next/link";
import { Icon } from "@/components/icons";
import { FranjaMarca, LogoRussellBedford } from "@/components/marca";

/**
 * Página «no encontrada» con la marca (reemplaza la 404 por defecto de Next, que
 * usa la fuente del sistema, negro puro y el modo oscuro del equipo). Dentro de la
 * app se pinta en el cascarón; fuera de él (`conMarca`) lleva el logotipo con su
 * espacio libre y la franja institucional al pie, como el login.
 */
export function PantallaNoEncontrada({ conMarca = false }: { conMarca?: boolean }) {
  const contenido = (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-navy-700">
        <Icon name="search" size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-light text-navy-800">No encontramos esta página</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-600">
          La dirección no existe o lo que buscas ya no está disponible. Revisa el enlace o vuelve al inicio.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="mt-1 inline-flex items-center rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy-600"
      >
        Ir al inicio
      </Link>
    </div>
  );
  if (!conMarca) return contenido;
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <div className="mx-auto w-full max-w-5xl px-5">
        <LogoRussellBedford variante="azul" ancho={160} className="-ml-8" prioridad />
      </div>
      <div className="flex flex-1 items-center justify-center">{contenido}</div>
      <FranjaMarca className="h-2" />
    </div>
  );
}
