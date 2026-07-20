"use client";

import { FirebaseError } from "firebase/app";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";

type Mode = "login" | "signup";

function describeAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "That email is already registered. Try signing in instead.";
      case "auth/invalid-email":
        return "That email address is not valid.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/popup-closed-by-user":
        return "Google sign-in was cancelled.";
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, signupWithEmail, loginWithEmail, loginWithGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signupWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-12 flex justify-center">
          <Logo href="/auth" />
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-charcoal">
            {mode === "login" ? "Sign in" : "Create an account"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "login"
              ? "Measure surfaces in seconds."
              : "Start your trial. No credit card."}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 border border-line">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`py-2.5 text-xs uppercase tracking-[0.18em] transition-colors ${
              mode === "login"
                ? "bg-charcoal text-paper"
                : "bg-paper text-graphite hover:bg-mist"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`py-2.5 text-xs uppercase tracking-[0.18em] transition-colors ${
              mode === "signup"
                ? "bg-charcoal text-paper"
                : "bg-paper text-graphite hover:bg-mist"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="border border-charcoal bg-mist px-3 py-2 text-xs text-charcoal">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-charcoal py-3 text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite disabled:opacity-50"
          >
            {submitting
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-3 border border-charcoal bg-paper py-3 text-sm font-medium uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist disabled:opacity-50"
        >
          <GoogleGlyph />
          Continue with Google
        </button>
      </div>
      </main>
      <Footer />
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
