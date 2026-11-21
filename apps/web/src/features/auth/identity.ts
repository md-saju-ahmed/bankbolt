export const workspaces = {
  ADMIN: { path: "/admin", label: "Admin" },
  STAFF: { path: "/staff", label: "Bank Staff" },
  CUSTOMER: { path: "/customer", label: "Customer" },
} as const;

export type Role = keyof typeof workspaces;
export function workspaceRole(workspace: string): Role | undefined {
  return (Object.keys(workspaces) as Role[]).find(
    (role) => workspaces[role].path === `/${workspace}`,
  );
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};
