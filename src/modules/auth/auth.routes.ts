import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authLimiter } from "../../middlewares/rateLimiter.middleware";
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  refreshSchema,
} from "./auth.schema";
import * as authController from "./auth.controller";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/google", authLimiter, validate(googleLoginSchema), authController.googleLogin);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", validate(refreshSchema), authController.logout);

export default router;
