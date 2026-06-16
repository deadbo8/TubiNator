"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

// Routes where the app chrome should NOT appear.
const HIDDEN = ["/", "/login", "/register"];

export function SiteHeader() {
  const pathname = usePathname();
  const { status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [due, setDue] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setIsAdmin(Boolean(d?.isAdmin));
        setDue(Number(d?.stats?.dueReviews ?? 0));
      })
      .catch(() => {});
  }, [status, pathname]);

  if (status !== "authenticated") return null;
  if (HIDDEN.includes(pathname)) return null;

  const link = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 text-sm transition ${
          active ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  const reviewLink = () => {
    const active = pathname === "/review";
    return (
      <Link
        href="/review"
        className={`relative rounded-lg px-3 py-1.5 text-sm transition ${
          active ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
        }`}
      >
        Review
        {due > 0 && (
          <span className="ml-1 rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-[10px] font-semibold text-black">
            {due}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            Tubi<span className="text-[hsl(var(--primary))]">nator</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {link("/dashboard", "Dashboard")}
          {link("/explore", "Explore")}
          {reviewLink()}
          {link("/generate", "New course")}
          {link("/settings", "Settings")}
          {isAdmin && link("/admin", "Admin")}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="ml-1 rounded-lg px-3 py-1.5 text-sm text-white/60 transition hover:text-white"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
