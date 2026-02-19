"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Login failed. Check your email and password.");
      return;
    }

    router.push("/admin/bookings");
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <div className="field full">
        <label htmlFor="admin-email">Admin email</label>
        <input id="admin-email" type="email" name="email" required />
      </div>
      <div className="field full">
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" name="password" required />
      </div>
      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
      {error ? <p className="notice error">{error}</p> : null}
    </form>
  );
}
