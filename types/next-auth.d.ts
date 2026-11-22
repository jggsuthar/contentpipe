import { DefaultSession } from "next-auth";
import "next-auth/jwt";
import { RolePermissions } from "./database";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: string;
    user: {
      id?: string;
      role?: "creator" | "team" | null;
      roleId?: string;
      title?: string;
      permissions?: RolePermissions;
      assignedContentTypes?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: "creator" | "team" | null;
    roleId?: string;
    title?: string;
    permissions?: RolePermissions;
    assignedContentTypes?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
    role?: "creator" | "team" | null;
    roleId?: string;
    title?: string;
    permissions?: RolePermissions;
    assignedContentTypes?: string[];
  }
}
