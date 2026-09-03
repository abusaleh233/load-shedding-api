import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/rbac.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { listAuditLogs } from "./audit.service";

const router = Router();

/**
 * GET /api/v1/admin/audit-logs
 * Admin-only: paginated, filterable audit trail of critical actions.
 */
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const entity = req.query.entity as string | undefined;
    const action = req.query.action as string | undefined;
    const userId = req.query.userId as string | undefined;

    const result = await listAuditLogs({ page, limit, entity, action, userId });
    ApiResponse.success(res, result, "Audit logs retrieved successfully");
  })
);

export default router;
