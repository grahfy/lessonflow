"use client";

import { redirect } from "next/navigation";
import { useEffect, useState, useRef } from "react";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { isSetupComplete } from "@/lib/setup";

export interface RequireAdminProps {
  children: React.ReactNode;
}

/**
 * Authentication guard for admin routes.
 * Checks setup completion and admin authentication, redirecting as needed.
 */
export function RequireAdmin({ children }: RequireAdminProps) {
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);

  useEffect(() => {
    void (async () => {
      if (redirectingRef.current) return;
      
      const setupComplete = await isSetupComplete();
      if (!setupComplete) {
        redirectingRef.current = true;
        redirect("/setup");
        return;
      }

      const admin = await getCurrentAdmin();
      if (!admin) {
        redirectingRef.current = true;
        redirect("/admin/login");
        return;
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="loading-shell">
        <div className="loading-spinner" />
        <style>{`
          .loading-shell {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: var(--paper);
          }
          .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--ink-4);
            border-top-color: var(--ink-1);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
