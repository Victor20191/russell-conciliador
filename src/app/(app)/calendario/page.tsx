import { PageHeader, ModulePlaceholder } from "@/components/ui";

export default function CalendarioPage() {
  return (
    <div>
      <PageHeader title="Calendario" subtitle="Vencimientos tributarios y cierres por cliente" />
      <ModulePlaceholder
        icon="calendar"
        title="Calendario tributario y de cierres"
        description="Visualiza vencimientos DIAN, fechas de cierre contable y entregables por cliente en una vista de calendario consolidada."
        bullets={[
          "Vencimientos de formatos DIAN (IVA, Retefuente, ICA…)",
          "Fechas de cierre contable por cliente y período",
          "Recordatorios de entregables y asignaciones",
        ]}
      />
    </div>
  );
}
