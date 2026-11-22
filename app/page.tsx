"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  ShieldCheck,
  ArrowRight,
  Lock,
  FolderKanban,
  FileText,
  CalendarClock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { PublicShell } from "@/components/public/public-shell";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isWelcomeCallback, setIsWelcomeCallback] = useState(false);
  const [callbackUrlParam, setCallbackUrlParam] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("error"));
    setIsWelcomeCallback(params.get("welcome") === "1");
    setCallbackUrlParam(params.get("callbackUrl"));
  }, []);

  const isAuthenticated = status === "authenticated" && !!session?.user?.role;
  const dashboardHref =
    session?.user?.role === "creator"
      ? "/creator/dashboard"
      : "/team/dashboard";

  // Automatically route right after Google OAuth completes
  useEffect(() => {
    if (isWelcomeCallback && status === "authenticated" && session?.user) {
      const role = session.user.role;
      if (role === "creator") {
        router.replace("/creator/dashboard");
      } else if (role === "team") {
        router.replace("/team/dashboard");
      } else {
        router.replace("/?error=Unauthorized");
      }
    }
  }, [isWelcomeCallback, status, session, router]);

  const getErrorMessage = () => {
    if (errorMsg) return errorMsg;
    if (!authError) return null;
    switch (authError) {
      case "Unauthorized":
        return "Unauthorized Account: This email is not authorized. Please ask the developer/administrator to grant access.";
      case "AccessDenied":
        return "Access Denied: Your Google account is not authorized to access this workspace.";
      case "Configuration":
        return "OAuth Configuration error: Missing Google Client ID or Secret.";
      case "OAuthSignin":
      case "OAuthCallback":
        return "Google OAuth sign-in failed. Please try again or verify authorized redirect URIs.";
      default:
        return `Authentication failed (${authError}). Please try again.`;
    }
  };

  const displayError = getErrorMessage();

  const handleGoogleSignIn = async () => {
    try {
      setLoadingGoogle(true);
      setErrorMsg(null);
      await signIn("google", {
        callbackUrl: callbackUrlParam || "/?welcome=1",
      });
    } catch {
      setErrorMsg("Failed to initiate Google sign-in. Check your connection.");
      setLoadingGoogle(false);
    }
  };

  return (
    <PublicShell>
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Hero Glass Card */}
        <section className="glass-floating rounded-3xl p-8 sm:p-11 text-center flex flex-col items-center">
          <div className="relative mb-5">
            <div className="absolute -inset-3 rounded-full bg-primary/20 blur-xl pointer-events-none" />
            <div className="relative w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Clapperboard className="w-7 h-7" />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium glass-subtle text-muted-foreground mb-4">
            <Lock className="w-3 h-3 text-primary" />
            <span>Private Internal Workspace</span>
          </span>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            ContentPipe
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed mb-6">
            Internal video production tracker, script studio, scheduling, and
            Google Drive asset workspace built for our creator team.
          </p>

          {/* Authorized-Only Notice */}
          <div className="w-full max-w-md rounded-2xl glass-subtle border border-border/80 p-4 mb-6 flex items-start gap-3 text-left">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-semibold">
                Authorized Access Only:
              </strong>{" "}
              This application is strictly for internal use. Users cannot sign
              in unless the developer has pre-authorized their email address.
            </p>
          </div>

          {/* Auth Error Banner */}
          {displayError && (
            <div className="w-full max-w-md mb-5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Direct Google Login OR Dashboard CTA */}
          <div className="w-full max-w-sm flex flex-col items-center">
            {isAuthenticated ? (
              <Link
                href={dashboardHref}
                className="w-full h-12 px-6 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loadingGoogle}
                className="w-full h-12 px-5 flex items-center justify-center gap-3 rounded-xl bg-white text-gray-900 border border-gray-200/80 hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] font-medium text-sm transition-all duration-250 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loadingGoogle ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span className="text-gray-800 font-semibold">
                  Sign in with Google
                </span>
              </button>
            )}
          </div>
        </section>

        {/* Minimal 3-Pill Overview */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <FolderKanban className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Pipeline &amp; Drive Sync
            </span>
            <span className="text-[11px] text-muted-foreground">
              Structured deliverables &amp; folders
            </span>
          </div>
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Scripts &amp; Notes
            </span>
            <span className="text-[11px] text-muted-foreground">
              Scenes, scribing &amp; teleprompter
            </span>
          </div>
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Team Scheduling
            </span>
            <span className="text-[11px] text-muted-foreground">
              Deadlines &amp; workload zones
            </span>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
