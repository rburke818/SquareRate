"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { resolvePlan } from "@/lib/plans";
import {
  DISCORD_INVITE_URL,
  SUPPORT_EMAIL,
  SUPPORT_WEBHOOK_URL,
} from "@/lib/site";
import { useSupport, type SupportTopic } from "@/lib/support-context";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Screenshots ride along inside the JSON body as a base64 data URL rather than
 * as multipart, so n8n receives one parseable payload. Base64 inflates by ~33%,
 * so this cap keeps the worst case comfortably inside n8n's default body limit.
 */
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Diagnostic context attached to every submission. A bug report without this is
 * close to useless — "the scan didn't work" can't be actioned, but the same
 * message alongside the uid, plan and the exact job URL usually can be.
 */
function collectContext(pathname: string, plan: string, uid?: string) {
  return {
    uid: uid ?? null,
    plan,
    path: pathname,
    url: typeof window === "undefined" ? null : window.location.href,
    userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
    viewport:
      typeof window === "undefined"
        ? null
        : `${window.innerWidth}x${window.innerHeight}`,
    submittedAt: new Date().toISOString(),
  };
}

/** Prefilled mailto used when n8n is unreachable or not configured. */
function mailtoFallback(
  topic: SupportTopic,
  message: string,
  context: ReturnType<typeof collectContext>,
): string {
  const subject =
    topic === "bug" ? "SquareRate bug report" : "SquareRate question";
  const body = [
    message,
    "",
    "---",
    `Plan: ${context.plan}`,
    `Page: ${context.url ?? context.path}`,
    `Account: ${context.uid ?? "signed out"}`,
    `Browser: ${context.userAgent ?? "unknown"}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

/**
 * Floating "Report a bug" toggle plus the support panel it opens.
 *
 * Mounted once in the root layout. The panel is also opened from the footer's
 * Contact link via `SupportProvider`, so there's a single form for both bug
 * reports and general questions.
 */
export function SupportWidget() {
  const { open, topic, openSupport, closeSupport } = useSupport();
  const pathname = usePathname();

  // The floating toggle belongs on the app surfaces, where a user actually
  // hits bugs. Marketing and legal pages get the footer's Contact link
  // instead — the fixed button would otherwise sit on top of the footer nav
  // once you scroll to the bottom of those pages.
  const showFloatingButton =
    pathname.startsWith("/dashboard") || pathname.startsWith("/job");

  return (
    <>
      {!open && showFloatingButton ? (
        <button
          type="button"
          onClick={() => openSupport("bug")}
          aria-haspopup="dialog"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border border-charcoal bg-paper px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-charcoal shadow-sm transition-colors hover:bg-charcoal hover:text-paper"
        >
          <BugGlyph />
          Report a bug
        </button>
      ) : null}

      {open ? <SupportPanel topic={topic} onClose={closeSupport} /> : null}
    </>
  );
}

function SupportPanel({
  topic: initialTopic,
  onClose,
}: {
  topic: SupportTopic;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, userDoc } = useAuth();
  const plan = resolvePlan(userDoc);

  const [topic, setTopic] = useState<SupportTopic>(initialTopic);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  // `null` means the user hasn't touched the field, so it falls back to their
  // signed-in address — which may only resolve after first paint. Deriving it
  // rather than syncing auth into state with an effect keeps the two from
  // fighting when auth loads late.
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const email = emailInput ?? user?.email ?? "";
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    messageRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const context = collectContext(pathname, plan.label, user?.uid);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input so removing an image and re-picking the same file still
    // fires a change event.
    event.target.value = "";
    setFileError(null);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFileError("That isn't an image — PNG, JPG, GIF or HEIC only.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setFileError(
        `That image is ${formatBytes(file.size)}. Keep it under ${formatBytes(
          MAX_SCREENSHOT_BYTES,
        )}.`,
      );
      return;
    }

    try {
      setAttachment({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readAsDataUrl(file),
      });
    } catch {
      setFileError("Couldn't read that file. Try a different one.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorText(null);

    if (!SUPPORT_WEBHOOK_URL) {
      setStatus("error");
      setErrorText(
        "The in-app form isn't connected yet. Use the email link below and we'll get straight back to you.",
      );
      return;
    }

    try {
      const response = await fetch(SUPPORT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          name,
          email,
          message,
          context,
          attachment,
        }),
      });
      if (!response.ok) {
        throw new Error(`Support webhook responded with ${response.status}`);
      }
      setStatus("sent");
    } catch (err) {
      console.error("[SupportWidget] submission failed", err);
      setStatus("error");
      setErrorText(
        "That didn't send. Your message is still in the box — you can email it to us instead.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-panel-title"
    >
      {/* Click-to-dismiss scrim. Hidden from assistive tech so it doesn't
          announce a second "Close" alongside the real one; Escape and the
          header button remain the keyboard paths out. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-charcoal/40"
      />

      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-y-auto border border-charcoal bg-paper">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span
            id="support-panel-title"
            className="text-[11px] uppercase tracking-[0.22em] text-muted"
          >
            {status === "sent" ? "Message sent" : "Get in touch"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
          >
            Close
          </button>
        </div>

        {status === "sent" ? (
          <div className="px-6 py-10 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-charcoal">
              Got it — thanks
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-graphite">
              We&rsquo;ll reply to{" "}
              <span className="text-charcoal">{email || SUPPORT_EMAIL}</span>.
              If it&rsquo;s urgent, the Discord is the fastest way to reach us.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full bg-charcoal py-3 text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
            <div className="grid grid-cols-2 border border-line">
              {(["bug", "question"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTopic(value)}
                  aria-pressed={topic === value}
                  className={`py-2.5 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                    topic === value
                      ? "bg-charcoal text-paper"
                      : "bg-paper text-graphite hover:bg-mist"
                  }`}
                >
                  {value === "bug" ? "Report a bug" : "Ask a question"}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                Name
              </span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
                placeholder="Your name"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
                placeholder="you@company.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                {topic === "bug" ? "What went wrong?" : "How can we help?"}
              </span>
              <textarea
                ref={messageRef}
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full resize-y border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
                placeholder={
                  topic === "bug"
                    ? "Describe what happened in as much detail as you can — what you were doing, what you expected, and what the app did instead. Screenshots help a lot."
                    : "Tell us what you need."
                }
              />
            </label>

            <div>
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                Screenshot — optional
              </span>

              {attachment ? (
                <div className="flex items-center gap-3 border border-line p-2">
                  {/* Plain <img>: the source is an in-memory data URL, which
                      next/image can neither optimize nor size ahead of time. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.dataUrl}
                    alt={`Preview of ${attachment.name}`}
                    className="h-12 w-12 shrink-0 border border-line object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-charcoal">
                      {attachment.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {formatBytes(attachment.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center border border-dashed border-line px-3 py-4 text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:border-charcoal hover:text-charcoal">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  Attach an image
                </label>
              )}

              {fileError ? (
                <p className="mt-2 border border-charcoal bg-mist px-3 py-2 text-xs text-charcoal">
                  {fileError}
                </p>
              ) : null}
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              We attach your plan, the page you&rsquo;re on and your browser
              version so we can reproduce the problem. Nothing else.
            </p>

            {errorText ? (
              <p className="border border-charcoal bg-mist px-3 py-2 text-xs text-charcoal">
                {errorText}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-charcoal py-3 text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>

            {attachment ? (
              <p className="text-[11px] leading-relaxed text-muted">
                Heads up: emailing instead won&rsquo;t carry your image —
                you&rsquo;ll need to attach it again in your mail app.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[11px]">
              <a
                href={mailtoFallback(topic, message, context)}
                className="uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
              >
                Email us instead
              </a>
              {DISCORD_INVITE_URL ? (
                <a
                  href={DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
                >
                  Join our Discord
                </a>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function BugGlyph() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <rect x="5" y="5.5" width="6" height="7.5" />
      <path d="M6 3.5 A2 2 0 0 1 10 3.5" />
      <path d="M5 7.5H2M14 7.5h-3M5 11H2.5M13.5 11H11M5 4.5 3.5 3M11 4.5 12.5 3" />
    </svg>
  );
}
