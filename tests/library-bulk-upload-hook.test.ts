// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBulkUpload } from "@/lib/admin/use-bulk-upload";
import type { CollectedFile } from "@/lib/admin/folder-traversal";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useBulkUpload>;

/** Renders the hook inside a host component and returns a live value getter. */
function renderBulkUploadHook(options: Parameters<typeof useBulkUpload>[0]) {
  let latest: HookValue | null = null;
  function Host() {
    latest = useBulkUpload(options);
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Host));
  });
  return {
    value: () => {
      if (!latest) throw new Error("hook not rendered");
      return latest;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe("useBulkUpload (React binding)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mirrors queue snapshots into state and derives the summary", async () => {
    const files: CollectedFile[] = [
      { file: { name: "a.mp3", size: 10, type: "audio/mpeg" } as unknown as File, relativePath: "a.mp3" },
      { file: { name: ".DS_Store", size: 1, type: "" } as unknown as File, relativePath: ".DS_Store" }
    ];
    const transport = vi.fn(async ({ file }: { file: File }) => ({
      ok: true as const,
      itemId: `item-${file.name}`,
      duplicateOf: null
    }));
    const hook = renderBulkUploadHook({
      transport,
      mintGrant: async () => ({ ok: true, grantId: "g1" })
    });

    await act(async () => {
      await hook.value().begin(files);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const { state, summary } = hook.value();
    expect(state?.phase).toBe("done");
    expect(state?.junkDropped).toBe(1);
    expect(summary).toMatchObject({ done: 1, junkDropped: 1, discovered: 2 });
    expect(transport).toHaveBeenCalledTimes(1);

    act(() => {
      hook.value().reset();
    });
    expect(hook.value().state).toBeNull();
    hook.unmount();
  });
});
