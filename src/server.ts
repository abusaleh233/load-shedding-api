import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { redis } from "./config/redis";
import { logger } from "./utils/logger";

async function bootstrap() {
  const app = createApp();

  
  try {
    await prisma.$connect();
    logger.info("PostgreSQL connected via Prisma");
  } catch (err) {
    logger.error(`Failed to connect to PostgreSQL: ${(err as Error).message}`);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Load Shedding & Power Management API running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`API base: http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      redis.disconnect();
      logger.info("Shutdown complete.");
      process.exit(0);
    });

    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
  });
  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}

bootstrap();
