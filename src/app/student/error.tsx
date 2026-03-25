"use client";

import { useEffect } from "react";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student portal error:", error);
  }, [error]);

  return (
    <div className="error-boundary">
      <h1>Something went wrong</h1>
      <p>An error occurred in the student portal. Please try again or return to login.</p>
      <div className="error-boundary-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/student/login" className="btn btn-secondary">
          Back to login
        </a>
      </div>
    </div>
  );
}
