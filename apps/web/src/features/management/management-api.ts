import { baseApi } from "@/lib/api/base-api";
import type { Account, Customer } from "@/features/onboarding/onboarding-api";

export type AccessStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";
export type Section = "customers" | "accounts";
type Query = {
  q: string;
  page: number;
  verification?: string;
  accessStatus?: string;
  type?: string;
  status?: string;
};
export type CustomerRow = Pick<
  Customer,
  "id" | "fullName" | "email" | "verificationStatus"
> & { accessStatus: AccessStatus };
export type ManagedAccount = Account & { ownerName: string };
export type AccountDetail = ManagedAccount & {
  customerId: string;
  ownerEmail: string;
};
export type History = {
  events: {
    id: string;
    action: string;
    reason: string | null;
    actorName: string | null;
    accountNumber: string | null;
    createdAt: string;
  }[];
  hasNextPage: boolean;
};
export type AccessAction = "ACTIVATE" | "DEACTIVATE" | "BLOCK";
export type AccountAction = "FREEZE" | "UNFREEZE" | "DEACTIVATE" | "REACTIVATE";
export type AccountChange =
  | { kind: "status"; action: AccountAction; reason: string }
  | {
      kind: "limits";
      transferLimitPoisha: string;
      dailyTransferLimitPoisha: string;
      reason: string;
    }
  | {
      kind: "metadata";
      businessName: string | null;
      businessRegistrationReference: string | null;
      reason: string;
    };
export type OwnedAccount = Account & { restriction: string | null };

const changes = ["Management", "OnboardingAccounts", "OwnedAccounts"] as const;
type DetailQuery = { id: string; page: number };

export const managementApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    customerDirectory: b.query<
      { customers: CustomerRow[]; hasNextPage: boolean },
      Query
    >({
      query: (body) => ({
        url: "/management/customers/search",
        method: "POST",
        body,
      }),
      providesTags: ["Management"],
      keepUnusedDataFor: 0,
    }),
    accountDirectory: b.query<
      { accounts: ManagedAccount[]; hasNextPage: boolean },
      Query
    >({
      query: (body) => ({
        url: "/management/accounts/search",
        method: "POST",
        body,
      }),
      providesTags: ["Management"],
      keepUnusedDataFor: 0,
    }),
    managedCustomer: b.query<
      { customer: Customer; history: History },
      DetailQuery
    >({
      query: ({ id, page }) => ({
        url: `/management/customers/${id}`,
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["Management"],
      keepUnusedDataFor: 0,
    }),
    managedAccount: b.query<
      { account: AccountDetail; history: History },
      DetailQuery
    >({
      query: ({ id, page }) => ({
        url: `/management/accounts/${id}`,
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["Management"],
      keepUnusedDataFor: 0,
    }),
    changeCustomerAccess: b.mutation<
      void,
      { id: string; action: AccessAction; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/management/customers/${id}/access`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, error) => (error ? [] : changes),
    }),
    changeAccount: b.mutation<void, AccountChange & { id: string }>({
      query: ({ id, ...body }) => ({
        url: `/management/accounts/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, error) => (error ? [] : changes),
    }),
    ownedAccounts: b.query<
      { accounts: OwnedAccount[]; hasNextPage: boolean },
      number
    >({
      query: (page) => ({
        url: "/accounts",
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["OwnedAccounts"],
      keepUnusedDataFor: 0,
    }),
    ownedAccount: b.query<{ account: OwnedAccount }, string>({
      query: (id) => ({
        url: `/accounts/${encodeURIComponent(id)}`,
        cache: "no-store",
      }),
      providesTags: ["OwnedAccounts"],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useCustomerDirectoryQuery,
  useAccountDirectoryQuery,
  useManagedCustomerQuery,
  useManagedAccountQuery,
  useChangeCustomerAccessMutation,
  useChangeAccountMutation,
  useOwnedAccountsQuery,
  useOwnedAccountQuery,
} = managementApi;
