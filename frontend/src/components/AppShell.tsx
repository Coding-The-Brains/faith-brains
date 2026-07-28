"use client";

import { useEffect, useState } from "react";
import { isSignedIn } from "@/lib/auth";
import Sidebar from "./Sidebar";

// Signed-in desktop gets the sidebar shell; everyone else gets the plain page.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    isSignedIn().then(setSignedIn);
  }, []);

  if (!signedIn) return <>{children}</>;
  return (
    <>
      <Sidebar />
      <div className="flex min-h-screen flex-col xl:pl-60">{children}</div>
    </>
  );
}
