"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface LogoProps {
  /**
   * If provided, clicking the logo runs this callback before navigating.
   * Used by the dashboard to reset local state when the user clicks the
   * logo while already on /dashboard.
   */
  onReset?: () => void;
  href?: string;
}

export function Logo({ onReset, href = "/dashboard" }: LogoProps) {
  const router = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onReset) {
      event.preventDefault();
      onReset();
      router.push(href);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="group inline-flex items-center gap-2 select-none"
      aria-label="SquareRate — back to dashboard"
    >
      <span
        aria-hidden
        className="inline-block h-4 w-4 border border-charcoal bg-charcoal transition-colors group-hover:bg-paper"
      />
      <span className="text-[15px] font-medium tracking-tight text-charcoal">
        SquareRate
      </span>
    </Link>
  );
}
