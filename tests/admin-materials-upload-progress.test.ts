import * as React from "react";
import { createElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminMaterialsPanel } from "@/components/admin/ui/admin-materials-panel";
import type { LearningMaterialUploadProgress } from "@/lib/admin/use-learning-materials";

// Classic JSX transform: the panel tree compiles to React.createElement calls
// that resolve against the global, matching the other component tests here.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const formRef = { current: null };

/**
 * Static render only — no jsdom. `useCaptcha` fetches its challenge from an
 * effect, and effects do not run during server rendering, so the panel paints
 * without a network stub.
 */
function renderUploadButton(overrides: {
  materialsUploading: boolean;
  materialsUploadProgress?: LearningMaterialUploadProgress | null;
}): string {
  return renderToStaticMarkup(
    createElement(
      TooltipPrimitive.Provider,
      null,
      createElement(AdminMaterialsPanel, {
        materialsLoading: false,
        materialsList: [],
        materialsDeletingId: null,
        uploadFormRef: formRef,
        onUpload: () => {},
        onDelete: () => {},
        ...overrides
      })
    )
  );
}

describe("AdminMaterialsPanel upload button label", () => {
  it("reads 'Upload Material' when idle", () => {
    const markup = renderUploadButton({ materialsUploading: false });

    expect(markup).toContain("Upload Material");
    expect(markup).not.toContain("Uploading");
  });

  it("counts files while a split batch uploads", () => {
    const markup = renderUploadButton({
      materialsUploading: true,
      materialsUploadProgress: { completed: 40, total: 120 }
    });

    expect(markup).toContain("Uploading 40 of 120 files...");
  });

  it("falls back to the plain label when progress is unknown", () => {
    // Control for the assertion above: same uploading state, no progress. If the
    // count ever rendered from something other than materialsUploadProgress,
    // this case would show a count too.
    const markup = renderUploadButton({ materialsUploading: true });

    expect(markup).toContain("Uploading...");
    expect(markup).not.toContain(" of ");
  });

  it("does not say '1 of 1' for a single-file upload", () => {
    const markup = renderUploadButton({
      materialsUploading: true,
      materialsUploadProgress: { completed: 0, total: 1 }
    });

    expect(markup).toContain("Uploading...");
    expect(markup).not.toContain(" of ");
  });

  it("keeps the button disabled while uploading", () => {
    // The label is the only upload-state signal the admin gets mid-batch, so a
    // silently re-clickable button would double-submit the whole batch.
    expect(renderUploadButton({ materialsUploading: true })).toContain("disabled");
    expect(renderUploadButton({ materialsUploading: false })).not.toContain("disabled");
  });
});
