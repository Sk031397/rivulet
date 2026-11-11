"use client";

import { useEffect, useState } from "react";

/** Generic identity shown for the shared demo account (no real person's details). */
export const DEMO_PROFILE = {
  firstName: "Demo",
  lastName: "User",
  fullName: "Demo User",
  email: "demo@rivulet.app",
} as const;

/** True when this browser is in a demo session (cookie set by /api/demo). */
export function useIsDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(document.cookie.split("; ").includes("rivulet_demo=1"));
  }, []);
  return demo;
}
