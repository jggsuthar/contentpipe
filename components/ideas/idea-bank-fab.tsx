"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Lightbulb } from "lucide-react";
import {
  IdeaBankModal,
  IdeaBankItem,
  BrandOption,
  ContentSeriesOption,
} from "@/components/ideas/idea-bank-modal";

export function IdeaBankFab() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const isCreator =
    status === "authenticated" && session?.user?.role === "creator";

  const [isOpen, setIsOpen] = useState(false);
  const [ideas, setIdeas] = useState<IdeaBankItem[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentSeriesOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [isQueryFullscreen, setIsQueryFullscreen] = useState(false);

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

  const fetchIdeasAndMeta = useCallback(async () => {
    if (!isCreator) return;
    setLoading(true);
    try {
      const [ideasRes, brandsRes, typesRes] = await Promise.all([
        fetch("/api/ideas?all=true"),
        fetch("/api/settings/brands"),
        fetch("/api/settings/content-types"),
      ]);

      if (ideasRes.ok) {
        const ideasData = await ideasRes.json();
        setIdeas(Array.isArray(ideasData) ? ideasData : []);
      }
      if (brandsRes.ok) {
        const brandsData = await brandsRes.json();
        setBrands(Array.isArray(brandsData) ? brandsData : []);
      }
      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setContentTypes(Array.isArray(typesData) ? typesData : []);
      }
    } catch (err) {
      console.error("Error loading Idea Bank metadata:", err);
    } finally {
      setLoading(false);
    }
  }, [isCreator]);

  useEffect(() => {
    if (isCreator) {
      fetchIdeasAndMeta();
    }
  }, [isCreator, fetchIdeasAndMeta]);

  useEffect(() => {
    if (isOpen && isCreator) {
      fetchIdeasAndMeta();
    }
  }, [isOpen, isCreator, fetchIdeasAndMeta]);

  useEffect(() => {
    if (!isCreator) return;
    const handleIdeasUpdated = () => {
      fetchIdeasAndMeta();
    };
    window.addEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
    return () =>
      window.removeEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
  }, [isCreator, fetchIdeasAndMeta]);

  // Global Alt + I keyboard shortcut
  useEffect(() => {
    if (!isCreator) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreator]);

  const hasMissingDetails = useMemo(
    () => ideas.some((i) => !i.brand_id || !i.content_type_id),
    [ideas]
  );

  const isHiddenRoute =
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/unauthorized";
  if (!isCreator || isHiddenRoute || isQueryFullscreen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 glass-floating rounded-full shadow-lg hover:scale-105 transition-all px-4 py-2.5 flex items-center gap-2 border border-border cursor-pointer group"
        title="Open Idea Bank (Alt + I)"
        aria-label="Open Idea Bank"
      >
        <span className="relative flex items-center justify-center text-amber-500">
          <Lightbulb className="w-4 h-4" />
          {hasMissingDetails && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-background absolute -top-1 -right-1"
              title="Some ideas are missing Brand or Content Pipe"
            />
          )}
        </span>
        <span className="text-xs font-bold tracking-tight text-foreground">
          Idea Bank
        </span>
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 leading-none">
          {ideas.length}
        </span>
      </button>

      <IdeaBankModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        ideas={ideas}
        loading={loading}
        brands={brands}
        contentTypes={contentTypes}
        onRefreshIdeas={fetchIdeasAndMeta}
        onIdeaCreated={(created) => {
          setIdeas((prev) => [created, ...prev]);
        }}
        onIdeaUpdated={(updated) => {
          setIdeas((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }}
        onIdeaDeleted={(deletedId) => {
          setIdeas((prev) => prev.filter((item) => item.id !== deletedId));
        }}
      />
    </>
  );
}
