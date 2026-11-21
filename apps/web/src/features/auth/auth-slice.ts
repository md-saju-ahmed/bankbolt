import { createSlice, isAnyOf } from "@reduxjs/toolkit";
import { authApi, errorCode } from "./auth-api";
import type { Role } from "./identity";

const initialState: { role: Role | null } = { role: null };

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addMatcher(
        isAnyOf(
          authApi.endpoints.me.matchFulfilled,
          authApi.endpoints.workspace.matchFulfilled,
        ),
        (state, { payload }) => {
          state.role = payload.user.role;
        },
      )
      .addMatcher(
        authApi.endpoints.login.matchFulfilled,
        (state, { payload }) => {
          state.role = payload.user.role;
        },
      )
      .addMatcher(authApi.endpoints.logout.matchFulfilled, (state) => {
        state.role = null;
      })
      .addMatcher(
        isAnyOf(
          authApi.endpoints.me.matchRejected,
          authApi.endpoints.workspace.matchRejected,
        ),
        (state, { payload }) => {
          const code = errorCode(payload);
          if (code === "AUTH_REQUIRED" || code === "ACCOUNT_BLOCKED")
            state.role = null;
        },
      );
  },
});
