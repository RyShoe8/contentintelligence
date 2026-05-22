"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Thin bar under the header while route content is loading after a nav click. */
export function NavigationProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const prevPath = useRef(pathname);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setPending(false);
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    }
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("http")) {
        return;
      }
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      setPending(true);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setPending(false), 12_000);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      className="h-0.5 w-full overflow-hidden bg-[var(--border)]"
      role="progressbar"
      aria-label="Loading page"
    >
      <div className="h-full w-1/3 animate-pulse bg-[var(--accent)]" />
    </div>
  );
}
