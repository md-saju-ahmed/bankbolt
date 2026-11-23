import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { requestAuthenticator } from "@/lib/authenticator-prompt";

const fetchApi = fetchBaseQuery({
  baseUrl: "/api/v1",
  credentials: "same-origin",
});

function hasCode(data: unknown, code: string) {
  if (typeof data !== "object" || data === null || !("error" in data))
    return false;
  const error = data.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

const withAuthenticator: typeof fetchApi = async (args, api, options) => {
  const initial = await fetchApi(args, api, options);
  if (
    initial.error?.status !== 403 ||
    !hasCode(initial.error.data, "AUTHENTICATOR_CODE_REQUIRED")
  )
    return initial;
  const request = typeof args === "string" ? { url: args } : args;
  let verified: Awaited<ReturnType<typeof fetchApi>> | undefined;
  const submitted = await requestAuthenticator(api.signal, async (code) => {
    const existing = request.headers;
    const headers = new Headers(
      existing instanceof Headers ? existing : undefined,
    );
    if (existing && !(existing instanceof Headers)) {
      const entries = Array.isArray(existing)
        ? existing
        : Object.entries(existing);
      for (const [name, value] of entries)
        if (name !== undefined && value !== undefined)
          headers.append(name, String(value));
    }
    headers.set("X-BankBolt-Authenticator-Code", code);
    const result = await fetchApi({ ...request, headers }, api, options);
    if (
      result.error?.status === 403 &&
      hasCode(result.error.data, "INVALID_AUTHENTICATOR_CODE")
    )
      return false;
    // Keep the request carrying the OTP out of RTK Query action metadata.
    verified = result.error ? { error: result.error } : { data: result.data };
    return true;
  });
  return submitted && verified
    ? verified
    : {
        error: {
          status: 403,
          data: {
            error: {
              code: "AUTHENTICATOR_CANCELLED",
              message: "Authenticator verification was cancelled.",
            },
          },
        },
      };
};

export const baseApi = createApi({
  reducerPath: "bankboltApi",
  baseQuery: withAuthenticator,
  tagTypes: [
    "Session",
    "OnboardingAccounts",
    "Management",
    "Profile",
    "OwnedAccounts",
    "Transactions",
    "TransactionPin",
    "CashRequests",
    "TransactionFlags",
    "Loans",
  ],
  endpoints: () => ({}),
});
