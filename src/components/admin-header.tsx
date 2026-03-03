"use client";

import { useRouter } from "next/navigation";
import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";
import { ADMIN_NAV_ITEMS } from "@/lib/admin/config";

interface AdminHeaderProps {
  title: string;
}

export function AdminHeader({ title }: AdminHeaderProps) {
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.assign("/admin/login");
    }
  }

  return (
    <div className="admin-card booking-row admin-header-row" data-motion-item="admin-header-card">
      <h1 className="admin-console-title" data-motion-item="admin-title">
        {title}
      </h1>
      <div className="booking-row">
        {ADMIN_NAV_ITEMS.map((item) => (
          <button
            key={item.href}
            className="btn btn-secondary"
            type="button"
            onClick={() => router.push(item.href)}
          >
            {item.label}
          </button>
        ))}
        <AdminDeployUpdatesButton />
        <button
          className="btn btn-secondary"
          type="button"
          data-motion-item="admin-logout"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
