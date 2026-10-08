import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { getSessionUser } from "@/lib/auth";

/**
 * The status board is public: anonymous visitors read it and are invited to
 * sign in only when they try to report or subscribe. Pages that need an
 * account redirect themselves.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <Shell user={user}>{children}</Shell>;
}
