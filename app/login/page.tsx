"use client";

import React, { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, AlertTriangle, Loader2, Database, ShieldCheck } from "lucide-react";

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const authError = searchParams?.get("error");

  const getErrorMessage = () => {
    if (errorMsg) return errorMsg;
    if (!authError) return null;
    switch (authError) {
      case "Unauthorized":
        return "Unauthorized Account: This Google email is not registered in the database as a Creator or Team Member. Contact the Creator to be added.";
      case "AccessDenied":
        return "Access Denied: Your Google account is not authorized to access this register.";
      case "Configuration":
        return "OAuth Configuration error: Missing Google Client ID or Secret. Restart the server after editing .env.local.";
      case "OAuthSignin":
      case "OAuthCallback":
        return "Google OAuth error. Ensure 'http://localhost:3000/api/auth/callback/google' is added to Authorized Redirect URIs in Google Cloud Console.";
      default:
        return `Authentication failed (${authError}). Please try again.`;
    }
  };

  const displayError = getErrorMessage();

  // If already authenticated with a dynamic role, redirect accordingly
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const role = session.user.role;
      if (role === "creator") {
        router.push("/creator/dashboard");
      } else if (role === "team") {
        router.push("/team/dashboard");
      } else {
        router.push("/login?error=Unauthorized");
      }
    }
  }, [status, session, router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoadingGoogle(true);
      setErrorMsg(null);
      await signIn("google", { callbackUrl: "/" });
    } catch (err) {
      setErrorMsg("Failed to initiate Google sign-in. Check your connection.");
      setLoadingGoogle(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="w-full flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
            <Clapperboard className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight">ContentPipe</span>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="w-full max-w-md mx-auto my-auto py-8">
        <div className="glass-floating rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center">
          {/* Brand Icon with Ambient Glow */}
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-primary/25 blur-xl pointer-events-none" />
            <div className="relative w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
              <Clapperboard className="w-8 h-8" />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-2 font-display">
            Creator Production Register
          </h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
            Distraction-free matrix production tracker, script workspace, and review hub.
          </p>

          {/* Database RBAC Status Indicator */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono glass-subtle text-muted-foreground mb-6">
            <Database className="w-3 h-3 text-status-done" />
            <span>Dynamic DB Role Verification</span>
          </div>

          {/* Error Banner if unauthorized or error */}
          {displayError && (
            <div className="w-full mb-6 p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {/* The Single "Sign in with Google" button */}
          <button
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
            <span className="text-gray-800 font-semibold">Sign in with Google</span>
          </button>

          <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
            Offline access requests Google Drive permissions for pipeline asset storage.
          </p>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full text-center text-xs text-muted-foreground py-4 font-mono">
        Creator Production Register System — Phase 1: Database & Dynamic Auth
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-mono text-xs">
          Loading login...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
