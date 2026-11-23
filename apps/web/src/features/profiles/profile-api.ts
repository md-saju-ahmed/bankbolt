import { baseApi } from "@/lib/api/base-api";

export type Profile = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  occupation: string | null;
  photoUrl?: string | null;
};
type PersonalChanges = Partial<Pick<Profile, "photoUrl" | "occupation">>;
export type ContactChanges = Partial<
  Pick<Profile, "fullName" | "email" | "phone" | "address">
>;
type Decision = "APPROVED" | "REJECTED";

export type ProfileRequest = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  reason: string;
  status: Decision | "PENDING";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
};

type PendingReview = ProfileRequest & {
  customerId: string;
  customerName: string;
  canReview: boolean;
};

const profilePath = (customerId?: string) =>
  customerId ? `/profile/customers/${customerId}` : "/profile";

export const {
  useOwnProfileQuery,
  useUpdateProfileMutation,
  useRequestProfileChangeMutation,
  useProfileReviewQuery,
  useDecideProfileChangeMutation,
} = baseApi.injectEndpoints({
  endpoints: (build) => ({
    ownProfile: build.query<
      { profile: Profile; requests: ProfileRequest[] },
      void
    >({
      query: () => ({ url: "/profile", cache: "no-store" }),
      providesTags: ["Profile"],
      keepUnusedDataFor: 0,
    }),
    updateProfile: build.mutation<
      void,
      { customerId?: string; changes: PersonalChanges }
    >({
      query: ({ customerId, changes }) => ({
        url: profilePath(customerId),
        method: "PATCH",
        body: changes,
      }),
      invalidatesTags: (_result, error, { customerId }) =>
        error ? [] : customerId ? ["Management"] : ["Profile", "Session"],
    }),
    requestProfileChange: build.mutation<
      { request: ProfileRequest },
      { customerId?: string; changes: ContactChanges; reason: string }
    >({
      query: ({ customerId, ...body }) => ({
        url: `${profilePath(customerId)}/requests`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, error) =>
        error ? [] : ["Profile", "Management"],
    }),
    profileReview: build.query<
      { requests: PendingReview[]; hasNextPage: boolean },
      number
    >({
      query: (page) => ({
        url: "/profile/review",
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["Profile"],
      keepUnusedDataFor: 0,
    }),
    decideProfileChange: build.mutation<
      void,
      { id: string; status: Decision; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/profile/review/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, error) =>
        error ? [] : ["Profile", "Management"],
    }),
  }),
});
