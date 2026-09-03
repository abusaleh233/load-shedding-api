import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createAreaSchema, updateAreaSchema, idParamSchema, listQuerySchema } from "./area.schema";
import * as controller from "./area.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(createAreaSchema),
  controller.createArea
);
router.get("/", authenticate, validate(listQuerySchema), controller.listAreas);
router.get("/:id", authenticate, validate(idParamSchema), controller.getArea);
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(updateAreaSchema),
  controller.updateArea
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  controller.deleteArea
);

export default router;
