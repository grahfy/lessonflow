"use client";

import { useId, useRef, useState } from "react";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";
import styles from "./library.module.css";

interface LibraryUploadCardProps {
  uploading: boolean;
  onSubmit: (form: HTMLFormElement, captcha: { captchaToken: string; captchaAnswer: string }) => Promise<boolean>;
}

/**
 * Upload form for a new library item. Mirrors the customer-material upload —
 * same file allow-list and CAPTCHA parity (skipped in dev/test server-side) —
 * but has no customer/booking/folder context: the library is a flat shared store.
 */
export function LibraryUploadCard({ uploading, onSubmit }: LibraryUploadCardProps) {
  const fileInputId = useId();
  const captcha = useCaptcha();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("No file selected");

  async function handleUpload() {
    if (!formRef.current) return;
    if (!captcha.validateAnswer()) return;

    const ok = await onSubmit(formRef.current, captcha.getPayload());
    // Fresh challenge every attempt to avoid stale-answer replay.
    void captcha.regenerate();
    if (ok) {
      formRef.current.reset();
      setSelectedFileName("No file selected");
    }
  }

  return (
    <AdminCard ghost>
      <form ref={formRef} onReset={() => setSelectedFileName("No file selected")}>
        <AdminForm>
          <AdminField label="Title (optional)" tooltip="Defaults to the file name when left blank." fullWidth>
            <input type="text" name="title" maxLength={255} placeholder="e.g. Sweet Child O' Mine" />
          </AdminField>

          <AdminField label="Select file" tooltip="PDF, common audio, or image files up to 100MB." fullWidth>
            <input
              id={fileInputId}
              type="file"
              name="file"
              accept={`${LEARNING_MATERIAL_ACCEPT},image/*`}
              className="admin-visually-hidden-input"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setSelectedFileName(file?.name || "No file selected");
              }}
            />
            <div className={styles.fileButtonRow}>
              <Tooltip content="Select a file from your device.">
                <label htmlFor={fileInputId} className="btn btn-secondary">
                  Browse
                </label>
              </Tooltip>
              <span className={styles.fileName} title={selectedFileName}>
                {selectedFileName}
              </span>
            </div>
          </AdminField>

          <AdminField label="Description (optional)" tooltip="Context or practice notes shown with the item." fullWidth>
            <textarea name="description" rows={2} maxLength={500} placeholder="E.g. Intro riff, capo 2nd fret" />
          </AdminField>

          <CaptchaField idPrefix="library-upload" captcha={captcha} />

          <Tooltip content="Add this file to the shared library.">
            <button type="button" className="btn btn-primary" disabled={uploading} onClick={handleUpload}>
              {uploading ? "Uploading…" : "Add to library"}
            </button>
          </Tooltip>
        </AdminForm>
      </form>
    </AdminCard>
  );
}
