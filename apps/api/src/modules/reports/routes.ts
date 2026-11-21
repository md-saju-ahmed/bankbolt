import { Router } from "express";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import {
  adminReportQuery,
  customerReportQuery,
  reportPeriod,
  staffReportQuery,
} from "./period.ts";
import { adminReport, customerReport, staffReport } from "./service.ts";

export const reportsRouter = Router();
reportsRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
reportsRouter.use(requireAuth);

reportsRouter.get("/admin", requireRole("ADMIN"), async (request, response) => {
  const period = reportPeriod(adminReportQuery.parse(request.query));
  response.json(await adminReport(period));
});

reportsRouter.get(
  "/customer",
  requireRole("CUSTOMER"),
  async (request, response) => {
    const filters = customerReportQuery.parse(request.query);
    response.json(
      await customerReport(
        currentIdentity(request).id,
        reportPeriod(filters),
        filters.accountId,
      ),
    );
  },
);

reportsRouter.get("/staff", requireRole("STAFF"), async (request, response) => {
  staffReportQuery.parse(request.query);
  response.json(await staffReport(currentIdentity(request).id));
});
