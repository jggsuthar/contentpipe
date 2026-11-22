"use client";

import React from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon } from "lucide-react";

interface ThemeSwitcherProps {
  compact?: boolean;
}

export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const isBright = theme === "theme-bright";

  return (
    <div
      role="group"
      aria-label="Theme mode"
      className="inline-flex items-center p-1 rounded-full glass-subtle text-xs gap-0.5"
    >
      <button
        type="button"
        onClick={() => setTheme("theme-bright")}
        title="Daylight Frost (Bright)"
        aria-pressed={isBright}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-all duration-200 cursor-pointer ${
          isBright
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        {!compact && <span>Bright</span>}
      </button>

      <button
        type="button"
        onClick={() => setTheme("theme-dark")}
        title="Obsidian Glass (Dark)"
        aria-pressed={!isBright}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-all duration-200 cursor-pointer ${
          !isBright
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        {!compact && <span>Dark</span>}
      </button>
    </div>
  );
}
