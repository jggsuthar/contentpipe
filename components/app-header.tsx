"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Clapperboard,
  LayoutDashboard,
  Table,
  CalendarClock,
  Sliders,
  HardDrive,
  User,
  ChevronDown,
  LogOut,
  Shield,
  ExternalLink,
  Menu,
} from "lucide-react";

export function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
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
      label: "Index",
      href: "/index",
      icon: Table,
      active: pathname.startsWith("/index") || pathname.startsWith("/tracker") || pathname.startsWith("/scripts") || pathname.startsWith("/content"),
    },
    {
      label: "Schedule",
      href: "/schedule",
      icon: CalendarClock,
      active: pathname.startsWith("/schedule"),
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

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (mobileRef.current && !mobileRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Do not render authenticated app header on public, login, or error pages
  if (
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/login" ||
    pathname === "/unauthorized"
  ) {
    return null;
  }

  return (
    <header className="w-full glass-nav sticky top-0 z-40" suppressHydrationWarning>
      <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4" suppressHydrationWarning>
        {/* Left: Brand Logo */}
        <Link
          href={dashboardHref}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity duration-250 shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
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
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase font-bold tracking-wider bg-status-review/15 text-status-review border border-status-review/30">
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
        <div className="flex items-center gap-2 sm:gap-2.5 ml-auto">
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

          {/* Narrow / Mobile Screen Dropdown Trigger */}
          <div className="relative md:hidden" ref={mobileRef}>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-xl text-xs glass-subtle flex items-center gap-1 transition-all duration-250 cursor-pointer ${
                mobileMenuOpen ? "bg-muted text-foreground border-primary/40" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Navigation Menu"
            >
              <Menu className="w-4 h-4" />
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${mobileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Mobile Dropdown Menu */}
            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 glass-floating rounded-2xl p-1.5 z-50 text-xs font-sans space-y-0.5 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground uppercase border-b border-border/60 mb-1">
                  Menu Tabs
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                        item.active
                          ? "bg-primary/15 text-primary font-semibold"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right-most Account Icon & Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex items-center gap-1.5 p-1.5 pr-2.5 rounded-full glass-subtle transition-all duration-250 cursor-pointer ${
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
                    href="/index"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                  >
                    <Table className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Index (Production Matrix)</span>
                  </Link>
                  <Link
                    href="/schedule"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors duration-200"
                  >
                    <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Schedule (PWS Timetable)</span>
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
                      signOut({ callbackUrl: "/login" });
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
  );
}
