import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  updateProfileSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  idParamSchema,
} from "./user.schema";
import * as userController from "./user.controller";

const router = Router();

// --- Self-service profile ---
router.get("/me", authenticate, userController.getMe);
router.patch("/me", authenticate, validate(updateProfileSchema), userController.updateMe);

// --- Admin user management ---
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  validate(listUsersQuerySchema),
  userController.listUsers
);
router.patch(
  "/:id/role",
  authenticate,
  authorize(Role.ADMIN),
  validate(updateUserRoleSchema),
  userController.updateUserRole
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  userController.deleteUser
);

export default router;
