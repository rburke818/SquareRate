"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** What the user is reaching out about. Drives the form copy and the subject. */
export type SupportTopic = "bug" | "question";

interface SupportContextValue {
  open: boolean;
  topic: SupportTopic;
  openSupport: (topic?: SupportTopic) => void;
  closeSupport: () => void;
}

const SupportContext = createContext<SupportContextValue | undefined>(undefined);

/**
 * Holds the open/closed state of the support panel so it can be triggered from
 * anywhere — the floating "Report a bug" toggle, the footer's Contact link, or
 * an error banner — while the panel itself is mounted once in the root layout.
 */
export function SupportProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<SupportTopic>("bug");

  const openSupport = useCallback((next: SupportTopic = "bug") => {
    setTopic(next);
    setOpen(true);
  }, []);

  const closeSupport = useCallback(() => setOpen(false), []);

  const value = useMemo<SupportContextValue>(
    () => ({ open, topic, openSupport, closeSupport }),
    [open, topic, openSupport, closeSupport],
  );

  return (
    <SupportContext.Provider value={value}>{children}</SupportContext.Provider>
  );
}

export function useSupport(): SupportContextValue {
  const ctx = useContext(SupportContext);
  if (!ctx) {
    throw new Error("useSupport must be used inside <SupportProvider>");
  }
  return ctx;
}
