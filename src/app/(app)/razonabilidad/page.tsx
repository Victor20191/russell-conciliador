import { PageHeader, ModulePlaceholder } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";

export default async function RazonabilidadPage() {
  await requirePermiso("razonabilidad:ver");
  return (
    <div>
      <PageHeader title="Razonabilidad" subtitle="Análisis de razonabilidad de cuentas con hallazgos y memorando IA" />
      <ModulePlaceholder
        icon="ai"
        title="Análisis de razonabilidad"
        description="Evalúa la razonabilidad de los saldos contables aplicando reglas y pruebas analíticas, detecta hallazgos y genera un memorando asistido por IA."
        bullets={[
          "Detección de variaciones atípicas y saldos contrarios a naturaleza",
          "Gestión de hallazgos (F-001, F-002…) con seguimiento",
          "Memorando de razonabilidad generado por IA",
        ]}
      />
    </div>
  );
}
