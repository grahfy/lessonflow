import type { ReactNode } from "react";

const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL;

/**
 * Minimal, self-contained branded card layout shared by the public pay flow
 * (the pay page plus the success/cancelled landing pages) so it does not depend
 * on authenticated app chrome and stays visually consistent across the flow.
 */
export function StatusShell({
  title,
  business,
  children,
}: {
  title: string;
  business?: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        padding: "1.5rem",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "28rem",
          background: "#ffffff",
          borderRadius: "0.75rem",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
          padding: "2rem",
        }}
      >
        {LOGO_URL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOGO_URL}
            alt={business ? `${business} logo` : "Logo"}
            style={{
              height: "2.25rem",
              width: "auto",
              marginBottom: "1rem",
              display: "block",
            }}
          />
        ) : null}
        {business ? (
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {business}
          </p>
        ) : null}
        <h1 style={{ fontSize: "1.4rem", margin: "0.5rem 0 1rem" }}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
