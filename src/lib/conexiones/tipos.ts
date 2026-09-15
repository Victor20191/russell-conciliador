import type { IconName } from "@/components/icons";

// ============================================================
// Catálogo de conexiones e integraciones (puro, apto para cliente).
//
// Define las CATEGORÍAS, los PROVEEDORES y los CAMPOS de cada conexión.
// La UI (`/config/conexiones`) genera el formulario a partir de este
// catálogo y las Server Actions validan contra él; agregar un proveedor
// nuevo es agregar una entrada aquí.
//
// Los campos de `camposConfiguracion` se guardan tal cual (no son secretos);
// los de `camposCredenciales` se cifran con AES-256-GCM antes de persistir
// (`src/lib/conexiones/credenciales.ts`). NUNCA se exponen al cliente.
// ============================================================

export type CategoriaConexion = "CORREO" | "ALMACENAMIENTO" | "API" | "WEBHOOK";
export type Entorno = "PRODUCCION" | "PRUEBAS";
export type TipoCampo = "texto" | "numero" | "booleano";

export type CampoDefinicion = {
  clave: string;
  label: string;
  tipo: TipoCampo;
  requerido?: boolean;
  placeholder?: string;
  ayuda?: string;
  porDefecto?: string | number | boolean;
};

export type EstrategiaPrueba =
  | { tipo: "s3" }
  | { tipo: "smtp" }
  | { tipo: "graph" }
  | { tipo: "oauth" }
  | { tipo: "http"; ruta?: string; encabezadoAuth: string; esquemaAuth: "bearer" | "valor" }
  | { tipo: "webhook" };

export type ProveedorDefinicion = {
  clave: string;
  label: string;
  categoria: CategoriaConexion;
  descripcion: string;
  camposConfiguracion: CampoDefinicion[];
  camposCredenciales: CampoDefinicion[];
  prueba: EstrategiaPrueba;
  /** Tiene un ejecutor automático propio (hoy solo almacenamiento). */
  ejecutable?: boolean;
};

export const CATEGORIAS: {
  clave: CategoriaConexion;
  label: string;
  icono: IconName;
  descripcion: string;
}[] = [
  {
    clave: "CORREO",
    label: "Correo",
    icono: "send",
    descripcion: "Buzones y servidores desde los que la plataforma lee o envía correo.",
  },
  {
    clave: "ALMACENAMIENTO",
    label: "Almacenamiento",
    icono: "upload",
    descripcion: "Buckets S3/R2 donde viven los soportes de los archivos.",
  },
  {
    clave: "API",
    label: "API",
    icono: "doc",
    descripcion: "Servicios REST externos (facturación electrónica, IA, mensajería…).",
  },
  {
    clave: "WEBHOOK",
    label: "Webhook",
    icono: "link",
    descripcion: "Endpoints que reciben notificaciones de la plataforma.",
  },
];

export const ENTORNOS: { clave: Entorno; label: string }[] = [
  { clave: "PRODUCCION", label: "Producción" },
  { clave: "PRUEBAS", label: "Pruebas" },
];

const CAMPOS_S3_BASE: CampoDefinicion[] = [
  {
    clave: "bucket",
    label: "Bucket",
    tipo: "texto",
    requerido: true,
    placeholder: "russell-soportes",
  },
  {
    clave: "region",
    label: "Región",
    tipo: "texto",
    porDefecto: "us-east-1",
    ayuda: "En Cloudflare R2 usa «auto».",
  },
  {
    clave: "endpoint",
    label: "Endpoint",
    tipo: "texto",
    placeholder: "https://<cuenta>.r2.cloudflarestorage.com",
    ayuda: "Déjalo vacío para Amazon S3.",
  },
  {
    clave: "force_path_style",
    label: "Forzar estilo de ruta",
    tipo: "booleano",
    porDefecto: false,
    ayuda: "Actívalo en MinIO y en servicios que no usan subdominio por bucket.",
  },
];

const CREDENCIALES_S3: CampoDefinicion[] = [
  { clave: "access_key_id", label: "Access Key ID", tipo: "texto", requerido: true },
  { clave: "secret_access_key", label: "Secret Access Key", tipo: "texto", requerido: true },
];

const CAMPOS_API_BASE = (
  urlBase: string | undefined,
  rutaPrueba: string | undefined,
  encabezado: string,
): CampoDefinicion[] => [
  {
    clave: "url_base",
    label: "URL base",
    tipo: "texto",
    requerido: true,
    porDefecto: urlBase,
    placeholder: "https://api.proveedor.com",
  },
  {
    clave: "ruta_prueba",
    label: "Ruta de prueba",
    tipo: "texto",
    porDefecto: rutaPrueba,
    placeholder: "/health",
    ayuda: "Ruta que la prueba consulta con GET. Déjala vacía para probar la URL base.",
  },
  {
    clave: "encabezado_auth",
    label: "Encabezado de autenticación",
    tipo: "texto",
    porDefecto: encabezado,
  },
];

export const PROVEEDORES: ProveedorDefinicion[] = [
  // ----- Almacenamiento (ejecutable: consumo de archivos) -----
  {
    clave: "cloudflare_r2",
    label: "Cloudflare R2",
    categoria: "ALMACENAMIENTO",
    descripcion: "Bucket de Cloudflare R2 (compatible con S3) para soportes y originales.",
    camposConfiguracion: [
      {
        clave: "endpoint",
        label: "Endpoint",
        tipo: "texto",
        requerido: true,
        placeholder: "https://<cuenta>.r2.cloudflarestorage.com",
      },
      ...CAMPOS_S3_BASE.filter((c) => c.clave !== "endpoint"),
    ],
    camposCredenciales: CREDENCIALES_S3,
    prueba: { tipo: "s3" },
    ejecutable: true,
  },
  {
    clave: "aws_s3",
    label: "Amazon S3",
    categoria: "ALMACENAMIENTO",
    descripcion: "Bucket de AWS S3 para soportes y originales.",
    camposConfiguracion: CAMPOS_S3_BASE,
    camposCredenciales: CREDENCIALES_S3,
    prueba: { tipo: "s3" },
    ejecutable: true,
  },
  {
    clave: "minio",
    label: "MinIO",
    categoria: "ALMACENAMIENTO",
    descripcion: "Almacenamiento de objetos propio (MinIO) compatible con S3.",
    camposConfiguracion: CAMPOS_S3_BASE.map((campo) =>
      campo.clave === "force_path_style" ? { ...campo, porDefecto: true } : campo,
    ),
    camposCredenciales: CREDENCIALES_S3,
    prueba: { tipo: "s3" },
    ejecutable: true,
  },
  {
    clave: "s3_compatible",
    label: "S3 compatible",
    categoria: "ALMACENAMIENTO",
    descripcion: "Cualquier servicio compatible con la API de S3 (Wasabi, Backblaze…).",
    camposConfiguracion: CAMPOS_S3_BASE,
    camposCredenciales: CREDENCIALES_S3,
    prueba: { tipo: "s3" },
    ejecutable: true,
  },

  // ----- Correo -----
  {
    clave: "microsoft365",
    label: "Microsoft 365 (buzón)",
    categoria: "CORREO",
    descripcion:
      "Buzón de Microsoft 365 leído con Microsoft Graph (facturas electrónicas, órdenes de compra).",
    camposConfiguracion: [
      { clave: "tenant_id", label: "Tenant ID", tipo: "texto", requerido: true },
      {
        clave: "buzon",
        label: "Buzón",
        tipo: "texto",
        requerido: true,
        placeholder: "facturacion@cliente.com",
      },
      { clave: "carpeta", label: "Carpeta", tipo: "texto", porDefecto: "Facturas" },
    ],
    camposCredenciales: [
      { clave: "client_id", label: "Client ID", tipo: "texto", requerido: true },
      { clave: "client_secret", label: "Client Secret", tipo: "texto", requerido: true },
    ],
    prueba: { tipo: "graph" },
  },
  {
    clave: "microsoft365_envio",
    label: "Microsoft 365 (buzón de envío)",
    categoria: "CORREO",
    descripcion:
      "Buzón de Microsoft 365 desde el que la plataforma envía notificaciones y reportes (Microsoft Graph).",
    camposConfiguracion: [
      { clave: "tenant_id", label: "Tenant ID", tipo: "texto", requerido: true },
      {
        clave: "remitente",
        label: "Remitente",
        tipo: "texto",
        requerido: true,
        placeholder: "notificaciones@russellbedford.com.co",
      },
    ],
    camposCredenciales: [
      { clave: "client_id", label: "Client ID", tipo: "texto", requerido: true },
      { clave: "client_secret", label: "Client Secret", tipo: "texto", requerido: true },
    ],
    prueba: { tipo: "graph" },
  },
  {
    clave: "smtp",
    label: "Servidor de correo (SMTP)",
    categoria: "CORREO",
    descripcion: "Servidor SMTP para envío de notificaciones y reportes.",
    camposConfiguracion: [
      { clave: "host", label: "Servidor", tipo: "texto", requerido: true, placeholder: "smtp.cliente.com" },
      { clave: "puerto", label: "Puerto", tipo: "numero", porDefecto: 587 },
      {
        clave: "remitente",
        label: "Remitente",
        tipo: "texto",
        placeholder: "notificaciones@russellbedford.com.co",
      },
    ],
    camposCredenciales: [
      { clave: "usuario", label: "Usuario", tipo: "texto" },
      { clave: "contrasena", label: "Contraseña", tipo: "texto" },
    ],
    prueba: { tipo: "smtp" },
  },
  {
    clave: "gmail",
    label: "Gmail",
    categoria: "CORREO",
    descripcion: "Cuenta de Gmail con contraseña de aplicación.",
    camposConfiguracion: [
      { clave: "host", label: "Servidor", tipo: "texto", porDefecto: "smtp.gmail.com" },
      { clave: "puerto", label: "Puerto", tipo: "numero", porDefecto: 587 },
      { clave: "remitente", label: "Remitente", tipo: "texto", placeholder: "cuenta@gmail.com" },
    ],
    camposCredenciales: [
      { clave: "usuario", label: "Usuario", tipo: "texto" },
      { clave: "contrasena", label: "Contraseña de aplicación", tipo: "texto" },
    ],
    prueba: { tipo: "smtp" },
  },

  // ----- API -----
  {
    clave: "api_rest",
    label: "API REST",
    categoria: "API",
    descripcion: "Servicio REST genérico autenticado con token.",
    camposConfiguracion: CAMPOS_API_BASE(undefined, undefined, "Authorization"),
    camposCredenciales: [{ clave: "token", label: "Token", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },
  {
    clave: "oauth2_client_credentials",
    label: "OAuth 2.0 (client credentials)",
    categoria: "API",
    descripcion: "Servicio que entrega un token OAuth 2.0 con client_id y client_secret.",
    camposConfiguracion: [
      {
        clave: "url_token",
        label: "URL del token",
        tipo: "texto",
        requerido: true,
        placeholder: "https://auth.proveedor.com/oauth/token",
      },
      {
        clave: "scope",
        label: "Scope",
        tipo: "texto",
        placeholder: "api.read",
        ayuda: "Opcional: alcance solicitado al servidor de autorización.",
      },
    ],
    camposCredenciales: [
      { clave: "client_id", label: "Client ID", tipo: "texto", requerido: true },
      { clave: "client_secret", label: "Client Secret", tipo: "texto", requerido: true },
    ],
    prueba: { tipo: "oauth" },
  },
  {
    clave: "siigo",
    label: "Siigo",
    categoria: "API",
    descripcion: "Facturación electrónica y contabilidad en la nube.",
    camposConfiguracion: CAMPOS_API_BASE("https://api.siigo.com", undefined, "Authorization"),
    camposCredenciales: [{ clave: "token", label: "Access Token", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },
  {
    clave: "numrot_radian",
    label: "NumRot (Radian DIAN)",
    categoria: "API",
    descripcion: "Eventos RADIAN de la DIAN (acuse, recibo, aceptación, reclamo).",
    camposConfiguracion: CAMPOS_API_BASE(undefined, undefined, "Authorization"),
    camposCredenciales: [{ clave: "token", label: "Token", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },
  {
    clave: "whatsapp",
    label: "WhatsApp Business",
    categoria: "API",
    descripcion: "Mensajería de WhatsApp Business (Meta Graph API).",
    camposConfiguracion: CAMPOS_API_BASE("https://graph.facebook.com", "/v21.0/me", "Authorization"),
    camposCredenciales: [{ clave: "token", label: "Token", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },
  {
    clave: "microsoft_graph",
    label: "Microsoft Graph",
    categoria: "API",
    descripcion: "API de Microsoft Graph con token de aplicación o delegado.",
    camposConfiguracion: CAMPOS_API_BASE("https://graph.microsoft.com", "/v1.0/me", "Authorization"),
    camposCredenciales: [{ clave: "token", label: "Token", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },
  {
    clave: "anthropic",
    label: "Anthropic (Claude)",
    categoria: "API",
    descripcion: "Modelos de IA de Anthropic para extracción y mapeo asistidos.",
    camposConfiguracion: CAMPOS_API_BASE("https://api.anthropic.com", "/v1/models", "x-api-key"),
    camposCredenciales: [{ clave: "api_key", label: "API Key", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "x-api-key", esquemaAuth: "valor" },
  },
  {
    clave: "gemini",
    label: "Google Gemini",
    categoria: "API",
    descripcion: "Modelos de IA de Google para extracción y mapeo asistidos.",
    camposConfiguracion: CAMPOS_API_BASE(
      "https://generativelanguage.googleapis.com",
      "/v1beta/models",
      "x-goog-api-key",
    ),
    camposCredenciales: [{ clave: "api_key", label: "API Key", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "x-goog-api-key", esquemaAuth: "valor" },
  },
  {
    clave: "openrouter",
    label: "OpenRouter",
    categoria: "API",
    descripcion: "Puerta de acceso a modelos de IA de varios proveedores.",
    camposConfiguracion: CAMPOS_API_BASE("https://openrouter.ai", "/api/v1/models", "Authorization"),
    camposCredenciales: [{ clave: "api_key", label: "API Key", tipo: "texto" }],
    prueba: { tipo: "http", encabezadoAuth: "Authorization", esquemaAuth: "bearer" },
  },

  // ----- Webhook -----
  {
    clave: "webhook_saliente",
    label: "Webhook saliente",
    categoria: "WEBHOOK",
    descripcion: "Endpoint HTTP que recibe notificaciones de la plataforma.",
    camposConfiguracion: [
      { clave: "url", label: "URL", tipo: "texto", requerido: true, placeholder: "https://hooks.cliente.com/russell" },
    ],
    camposCredenciales: [{ clave: "secreto", label: "Secreto", tipo: "texto" }],
    prueba: { tipo: "webhook" },
  },
];

const POR_CLAVE = new Map(PROVEEDORES.map((p) => [p.clave, p]));

export function proveedorPorClave(clave: string | null | undefined): ProveedorDefinicion | null {
  if (!clave) return null;
  return POR_CLAVE.get(clave) ?? null;
}

export function proveedoresDeCategoria(categoria: CategoriaConexion): ProveedorDefinicion[] {
  return PROVEEDORES.filter((p) => p.categoria === categoria);
}

export function categoriaValida(valor: string): valor is CategoriaConexion {
  return CATEGORIAS.some((c) => c.clave === valor);
}

export function entornoValido(valor: string): valor is Entorno {
  return ENTORNOS.some((e) => e.clave === valor);
}

export function categoriaDeProveedor(clave: string): CategoriaConexion | null {
  return proveedorPorClave(clave)?.categoria ?? null;
}

export function etiquetaCategoria(categoria: string): string {
  return CATEGORIAS.find((c) => c.clave === categoria)?.label ?? categoria;
}

export function etiquetaEntorno(entorno: string): string {
  return ENTORNOS.find((e) => e.clave === entorno)?.label ?? entorno;
}

export function iconoCategoria(categoria: string): IconName {
  return CATEGORIAS.find((c) => c.clave === categoria)?.icono ?? "link";
}

/** Valor por defecto de un campo (para prerrellenar el formulario). */
export function valorPorDefecto(campo: CampoDefinicion): string | boolean {
  if (campo.porDefecto === undefined) return campo.tipo === "booleano" ? false : "";
  return typeof campo.porDefecto === "number" ? String(campo.porDefecto) : campo.porDefecto;
}
