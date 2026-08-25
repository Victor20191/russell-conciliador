import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import { FUENTE_BALANCE } from "@/lib/perfiles-carga/filas-memoria";
import { cargarFilasMemoria } from "@/lib/perfiles-carga/cargar-filas";
import PerfilesCargaClient from "./perfiles-carga-client";

/**
 * Configuración › Perfiles de carga › **Balance** — administración CENTRAL de la
 * memoria de lectura de balances por cliente: formatos por huella, correcciones
 * por cuenta y preferencias de carga.
 *
 * La memoria de cada MÓDULO (Inventarios, Cartera, CxP, Ingresos, Activos Fijos,
 * Nómina) vive en su propia pantalla del mismo submenú lateral
 * (`/config/perfiles-carga/[fuente]`, p. ej. `/config/perfiles-carga/inv`): nunca
 * se mezcla con la del balance en una sola lista.
 *
 * Es parametrización técnica de la plataforma: sale de la ficha del cliente y de
 * las pantallas de balance/módulos y vive aquí, tras `perfiles_carga:administrar`
 * (Administrador y Superadministrador). Los administradores tienen alcance
 * global, así que se consideran todos los clientes. El orden es por actividad
 * reciente (último perfil/corrección/preferencia creado o editado primero).
 */
export default async function PerfilesCargaPage() {
  await requirePermiso("perfiles_carga:administrar");
  const { rows, totalClientes } = await cargarFilasMemoria(FUENTE_BALANCE);

  return (
    <div>
      <PageHeader
        title="Perfiles de carga · Balance"
        subtitle="Cómo lee la plataforma el balance de cada cliente: formatos memorizados, correcciones por cuenta y preferencias de carga. La memoria de cada módulo está en su propia entrada del menú."
      />
      <PerfilesCargaClient fuente={FUENTE_BALANCE} rows={rows} totalClientes={totalClientes} />
    </div>
  );
}
