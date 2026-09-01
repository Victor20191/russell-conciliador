// Parametrización (spec) reutilizable ENTRE CLIENTES del MISMO ERP al cargar un módulo.
// Nunca reemplaza al perfil propio del cliente: solo elige automáticamente un perfil de
// otro cliente cuando la huella del layout es IDÉNTICA. Los layouts parecidos se ignoran
// para evitar mapeos de columnas ambiguos y no se envían al navegador.
import { SpecModuloSchema, type SpecModulo } from "./extraccion/esquema";

export type PerfilCandidato = {
  clienteId: number;
  huella: string;
  spec: unknown;
  vecesUsado: number;
};

/**
 * Elige el perfil de otro cliente cuya huella coincide exactamente con el archivo.
 * Descarta specs incompatibles con el esquema actual y duplicados por cliente/huella.
 * Entre varias coincidencias gana el más usado y, en empate, el cliente de id mayor.
 */
export function seleccionarPerfilExacto(
  perfiles: PerfilCandidato[],
  huellasCandidatas: string[],
): PerfilCandidato | null {
  const candidatas = new Set(huellasCandidatas);

  const vistos = new Set<string>();
  let exacto: PerfilCandidato | null = null;
  for (const perfil of perfiles) {
    const clave = `${perfil.clienteId}:${perfil.huella}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (!candidatas.has(perfil.huella)) continue;
    const parsed = SpecModuloSchema.safeParse(perfil.spec);
    if (!parsed.success) continue;
    const valido = { ...perfil, spec: parsed.data satisfies SpecModulo };
    if (
      !exacto ||
      valido.vecesUsado > exacto.vecesUsado ||
      (valido.vecesUsado === exacto.vecesUsado && valido.clienteId > exacto.clienteId)
    ) {
      exacto = valido;
    }
  }
  return exacto;
}
