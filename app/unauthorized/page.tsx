"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, LogOut, Clapperboard } from "lucide-react";

export default function UnauthorizedPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="w-full flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
            <Clapperboard className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight">ContentPipe</span>
        </div>
      </header>

      {/* Main Card */}
      <main className="w-full max-w-lg mx-auto my-auto py-8">
        <div className="glass-floating rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center">
          <div className="relative mb-5">
            <div className="absolute -inset-3 rounded-full bg-destructive/20 blur-xl pointer-events-none" />
            <div className="relative w-16 h-16 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-destructive/15 text-destructive border border-destructive/25 mb-3">
            Access Denied • 403
          </span>

          <h1 className="text-2xl font-bold font-display mb-2">
            Unauthorized Account
          </h1>

          <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-sm">
            Per SPEC.md Section 2.2: Your Google account is not mapped to an authorized Creator or Team role in this channel register.
          </p>

          {/* Email badge */}
          {session?.user?.email && (
            <div className="w-full p-3.5 rounded-xl glass-subtle text-xs font-mono mb-6 flex flex-col gap-1 text-left">
              <span className="text-muted-foreground text-[11px]">Attempted Account:</span>
              <span className="font-semibold text-foreground break-all">{session.user.email}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-250 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out & Switch Account</span>
            </button>

            <Link
              href="/"
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold glass-subtle hover:bg-muted/60 text-foreground transition-all duration-250 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Home</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-muted-foreground py-4 font-mono">
        Access restricted to authorized channel roles.
      </footer>
    </div>
  );
}
