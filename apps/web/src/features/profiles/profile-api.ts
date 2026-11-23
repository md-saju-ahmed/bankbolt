import { baseApi } from "@/lib/api/base-api";

export type Profile = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  occupation: string | null;
  photoUrl?: string | null;
};
export type ProfileChanges = Partial<Profile>;
type Decision = "APPROVED" | "REJECTED";

export type ProfileRequest = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  personalChanges?: Pick<ProfileChanges, "occupation" | "photoUrl">;
  reason: string;
  status: Decision | "PENDING";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
};

type PendingReview = ProfileRequest & {
  customerId: string;
  customerName: string;
  currentProfile?: Profile;
  canReview: boolean;
};

const profilePath = (customerId?: string) =>
  customerId ? `/profile/customers/${customerId}` : "/profile";

export const {
  useOwnProfileQuery,
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
    requestProfileChange: build.mutation<
      { request: ProfileRequest },
      { customerId?: string; changes: ProfileChanges; reason: string }
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
