import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type LoanQueue =
  | "pending"
  | "reviewing"
  | "forwarded"
  | "approved"
  | "rejected"
  | "active"
  | "completed";
type LoanReviewer = "staff" | "admin";
type ReviewSelection = { queue: LoanQueue; page: number };

const initialState: Record<LoanReviewer, ReviewSelection> = {
  staff: { queue: "pending", page: 1 },
  admin: { queue: "forwarded", page: 1 },
};

export const loansSlice = createSlice({
  name: "loans",
  initialState,
  reducers: {
    setReviewSelection(
      state,
      { payload }: PayloadAction<ReviewSelection & { workspace: LoanReviewer }>,
    ) {
      state[payload.workspace] = { queue: payload.queue, page: payload.page };
    },
    resetLoanReview: () => initialState,
  },
});
