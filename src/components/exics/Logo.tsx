import { cn } from "@/lib/utils";

// Minimal abstract monochrome logo mark — concentric arcs
export function Logo({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("text-foreground", className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path
        d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5M12 17.5A5.5 5.5 0 0 1 6.5 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
