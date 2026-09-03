import { createApp } from "../src/app";

/**
 * Vercel serverless entry point.
 *
 * Vercel's Node.js runtime (@vercel/node) can host a full Express app
 * directly: exporting the Express app instance as the default export from
 * a file under /api is enough — Vercel forwards every incoming request to
 * it as (req, res), which is exactly Express's own handler signature.
 * There is no app.listen() here (and there must not be one) — that's only
 * for local development, in src/server.ts. A serverless function is
 * invoked per-request; it doesn't keep a socket open and listening.
 *
 * IMPORTANT: this file intentionally does NOT call prisma.$connect() or
 * any other one-time bootstrap logic the way server.ts does. The Prisma
 * client singleton in src/lib/prisma.ts lazily connects on its first
 * query, which is exactly the behavior a stateless serverless invocation
 * needs — and the singleton pattern there (reusing a global client across
 * invocations of the same warm function instance) avoids reopening a fresh
 * DB connection on every single request.
 */
const app = createApp();

export default app;
