"use client";

/**
 * Lightweight in-memory + sessionStorage Stale-While-Revalidate (SWR) cache
 * for instant tab switching across Dashboard, Index, Settings, and Storage Clean Up.
 *
 * Notice: Synchronous reads only read the module-level `memoryCache`, which is empty
 * on SSR and initial JS boot — guaranteeing zero React hydration mismatches on reload,
 * while giving 0ms instant mounts on all App Router client-side tab navigations.
 */

const SESSION_PREFIX = "contentpipe:swr:v1:";
const memoryCache = new Map<string, unknown>();

export function getSessionCache<T>(key: string): T | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  return null;
}

export function hydrateSessionCacheFromStorage<T>(key: string): T | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function setSessionCache<T>(key: string, value: T): void {
  memoryCache.set(key, value);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota errors in private mode
  }
}

export function removeSessionCache(keyOrPrefix: string, isPrefix = false): void {
  if (isPrefix) {
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(keyOrPrefix)) memoryCache.delete(k);
    }
    if (typeof window !== "undefined") {
      try {
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const storageKey = window.sessionStorage.key(i);
          if (storageKey && storageKey.startsWith(`${SESSION_PREFIX}${keyOrPrefix}`)) {
            window.sessionStorage.removeItem(storageKey);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
    return;
  }

  memoryCache.delete(keyOrPrefix);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(`${SESSION_PREFIX}${keyOrPrefix}`);
    } catch {
      // Ignore storage errors
    }
  }
}

export function invalidateDashboardCache(): void {
  removeSessionCache("creator-dashboard", true);
  removeSessionCache("team-dashboard", true);
}

export function clearAllSessionCache(): void {
  memoryCache.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const storageKey = window.sessionStorage.key(i);
      if (storageKey && storageKey.startsWith(SESSION_PREFIX)) {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage errors
  }
}
