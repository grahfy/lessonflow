"use client";

import { useId, useState } from "react";
import type { RefObject } from "react";
import Image from "next/image";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { LEARNING_MATERIAL_ACCEPT, type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";
import { formatDateTime } from "@/lib/admin/utils";

interface AdminMaterialsPanelProps {
  materialsLoading: boolean;
  materialsList: LearningMaterialRow[];
  materialsUploading: boolean;
  materialsDeletingId: string | null;
  uploadFormRef: RefObject<HTMLFormElement | null>;
  onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
  onDelete: (id: string) => void;
  bookingField?: {
    bookingId: string;
    bookings: LearningMaterialBooking[];
    onChange: (bookingId: string) => void;
  };
}

/**
 * Reusable panel for viewing and uploading student learning materials.
 *
 * RATIONALE: Booking/customer dialogs share the same material workflow but
 * differ slightly in upload context. Keeping the view/upload UI here ensures
 * captcha rules, file affordances, and booking-assignment behavior stay aligned.
 */
export function AdminMaterialsPanel({
  materialsLoading,
  materialsList,
  materialsUploading,
  materialsDeletingId,
  uploadFormRef,
  onUpload,
  onDelete,
  bookingField
}: AdminMaterialsPanelProps) {
  const fileInputId = useId();
  const captcha = useCaptcha();
  const [selectedFileName, setSelectedFileName] = useState("No file selected");

  /**
   * Validates the human check before handing the actual file upload off to the
   * parent mutation handler.
   */
  function handleUpload() {
    if (!captcha.validateAnswer()) {
      return;
    }

    onUpload(captcha.getPayload());
    // NOTE: Each upload attempt gets a fresh challenge to prevent accidental
    // replay with a stale captcha answer after the form contents change.
    void captcha.regenerate();
  }

  return (
    <>
      <div className="dialog-col dialog-tab-section">
        <h3 className="manual-section-title">Materials List</h3>
        <AdminCard ghost className="customer-materials-list-card">
          {materialsLoading ? (
            <p className="helper-text">Loading materials...</p>
          ) : materialsList.length > 0 ? (
            <div className="customer-materials-list">
              {materialsList.map((material) => (
                <div key={material.id} className="customer-materials-item">
                  <div className="customer-materials-item-head">
                    <div className="customer-materials-item-copy">
                      <strong>{material.description || material.title}</strong>
                      <span>
                        {material.mimeType} · {(material.sizeBytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {formatDateTime(material.createdAt)}
                      </span>
                      {material.description ? (
                        <span className="helper-text">{material.title}</span>
                      ) : null}
                    </div>
                    <div className="customer-materials-item-actions">
                      <Tooltip content="Open material in a new tab.">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() =>
                            // RATIONALE: Admins often need the browser's native
                            // PDF/audio/image controls, so we open the raw file
                            // route instead of rendering previews inline only.
                            window.open(`/api/admin/learning-materials/${material.id}`, "_blank")
                          }
                        >
                          View
                        </button>
                      </Tooltip>
                      <Tooltip content="Permanently remove this material.">
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={materialsDeletingId === material.id}
                          onClick={() => void onDelete(material.id)}
                        >
                          {materialsDeletingId === material.id ? "Deleting..." : "Delete"}
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {material.mimeType.startsWith("audio/") || material.mimeType === "audio/mpeg" ? (
                    <audio
                      controls
                      src={`/api/admin/learning-materials/${material.id}`}
                      className="customer-materials-audio"
                    />
                  ) : null}

                  {material.mimeType.startsWith("image/") ? (
                    <Image
                      src={`/api/admin/learning-materials/${material.id}`}
                      alt={material.title}
                      width={480}
                      height={120}
                      unoptimized
                      className="customer-materials-image"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="helper-text">No materials found for this selection.</p>
          )}
        </AdminCard>
      </div>

      <div className="dialog-col dialog-tab-section">
        <h3 className="manual-section-title">Upload New</h3>
        <AdminCard ghost className="customer-materials-upload-card">
          <form
            ref={uploadFormRef}
            className="customer-materials-upload-form"
            onReset={() => setSelectedFileName("No file selected")}
          >
            <AdminForm className="customer-materials-upload-grid">
              {bookingField ? (
                <AdminField
                  label="Assign to lesson booking (optional)"
                  tooltip="Link this material to a specific lesson, or leave it unassigned so it stays available across the student's materials."
                  fullWidth
                >
                  <select
                    value={bookingField.bookingId}
                    onChange={(event) => bookingField.onChange(event.target.value)}
                  >
                    {/* RATIONALE: Unassigned uploads remain visible across the
                        student portal instead of disappearing with one lesson. */}
                    <option value="">Unassigned upload (all lessons)</option>
                    {bookingField.bookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {new Date(booking.startAt).toLocaleDateString("en-AU")}{" "}
                        {new Date(booking.startAt).toLocaleTimeString("en-AU", {
                          hour: "numeric",
                          minute: "2-digit"
                        })}
                      </option>
                    ))}
                  </select>
                </AdminField>
              ) : null}
              <AdminField label="Select file" tooltip="Choose the file to upload from your computer." fullWidth>
                <input
                  id={fileInputId}
                  type="file"
                  name="file"
                  accept={`${LEARNING_MATERIAL_ACCEPT},image/*`}
                  className="admin-visually-hidden-input"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    // NOTE: We mirror the selected filename outside the hidden
                    // native input so the custom button UI stays accessible.
                    setSelectedFileName(file?.name || "No file selected");
                  }}
                />
                <div className="customer-materials-file-picker">
                  <Tooltip content="Select a file from your device.">
                    <label htmlFor={fileInputId} className="btn btn-secondary">
                      Browse
                    </label>
                  </Tooltip>
                  <span className="customer-materials-file-name" title={selectedFileName}>
                    {selectedFileName}
                  </span>
                </div>
              </AdminField>
              <AdminField
                label="Description (optional)"
                tooltip="Provide context or instructions for this material."
                fullWidth
              >
                <textarea
                  name="description"
                  rows={2}
                  maxLength={500}
                  placeholder="E.g. Practice this fingerpicking pattern at 80 BPM"
                />
              </AdminField>
              <CaptchaField idPrefix="material-upload" captcha={captcha} />
              <Tooltip content="Upload the selected material.">
                <button
                  type="button"
                  disabled={materialsUploading}
                  onClick={handleUpload}
                  className="btn btn-primary customer-materials-upload-btn"
                >
                  {materialsUploading ? "Uploading..." : "Upload Material"}
                </button>
              </Tooltip>
            </AdminForm>
          </form>
        </AdminCard>
      </div>
    </>
  );
}
