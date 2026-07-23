"use client";

import React, { useMemo, useState } from "react";
import { generateHTML, generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

import { AppDialog } from "@/components/ui/app-dialog";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { TipTapEditor } from "@/components/admin/lesson-plans/editor/tiptap-editor";
import { SitePopup } from "@/components/public/site-popup";
import { readApiFieldErrors } from "@/lib/admin/utils";
import { getContrastRatio } from "@/lib/popups/contrast";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/time";
import type {
  PopupAnimation,
  PopupFormFactor,
  PopupImagePlacement,
  PopupRepeatPolicy
} from "@/generated/prisma/client";

import type { SavedPopup } from "./popups-client";
import styles from "./popups.module.css";

/**
 * Popup body content uses ONLY StarterKit — matches
 * BODY_HTML_SANITIZE_EXTENSIONS in popup-contract.ts, so what the admin sees
 * while editing is exactly what survives the server-side sanitize round-trip
 * (no image/chord embeds the server would silently strip anyway).
 */
const POPUP_BODY_EXTENSIONS = [StarterKit, Placeholder.configure({ placeholder: "Popup message..." })];

const FORM_FACTORS: PopupFormFactor[] = ["modal", "corner", "bar"];
const ANIMATIONS: PopupAnimation[] = ["fade", "slide_up", "slide_in_right", "zoom", "bounce", "pulse"];
const IMAGE_PLACEMENTS: PopupImagePlacement[] = ["top", "side", "background", "none"];
const REPEAT_POLICIES: PopupRepeatPolicy[] = ["once", "session", "days", "always"];

export interface PopupFormValues {
  title: string;
  enabled: boolean;
  heading: string;
  bodyHtml: string;
  imageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  ctaUrl: string;
  formFactor: PopupFormFactor;
  animation: PopupAnimation;
  backgroundColor: string;
  textColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  widthPx: string;
  cornerRadiusPx: string;
  imagePlacement: PopupImagePlacement;
  startAtLocal: string;
  endAtLocal: string;
  targetPathsText: string;
  delaySeconds: string;
  repeatPolicy: PopupRepeatPolicy;
  repeatDays: string;
}

function toFormValues(popup: SavedPopup | null): PopupFormValues {
  return {
    title: popup?.title ?? "",
    enabled: popup?.enabled ?? false,
    heading: popup?.heading ?? "",
    bodyHtml: popup?.bodyHtml ?? "",
    imageUrl: popup?.imageUrl ?? "",
    imageAlt: popup?.imageAlt ?? "",
    ctaLabel: popup?.ctaLabel ?? "",
    ctaUrl: popup?.ctaUrl ?? "",
    formFactor: popup?.formFactor ?? "modal",
    animation: popup?.animation ?? "fade",
    backgroundColor: popup?.backgroundColor ?? "#ffffff",
    textColor: popup?.textColor ?? "#111111",
    buttonBackgroundColor: popup?.buttonBackgroundColor ?? "#2247d8",
    buttonTextColor: popup?.buttonTextColor ?? "#ffffff",
    widthPx: popup?.widthPx != null ? String(popup.widthPx) : "",
    cornerRadiusPx: popup?.cornerRadiusPx != null ? String(popup.cornerRadiusPx) : "",
    imagePlacement: popup?.imagePlacement ?? "none",
    startAtLocal: popup?.startAt ? toDateTimeLocalValue(popup.startAt) : "",
    endAtLocal: popup?.endAt ? toDateTimeLocalValue(popup.endAt) : "",
    targetPathsText: popup?.targetPaths?.join("\n") ?? "",
    delaySeconds: String(popup?.delaySeconds ?? 0),
    repeatPolicy: popup?.repeatPolicy ?? "session",
    repeatDays: popup?.repeatDays != null ? String(popup.repeatDays) : ""
  };
}

/** Builds the JSON payload `sitePopupInputSchema` (popup-contract.ts) expects. */
function toSubmitPayload(values: PopupFormValues) {
  const targetPaths = values.targetPathsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: values.title,
    enabled: values.enabled,
    heading: values.heading,
    bodyHtml: values.bodyHtml,
    imageUrl: values.imageUrl.trim() || null,
    imageAlt: values.imageAlt.trim() || null,
    ctaLabel: values.ctaLabel.trim() || null,
    ctaUrl: values.ctaUrl.trim() || null,
    formFactor: values.formFactor,
    animation: values.animation,
    backgroundColor: values.backgroundColor,
    textColor: values.textColor,
    buttonBackgroundColor: values.buttonBackgroundColor,
    buttonTextColor: values.buttonTextColor,
    widthPx: values.widthPx.trim() ? Number.parseInt(values.widthPx, 10) : null,
    cornerRadiusPx: values.cornerRadiusPx.trim() ? Number.parseInt(values.cornerRadiusPx, 10) : null,
    imagePlacement: values.imagePlacement,
    // dateTimeLocalToIso resolves the business timezone (APP_TIMEZONE) so the
    // stored instant matches what the admin actually picked, regardless of
    // which timezone the server process itself runs in.
    startAt: values.startAtLocal ? dateTimeLocalToIso(values.startAtLocal) : null,
    endAt: values.endAtLocal ? dateTimeLocalToIso(values.endAtLocal) : null,
    targetPaths: targetPaths.length > 0 ? targetPaths : null,
    delaySeconds: values.delaySeconds.trim() ? Number.parseInt(values.delaySeconds, 10) : 0,
    repeatPolicy: values.repeatPolicy,
    repeatDays: values.repeatDays.trim() ? Number.parseInt(values.repeatDays, 10) : null
  };
}

function noop() {}

interface PopupFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  popup: SavedPopup | null;
}

/**
 * Create/edit dialog for one SitePopup (AC-27). Conforms to
 * `sitePopupInputSchema` (src/lib/popups/popup-contract.ts) — that file is
 * the authority on field shape/limits; this form only builds the JSON body
 * and surfaces whatever the server rejects.
 */
export function PopupForm({ isOpen, onClose, onSaved, popup }: PopupFormProps) {
  const [values, setValues] = useState<PopupFormValues>(() => toFormValues(popup));
  const [bodyJson, setBodyJson] = useState<JSONContent>(() =>
    generateJSON(popup?.bodyHtml || "<p></p>", POPUP_BODY_EXTENSIONS)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // The modal form factor's preview renders a real, portaled AppDialog (see
  // the preview section below) — its own close/Escape/backdrop only work if
  // onDismiss actually closes something. This is that something.
  //
  // Starts open only when editing. A new popup defaults to the `modal` form
  // factor with an empty heading, so opening the preview immediately puts a
  // blank portaled dialog over the form the owner has not filled in yet, and
  // it has to be dismissed before anything can be typed. Editing is the
  // opposite case: there is real content, and seeing it straight away is the
  // point. "Show preview" reopens it either way.
  const [previewOpen, setPreviewOpen] = useState(() => Boolean(popup));

  function set<K extends keyof PopupFormValues>(key: K, value: PopupFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const textContrast = useMemo(
    () => getContrastRatio(values.textColor, values.backgroundColor),
    [values.textColor, values.backgroundColor]
  );
  const buttonContrast = useMemo(
    () => getContrastRatio(values.buttonTextColor, values.buttonBackgroundColor),
    [values.buttonTextColor, values.buttonBackgroundColor]
  );

  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});

    try {
      const bodyHtml = generateHTML(bodyJson, POPUP_BODY_EXTENSIONS);
      const payload = toSubmitPayload({ ...values, bodyHtml });
      const url = popup ? `/api/admin/popups/${popup.id}` : "/api/admin/popups";
      const response = await fetch(url, {
        method: popup ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error || "Unable to save popup.");
        setFieldErrors(readApiFieldErrors(data));
        return;
      }

      onSaved();
    } catch {
      setError("Network request failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className={styles.dialogFooter}>
      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !values.heading.trim()}>
        {saving ? "Saving..." : "Save Popup"}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title={popup ? "Edit Popup" : "New Popup"}
      size="lg"
      footer={footer}
      bodyClassName={styles.dialogBody}
    >
      <div className={styles.formRoot}>
        {error && <p className={styles.formError} role="alert">{error}</p>}

        <AdminForm>
          <AdminField label="Internal name" required htmlFor="popup-title" error={fieldErrors.title}>
            <input
              id="popup-title"
              type="text"
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              maxLength={150}
              placeholder="Never shown to visitors — for your own reference"
            />
          </AdminField>

          <AdminField label="Enabled" htmlFor="popup-enabled">
            <label className="admin-inline-checkbox">
              <input
                id="popup-enabled"
                type="checkbox"
                checked={values.enabled}
                onChange={(event) => set("enabled", event.target.checked)}
              />
              Live on the public site
            </label>
          </AdminField>

          <AdminField label="Heading" required htmlFor="popup-heading" error={fieldErrors.heading}>
            <input
              id="popup-heading"
              type="text"
              value={values.heading}
              onChange={(event) => set("heading", event.target.value)}
              maxLength={150}
            />
          </AdminField>

          <AdminField label="Body" fullWidth error={fieldErrors.bodyHtml}>
            {/* TipTapEditor has no id/aria-label prop to pair with a <label htmlFor>,
                so the accessible name goes on this wrapping group instead. */}
            <div role="group" aria-label="Body">
              <TipTapEditor
                content={bodyJson}
                onUpdate={setBodyJson}
                extensions={POPUP_BODY_EXTENSIONS}
                minimal
              />
            </div>
          </AdminField>

          <AdminField label="CTA label" htmlFor="popup-cta-label" error={fieldErrors.ctaLabel}>
            <input
              id="popup-cta-label"
              type="text"
              value={values.ctaLabel}
              onChange={(event) => set("ctaLabel", event.target.value)}
              maxLength={50}
              placeholder="Book Now"
            />
          </AdminField>

          <AdminField label="CTA URL" htmlFor="popup-cta-url" error={fieldErrors.ctaUrl}>
            <input
              id="popup-cta-url"
              type="text"
              value={values.ctaUrl}
              onChange={(event) => set("ctaUrl", event.target.value)}
              placeholder="/book or https://..."
            />
          </AdminField>

          <AdminField
            label="Image"
            fullWidth
            description={
              popup
                ? undefined
                : "Save the popup first, then come back to edit it and add an image."
            }
            error={fieldErrors.imageUrl}
          >
            {popup ? (
              <PopupImageEditor popup={popup} imageUrl={values.imageUrl} onChange={(url) => set("imageUrl", url)} />
            ) : (
              <p className={styles.helperNote}>Image upload unlocks after the first save.</p>
            )}
          </AdminField>

          <AdminField label="Image alt text" htmlFor="popup-image-alt" error={fieldErrors.imageAlt}>
            <input
              id="popup-image-alt"
              type="text"
              value={values.imageAlt}
              onChange={(event) => set("imageAlt", event.target.value)}
              maxLength={200}
            />
          </AdminField>

          <AdminField label="Image placement" htmlFor="popup-image-placement">
            <select
              id="popup-image-placement"
              value={values.imagePlacement}
              onChange={(event) => set("imagePlacement", event.target.value as PopupImagePlacement)}
            >
              {IMAGE_PLACEMENTS.map((placement) => (
                <option key={placement} value={placement}>
                  {placement}
                </option>
              ))}
            </select>
          </AdminField>

          <AdminField label="Form factor" htmlFor="popup-form-factor">
            <select
              id="popup-form-factor"
              value={values.formFactor}
              onChange={(event) => set("formFactor", event.target.value as PopupFormFactor)}
            >
              {FORM_FACTORS.map((factor) => (
                <option key={factor} value={factor}>
                  {factor}
                </option>
              ))}
            </select>
          </AdminField>

          <AdminField label="Animation" htmlFor="popup-animation">
            <select
              id="popup-animation"
              value={values.animation}
              onChange={(event) => set("animation", event.target.value as PopupAnimation)}
            >
              {ANIMATIONS.map((animation) => (
                <option key={animation} value={animation}>
                  {animation}
                </option>
              ))}
            </select>
          </AdminField>

          <AdminField label="Width (px)" htmlFor="popup-width" error={fieldErrors.widthPx}>
            <input
              id="popup-width"
              type="number"
              value={values.widthPx}
              onChange={(event) => set("widthPx", event.target.value)}
              min={100}
              max={1200}
              placeholder="Auto"
            />
          </AdminField>

          <AdminField label="Corner radius (px)" htmlFor="popup-radius" error={fieldErrors.cornerRadiusPx}>
            <input
              id="popup-radius"
              type="number"
              value={values.cornerRadiusPx}
              onChange={(event) => set("cornerRadiusPx", event.target.value)}
              min={0}
              max={100}
              placeholder="Default"
            />
          </AdminField>

          <AdminField label="Background colour" htmlFor="popup-bg-color">
            <div className={styles.colorField}>
              <input
                id="popup-bg-color"
                type="color"
                className={styles.colorInput}
                value={values.backgroundColor}
                onChange={(event) => set("backgroundColor", event.target.value)}
              />
              <span>{values.backgroundColor}</span>
            </div>
          </AdminField>

          <AdminField label="Text colour" htmlFor="popup-text-color">
            <div className={styles.colorField}>
              <input
                id="popup-text-color"
                type="color"
                className={styles.colorInput}
                value={values.textColor}
                onChange={(event) => set("textColor", event.target.value)}
              />
              <span>{values.textColor}</span>
            </div>
          </AdminField>

          <AdminField label="Button background" htmlFor="popup-btn-bg-color">
            <div className={styles.colorField}>
              <input
                id="popup-btn-bg-color"
                type="color"
                className={styles.colorInput}
                value={values.buttonBackgroundColor}
                onChange={(event) => set("buttonBackgroundColor", event.target.value)}
              />
              <span>{values.buttonBackgroundColor}</span>
            </div>
          </AdminField>

          <AdminField label="Button text colour" htmlFor="popup-btn-text-color">
            <div className={styles.colorField}>
              <input
                id="popup-btn-text-color"
                type="color"
                className={styles.colorInput}
                value={values.buttonTextColor}
                onChange={(event) => set("buttonTextColor", event.target.value)}
              />
              <span>{values.buttonTextColor}</span>
            </div>
          </AdminField>

          <AdminField label="Starts" htmlFor="popup-start-at" description="Leave blank for always-on while enabled." error={fieldErrors.startAt}>
            <input
              id="popup-start-at"
              type="datetime-local"
              value={values.startAtLocal}
              onChange={(event) => set("startAtLocal", event.target.value)}
            />
          </AdminField>

          <AdminField label="Ends" htmlFor="popup-end-at" error={fieldErrors.endAt}>
            <input
              id="popup-end-at"
              type="datetime-local"
              value={values.endAtLocal}
              onChange={(event) => set("endAtLocal", event.target.value)}
            />
          </AdminField>

          <AdminField label="Delay before showing (seconds)" htmlFor="popup-delay" error={fieldErrors.delaySeconds}>
            <input
              id="popup-delay"
              type="number"
              value={values.delaySeconds}
              onChange={(event) => set("delaySeconds", event.target.value)}
              min={0}
              max={300}
            />
          </AdminField>

          <AdminField label="Repeat policy" htmlFor="popup-repeat-policy">
            <select
              id="popup-repeat-policy"
              value={values.repeatPolicy}
              onChange={(event) => set("repeatPolicy", event.target.value as PopupRepeatPolicy)}
            >
              {REPEAT_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {policy}
                </option>
              ))}
            </select>
          </AdminField>

          {values.repeatPolicy === "days" && (
            <AdminField label="Repeat every N days" htmlFor="popup-repeat-days" error={fieldErrors.repeatDays}>
              <input
                id="popup-repeat-days"
                type="number"
                value={values.repeatDays}
                onChange={(event) => set("repeatDays", event.target.value)}
                min={1}
                max={365}
              />
            </AdminField>
          )}

          <AdminField
            label="Target paths"
            fullWidth
            htmlFor="popup-target-paths"
            description="One path per line, e.g. /blog or /blog/* for that page and everything under it. Leave blank for every public page."
            error={fieldErrors.targetPaths}
          >
            <textarea
              id="popup-target-paths"
              value={values.targetPathsText}
              onChange={(event) => set("targetPathsText", event.target.value)}
              rows={3}
            />
          </AdminField>
        </AdminForm>

        <div className={styles.warningStack}>
          {textContrast && !textContrast.passesAA && (
            <p className={styles.contrastWarning}>
              Text/background contrast is {textContrast.ratio.toFixed(2)}:1 — below the WCAG AA minimum of 4.5:1. The
              popup will still save; consider adjusting the colours.
            </p>
          )}
          {buttonContrast && !buttonContrast.passesAA && (
            <p className={styles.contrastWarning}>
              Button text/background contrast is {buttonContrast.ratio.toFixed(2)}:1 — below the WCAG AA minimum of
              4.5:1.
            </p>
          )}
        </div>

        <div className={styles.previewFrame} onClickCapture={(event) => event.preventDefault()}>
          {/* SitePopup is the real public renderer (src/components/public/site-popup.tsx) —
              reused as-is, not re-implemented, so the preview can never drift from what
              visitors see. For the modal form factor it renders its own real, portaled
              AppDialog, which escapes both the containment div above and the click-capture
              guard (a portaled node isn't a DOM descendant of either). onDismiss has to
              actually close the preview — previewOpen — or its close button/Escape/backdrop
              click do nothing while its backdrop still blocks the rest of this form,
              including the Form factor select needed to switch away from modal. */}
          {previewOpen ? (
            <SitePopup
              isOpen
              formFactor={values.formFactor}
              animation={values.animation}
              imagePlacement={values.imagePlacement}
              content={{
                heading: values.heading,
                bodyHtml: generateHTML(bodyJson, POPUP_BODY_EXTENSIONS),
                imageUrl: values.imageUrl || null,
                imageAlt: values.imageAlt || null,
                ctaLabel: values.ctaLabel || null,
                ctaUrl: values.ctaUrl || null
              }}
              style={{
                backgroundColor: values.backgroundColor,
                textColor: values.textColor,
                buttonBackgroundColor: values.buttonBackgroundColor,
                buttonTextColor: values.buttonTextColor,
                widthPx: values.widthPx.trim() ? Number.parseInt(values.widthPx, 10) : null,
                cornerRadiusPx: values.cornerRadiusPx.trim() ? Number.parseInt(values.cornerRadiusPx, 10) : null
              }}
              onDismiss={() => setPreviewOpen(false)}
              onCtaClick={noop}
            />
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setPreviewOpen(true)}>
              Show preview
            </button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}

/** Inline image upload/remove for an existing popup (needs an id, so this only renders in edit mode). */
function PopupImageEditor({
  popup,
  imageUrl,
  onChange
}: {
  popup: SavedPopup;
  imageUrl: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/admin/popups/${popup.id}/image`, { method: "POST", body: formData });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setUploadError(data?.error || "Upload failed.");
        return;
      }
      onChange(data.imageUrl as string);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploadError("");
    const response = await fetch(`/api/admin/popups/${popup.id}/image`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setUploadError(data?.error || "Unable to remove image.");
      return;
    }
    onChange("");
  }

  return (
    <div className={styles.imageRow}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image, arbitrary aspect ratio
        <img src={imageUrl} alt="" className={styles.imagePreview} />
      ) : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        disabled={uploading}
      />
      {imageUrl && (
        <button type="button" className="btn btn-secondary" onClick={handleRemove} disabled={uploading}>
          Remove image
        </button>
      )}
      {uploading && <p className={styles.helperNote}>Uploading...</p>}
      {uploadError && <p className={styles.formError}>{uploadError}</p>}
    </div>
  );
}
