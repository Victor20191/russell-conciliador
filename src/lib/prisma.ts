import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    // Configuración explícita del pool de node-postgres.
    // max: número máximo de conexiones simultáneas a la BD.
    // Ajustar según el plan del servidor de BD (ej. Postgres con max_connections=100
    // y múltiples instancias Node: pool_size = floor(max_connections / instancias) - 5).
    max: parseInt(process.env.DB_POOL_MAX ?? "10"),
    // Si la BD no responde en N ms, el request falla en lugar de colgar.
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? "5000"),
    // Libera conexiones inactivas después de N ms.
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? "30000"),
  });
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
