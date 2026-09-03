import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env";
import { globalLimiter } from "./middlewares/rateLimiter.middleware";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware";
import { logger } from "./utils/logger";
import apiRoutes from "./routes/index";
import { stripeWebhook } from "./modules/payment/payment.controller";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // --- Security ---
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
      credentials: true,
    })
  );
  app.use(globalLimiter);

  // --- IMPORTANT: Stripe webhook must be registered BEFORE express.json() ---
  // Express applies body-parsing middleware in the order it was app.use()'d,
  // regardless of where the matching route handler lives in a sub-router.
  // If express.json() ran first, it would consume and re-serialize the
  // body, breaking Stripe's HMAC signature check (which is computed over
  // the exact raw bytes Stripe sent). So this single route gets its own
  // express.raw() parser, registered ahead of the global JSON parser below.
  app.post(
    `${env.API_PREFIX}/payments/webhook`,
    express.raw({ type: "application/json" }),
    stripeWebhook
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(compression());

  // --- Logging ---
  app.use(
    morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );

  // --- Routes ---
  app.use(env.API_PREFIX, apiRoutes);

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "Load Shedding & Power Management System API",
      data: { docs: `${env.API_PREFIX}` },
    });
  });

  // --- Error handling (must be last) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
