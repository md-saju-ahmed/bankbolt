import {
  configureStore,
  createListenerMiddleware,
  isAnyOf,
} from "@reduxjs/toolkit";
import { accountsSlice } from "@/features/accounts/accounts-slice";
import { authApi, errorCode } from "@/features/auth/auth-api";
import { authSlice } from "@/features/auth/auth-slice";
import { loansSlice } from "@/features/loans/loans-slice";
import { transactionsSlice } from "@/features/transactions/transactions-slice";
import { baseApi } from "@/lib/api/base-api";

export function makeStore() {
  const sessionListener = createListenerMiddleware();
  sessionListener.startListening({
    matcher: authApi.endpoints.logout.matchFulfilled,
    effect: (_, { dispatch }) => {
      dispatch(baseApi.util.resetApiState());
      dispatch(accountsSlice.actions.selectAccount(null));
      dispatch(loansSlice.actions.selectLoan(null));
      dispatch(transactionsSlice.actions.resetTransactionFilters());
    },
  });
  sessionListener.startListening({
    matcher: isAnyOf(
      authApi.endpoints.me.matchRejected,
      authApi.endpoints.workspace.matchRejected,
    ),
    effect: (action, { dispatch }) => {
      if (
        "payload" in action &&
        ["AUTH_REQUIRED", "ACCOUNT_BLOCKED"].includes(
          errorCode(action.payload) ?? "",
        )
      ) {
        dispatch(accountsSlice.actions.selectAccount(null));
        dispatch(loansSlice.actions.selectLoan(null));
        dispatch(transactionsSlice.actions.resetTransactionFilters());
      }
    },
  });

  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      accounts: accountsSlice.reducer,
      transactions: transactionsSlice.reducer,
      loans: loansSlice.reducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (defaults) =>
      defaults().prepend(sessionListener.middleware).concat(baseApi.middleware),
    // Login arguments contain a password and must stay out of Redux DevTools history.
    devTools: false,
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
