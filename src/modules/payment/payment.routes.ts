import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createCheckoutSessionSchema, listQuerySchema } from "./payment.schema";
import * as controller from "./payment.controller";

// NOTE: the raw-body webhook route is registered separately in routes/index.ts
// (it must NOT pass through express.json()). This router only covers the
// authenticated, JSON-bodied payment endpoints.
const router = Router();

router.post(
  "/create-checkout-session",
  authenticate,
  validate(createCheckoutSessionSchema),
  controller.createCheckoutSession
);
router.get("/history", authenticate, validate(listQuerySchema), controller.getPaymentHistory);
router.get("/", authenticate, authorize(Role.ADMIN), validate(listQuerySchema), controller.listAllPayments);

export default router;
