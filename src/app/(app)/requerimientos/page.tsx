import { PageHeader, ModulePlaceholder } from "@/components/ui";

export default function RequerimientosPage() {
  return (
    <div>
      <PageHeader title="Requerimientos de información" subtitle="Plantillas, envíos, repositorios y presentaciones a cliente" />
      <ModulePlaceholder
        icon="folder"
        title="Requerimientos de información"
        description="Gestiona las solicitudes de información a clientes: desde plantillas reutilizables hasta el seguimiento de envíos y la presentación final."
        bullets={[
          "Plantillas de requerimientos parametrizables",
          "Historial de envíos y estado de respuesta",
          "Repositorios de documentos recibidos",
          "Presentaciones a cliente (asistente y vista previa)",
        ]}
      />
    </div>
  );
}
