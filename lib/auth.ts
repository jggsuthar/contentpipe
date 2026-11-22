import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getDynamicUserProfile, isCreatorEmail } from "@/lib/constants/users";

export const authOptions: NextAuthOptions = {
  providers: [
    // 1. Google OAuth Provider with offline access and full Google Drive scope
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/drive",
        },
      },
    }),
  ],

  pages: {
    signIn: "/",
    error: "/",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET || "fallback_creator_secret_32bytes_dev_only",

  callbacks: {
    /**
     * Reject login if the account is neither the Creator nor a registered Team Member
     */
    async signIn({ user }) {
      if (!user?.email) {
        return "/?error=Unauthorized";
      }

      const email = user.email.toLowerCase().trim();

      // Check if Creator (fast-path)
      if (isCreatorEmail(email)) {
        return true;
      }

      // Check dynamic database roles for team member
      const profile = await getDynamicUserProfile(email);
      if (profile && profile.role === "team") {
        return true;
      }

      // Deny access if unmapped in the database
      return "/?error=Unauthorized";
    },

    /**
     * Persist tokens and query database profile dynamically into the JWT
     */
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;

        // Persist Creator's offline Google Drive refresh token to database
        if (account.refresh_token && token.email && isCreatorEmail(token.email)) {
          try {
            const prisma = (await import("@/lib/prisma")).default;
            await prisma.creatorSettings.upsert({
              where: { id: "default" },
              create: {
                id: "default",
                drive_refresh_token: account.refresh_token,
              },
              update: {
                drive_refresh_token: account.refresh_token,
              },
            });
          } catch (e) {
            console.error("Failed to persist Creator Drive refresh token:", e);
          }
        }
      }

      if (token.email) {
        const profile = await getDynamicUserProfile(token.email);
        if (profile) {
          token.role = profile.role;
          token.roleId = profile.roleId;
          token.title = profile.title;
          token.permissions = profile.permissions;
          token.assignedContentTypes = profile.assignedContentTypes;
        } else {
          token.role = null;
        }
      }

      return token;
    },

    /**
     * Expose verified role and permission payload to the active session
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.refreshToken = token.refreshToken as string | undefined;

      if (session.user) {
        session.user.role = (token.role as "creator" | "team" | null) ?? null;
        session.user.roleId = token.roleId as string | undefined;
        session.user.title = token.title as string | undefined;
        session.user.permissions = token.permissions;
        session.user.assignedContentTypes = token.assignedContentTypes;
      }

      return session;
    },
  },
};
