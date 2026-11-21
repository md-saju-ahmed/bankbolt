import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState: { selectedLoanId: string | null } = {
  selectedLoanId: null,
};

export const loansSlice = createSlice({
  name: "loans",
  initialState,
  reducers: {
    selectLoan(state, action: PayloadAction<string | null>) {
      state.selectedLoanId = action.payload;
    },
  },
});
