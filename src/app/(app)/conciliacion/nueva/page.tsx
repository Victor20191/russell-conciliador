import { PageHeader, ModulePlaceholder } from "@/components/ui";

export default function NuevaConciliacionPage() {
  return (
    <div>
      <PageHeader title="Nueva conciliación" subtitle="Asistente de parametrización y ejecución de un nuevo cruce" />
      <ModulePlaceholder
        icon="play"
        title="Asistente de nueva conciliación"
        description="Flujo guiado para iniciar una conciliación: selección de cliente y módulo, carga del archivo del ERP, mapeo de campos y cuentas, y ejecución del cruce."
        bullets={[
          "Carga de archivo del ERP (Excel/CSV)",
          "Mapeo de campos asistido por IA con niveles de confianza",
          "Mapeo de cuentas del cliente al plan estándar",
          "Confirmación y ejecución del cruce contable vs. auxiliar",
        ]}
      />
    </div>
  );
}
