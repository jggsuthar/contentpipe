import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PublicShell } from "@/components/public/public-shell";

export const metadata = {
  title: "Terms of Service — ContentPipe",
  description: "Terms of Service for ContentPipe internal production workspace.",
};

export default function TermsOfServicePage() {
  return (
    <PublicShell>
      <div className="max-w-3xl mx-auto w-full space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>

        <article className="glass-floating rounded-3xl p-6 sm:p-9 space-y-6">
          <header className="border-b border-border/60 pb-4 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <FileText className="w-4 h-4" />
              <span>Terms of Service</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              ContentPipe Terms of Service
            </h1>
            <p className="text-xs text-muted-foreground">
              Effective Date: November 22, 2026
            </p>
          </header>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              1. Internal Authorized Use Only
            </h2>
            <p>
              ContentPipe is a private production tracker and collaboration
              workspace operated solely for internal use. Access is restricted to
              accounts explicitly pre-authorized by the developer/administrator.
              Unauthorized sign-in attempts are prohibited and automatically
              blocked.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              2. Account Responsibilities &amp; Permissions
            </h2>
            <p>
              Authorized users must only access Content Series, Scripts,
              Production Boards, and connected Google Drive folders permitted by
              their assigned role. You are responsible for safeguarding your
              Google account credentials and any activity performed under your
              session.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              3. Content Ownership &amp; Google Drive Assets
            </h2>
            <p>
              You and your organization retain all ownership rights to scripts,
              notes, thumbnails, video files, and production assets managed
              through ContentPipe or stored in your connected Google Drive. You grant ContentPipe permission only to display, organize,
              and sync those assets inside the workspace on your behalf.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              4. Availability &amp; Access Termination
            </h2>
            <p>
              ContentPipe is provided on an &ldquo;as is&rdquo; basis for
              internal operational workflows. The administrator may update
              features, perform maintenance, or revoke user authorization at any
              time without prior notice.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              5. Contact
            </h2>
            <p>
              Questions regarding these Terms or workspace authorization can be
              directed to{" "}
              <a
                href="mailto:jggsuthar@gmail.com"
                className="text-primary hover:underline font-medium"
              >
                jggsuthar@gmail.com
              </a>
              .
            </p>
          </section>
        </article>
      </div>
    </PublicShell>
  );
}
