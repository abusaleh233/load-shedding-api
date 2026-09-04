import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/user/user.routes";
import substationRoutes from "../modules/substation/substation.routes";
import areaRoutes from "../modules/area/area.routes";
import scheduleRoutes from "../modules/schedule/schedule.routes";
import outageRoutes from "../modules/outage/outage.routes";
import billRoutes from "../modules/bill/bill.routes";
import paymentRoutes from "../modules/payment/payment.routes";
import auditRoutes from "../modules/audit/audit.routes";

const router = Router();

// NOTE: POST /payments/webhook is intentionally NOT mounted here. It is
// registered directly on the app in app.ts, ahead of the global
// express.json() parser, because Stripe's signature verification requires
// the raw (unparsed) request body. See app.ts for details. The paymentRoutes
// router below only covers the authenticated, JSON-bodied payment endpoints.

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/substations", substationRoutes);
router.use("/areas", areaRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/outages", outageRoutes);
router.use("/bills", billRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin/audit-logs", auditRoutes);

router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Service healthy", data: { uptime: process.uptime() } });
});

export default router;
