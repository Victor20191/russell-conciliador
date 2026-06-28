import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Ingresa un correo válido." }).trim().toLowerCase(),
  password: z
    .string()
    .min(1, { error: "La contraseña es obligatoria." })
    .trim(),
});

export type LoginState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

export type SessionPayload = {
  userId: number;
  role: string;
  sessionVersion: number;
  expiresAt: string; // ISO
};

// Estado genérico de las Server Actions usadas con useActionState.
export type ActionState = {
  ok?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
};

export const ModuleFieldSchema = z.object({
  moduleId: z.coerce.number().int().positive(),
  key: z
    .string()
    .min(1, { error: "La clave es obligatoria." })
    .regex(/^[a-z0-9_]+$/, { error: "Solo minúsculas, números y guion bajo." }),
  label: z.string().min(1, { error: "La etiqueta es obligatoria." }),
  type: z.enum(["string", "number", "date"]),
  required: z.boolean(),
  hint: z.string().optional(),
});

export const ClientSchema = z.object({
  code: z.string().min(1, { error: "El código es obligatorio." }).trim(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  nit: z.string().min(1, { error: "El NIT es obligatorio." }).trim(),
  // Clasificación del cliente (A, B o C). Obligatoria.
  tipo: z.enum(["A", "B", "C"], { error: "Selecciona el tipo de cliente (A, B o C)." }),
  // ERP y Sector son catálogos maestros (FK por id). AMBOS son opcionales al
  // cargar: el ERP se EXIGE al iniciar una operación (conciliación/balance), no
  // aquí. La existencia/estado del catálogo se valida contra la BD en la Server
  // Action.
  erpId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  sectorId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  // Socio responsable (informativo): la consistencia (Socio activo) se valida
  // contra la BD en la Server Action. No otorga alcance de lectura: el Socio
  // sigue derivando su acceso por jerarquía (derivarAsignacionesSocio).
  socioId: z.coerce
    .number({ error: "Selecciona el socio." })
    .int()
    .positive({ error: "Selecciona el socio." }),
});

// Responsables del cliente (asignación directa al crear/editar): uno o varios
// Staff ejecutan, el Senior revisa y el Gerente valida. La consistencia (roles
// exactos, usuarios activos y jerarquía gerente→senior→staff) se contrasta
// contra la BD en la propia Server Action.
export const ClientResponsablesSchema = z.object({
  gerenteId: z.coerce.number({ error: "Selecciona el gerente." }).int().positive({ error: "Selecciona el gerente." }),
  seniorId: z.coerce.number({ error: "Selecciona el senior." }).int().positive({ error: "Selecciona el senior." }),
  // Uno o varios staff por cliente; todos ejecutan (alcance de escritura).
  staffIds: z
    .array(z.coerce.number().int().positive())
    .min(1, { error: "Selecciona al menos un staff." }),
});

// Superiores directos de un usuario en la jerarquía organizacional
// (jerarquia_usuarios). La adyacencia de roles se valida en la action.
export const SuperioresSchema = z.array(z.coerce.number().int().positive()).max(50);

// Cuentas leídas que viajan en el `payload` del paso "leer" al "confirmar". Se
// validan tipos y montos (numéricos) antes de persistir; las sumas y el cuadre
// se recalculan en el servidor. Coincide con `CuentaCruda` de calcular.ts.
export const ImportReadySchema = z
  .array(
    z.object({
      code: z.string(),
      name: z.string(),
      prevBalance: z.number(),
      balance: z.number(),
      debitos: z.number().optional(),
      creditos: z.number().optional(),
    }),
  )
  .min(1);

// Confirmación de carga (paso 2): cliente + período desde/hasta (fechas ISO). El
// tipo de balance no se recibe del cliente: la carga lo fija por regla de
// negocio. Las cuentas ya leídas viajan aparte en `payload`.
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const ConfirmarBalanceSchema = z
  .object({
    clientId: z.coerce.number({ error: "Selecciona el cliente." }).int().positive({ error: "Selecciona el cliente." }),
    periodoInicio: z.string().regex(ISO_FECHA, { error: "Indica el período desde (fecha)." }),
    periodoFin: z.string().regex(ISO_FECHA, { error: "Indica el período hasta (fecha)." }),
  })
  .refine((d) => d.periodoFin >= d.periodoInicio, { error: "El período hasta no puede ser anterior al período desde.", path: ["periodoFin"] });

// Edición de un prompt de IA (Superadministrador). `clave` identifica el prompt
// del catálogo (extraccion_balance | mapeo_balance); el contenido es libre.
export const ActualizarPromptSchema = z.object({
  clave: z.string().trim().min(1, { error: "Prompt inválido." }),
  contenido: z.string().trim().min(20, { error: "El prompt debe tener al menos 20 caracteres." }),
});

export const PasswordSchema = z
  .string()
  .min(10, { error: "La contraseña debe tener al menos 10 caracteres." })
  .regex(/[A-Za-z]/, { error: "Debe incluir al menos una letra." })
  .regex(/[0-9]/, { error: "Debe incluir al menos un número." });

export const ChangePasswordSchema = z.object({
  current: z.string().min(1, { error: "Ingresa tu contraseña actual." }),
  next: PasswordSchema,
});

// El rol se valida como texto y se contrasta contra el catálogo `roles` de la
// BD en la propia Server Action (acepta los 5 roles del PDF y los legado, y
// cualquier rol nuevo que cree el Administrador).
const RoleField = z.string().trim().min(1, { error: "El rol es obligatorio." });

export const UserCreateSchema = z.object({
  email: z.email({ error: "Correo inválido." }).trim().toLowerCase(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleField,
  initials: z.string().min(1).max(3, { error: "Máximo 3 caracteres." }).trim(),
  password: PasswordSchema,
});

export const UserUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.email({ error: "Correo inválido." }).trim().toLowerCase(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleField,
  active: z.boolean(),
  // Ausente o vacía → la contraseña no se toca; con valor → política completa.
  password: z.preprocess((v) => (v ? v : undefined), PasswordSchema.optional()),
});

export const UserUnlockSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const UserDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Matriz de permisos (/config/permisos): cada cambio fija el NIVEL de una celda
// (rol × módulo). El `nivel` se valida contra el dominio cerrado de
// src/lib/rbac/niveles.ts; el `roleId`/`module` se contrastan además contra el
// catálogo (ROLES_MATRIZ y permisos sembrados) en la propia Server Action.
export const CambioNivelSchema = z.object({
  roleId: z.number().int().positive(),
  module: z.string().trim().min(1),
  nivel: z.enum(["ninguno", "ver", "comentar", "operar", "administrar"]),
});

export const GuardarNivelesSchema = z
  .array(CambioNivelSchema)
  .min(1, { error: "No hay cambios para guardar." })
  .max(2000, { error: "Demasiados cambios en una sola operación." });

// ===== Plan de cuentas estándar Russell (/config/mapeo · pestaña estándar) =====
// CRUD del catálogo global de cuentas estándar. SOLO Administrador (gate
// `mapeo:administrar`). Cada movimiento queda en la bitácora dedicada
// `bitacora_cuentas_estandar` además del registro global de auditoría.

// Texto opcional: "" o ausente → null; en otro caso, recortado. (Igual criterio
// que los campos opcionales de cliente.)
const textoOpcionalCuenta = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}, z.string().max(4000, { error: "El texto es demasiado largo." }).nullable());

// Campos compartidos por crear/editar una cuenta estándar.
const CuentaEstandarBase = {
  code: z
    .string()
    .min(1, { error: "El código es obligatorio." })
    .trim()
    .max(60, { error: "El código es demasiado largo." }),
  name: z
    .string()
    .min(1, { error: "El nombre es obligatorio." })
    .trim()
    .max(300, { error: "El nombre es demasiado largo." }),
  level: z.coerce
    .number({ error: "El nivel es obligatorio." })
    .int({ error: "El nivel debe ser un entero." })
    .min(1, { error: "Nivel fuera de rango (1–12)." })
    .max(12, { error: "Nivel fuera de rango (1–12)." }),
  nature: z.enum(["D", "C"], { error: "Selecciona la naturaleza (Débito o Crédito)." }),
  critical: z.boolean(),
  parent: textoOpcionalCuenta,
  russellAccount: textoOpcionalCuenta,
  categoryType: textoOpcionalCuenta,
  includes: textoOpcionalCuenta,
  excludes: textoOpcionalCuenta,
  possibleAccounts: textoOpcionalCuenta,
  supportingDocuments: textoOpcionalCuenta,
  controlSupports: textoOpcionalCuenta,
  mappingNotes: textoOpcionalCuenta,
};

export const StandardAccountCreateSchema = z.object(CuentaEstandarBase);

export const StandardAccountUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  ...CuentaEstandarBase,
});

export const StandardAccountDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ===== Novedades (/novedades · changelog + control de versiones) =====
// CRUD admin-only (gate `novedades:administrar`). Una VERSIÓN (encabezado) agrupa
// varios CAMBIOS (detalle). Texto opcional: "" o ausente → null (mismo criterio
// que los campos opcionales de cuenta estándar/cliente).
const textoOpcionalNovedad = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}, z.string().max(8000, { error: "El texto es demasiado largo." }).nullable());

// Ruta interna para "probar" la funcionalidad: vacía → null; si viene, debe ser
// una ruta ABSOLUTA INTERNA (empieza con "/", sin "//" inicial ni dominio/esquema)
// para evitar enlaces externos / open-redirect desde el botón "Probar".
const rutaInternaOpcional = z.preprocess(
  (v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t;
  },
  z
    .string()
    .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, {
      error: "La ruta debe ser interna (empezar con / y sin dominio).",
    })
    .max(200, { error: "La ruta es demasiado larga." })
    .nullable(),
);

const ordenOpcional = z.coerce.number().int().min(0).max(100000).catch(0);

const VersionBase = {
  number: z
    .string()
    .min(1, { error: "El número de versión es obligatorio." })
    .trim()
    .max(40, { error: "El número es demasiado largo." }),
  title: z
    .string()
    .min(1, { error: "El título es obligatorio." })
    .trim()
    .max(200, { error: "El título es demasiado largo." }),
  summary: textoOpcionalNovedad,
  status: z.enum(["borrador", "publicada"], { error: "Selecciona el estado de la versión." }),
  order: ordenOpcional,
};

export const VersionCreateSchema = z.object(VersionBase);
export const VersionUpdateSchema = z.object({ id: z.coerce.number().int().positive(), ...VersionBase });
export const VersionDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

const ChangeBase = {
  versionId: z
    .coerce.number({ error: "Selecciona la versión." })
    .int()
    .positive({ error: "Selecciona la versión." }),
  type: z.enum(["nueva", "mejora", "correccion", "seguridad"], { error: "Selecciona el tipo de cambio." }),
  title: z
    .string()
    .min(1, { error: "El título es obligatorio." })
    .trim()
    .max(200, { error: "El título es demasiado largo." }),
  description: z
    .string()
    .min(1, { error: "La descripción es obligatoria." })
    .trim()
    .max(8000, { error: "La descripción es demasiado larga." }),
  moduleKey: textoOpcionalNovedad,
  route: rutaInternaOpcional,
  howTo: textoOpcionalNovedad,
  example: textoOpcionalNovedad,
  featureStatus: z.enum(["disponible", "en_desarrollo", "planeada"], {
    error: "Selecciona el estado de la funcionalidad.",
  }),
  order: ordenOpcional,
};

export const ChangeCreateSchema = z.object(ChangeBase);
export const ChangeUpdateSchema = z.object({ id: z.coerce.number().int().positive(), ...ChangeBase });
export const ChangeDeleteSchema = z.object({ id: z.coerce.number().int().positive() });
