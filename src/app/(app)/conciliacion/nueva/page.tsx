import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import { requirePermiso } from "@/lib/rbac";

export default async function NuevaConciliacionPage() {
  await requirePermiso("conciliaciones:crear");
  await requirePermiso("modulos_datos:ver");

  return (
    <div>
      <PageHeader
        title="Nueva conciliación"
        subtitle="Elige el módulo para cargar tus archivos y conciliar los datos del cliente."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(MODULOS_IMPORT).map((modulo) => (
          <Card key={modulo.codigo}>
            <Link
              href={`/modulos/${modulo.codigo.toLowerCase()}`}
              className="block rounded-lg p-5 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
            >
              <h2 className="text-sm font-semibold text-ink-900">{modulo.label}</h2>
              <p className="mt-2 text-[13px] text-ink-500">
                Carga, revisión y cruce contable de {modulo.label.toLowerCase()}.
              </p>
              <span className="mt-4 inline-block text-[13px] font-semibold text-navy-700">
                Abrir módulo →
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
