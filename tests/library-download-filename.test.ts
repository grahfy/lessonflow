import { describe, expect, it } from "vitest";

import { buildLearningMaterialDownloadFilename } from "@/lib/student-portal/materials";

describe("buildLearningMaterialDownloadFilename", () => {
  it("keeps existing MIME-inferred behavior for audio/pdf/image", () => {
    expect(
      buildLearningMaterialDownloadFilename({ title: "Warm Up", materialType: "audio", mimeType: "audio/mpeg" })
    ).toBe("Warm Up.mp3");
    expect(
      buildLearningMaterialDownloadFilename({ title: "Theory", materialType: "pdf", mimeType: "application/pdf" })
    ).toBe("Theory.pdf");
    expect(
      buildLearningMaterialDownloadFilename({ title: "Chart", materialType: "image", mimeType: "image/png" })
    ).toBe("Chart.png");
  });

  it("uses the original filename's extension when MIME inference fails (AC-I3)", () => {
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Sweet Child",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream",
        originalFilename: "Sweet Child O Mine.gp5"
      })
    ).toBe("Sweet Child.gp5");
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Etude",
        materialType: "guitar_pro",
        mimeType: "",
        originalFilename: "etude.GPX"
      })
    ).toBe("Etude.gpx");
  });

  it("MIME inference wins over the original filename when both resolve", () => {
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Riff",
        materialType: "audio",
        mimeType: "audio/mpeg",
        originalFilename: "riff.wav"
      })
    ).toBe("Riff.mp3");
  });

  it("falls back to .gp for guitar_pro without a usable original filename", () => {
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Legacy Tab",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream",
        originalFilename: null
      })
    ).toBe("Legacy Tab.gp");
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Legacy Tab",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream"
      })
    ).toBe("Legacy Tab.gp");
  });

  it("rejects unsafe or missing original-filename extensions", () => {
    // No extension, header-breaking characters, or overlong tokens must never
    // leak into the content-disposition filename.
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Odd",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream",
        originalFilename: "no-extension"
      })
    ).toBe("Odd.gp");
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Odd",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream",
        originalFilename: 'weird."ext\r\n'
      })
    ).toBe("Odd.gp");
    expect(
      buildLearningMaterialDownloadFilename({
        title: "Odd",
        materialType: "guitar_pro",
        mimeType: "application/octet-stream",
        originalFilename: `tab.${"x".repeat(20)}`
      })
    ).toBe("Odd.gp");
  });
});
