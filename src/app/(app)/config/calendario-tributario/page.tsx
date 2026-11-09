import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { cargarCalendariosDian } from "@/lib/impuestos/configuracion-servidor";
import { esFormularioCalendario } from "@/lib/impuestos/calendario";
import { anioColombia } from "@/lib/fecha-hora";
import CalendarioTributarioClient from "./calendario-tributario-client";

export default async function CalendarioTributarioPage({ searchParams }: { searchParams: Promise<{ anio?: string; formulario?: string }> }) {
  // Global (sin cliente): todos consultan con `impuestos:ver`; importan y editan Gerente, Socio y
  // los administradores con `impuestos:configurar`.
  await requirePermiso("impuestos:ver");
  const { anio: anioParam, formulario: formularioParam } = await searchParams;
  const actual = anioColombia();
  const pedido = Number(anioParam);
  const anio = Number.isInteger(pedido) && pedido >= 2020 && pedido <= 2100 ? pedido : actual;
  const formulario = formularioParam && esFormularioCalendario(formularioParam) ? formularioParam : "RETEFUENTE";
  const [{ anios, calendarios }, puedeEditar] = await Promise.all([
    cargarCalendariosDian(anio),
    authorizePermiso("impuestos:configurar").then((r) => r.ok),
  ]);
  const opcionesAnio = [...new Set([...anios, actual, actual + 1, anio])].sort((a, b) => b - a);

  return (
    <div>
      <PageHeader
        title="Calendario tributario"
        subtitle="Fechas límite de la DIAN para presentar y pagar la Retención en la fuente y el IVA (bimestral, cuatrimestral y anual), por período y último dígito del NIT (sin el dígito de verificación). Con ellas se mide la oportunidad de cada declaración y de su pago. Se carga una vez por año: al importar el PDF se leen todas las secciones."
      />
      <CalendarioTributarioClient anio={anio} calendarios={calendarios} formularioInicial={formulario} opcionesAnio={opcionesAnio} puedeEditar={puedeEditar} />
    </div>
  );
}
