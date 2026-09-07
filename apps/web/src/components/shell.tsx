"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
  Home,
  Activity,
  Map,
  ChartNoAxesCombined,
  CalendarDays,
  Flag,
  Bike,
  MessageCircle,
  Settings,
  Upload,
  Heart,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@convex/_generated/api";
const links = [
  ["/home", "Home", Home],
  ["/activities", "Activities", Activity],
  ["/records", "Records", Activity],
  ["/maps", "Maps", Map],
  ["/analysis", "Analysis", ChartNoAxesCombined],
  ["/calendar", "Calendar", CalendarDays],
  ["/goals", "Goals", Flag],
  ["/gear", "Gear", Bike],
  ["/health", "Recovery", Heart],
  ["/ask", "Ask Kinetexa", MessageCircle],
  ["/sharing", "Sharing", ArrowUpRight],
  ["/settings", "Settings", Settings],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    { isAuthenticated } = useConvexAuth(),
    ensure = useAction(api.athletes.ensure),
    profile = useQuery(api.athletes.current, isAuthenticated ? {} : "skip");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (isAuthenticated)
      ensure().catch(() =>
        setError("Your account could not be opened. Reload to retry."),
      );
  }, [isAuthenticated, ensure]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="rail">
        <Link href="/home" className="wordmark">
          kinetexa<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={pathname.startsWith(href) ? "active" : ""}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-bottom">
          <Link href="/billing">
            Your plan <ArrowUpRight size={16} />
          </Link>
          <Link href="/settings">{profile?.displayName ?? "Your account"}</Link>
          <a href="/sign-out">Sign out</a>
        </div>
      </aside>
      <main id="content" className="workspace">
        <header className="workspace-top">
          <span>Private training workspace</span>
          <button
            className="mobile-menu-button secondary"
            aria-expanded={menuOpen}
            aria-controls="all-pages"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Menu
          </button>
          <Link className="button small" href="/import">
            <Upload size={16} /> Import activities
          </Link>
        </header>
        {menuOpen && (
          <nav
            id="all-pages"
            className="all-pages surface"
            aria-label="All pages"
          >
            {links.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <Link href="/billing">Your plan</Link>
            <a href="/sign-out">Sign out</a>
          </nav>
        )}
        {error ? (
          <p role="alert">{error}</p>
        ) : !profile ? (
          <p className="loading">Opening your training history…</p>
        ) : !profile.onboarded ? (
          <Onboarding />
        ) : (
          children
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links
          .filter(([href]) =>
            ["/home", "/activities", "/maps", "/ask", "/settings"].includes(
              href,
            ),
          )
          .map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label === "Ask Kinetexa" ? "Ask" : label}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}
function Onboarding() {
  const update = useMutation(api.athletes.updateProfile),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="onboarding">
      <h1>Your training belongs to you.</h1>
      <p>
        Start with a private account. Import your own files, explore your
        history and decide what you share.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await update({
              displayName: String(f.get("name")),
              timezone: String(f.get("timezone")),
              units: "metric",
              aiConsent: f.get("ai") === "on",
              analyticsConsent: f.get("analytics") === "on",
            });
          } catch {
            setError("Check your name and time zone, then try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Display name
          <input
            name="name"
            autoComplete="given-name"
            required
            maxLength={80}
          />
        </label>
        <label>
          Time zone
          <input
            name="timezone"
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            required
          />
        </label>
        <div className="privacy-note">
          <strong>Private from the start</strong>
          <p>
            Your activities, routes and recovery data are visible only to you.
            Public links require a separate choice.
          </p>
        </div>
        <label className="check">
          <input type="checkbox" name="ai" /> Allow AI to process relevant
          fitness summaries when I ask a question. Optional.
        </label>
        <label className="check">
          <input type="checkbox" name="analytics" /> Share anonymous product
          usage events to help improve Kinetexa. Optional.
        </label>
        <p className="muted">
          You can change either choice in Settings.{" "}
          <Link href="/privacy">Read the privacy policy</Link>.
        </p>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>
          {busy ? "Saving…" : "Open my workspace"}
        </button>
      </form>
    </section>
  );
}
