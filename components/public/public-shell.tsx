"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Clapperboard, ArrowRight, Lock } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const isAuthenticated = status === "authenticated" && !!session?.user?.role;
  const dashboardHref =
    session?.user?.role === "creator"
      ? "/creator/dashboard"
      : "/team/dashboard";

  return (
    <div className="min-h-screen w-full flex flex-col justify-between">
      {/* Clean Public Top Bar */}
      <header className="w-full glass-nav sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
              <Clapperboard className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight text-foreground">
              ContentPipe
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <ThemeSwitcher />

            {isAuthenticated ? (
              <Link
                href={dashboardHref}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>Open Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Lock className="w-3 h-3" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col justify-center">
        {children}
      </main>

      {/* Minimal Legal Footer */}
      <footer className="w-full border-t border-border/60 py-5 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            &copy; {new Date().getFullYear()} ContentPipe • Internal Production Workspace
          </span>

          <nav className="flex items-center gap-5">
            <Link
              href="/"
              className={`hover:text-foreground transition-colors ${
                pathname === "/" ? "text-foreground font-semibold" : ""
              }`}
            >
              Home
            </Link>
            <Link
              href="/privacy"
              className={`hover:text-foreground transition-colors ${
                pathname === "/privacy" ? "text-foreground font-semibold" : ""
              }`}
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className={`hover:text-foreground transition-colors ${
                pathname === "/terms" ? "text-foreground font-semibold" : ""
              }`}
            >
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
