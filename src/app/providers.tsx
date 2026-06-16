"use client";

import { SessionProvider } from "next-auth/react";
import { SiteHeader } from "@/components/site-header";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SiteHeader />
      {children}
    </SessionProvider>
  );
}
