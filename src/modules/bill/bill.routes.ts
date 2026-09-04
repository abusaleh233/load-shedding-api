import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createBillSchema, updateBillSchema, idParamSchema, listQuerySchema } from "./bill.schema";
import * as controller from "./bill.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(createBillSchema),
  controller.createBill
);
router.get("/", authenticate, validate(listQuerySchema), controller.listBills);
router.get("/:id", authenticate, validate(idParamSchema), controller.getBill);
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.OPERATOR),
  validate(updateBillSchema),
  controller.updateBill
);
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  controller.deleteBill
);

export default router;