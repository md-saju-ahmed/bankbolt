import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const transactionsSlice = createSlice({
  name: "transactions",
  initialState: { search: "", page: 1 },
  reducers: {
    setTransactionSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
      state.page = 1;
    },
    setTransactionPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
  },
});
