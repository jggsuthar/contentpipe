"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "theme-dark" | "theme-bright";

export function migrateTheme(value: string | null | undefined): Theme {
  if (value === "theme-bright" || value === "theme-swiss" || value === "theme-comics") {
    return "theme-bright";
  }
  if (value === "theme-dark" || value === "theme-industrial") {
    return "theme-dark";
  }
  return "theme-dark";
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "theme-dark",
  setTheme: () => {},
});

export const THEME_CONFIGS: {
  id: Theme;
  name: string;
  vibe: string;
  badge: string;
}[] = [
  {
    id: "theme-dark",
    name: "Obsidian Glass",
    vibe: "Deep slate-navy canvas, frosted dark surfaces, electric indigo",
    badge: "Dark",
  },
  {
    id: "theme-bright",
    name: "Daylight Frost",
    vibe: "Soft pearl-sky canvas, frosted white glass, royal indigo",
    badge: "Bright",
  },
];

const ALL_THEME_CLASSES = [
  "theme-industrial",
  "theme-swiss",
  "theme-comics",
  "theme-dark",
  "theme-bright",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("theme-dark");

  const applyThemeToDOM = useCallback((newTheme: Theme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove(...ALL_THEME_CLASSES, "dark");
    root.classList.add(newTheme);
    if (newTheme === "theme-dark") {
      root.classList.add("dark");
    }
    root.setAttribute("data-theme", newTheme);
    if (body) {
      body.classList.remove(...ALL_THEME_CLASSES);
      body.classList.add(newTheme);
      body.setAttribute("data-theme", newTheme);
    }
  }, []);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      const normalized = migrateTheme(newTheme);
      setThemeState(normalized);
      try {
        localStorage.setItem("creator_theme", normalized);
      } catch {}
      applyThemeToDOM(normalized);
    },
    [applyThemeToDOM]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("creator_theme");
      const initialTheme = migrateTheme(saved);
      if (saved && saved !== initialTheme) {
        localStorage.setItem("creator_theme", initialTheme);
      }
      setThemeState(initialTheme);
      applyThemeToDOM(initialTheme);
    } catch {}
  }, [applyThemeToDOM]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
