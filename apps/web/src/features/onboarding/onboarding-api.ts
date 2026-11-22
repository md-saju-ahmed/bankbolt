import { baseApi } from "@/lib/api/base-api";

export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type Customer = {
  id: string;
  fullName: string;
  email: string;
  blocked: boolean;
  accessActive: boolean;
  phone: string;
  dateOfBirth: string;
  address: string;
  identityReference: string;
  occupation: string | null;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
};

export type Registration = Pick<
  Customer,
  | "fullName"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "address"
  | "identityReference"
> & { occupation?: string; password: string };

export type AccountType = "SAVINGS" | "CURRENT" | "BUSINESS";
export type Account = {
  id: string;
  accountNumber: string;
  type: AccountType;
  status: "PENDING" | "ACTIVE" | "FROZEN" | "DEACTIVATED";
  balancePoisha: string;
  heldBalancePoisha: string;
  availableBalancePoisha: string;
  transferLimitPoisha: string;
  dailyTransferLimitPoisha: string;
  businessName: string | null;
  businessRegistrationReference: string | null;
};
type Creation = {
  customerId: string;
  requestId: string;
  type: AccountType;
  businessName?: string;
  businessRegistrationReference?: string;
};

const path = (customerId: string) => `/customers/${customerId}/accounts`;
const accountTag = (customerId: string) =>
  ({ type: "OnboardingAccounts", id: customerId }) as const;

const onboardingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    registerCustomer: builder.mutation<{ customer: Customer }, Registration>({
      query: (body) => ({ url: "/customers", method: "POST", body }),
    }),
    lookupCustomer: builder.mutation<{ customer: Customer }, string>({
      query: (email) => ({
        url: "/customers/lookup",
        method: "POST",
        body: { email },
      }),
    }),
    recordVerification: builder.mutation<
      { customer: Customer },
      { customerId: string; status: VerificationStatus }
    >({
      query: ({ customerId, status }) => ({
        url: `/customers/${customerId}/verification`,
        method: "PATCH",
        body: { status },
      }),
    }),
    onboardingAccounts: builder.query<
      { accounts: Account[]; hasNextPage: boolean },
      { customerId: string; page: number }
    >({
      query: ({ customerId, page }) => ({
        url: path(customerId),
        params: { page },
        cache: "no-store",
      }),
      providesTags: (_result, _error, { customerId }) => [
        accountTag(customerId),
      ],
      keepUnusedDataFor: 0,
    }),
    createAccount: builder.mutation<{ account: Account }, Creation>({
      query: ({ customerId, ...body }) => ({
        url: path(customerId),
        method: "POST",
        body,
      }),
      invalidatesTags: (result, _error, { customerId }) =>
        result ? [accountTag(customerId)] : [],
    }),
    activateAccount: builder.mutation<
      { account: Account },
      { customerId: string; accountId: string }
    >({
      query: ({ customerId, accountId }) => ({
        url: `${path(customerId)}/${accountId}/activate`,
        method: "POST",
      }),
      invalidatesTags: (result, _error, { customerId }) =>
        result ? [accountTag(customerId)] : [],
    }),
  }),
});

export const {
  useRegisterCustomerMutation,
  useLookupCustomerMutation,
  useRecordVerificationMutation,
  useOnboardingAccountsQuery,
  useCreateAccountMutation,
  useActivateAccountMutation,
} = onboardingApi;
