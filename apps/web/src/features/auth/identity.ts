export const workspaces = {
  ADMIN: { path: "/admin", label: "Admin" },
  STAFF: { path: "/staff", label: "Bank Staff" },
  CUSTOMER: { path: "/customer", label: "Customer" },
} as const;

export type Role = keyof typeof workspaces;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};
