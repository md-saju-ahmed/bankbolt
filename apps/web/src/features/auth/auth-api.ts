import { baseApi } from "@/lib/api/base-api";
import { workspaces, type Role, type SessionUser } from "./identity";

type Session = { user: SessionUser };
type LoginBody = { email: string; password: string };

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    me: builder.query<Session, void>({
      query: () => ({ url: "/auth/me", cache: "no-store" }),
      providesTags: ["Session"],
      keepUnusedDataFor: 0,
    }),
    workspace: builder.query<Session, Role>({
      query: (role) => ({
        url: `/auth/workspaces${workspaces[role].path}`,
        cache: "no-store",
      }),
      providesTags: ["Session"],
      keepUnusedDataFor: 0,
    }),
    login: builder.mutation<Session, LoginBody>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: (result) => (result ? ["Session"] : []),
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Session"],
    }),
  }),
});

export const {
  useMeQuery,
  useWorkspaceQuery,
  useLoginMutation,
  useLogoutMutation,
} = authApi;

export function errorCode(error: unknown) {
  if (typeof error !== "object" || !error || !("data" in error))
    return undefined;
  const data = error.data;
  if (typeof data !== "object" || !data || !("error" in data)) return undefined;
  const detail = data.error;
  if (typeof detail !== "object" || !detail || !("code" in detail))
    return undefined;
  return typeof detail.code === "string" ? detail.code : undefined;
}
