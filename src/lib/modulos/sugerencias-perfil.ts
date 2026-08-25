// Sugerencias de parametrización (spec) reutilizables ENTRE CLIENTES del MISMO ERP, al
// cargar un módulo. Es INDICATIVO: nunca reemplaza al perfil propio del cliente (ese
// sigue resuelto por `specPerfilModulo` en la Server Action) ni obliga a nada — solo
// ahorra trabajo cuando otro cliente del mismo ERP ya parametrizó un layout igual o
// parecido. Lógica PURA (sin BD): separa, entre los perfiles de OTROS clientes con el
// mismo ERP, cuál aplica EXACTO (huella idéntica al archivo que se está analizando) de
// los que solo sirven como punto de partida para elegir a mano.
import { SpecModuloSchema, type SpecModulo } from "./extraccion/esquema";

export type PerfilCandidato = {
  clienteId: number;
  clienteNombre: string;
  huella: string;
  spec: unknown;
  archivoEjemplo: string | null;
  vecesUsado: number;
};

export type SugerenciasPerfil = {
  /** Perfil de otro cliente con huella IDÉNTICA al archivo (layout igual): el de mayor
   *  `vecesUsado` (empatado, el de `clienteId` mayor = más reciente al no tener fecha). */
  exacto: PerfilCandidato | null;
  /** El resto de perfiles del ERP (sin huella coincidente), como punto de partida a elegir
   *  a mano, ordenados por `vecesUsado` descendente. Nunca incluye al `exacto`. */
  lista: PerfilCandidato[];
};

/**
 * Separa los perfiles de otros clientes del mismo ERP en `exacto` (huella idéntica, listo
 * para prellenar) y `lista` (punto de partida a elegir). Descarta specs que ya no validan
 * contra `SpecModuloSchema` (perfiles de un descriptor viejo) y deduplica por
 * (clienteId, huella).
 */
export function seleccionarSugerenciasPerfil(
  perfiles: PerfilCandidato[],
  huellasCandidatas: string[],
): SugerenciasPerfil {
  const candidatas = new Set(huellasCandidatas);

  const vistos = new Set<string>();
  const validos: PerfilCandidato[] = [];
  for (const perfil of perfiles) {
    const clave = `${perfil.clienteId}:${perfil.huella}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const parsed = SpecModuloSchema.safeParse(perfil.spec);
    if (!parsed.success) continue;
    validos.push({ ...perfil, spec: parsed.data satisfies SpecModulo });
  }

  let exacto: PerfilCandidato | null = null;
  for (const perfil of validos) {
    if (!candidatas.has(perfil.huella)) continue;
    if (
      !exacto ||
      perfil.vecesUsado > exacto.vecesUsado ||
      (perfil.vecesUsado === exacto.vecesUsado && perfil.clienteId > exacto.clienteId)
    ) {
      exacto = perfil;
    }
  }

  const lista = validos
    .filter((perfil) => perfil !== exacto)
    .sort((a, b) => b.vecesUsado - a.vecesUsado);

  return { exacto, lista };
}
