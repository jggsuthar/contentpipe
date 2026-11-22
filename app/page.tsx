"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Clapperboard,
  ShieldCheck,
  ArrowRight,
  Lock,
  FolderKanban,
  FileText,
  CalendarClock,
} from "lucide-react";
import { PublicShell } from "@/components/public/public-shell";

export default function HomePage() {
  const { data: session, status } = useSession();

  const isAuthenticated = status === "authenticated" && !!session?.user?.role;
  const dashboardHref =
    session?.user?.role === "creator"
      ? "/creator/dashboard"
      : "/team/dashboard";

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

          <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed mb-7">
            Internal video production tracker, script studio, scheduling, and
            Google Drive asset workspace built for our creator team.
          </p>

          {/* Authorized-Only Notice */}
          <div className="w-full max-w-md rounded-2xl glass-subtle border border-border/80 p-4 mb-7 flex items-start gap-3 text-left">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-semibold">
                Authorized Access Only:
              </strong>{" "}
              This application is strictly for internal use. You will not be
              able to sign in unless the developer has pre-authorized your email
              address.
            </p>
          </div>

          {/* Primary CTA */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isAuthenticated ? (
              <Link
                href={dashboardHref}
                className="px-6 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 transition-all shadow-sm"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 transition-all shadow-sm"
              >
                <span>Sign In with Google</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </section>

        {/* Minimal 3-Pill Overview */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <FolderKanban className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Pipeline & Drive Sync
            </span>
            <span className="text-[11px] text-muted-foreground">
              Structured deliverables & folders
            </span>
          </div>
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Scripts & Notes
            </span>
            <span className="text-[11px] text-muted-foreground">
              Scenes, scribing & teleprompter
            </span>
          </div>
          <div className="card-theme rounded-2xl p-4 flex flex-col items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Team Scheduling
            </span>
            <span className="text-[11px] text-muted-foreground">
              Deadlines & workload zones
            </span>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
