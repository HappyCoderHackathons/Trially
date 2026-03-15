"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export interface AppHeaderProps {
  /** Optional back link (e.g. to home or previous page). Renders an arrow before the logo. */
  backLink?: { href: string; label?: string }
  /** Show a "Dashboard" link next to the branding. */
  showDashboardLink?: boolean
  /** Show the theme toggle on the right. Default true. */
  showThemeToggle?: boolean
  /** Optional extra class for the header container (e.g. sticky, max-width). */
  className?: string
}

export function AppHeader({
  backLink,
  showDashboardLink = false,
  showThemeToggle = true,
  className = "",
}: AppHeaderProps) {
  return (
    <header
      className={
        `flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6 ${className}`.trim()
      }
    >
      <div className="flex items-center gap-5">
        {backLink && (
          <Link
            href={backLink.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={backLink.label ?? "Back"}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <Link href="/" className="flex items-center gap-2 text-primary">
          <Image
            src="/trially-logo.jpg"
            alt=""
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="text-base font-light tracking-wide">Trially</span>
        </Link>
        {showDashboardLink && (
          <Link
            href="/dashboard"
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
        )}
      </div>
      {showThemeToggle && <ThemeToggle />}
    </header>
  )
}
