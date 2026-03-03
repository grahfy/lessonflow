"use client";

import { RefObject, useId, useState } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime, formatBytes } from "@/lib/admin/formatters";
import { type LearningMaterialRow, LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";

interface BookingMaterialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  materialsList: LearningMaterialRow[];
  materialsLoading: boolean;
  materialsUploading: boolean;
  onUpload: () => void;
  onDelete: (id: string) => void;
  uploadFormRef: RefObject<HTMLFormElement | null>;
}

export function BookingMaterialsDialog({
  isOpen,
  onClose,
  rootRef,
  materialsList,
  materialsLoading,
  materialsUploading,
  onUpload,
  onDelete,
  uploadFormRef
}: BookingMaterialsDialogProps) {
  const fileInputId = useId();
  const [selectedFileName, setSelectedFileName] = useState("No file selected");

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title="Learning Materials"
      wide
      footer={<button className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <div className="dialog-tab-stack materials-dialog-content">
        <AdminCard style={{ marginBottom: "20px" }}>
          <h4>Upload New Material</h4>
          <form
            ref={uploadFormRef}
            onSubmit={(e) => e.preventDefault()}
            onReset={() => setSelectedFileName("No file selected")}
          >
            <AdminForm style={{ width: "100%", gap: "12px" }}>
              <AdminField label="Select File" required fullWidth>
                <input
                  id={fileInputId}
                  type="file"
                  name="file"
                  accept={LEARNING_MATERIAL_ACCEPT}
                  style={{
                    position: "absolute",
                    width: "1px",
                    height: "1px",
                    padding: 0,
                    margin: "-1px",
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    border: 0
                  }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    setSelectedFileName(file?.name || "No file selected");
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    gap: "10px",
                    alignItems: "center",
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.02)"
                  }}
                >
                  <label htmlFor={fileInputId} className="btn btn-secondary" style={{ margin: 0 }}>
                    Browse...
                  </label>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: "0.82rem",
                      color: "var(--ink-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                    title={selectedFileName}
                  >
                    {selectedFileName}
                  </span>
                </div>
              </AdminField>
              <button 
                className="btn btn-primary" 
                disabled={materialsUploading} 
                onClick={onUpload}
                style={{ marginTop: "10px", width: "100%" }}
              >
                {materialsUploading ? "Uploading..." : "Upload File"}
              </button>
            </AdminForm>
          </form>
        </AdminCard>

        <h4>Existing Materials</h4>
        {materialsLoading ? (
          <p className="helper-text">Loading...</p>
        ) : materialsList.length === 0 ? (
          <p className="helper-text">No materials uploaded for this booking.</p>
        ) : (
          <div className="materials-list" style={{ display: "grid", gap: "10px", maxHeight: "280px", overflowY: "auto", paddingRight: "2px" }}>
            {materialsList.map((m) => (
              <AdminCard key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px" }}>
                <div>
                  <strong>{m.title}</strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>
                    {m.mimeType} · {formatBytes(m.sizeBytes)} · {formatDateTime(m.createdAt)}
                  </div>
                </div>
                <div className="button-row">
                  <button className="btn btn-secondary" onClick={() => window.open(m.previewUrl, "_blank")}>View</button>
                  <button className="btn btn-danger" onClick={() => onDelete(m.id)}>Delete</button>
                </div>
              </AdminCard>
            ))}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
