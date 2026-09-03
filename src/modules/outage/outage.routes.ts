import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createOutageSchema, updateOutageSchema, idParamSchema, listQuerySchema } from "./outage.schema";
import * as controller from "./outage.controller";

const router = Router();

// IMPORTANT: /live must be registered before /:id to avoid route collision.
router.get("/live", authenticate, controller.getLiveOutages);

router.post("/", authenticate, validate(createOutageSchema), controller.createOutage);
router.get("/", authenticate, validate(listQuerySchema), controller.listOutages);
router.get("/:id", authenticate, validate(idParamSchema), controller.getOutage);
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(updateOutageSchema),
  controller.updateOutage
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  controller.deleteOutage
);

export default router;
