import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files, api routes, and icons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || "fallback_creator_secret_32bytes_dev_only",
  });

  const isAuth = !!token;
  const role = token?.role as "creator" | "team" | null | undefined;

  // 1. Public Homepage, Privacy & Terms routes
  if (pathname === "/" || pathname === "/privacy" || pathname === "/terms") {
    return NextResponse.next();
  }

  // 2. Creator-protected routes '/creator/*' and '/settings/*'
  if (pathname.startsWith("/creator") || pathname.startsWith("/settings")) {
    if (!isAuth) {
      const homeUrl = new URL("/", req.url);
      homeUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(homeUrl);
    }
    if (role !== "creator") {
      return NextResponse.redirect(new URL("/?error=Unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // 3. Team-protected routes '/team/*'
  if (pathname.startsWith("/team")) {
    if (!isAuth) {
      const homeUrl = new URL("/", req.url);
      homeUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(homeUrl);
    }
    // Per SPEC.md Section 3.3, Creator also has master access across all team spaces
    if (role !== "team" && role !== "creator") {
      return NextResponse.redirect(new URL("/?error=Unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // 4. Authenticated App Workspaces: '/index/*', '/tracker/*', '/scripts/*', '/content/*'
  if (
    pathname.startsWith("/index") ||
    pathname.startsWith("/tracker") ||
    pathname.startsWith("/scripts") ||
    pathname.startsWith("/content")
  ) {
    if (!isAuth) {
      const homeUrl = new URL("/", req.url);
      homeUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(homeUrl);
    }
    if (role !== "team" && role !== "creator") {
      return NextResponse.redirect(new URL("/?error=Unauthorized", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/creator/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/index/:path*",
    "/tracker/:path*",
    "/scripts/:path*",
    "/content/:path*",
  ],
};
