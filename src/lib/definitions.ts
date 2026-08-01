import * as z from "zod";
import { tieneDigitosNit } from "@/lib/nit";
import { SpecCargaSchema } from "@/lib/balance/extraccion/esquema";

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
  nit: z
    .string()
    .min(1, { error: "El NIT es obligatorio." })
    .trim()
    .refine(tieneDigitosNit, { error: "El NIT debe incluir al menos un numero." }),
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

// Payload COMPACTO firmado (HMAC) que vuelve del cliente al confirmar la carga
// de balance (paso 2). Solo loteId + metadatos: las cuentas viven en el staging
// del lote (fuente de verdad) y NO viajan de regreso. `cuadreArchivo` sí viaja
// porque los totales de la fila TOTALES no son reconstruibles sin reabrir el
// archivo. La firma se valida con el contexto `balance:sugerencia:v2`.
export const PayloadCargaBalanceSchema = z.object({
  v: z.literal(2),
  loteId: z.uuid(),
  archivoNombre: z.string(),
  archivoTam: z.string(),
  nitDetectado: z.string().nullable(),
  nitFuente: z.enum(["PARAMETRO", "FUENTE", "INFERIDO", "NINGUNO"]),
  periodoInicial: z.string().nullable(),
  periodoFinal: z.string().nullable(),
  estandar: z.string(),
  convencionCredito: z.string(),
  filasLeidas: z.number().int(),
  filasExcluidas: z.number().int(),
  filasDescuadre: z.number().int(),
  cuentasMovimiento: z.number().int(),
  cuentasAgrupadoras: z.number().int(),
  cuentas: z.number().int(),
  cuadreArchivo: z.object({ totalDebitos: z.number(), totalCreditos: z.number() }).nullable(),
  origenExtraccion: z.enum(["perfil", "ia", "plantilla", "manual"]),
  // Proveedor elegido para esta carga. Opcional para aceptar sugerencias v2 que
  // ya estuvieran abiertas antes de incorporar el selector de desarrollo.
  proveedorIA: z.enum(["anthropic", "gemini"]).optional(),
  huella: z.string().nullable(),
});
export type PayloadCargaBalance = z.infer<typeof PayloadCargaBalanceSchema>;

// Spec de estructura EDITABLE del asistente de carga (editor de estructura) y del
// perfil guardado por cliente. El shape viene del pipeline (`SpecCargaSchema`);
// aquí se agregan las validaciones de sanidad del formulario.
export const SpecCargaBalanceSchema = SpecCargaSchema.refine((s) => s.hoja.trim().length > 0, { error: "Indica la hoja del balance.", path: ["hoja"] })
  .refine((s) => s.primeraFilaDatos > s.filaEncabezado, { error: "La primera fila de datos debe ir después de la fila de encabezado.", path: ["primeraFilaDatos"] })
  .refine((s) => s.columnas.codigo >= 1 || s.columnas.codigoFragmentos.length > 0, {
    error: "Indica la columna del código de cuenta o sus columnas fragmentadas.",
    path: ["columnas"],
  });

// Edición DIRECTA de un perfil ya guardado. Es deliberadamente más estricta
// que el contrato que recibe la IA: en la UI no aceptamos índices negativos,
// dos fuentes simultáneas para el código ni una regla marcadora incompleta.
// Así el perfil persistido siempre queda aplicable de forma determinista.
export const SpecPerfilCargaEditableSchema = SpecCargaBalanceSchema
  .refine((s) => s.hoja.trim().length <= 120, {
    error: "El nombre de la hoja es demasiado largo (máx. 120 caracteres).",
    path: ["hoja"],
  })
  .refine((s) => s.filaEncabezado >= 1 && s.primeraFilaDatos >= 2, {
    error: "Las filas del encabezado y de los datos deben ser números positivos.",
    path: ["filaEncabezado"],
  })
  .refine((s) => {
    const escalares = Object.entries(s.columnas)
      .filter(([campo]) => campo !== "codigoFragmentos")
      .map(([, valor]) => valor);
    return escalares.every((valor) => typeof valor === "number" && valor >= 0)
      && s.columnas.codigoFragmentos.every((valor) => valor >= 1);
  }, {
    error: "Las columnas deben usar índices positivos; usa 0 únicamente para indicar que una columna no existe.",
    path: ["columnas"],
  })
  .refine((s) => new Set(s.columnas.codigoFragmentos).size === s.columnas.codigoFragmentos.length, {
    error: "Las columnas fragmentadas del código no pueden repetirse.",
    path: ["columnas", "codigoFragmentos"],
  })
  .refine((s) => !(s.columnas.codigo >= 1 && s.columnas.codigoFragmentos.length > 0), {
    error: "Elige una sola fuente para el código: una columna completa o varias columnas fragmentadas.",
    path: ["columnas"],
  })
  .refine((s) => {
    if (s.reglaDetalle.tipo !== "columna") return true;
    return (s.reglaDetalle.columna ?? 0) >= 1 && (s.reglaDetalle.valor ?? "").trim().length > 0;
  }, {
    error: "Para detectar el detalle por una columna, indica la columna y el valor que identifica una cuenta de movimiento.",
    path: ["reglaDetalle"],
  });

export const EditarPerfilCargaSchema = z.object({
  id: z.coerce.number({ error: "Perfil inválido." }).int().positive({ error: "Perfil inválido." }),
  actualizadoEn: z.string().datetime({ offset: true, error: "La versión del perfil no es válida." }),
  estructura: SpecPerfilCargaEditableSchema,
});

// Preferencias por defecto de carga de balance POR CLIENTE (todas opcionales:
// "" / «auto» → null = no fuerza nada).
export const AjustesCargaSchema = z.object({
  clienteId: z.coerce.number({ error: "Cliente inválido." }).int().positive({ error: "Cliente inválido." }),
  hojaPreferida: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(120, { error: "El nombre de la hoja es demasiado largo." }).nullable()),
  convencionCredito: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["firmado", "magnitud"], { error: "Convención de crédito inválida." }).nullable()),
  agregarPorTercero: z.preprocess((v) => (v === "si" ? true : v === "no" ? false : null), z.boolean().nullable()),
  imputarSoloHojas: z.preprocess((v) => (v === "si" ? true : v === "no" ? false : null), z.boolean().nullable()),
  observaciones: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(2000, { error: "Las notas son demasiado largas (máx. 2000 caracteres)." }).nullable()),
});

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

// Edición de un umbral de alertas del balance (Administrador/Superadministrador).
// `clave` identifica el umbral del catálogo (descuadre | naturaleza); el valor es
// un monto en pesos. Se acepta lo que el usuario escribe con separadores de miles
// («50.000», «50 000») y se normaliza a número entero: la BD guarda Decimal(18,2)
// pero los umbrales son montos redondos, no fracciones de peso.
export const ActualizarUmbralSchema = z.object({
  clave: z.string().trim().min(1, { error: "Umbral inválido." }),
  valor: z
    .string()
    .trim()
    .min(1, { error: "Escribe un monto." })
    .transform((s) => s.replace(/[^\d]/g, ""))
    .refine((s) => s.length > 0, { error: "El monto solo puede tener dígitos." })
    .transform((s) => Number(s))
    .refine((n) => Number.isSafeInteger(n), { error: "El monto es demasiado grande." })
    .refine((n) => n <= 1_000_000_000, { error: "El monto no puede superar $1.000.000.000." }),
});

// ---- Prevalidador de homologación ----
// Prefijo de cuenta (del plan Russell o del PUC del cliente). Se acepta lo que el
// usuario escribe con puntos o espacios («13.30», « 41 ») y se normaliza a dígitos.
// El PUC más largo que maneja la plataforma es de 8; se deja holgura hasta 10.
const PrefijoCuentaSchema = z
  .string()
  .trim()
  .min(1, { error: "Escribe una cuenta." })
  .transform((s) => s.replace(/[\s.]/g, ""))
  .refine((s) => /^\d{1,10}$/.test(s), { error: "La cuenta debe tener solo dígitos (máximo 10)." });

// Cuenta del CLIENTE contra la que se compara una fila del prevalidador. Se guarda
// por cliente, pero se edita desde un balance concreto (de ahí el `balanceId`, que
// resuelve el cliente y el alcance de escritura).
export const CuentaClientePrevalidadorSchema = z.object({
  balanceId: z.coerce.number({ error: "Balance inválido." }).int().positive({ error: "Balance inválido." }),
  catalogoId: z.coerce.number({ error: "Fila inválida." }).int().positive({ error: "Fila inválida." }),
  cuentaCliente: PrefijoCuentaSchema,
});

// Alta/edición de una fila del catálogo del prevalidador (Administrador/Superadmin).
export const FilaPrevalidadorSchema = z.object({
  // null = alta.
  id: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().positive().nullable()),
  moduloId: z.coerce.number({ error: "Selecciona el módulo." }).int().positive({ error: "Selecciona el módulo." }),
  cuentaRussell: PrefijoCuentaSchema,
  etiqueta: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().max(120, { error: "La etiqueta no puede superar 120 caracteres." }).nullable(),
  ),
  baseCalculo: z.enum(["saldo", "movimiento"], { error: "Base de cálculo inválida." }),
  orden: z.coerce.number().int().min(0).max(9999).default(0),
  activa: z.preprocess((v) => v === "si" || v === "true" || v === true, z.boolean()),
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

// Alcance del reporte funcional generado con IA. `versionIds` vacío o ausente →
// TODO el changelog (comportamiento por defecto). Si trae IDs, el reporte se
// limita a esas versiones. Esto acota el reporte y ayuda a no topar el límite de
// cambios enviados al modelo. NO se filtra por fecha calendario porque la unidad
// de agrupación del módulo es la versión (releasedAt es null en borradores).
export const ReporteNovedadesScopeSchema = z.object({
  versionIds: z.array(z.coerce.number().int().positive()).max(1000).optional(),
});
export type ReporteNovedadesScope = z.infer<typeof ReporteNovedadesScopeSchema>;

// Alcance del reporte ejecutivo de uso y adopción (Auditoría).
// `desde`/`hasta` en ISO (fecha o datetime); se normalizan en la Server Action.
// `versionIds` vacío o ausente → todas las versiones publicadas de Novedades.
export const ReporteEjecutivoUsoScopeSchema = z
  .object({
    desde: z.string().trim().min(1, { error: "Indica la fecha de inicio." }).max(40),
    hasta: z.string().trim().min(1, { error: "Indica la fecha de fin." }).max(40),
    versionIds: z.array(z.coerce.number().int().positive()).max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    const d = Date.parse(val.desde);
    const h = Date.parse(val.hasta);
    if (!Number.isFinite(d)) {
      ctx.addIssue({ code: "custom", message: "La fecha de inicio no es válida.", path: ["desde"] });
    }
    if (!Number.isFinite(h)) {
      ctx.addIssue({ code: "custom", message: "La fecha de fin no es válida.", path: ["hasta"] });
    }
    if (Number.isFinite(d) && Number.isFinite(h) && d > h) {
      ctx.addIssue({
        code: "custom",
        message: "La fecha de inicio no puede ser posterior a la de fin.",
        path: ["desde"],
      });
    }
  });
export type ReporteEjecutivoUsoScope = z.infer<typeof ReporteEjecutivoUsoScopeSchema>;
