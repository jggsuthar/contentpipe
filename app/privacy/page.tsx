import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { PublicShell } from "@/components/public/public-shell";

export const metadata = {
  title: "Privacy Policy — ContentPipe",
  description: "Privacy Policy for ContentPipe internal production workspace.",
};

export default function PrivacyPolicyPage() {
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
              <Shield className="w-4 h-4" />
              <span>Privacy Policy</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              ContentPipe Privacy Policy
            </h1>
            <p className="text-xs text-muted-foreground">
              Effective Date: November 22, 2026
            </p>
          </header>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              1. Scope &amp; Authorized Access
            </h2>
            <p>
              ContentPipe is a private, internal video production management
              application. Sign-in is restricted exclusively to email addresses
              explicitly authorized in advance by the administrator/developer.
              Unauthorized users are denied access and no account data is
              retained for rejected sign-in attempts.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              2. Google User Data We Access
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Google Account Profile:</strong>{" "}
                Your name, email address, and profile image are used solely to
                authenticate your identity and match you to your authorized role
                within ContentPipe.
              </li>
              <li>
                <strong className="text-foreground">Google Drive Access:</strong>{" "}
                When authorized, ContentPipe uses Google Drive permissions solely
                to create structured project folders and upload, list, or delete
                production media files (raw footage, B-roll, review cuts, and
                exports) explicitly managed inside the app.
              </li>
              <li>
                <strong className="text-foreground">Workspace Content:</strong>{" "}
                Scripts, notes, production schedules, task statuses, and review
                comments created inside ContentPipe.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              3. Google API Services User Data Policy (Limited Use)
            </h2>
            <p>
              ContentPipe&apos;s use and transfer to any other app of information
              received from Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>We never sell your Google data or workspace content.</li>
              <li>We never use your data for advertising or marketing.</li>
              <li>
                We never share your Google user data with third parties except as
                strictly needed to operate the private infrastructure (database
                hosting and Google Drive APIs).
              </li>
              <li>
                We never use Google Workspace or Google Drive data to train
                generalized AI or machine learning models.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              4. Data Storage, Security &amp; Deletion
            </h2>
            <p>
              All workspace records are stored securely in a private database
              protected by role-based access control over HTTPS. You may revoke
              ContentPipe&apos;s access to your Google account at any time via your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google Account Permissions
              </a>{" "}
              page, or request removal of your stored workspace data by
              contacting the administrator.
            </p>
          </section>

          <section className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              5. Contact
            </h2>
            <p>
              For privacy questions or data deletion requests, contact{" "}
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
