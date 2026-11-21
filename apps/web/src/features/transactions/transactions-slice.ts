import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { HistoryFilters } from "./transactions-api";

const initialFilters: HistoryFilters = { page: 1 };

export const transactionsSlice = createSlice({
  name: "transactions",
  initialState: initialFilters,
  reducers: {
    setTransactionFilters(
      _state,
      action: PayloadAction<Omit<HistoryFilters, "page">>,
    ) {
      return { ...action.payload, page: 1 };
    },
    resetTransactionFilters: () => initialFilters,
    setTransactionPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
  },
});
