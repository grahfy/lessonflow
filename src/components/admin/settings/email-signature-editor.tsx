"use client";

import { useEffect, useState } from "react";

import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

type EmailSignatureState = {
  bodyText: string;
  hasCustomBody: boolean;
  logoUrl: string | null;
  hasCustomLogo: boolean;
  resolvedLogoUrl: string;
  updatedAt: string | null;
};

const EMPTY_SIGNATURE_STATE: EmailSignatureState = {
  bodyText: "",
  hasCustomBody: false,
  logoUrl: null,
  hasCustomLogo: false,
  resolvedLogoUrl: "",
  updatedAt: null
};

/**
 * Owner-only editor for the shared outbound email signature and dedicated email logo.
 */
export function AdminEmailSignatureEditor() {
  const [signature, setSignature] = useState<EmailSignatureState>(EMPTY_SIGNATURE_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/email-signature");
        if (!response.ok) {
          await handleApiError(response, "Failed to load email signature.");
          return;
        }

        const data = (await response.json()) as {
          signature?: Partial<EmailSignatureState>;
        };
        setSignature({
          ...EMPTY_SIGNATURE_STATE,
          ...data.signature
        });
      } catch {
        setError("Failed to load email signature.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [handleApiError, safeFetch]);

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [signature.resolvedLogoUrl]);

  async function saveSignature() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await safeFetch("/api/admin/email-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyText: signature.bodyText
        })
      });

      if (!response.ok) {
        await handleApiError(response, "Failed to save email signature.");
        return;
      }

      const data = (await response.json()) as {
        signature?: Partial<EmailSignatureState>;
      };
      setSignature({
        ...EMPTY_SIGNATURE_STATE,
        ...data.signature
      });
      setNotice(signature.bodyText.trim() ? "Email signature saved." : "Custom signature cleared. Default contact signature will be used.");
    } catch {
      setError("Failed to save email signature.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setError("");
    setNotice("");

    try {
      const form = new FormData();
      form.set("file", file);

      const response = await safeFetch("/api/admin/email-signature/logo", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        await handleApiError(response, "Failed to upload signature logo.");
        return;
      }

      const data = (await response.json()) as {
        signature?: Partial<EmailSignatureState>;
      };
      setSignature({
        ...EMPTY_SIGNATURE_STATE,
        ...data.signature
      });
      setNotice("Signature logo uploaded.");
    } catch {
      setError("Failed to upload signature logo.");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    setRemovingLogo(true);
    setError("");
    setNotice("");

    try {
      const response = await safeFetch("/api/admin/email-signature/logo", {
        method: "DELETE"
      });

      if (!response.ok) {
        await handleApiError(response, "Failed to remove signature logo.");
        return;
      }

      const data = (await response.json()) as {
        signature?: Partial<EmailSignatureState>;
      };
      setSignature({
        ...EMPTY_SIGNATURE_STATE,
        ...data.signature
      });
      setNotice("Custom signature logo removed. Email signature now falls back to the branding logo.");
    } catch {
      setError("Failed to remove signature logo.");
    } finally {
      setRemovingLogo(false);
    }
  }

  if (loading) {
    return <p className="helper-text">Loading email signature...</p>;
  }

  return (
    <AdminEditorSection
      title="Email Signature"
      description="Shared footer used across all outbound emails. Leave the text blank to keep the current default contact signature."
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
      actions={
        <button className="btn btn-primary" type="button" disabled={saving || uploading || removingLogo} onClick={() => void saveSignature()}>
          {saving ? "Saving..." : "Save Signature"}
        </button>
      }
    >
      <AdminEditorPanel title="Signature Copy" subdued>
        <AdminForm>
          <AdminField
            label="Body"
            tooltip="Simple rich text only. URLs and email addresses will be linked automatically in outgoing emails."
            fullWidth
          >
            <textarea
              className="admin-editor-textarea admin-email-signature-textarea"
              value={signature.bodyText}
              onChange={(event) =>
                setSignature((current) => ({
                  ...current,
                  bodyText: event.target.value
                }))
              }
            />
          </AdminField>
          <p className="helper-text">
            Example:
            {" "}
            <code>Kind regards{"\n"}Jane Smith{"\n"}https://example.com{"\n"}hello@example.com</code>
          </p>
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Signature Logo" subdued>
        <AdminForm>
          <AdminField
            label="Preview"
            tooltip="This dedicated image is used in email signatures only. If none is uploaded, the standard branding logo is used."
            fullWidth
          >
            <div className="admin-email-signature-logo-stack">
              {signature.resolvedLogoUrl && !logoPreviewFailed ? (
                <>
                  {/* NOTE: This preview may point at external branding URLs or a local API route. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="admin-email-signature-logo-preview"
                    src={signature.resolvedLogoUrl}
                    alt="Email signature logo preview"
                    onError={() => setLogoPreviewFailed(true)}
                  />
                </>
              ) : (
                <p className="helper-text">
                  {signature.resolvedLogoUrl
                    ? "Logo preview unavailable. The stored logo may still be used in outgoing emails."
                    : "No logo available."}
                </p>
              )}
              <p className="helper-text">
                {signature.hasCustomLogo
                  ? "Using the custom email-signature logo."
                  : "Using the current branding logo as the fallback."}
              </p>
            </div>
          </AdminField>

          <AdminField label="Upload Logo" tooltip="Accepted formats: JPEG, PNG, GIF, or WebP up to 5MB." fullWidth>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              disabled={uploading || removingLogo || saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadLogo(file);
                }

                event.currentTarget.value = "";
              }}
            />
          </AdminField>

          <div className="button-row admin-email-signature-logo-actions">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!signature.hasCustomLogo || uploading || removingLogo || saving}
              onClick={() => void removeLogo()}
            >
              {removingLogo ? "Removing..." : "Remove Custom Logo"}
            </button>
          </div>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}
