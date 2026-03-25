"use client";

import * as React from "react";
import { useRef, useState } from "react";
import Papa from "papaparse";

import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

interface ImportCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * CSV import dialog for bulk customer creation.
 *
 * RATIONALE: Parsing happens client-side so obvious CSV structure errors can be
 * caught before the admin import route spends time validating each row.
 */
export function ImportCustomersDialog({ open, onOpenChange, onSuccess }: ImportCustomersDialogProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { safeFetch, handleApiError } = useSafeFetch({
    onError: (message) => setError(message)
  });

  const closeDialog = () => {
    onOpenChange(false);
    setError(null);
    setNotice(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setNotice(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // NOTE: We send Papa's row objects directly because the server route
          // owns header aliasing, normalization, dedupe, and partial-success reporting.
          const response = await safeFetch("/api/admin/customers/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customers: results.data }),
          });

          if (!response.ok) {
            await handleApiError(response, "Import failed");
            return;
          }

          const data = await response.json() as { importedCount?: number; errors?: unknown[] };
          const importedCount = data.importedCount ?? 0;
          const failedCount = Array.isArray(data.errors) ? data.errors.length : 0;

          if (failedCount > 0) {
            console.warn("Import completed with some errors:", data.errors);
            setNotice(`Imported ${importedCount} customers. ${failedCount} row${failedCount === 1 ? "" : "s"} failed. Check the browser console for details.`);
          } else {
            setNotice(`Successfully imported ${importedCount} customers.`);
          }

          onSuccess();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "An error occurred during import.");
        } finally {
          setIsImporting(false);
          event.target.value = "";
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsImporting(false);
      }
    });
  };

  return (
    <AdminDialog
      isOpen={open}
      onClose={closeDialog}
      rootRef={rootRef}
      title="Import Customers"
      size="compact"
      id="import-customers-dialog"
      footer={(
        <div className="dialog-footer-row dialog-footer-row-end">
          <button className="btn btn-secondary" type="button" onClick={closeDialog}>
            Close
          </button>
        </div>
      )}
    >
      <div className="import-customers-dialog">
        <p className="helper-text">
          Upload a CSV file with customer records. Required columns are <code>first_name</code>, <code>last_name</code>, and <code>email</code>.
        </p>

        <AdminNoticeStack error={error ?? undefined} notice={notice ?? undefined} loading={isImporting} loadingLabel="Importing customers..." />

        <div className="import-customers-dropzone">
          <label htmlFor="csv-upload" className="import-customers-dropzone-label">
            <strong>{isImporting ? "Importing..." : "Select CSV File"}</strong>
            <span className="helper-text">Choose a CSV export and the admin import route will validate each row.</span>
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            className="import-customers-input"
            onChange={handleFileUpload}
            disabled={isImporting}
          />
        </div>

        <div className="import-customers-columns">
          <span className="admin-workspace-chip">first_name</span>
          <span className="admin-workspace-chip">last_name</span>
          <span className="admin-workspace-chip">email</span>
        </div>
        <p className="helper-text">Large imports may complete with partial success, so row-level failures are reported separately from successful records.</p>
      </div>
    </AdminDialog>
  );
}
