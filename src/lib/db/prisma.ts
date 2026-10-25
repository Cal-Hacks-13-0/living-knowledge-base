import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Standard Next.js dev-mode singleton to avoid exhausting SQLite connections
// across hot reloads.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log: ("warn" | "error")[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

// Deployed (Vercel): the serverless filesystem can't hold a SQLite file, so the
// same schema lives in a hosted Turso (libSQL) database, reached through
// Prisma's libSQL driver adapter. Local dev and tests leave these unset and use
// the DATABASE_URL SQLite file as before. Schema changes are applied to Turso
// with `npm run db:migrate:turso` (Prisma Migrate can't target Turso directly).
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
