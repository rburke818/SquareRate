"use client";

import { useSupport, type SupportTopic } from "@/lib/support-context";

/**
 * Opens the shared support panel. Extracted so `Footer` can stay a Server
 * Component and only this one control ships as client JavaScript.
 */
export function SupportLink({
  topic = "question",
  children,
  className,
}: {
  topic?: SupportTopic;
  children: React.ReactNode;
  className?: string;
}) {
  const { openSupport } = useSupport();

  return (
    <button
      type="button"
      onClick={() => openSupport(topic)}
      aria-haspopup="dialog"
      className={
        className ??
        "uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
      }
    >
      {children}
    </button>
  );
}
