// Tipos de vista compartidos por las dos pantallas de mapeo: el plan estándar
// Russell (`/config/mapeo`) y la homologación por cliente
// (`/config/mapeo-cliente`). Viven aquí —y no en un componente— porque ambas
// rutas los necesitan y ninguna debe importar el módulo cliente de la otra.

/** Cuenta del plan estándar Russell tal como la consume la UI. */
export type StdAccount = {
  id: number;
  code: string;
  name: string;
  level: number;
  nature: string;
  parent: string | null;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  excludes: string | null;
  possibleAccounts: string | null;
  supportingDocuments: string | null;
  controlSupports: string | null;
  mappingNotes: string | null;
};

/** Fila de la bitácora dedicada del plan estándar (movimientos). */
export type StdLogRow = {
  id: number;
  code: string;
  action: string;
  user: string;
  detail: string;
  createdAt: string; // ISO
};

export type Subgrupo = { id: number; codigo: string; nombre: string; grupo: string; nombreGrupo: string; naturaleza: string };
