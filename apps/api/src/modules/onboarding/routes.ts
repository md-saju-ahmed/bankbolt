import { Router } from "express";
import { requireWebOrigin } from "../auth/auth-config.ts";
import { currentIdentity, requireAuth, requireRole } from "../auth/guards.ts";
import {
  activateAccount,
  createAccount,
  findCustomerByEmail,
  listAccounts,
  recordVerification,
  registerCustomer,
} from "./service.ts";
import {
  accountParams,
  accountRequest,
  customerParams,
  lookup,
  pages,
  registration,
  review,
} from "./validation.ts";

export const onboardingRouter = Router();

onboardingRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
onboardingRouter.use(requireAuth, requireRole("ADMIN", "STAFF"));

onboardingRouter.post("/", requireWebOrigin, async (request, response) => {
  response.status(201).json({
    customer: await registerCustomer(registration.parse(request.body)),
  });
});

onboardingRouter.post(
  "/lookup",
  requireWebOrigin,
  async (request, response) => {
    const { email } = lookup.parse(request.body);
    response.json({ customer: await findCustomerByEmail(email) });
  },
);

onboardingRouter.patch(
  "/:customerId/verification",
  requireWebOrigin,
  async (request, response) => {
    const { customerId } = customerParams.parse(request.params);
    const { status } = review.parse(request.body);
    response.json({
      customer: await recordVerification(
        customerId,
        status,
        currentIdentity(request).id,
      ),
    });
  },
);

onboardingRouter.get("/:customerId/accounts", async (request, response) => {
  const { customerId } = customerParams.parse(request.params);
  const { page } = pages.parse(request.query);
  response.json(await listAccounts(customerId, page));
});

onboardingRouter.post(
  "/:customerId/accounts",
  requireWebOrigin,
  async (request, response) => {
    const { customerId } = customerParams.parse(request.params);
    const { account, created } = await createAccount(
      customerId,
      accountRequest.parse(request.body),
    );
    response.status(created ? 201 : 200).json({ account });
  },
);

onboardingRouter.post(
  "/:customerId/accounts/:accountId/activate",
  requireWebOrigin,
  async (request, response) => {
    const { customerId, accountId } = accountParams.parse(request.params);
    response.json({ account: await activateAccount(customerId, accountId) });
  },
);
