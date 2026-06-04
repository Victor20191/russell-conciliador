import { PageHeader, ModulePlaceholder } from "@/components/ui";

export default function EstadoResultadoPage() {
  return (
    <div>
      <PageHeader title="Estado de Resultado" subtitle="Análisis del estado de resultados a partir del balance cargado" />
      <ModulePlaceholder
        icon="chart"
        title="Estado de Resultado"
        description="Genera y analiza el estado de resultados del cliente derivado del balance de comprobación oficial, con comparativos entre períodos y márgenes."
        bullets={[
          "Ingresos, costos y gastos consolidados desde el balance congelado",
          "Comparativo período actual vs. anterior con variaciones",
          "Cálculo de utilidad operacional y neta",
        ]}
      />
    </div>
  );
}
