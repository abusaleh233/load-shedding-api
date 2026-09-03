import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/** General API-wide limiter. */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    errors: [{ message: "Rate limit exceeded" }],
  },
});

/** Stricter limiter for auth endpoints to slow down credential-stuffing / brute force. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
    errors: [{ message: "Rate limit exceeded" }],
  },
});
