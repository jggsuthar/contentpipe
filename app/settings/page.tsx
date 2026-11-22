"use client";

import React, { useState, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { DefaultsTab } from "@/components/settings/defaults-tab";
import { ContentTypesTab } from "@/components/settings/content-types-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { DataMigrationTab } from "@/components/settings/data-migration-tab";
import {
  Clapperboard,
  Sliders,
  Layers,
  Users,
  Database,
  ArrowLeft,
  LogOut,
  ShieldCheck,
  Loader2,
} from "lucide-react";

type TabId = "defaults" | "content-types" | "roles" | "data-migration";

function SettingsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams?.get("tab") as TabId) || "defaults";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const isCreator = session?.user?.role === "creator";

  // Sync activeTab with URL params or enforce 'defaults' for team members
  React.useEffect(() => {
    if (!isCreator) {
      setActiveTab("defaults");
    } else {
      const tabFromUrl = searchParams?.get("tab") as TabId;
      if (tabFromUrl && ["defaults", "content-types", "roles", "data-migration"].includes(tabFromUrl)) {
        setActiveTab(tabFromUrl);
      }
    }
  }, [searchParams, isCreator]);

  const currentTab: TabId = !isCreator ? "defaults" : activeTab;

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
        Verifying user credentials...
      </div>
    );
  }

  // Authentication guard
  if (status === "unauthenticated" || !session?.user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="glass-floating rounded-3xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Please log in to access application settings and preferences.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-250 cursor-pointer"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = isCreator
    ? [
        { id: "defaults", label: "Defaults & Theme", icon: Sliders },
        { id: "content-types", label: "Brands & Content Series", icon: Layers },
        { id: "roles", label: "Team & Roles", icon: Users },
        { id: "data-migration", label: "Data Migration", icon: Database },
      ]
    : [{ id: "defaults", label: "Preferences", icon: Sliders }];

  return (
    <div className="flex-1 flex flex-col justify-between p-4 md:p-8">
      {/* Settings Sub-Navigation & Controls */}
      <main className="w-full max-w-6xl mx-auto my-2 flex-1">
        {/* Settings Header Title */}
        <div className="mb-6 pb-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {isCreator ? "System Settings" : "Preferences"}
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold tracking-wider border ${
                  isCreator
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {isCreator ? "Creator Only" : "Team Member"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {isCreator
                ? "Configure Defaults, Brands & Content Series, Workflows, and Dynamic Team Roles"
                : "Customize your Interface Theme and Default Tracker Horizon"}
            </p>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="inline-flex max-w-full items-center gap-1.5 mb-6 glass-subtle p-1.5 rounded-2xl overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = currentTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (isCreator) {
                    setActiveTab(t.id);
                    router.push(`/settings?tab=${t.id}`);
                  } else {
                    setActiveTab("defaults");
                    router.push("/settings?tab=defaults");
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-250 cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        {currentTab === "defaults" && <DefaultsTab isCreator={isCreator} />}
        {isCreator && currentTab === "content-types" && <ContentTypesTab />}
        {isCreator && currentTab === "roles" && <RolesTab />}
        {isCreator && currentTab === "data-migration" && <DataMigrationTab />}
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-6xl mx-auto">
        ContentPipe • {isCreator ? "Creator Settings Module" : "Member Preferences"}
      </footer>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-mono text-xs">
          Loading settings...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
