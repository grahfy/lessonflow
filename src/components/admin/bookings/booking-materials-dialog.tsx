"use client";

import { RefObject } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime, formatBytes } from "@/lib/admin/formatters";
import { type LearningMaterialRow, type LearningMaterialBooking, LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";

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
  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title="Learning Materials"
      footer={<button className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <div className="materials-dialog-content">
        <AdminCard style={{ marginBottom: '20px' }}>
          <h4>Upload New Material</h4>
          <form ref={uploadFormRef} onSubmit={e => e.preventDefault()}>
            <AdminForm>
              <AdminField label="Select File" required>
                <input type="file" name="file" accept={LEARNING_MATERIAL_ACCEPT} />
              </AdminField>
              <button 
                className="btn btn-primary" 
                disabled={materialsUploading} 
                onClick={onUpload}
                style={{ marginTop: '10px' }}
              >
                {materialsUploading ? 'Uploading...' : 'Upload File'}
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
          <div className="materials-list" style={{ display: 'grid', gap: '10px' }}>
            {materialsList.map(m => (
              <AdminCard key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px' }}>
                <div>
                  <strong>{m.title}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-2)' }}>
                    {m.mimeType} · {formatBytes(m.sizeBytes)} · {formatDateTime(m.createdAt)}
                  </div>
                </div>
                <div className="button-row">
                  <button className="btn btn-secondary" onClick={() => window.open(m.previewUrl, '_blank')}>View</button>
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
