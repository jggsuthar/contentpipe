"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RootPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user?.email) {
      router.replace("/login");
      return;
    }

    const role = session.user.role;
    if (role === "creator") {
      router.replace("/creator/dashboard");
    } else if (role === "team") {
      router.replace("/team/dashboard");
    } else {
      router.replace("/login?error=Unauthorized");
    }
  }, [session, status, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 font-mono text-xs text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span>Directing to your workspace...</span>
    </div>
  );
}
