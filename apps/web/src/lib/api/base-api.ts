import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const baseApi = createApi({
  reducerPath: "bankboltApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v1", credentials: "same-origin" }),
  tagTypes: ["Session", "OnboardingAccounts"],
  endpoints: () => ({}),
});
