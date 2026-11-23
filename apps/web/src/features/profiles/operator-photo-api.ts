import { baseApi } from "@/lib/api/base-api";

type PhotoRequest = {
  id: string;
  photoUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewReason: string | null;
};
type OperatorPhoto = {
  fullName: string;
  role: "STAFF" | "ADMIN";
  photoUrl: string | null;
  request: PhotoRequest | null;
};
type QueueEntry = PhotoRequest & {
  fullName: string;
  currentPhotoUrl: string | null;
  createdAt: string;
};

const url = "/profile/operator-photo";

export const {
  useOperatorPhotoQuery,
  useSaveOperatorPhotoMutation,
  useStaffPhotoQueueQuery,
  useDecideStaffPhotoMutation,
} = baseApi.injectEndpoints({
  endpoints: (build) => ({
    operatorPhoto: build.query<OperatorPhoto, void>({
      query: () => ({ url, cache: "no-store" }),
      providesTags: ["Profile"],
      keepUnusedDataFor: 0,
    }),
    saveOperatorPhoto: build.mutation<
      void,
      { staff: boolean; photoUrl: string | null }
    >({
      query: ({ staff, photoUrl }) => ({
        url: staff ? url + "/requests" : url,
        method: staff ? "POST" : "PUT",
        body: { photoUrl },
      }),
      invalidatesTags: (_result, error, { staff }) =>
        error ? [] : staff ? ["Profile"] : ["Profile", "Session"],
    }),
    staffPhotoQueue: build.query<
      { requests: QueueEntry[]; hasNextPage: boolean },
      number
    >({
      query: (page) => ({
        url: url + "/review",
        params: { page },
        cache: "no-store",
      }),
      providesTags: ["Profile"],
      keepUnusedDataFor: 0,
    }),
    decideStaffPhoto: build.mutation<
      void,
      { id: string; status: "APPROVED" | "REJECTED"; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: url + "/review/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, error) => (error ? [] : ["Profile"]),
    }),
  }),
});
