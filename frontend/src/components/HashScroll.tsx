"use client";

import { useEffect } from "react";

// App Router client navigations don't scroll to #anchors on server-rendered
// pages; "jump to verse 2:255" was landing at the top. This nudges the target
// into view after mount (verse cards carry scroll-mt for the sticky header).
export default function HashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, []);
  return null;
}
