import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    // Sin `-c timezone`: la sesión HEREDA la zona por defecto de la base. El
    // adaptador escribe cada `Date` como texto sin zona (reloj UTC) y al leer un
    // TIMESTAMPTZ descarta la zona, así que solo es correcto con la sesión en UTC;
    // con America/Bogota cada instante se guardaba 5 h después del real.
    // scripts/corregir-desfase-zona-horaria.ts corrige los datos y pone la base
    // en UTC en la MISMA transacción: heredar la zona hace que este código cambie
    // de comportamiento justo en ese instante (antes, igual que siempre), sin
    // depender de desplegar a la vez. La hora de Colombia se aplica al PRESENTAR
    // (`src/lib/fecha-hora.ts`), no aquí.
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
