import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  createSubstationSchema,
  updateSubstationSchema,
  idParamSchema,
  listQuerySchema,
} from "./substation.schema";
import * as controller from "./substation.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(createSubstationSchema),
  controller.createSubstation
);
router.get("/", authenticate, validate(listQuerySchema), controller.listSubstations);
router.get("/:id", authenticate, validate(idParamSchema), controller.getSubstation);
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(updateSubstationSchema),
  controller.updateSubstation
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  controller.deleteSubstation
);

export default router;
