"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";

export default function RootRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/auth");
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-sm tracking-widest uppercase text-muted">Loading</p>
    </main>
  );
}
