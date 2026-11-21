import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState: { selectedAccountId: string | null } = {
  selectedAccountId: null,
};

export const accountsSlice = createSlice({
  name: "accounts",
  initialState,
  reducers: {
    selectAccount(state, action: PayloadAction<string | null>) {
      state.selectedAccountId = action.payload;
    },
  },
});
