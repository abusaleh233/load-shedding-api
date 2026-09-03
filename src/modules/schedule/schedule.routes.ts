import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createScheduleSchema, updateScheduleSchema, idParamSchema, listQuerySchema } from "./schedule.schema";
import * as controller from "./schedule.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(createScheduleSchema),
  controller.createSchedule
);
router.get("/", authenticate, validate(listQuerySchema), controller.listSchedules);
router.get("/:id", authenticate, validate(idParamSchema), controller.getSchedule);
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(updateScheduleSchema),
  controller.updateSchedule
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(idParamSchema),
  controller.deleteSchedule
);

export default router;
