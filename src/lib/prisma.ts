import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ZONA_HORARIA_COLOMBIA } from "@/lib/fecha-hora";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    // Fuerza CURRENT_DATE, CURRENT_TIMESTAMP y cualquier SQL de negocio a la
    // zona colombiana aunque el proveedor PostgreSQL tenga otro valor global.
    options: `-c timezone=${ZONA_HORARIA_COLOMBIA}`,
    // keepAlive detecta sockets muertos (p. ej. tras un cambio de red/VPN)
    // en vez de entregarlos colgados desde el pool de conexiones.
    keepAlive: true,
    // Configuración explícita del pool de node-postgres.
    // max: número máximo de conexiones simultáneas a la BD.
    // Ajustar según el plan del servidor de BD (ej. Postgres con max_connections=100
    // y múltiples instancias Node: pool_size = floor(max_connections / instancias) - 5).
    max: parseInt(process.env.DB_POOL_MAX ?? "10"),
    // Si la BD no responde en N ms, el request falla en lugar de colgar. El
    // margen predeterminado cubre arranques fríos y reanudaciones de red sin
    // convertir una latencia transitoria en un falso fallo de conexión.
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? "15000"),
    // Libera conexiones inactivas después de N ms.
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? "30000"),
  });
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
