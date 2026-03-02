"use client";

import { useRouter } from "next/navigation";
import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";

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
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/bookings")}
        >
          Bookings
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/customers")}
        >
          Customers
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/invoices")}
        >
          Invoices
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/reports")}
        >
          Reports
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/manual")}
        >
          Manual
        </button>
        <AdminDeployUpdatesButton />
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => router.push("/admin/settings")}
        >
          Settings
        </button>
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
