import { PageHeader, ModulePlaceholder } from "@/components/ui";

export default function ConfigDianPage() {
  return (
    <div>
      <PageHeader title="Mapeos DIAN" subtitle="Configuración de renglones de formularios tributarios" />
      <ModulePlaceholder
        icon="doc"
        title="Mapeos DIAN"
        description="Define cómo se mapean las cuentas y renglones de cada formato DIAN (IVA, Retención, ICA) contra la contabilidad para la conciliación tributaria."
        bullets={[
          "Renglones del formato 300 (IVA), 350 (Retención) y otros",
          "Reglas de mapeo cuenta contable → renglón declarado",
          "Plantillas reutilizables por tipo de contribuyente",
        ]}
      />
    </div>
  );
}
