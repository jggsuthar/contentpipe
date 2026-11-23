"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { clearAllSessionCache } from "@/lib/session-cache";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Clapperboard,
  LayoutDashboard,
  Table,
  Sliders,
  HardDrive,
  User,
  ChevronDown,
  LogOut,
  Shield,
  Lightbulb,
} from "lucide-react";

export function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isQueryFullscreen, setIsQueryFullscreen] = useState(false);
  const [isTeleprompterActive, setIsTeleprompterActive] = useState(false);
  const [ideaBankState, setIdeaBankState] = useState<{
    count: number;
    hasMissingDetails: boolean;
  }>({ count: 0, hasMissingDetails: false });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync URL ?fullscreen=true without requiring a Suspense boundary in RootLayout
  useEffect(() => {
    const syncFullscreenParam = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      setIsQueryFullscreen(params.get("fullscreen") === "true");
    };
    syncFullscreenParam();
    window.addEventListener("popstate", syncFullscreenParam);
    return () => window.removeEventListener("popstate", syncFullscreenParam);
  }, [pathname]);

  // Listen for Idea Bank state broadcasts & teleprompter overlay events
  useEffect(() => {
    const handleIdeaState = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number; hasMissingDetails?: boolean }>).detail;
      if (!detail) return;
      setIdeaBankState({
        count: typeof detail.count === "number" ? detail.count : 0,
        hasMissingDetails: Boolean(detail.hasMissingDetails),
      });
    };
    const handleTeleprompter = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean }>).detail;
      setIsTeleprompterActive(Boolean(detail?.active));
    };

    window.addEventListener("contentpipe:idea-bank-state", handleIdeaState);
    window.addEventListener("contentpipe:teleprompter", handleTeleprompter);
    window.dispatchEvent(new CustomEvent("contentpipe:request-idea-bank-state"));

    return () => {
      window.removeEventListener("contentpipe:idea-bank-state", handleIdeaState);
      window.removeEventListener("contentpipe:teleprompter", handleTeleprompter);
    };
  }, []);

  const isCreator = mounted && session?.user?.role === "creator";
  const dashboardHref = isCreator ? "/creator/dashboard" : "/team/dashboard";

  // Navigation Items
  const navItems = [
    {
      label: "Dashboard",
      href: dashboardHref,
      icon: LayoutDashboard,
      active: pathname.startsWith("/creator/dashboard") || pathname.startsWith("/team/dashboard"),
    },
    {
      label: "Tracker",
      href: "/tracker",
      icon: Table,
      active:
        pathname.startsWith("/tracker") ||
        pathname.startsWith("/scripts") ||
        pathname.startsWith("/content"),
    },
    {
      label: isCreator ? "Settings" : "Preferences",
      href: isCreator ? "/settings" : "/settings?tab=defaults",
      icon: Sliders,
      active: pathname.startsWith("/settings"),
    },
    ...(isCreator
      ? [
          {
            label: "Storage Clean Up",
            href: "/storage-cleanup",
            icon: HardDrive,
            active: pathname.startsWith("/storage-cleanup"),
          },
        ]
      : []),
  ];

  // Close account dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Do not render authenticated app header on public or error pages
  if (
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/unauthorized"
  ) {
    return null;
  }

  const showMobileBottomNav =
    mounted &&
    Boolean(session?.user) &&
    !isQueryFullscreen &&
    !isTeleprompterActive;

  return (
    <>
      <header className="w-full glass-nav sticky top-0 z-40" suppressHydrationWarning>
        <div className="w-full px-3 sm:px-6 h-13 md:h-16 flex items-center justify-between gap-2 sm:gap-4" suppressHydrationWarning>
          {/* Left: Brand Logo */}
          <Link
            href={dashboardHref}
            className="flex items-center gap-2 sm:gap-2.5 hover:opacity-90 transition-opacity duration-250 shrink-0"
          >
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
              <Clapperboard className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-sm tracking-tight text-foreground">ContentPipe</span>
                {mounted && isCreator ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase font-bold tracking-wider bg-primary/15 text-primary border border-primary/25">
                    Creator
                  </span>
                ) : mounted && session?.user?.title ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase font-bold tracking-wider bg-status-review/15 text-status-review border border-status-review/30 max-w-[100px] truncate">
                    {session.user.title}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 hidden sm:inline">
                Production & Register Hub
              </span>
            </div>
          </Link>

          {/* Right-Aligned Navigation Bar, Theme Toggle & Account */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto">
            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 mr-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium font-sans flex items-center gap-1.5 transition-all duration-250 cursor-pointer ${
                      item.active
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Quick Bright/Dark Theme Toggle */}
            <ThemeSwitcher compact />

            {/* Right-most Account Icon & Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`flex items-center gap-1.5 p-1 pr-2 sm:p-1.5 sm:pr-2.5 rounded-full glass-subtle transition-all duration-250 cursor-pointer ${
                  dropdownOpen ? "border-primary/50 bg-muted/70" : "hover:bg-muted/60 text-foreground"
                }`}
                title="Account Menu"
                aria-expanded={dropdownOpen}
              >
                <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold font-mono text-xs">
                  {mounted && session?.user?.name ? (
                    session.user.name.charAt(0).toUpperCase()
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </div>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Account Popover Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 glass-floating rounded-2xl p-2 z-50 text-xs font-sans space-y-2 animate-in fade-in zoom-in-95 duration-200">
                  {/* User profile card */}
                  <div className="p-2.5 rounded-xl glass-subtle space-y-1">
                    <div className="font-semibold text-foreground truncate">
                      {session?.user?.name || "User Account"}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      {session?.user?.email || "Signed in"}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/60">
                      <Shield className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-mono font-medium text-foreground">
                        Role: {isCreator ? "Master Creator" : session?.user?.title || "Team Member"}
                      </span>
                    </div>
                  </div>

                  {/* Account Navigation Shortcuts */}
                  <div className="space-y-0.5">
                    <Link
                      href={dashboardHref}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>My Dashboard</span>
                    </Link>

                    <Link
                      href="/tracker"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                    >
                      <Table className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Tracker (Production Matrix)</span>
                    </Link>

                    {isCreator ? (
                      <>
                        <Link
                          href="/settings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                        >
                          <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Settings</span>
                        </Link>

                        <Link
                          href="/storage-cleanup"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                        >
                          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Storage Clean Up</span>
                        </Link>
                      </>
                    ) : (
                      <Link
                        href="/settings?tab=defaults"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                      >
                        <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Preferences</span>
                      </Link>
                    )}
                  </div>

                  {/* Sign Out Button */}
                  <div className="pt-1.5 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        clearAllSessionCache();
                        signOut({ callbackUrl: "/" });
                      }}
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-destructive/15 text-destructive font-medium transition-colors duration-200 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Fixed Mobile Bottom Navigation Bar (< md) */}
      {showMobileBottomNav && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-6px_24px_rgba(0,0,0,0.18)] pb-[env(safe-area-inset-bottom)]"
        >
          <div className={`grid ${isCreator ? "grid-cols-5" : "grid-cols-3"} items-stretch`}>
            {/* Tab 1: Dashboard */}
            <Link
              href={dashboardHref}
              className={`min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                pathname.startsWith("/creator/dashboard") || pathname.startsWith("/team/dashboard")
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="w-4.5 h-4.5" />
              <span className="truncate max-w-full">Dashboard</span>
            </Link>

            {/* Tab 2: Tracker */}
            <Link
              href="/tracker"
              className={`min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                pathname.startsWith("/tracker") ||
                pathname.startsWith("/scripts") ||
                pathname.startsWith("/content")
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table className="w-4.5 h-4.5" />
              <span className="truncate max-w-full">Tracker</span>
            </Link>

            {isCreator ? (
              <>
                {/* Tab 3 (Creator): Ideas */}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("contentpipe:open-idea-bank"))}
                  className="min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Open Idea Bank"
                >
                  <span className="relative inline-flex items-center justify-center">
                    <Lightbulb className="w-4.5 h-4.5 text-amber-500" />
                    {ideaBankState.count > 0 && (
                      <span className="absolute -top-1.5 -right-3 px-1 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-mono font-bold flex items-center justify-center leading-none">
                        {ideaBankState.count > 99 ? "99+" : ideaBankState.count}
                      </span>
                    )}
                    {ideaBankState.hasMissingDetails && (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-background absolute -top-1 -left-1.5"
                        title="Some ideas are missing Brand or Content Pipe"
                      />
                    )}
                  </span>
                  <span className="truncate max-w-full">Ideas</span>
                </button>

                {/* Tab 4 (Creator): Settings */}
                <Link
                  href="/settings"
                  className={`min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                    pathname.startsWith("/settings")
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sliders className="w-4.5 h-4.5" />
                  <span className="truncate max-w-full">Settings</span>
                </Link>

                {/* Tab 5 (Creator): Storage */}
                <Link
                  href="/storage-cleanup"
                  className={`min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                    pathname.startsWith("/storage-cleanup")
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HardDrive className="w-4.5 h-4.5" />
                  <span className="truncate max-w-full">Storage</span>
                </Link>
              </>
            ) : (
              /* Tab 3 (Team): Preferences */
              <Link
                href="/settings?tab=defaults"
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                  pathname.startsWith("/settings")
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sliders className="w-4.5 h-4.5" />
                <span className="truncate max-w-full">Preferences</span>
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
