"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="error-boundary">
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. Please try again.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
