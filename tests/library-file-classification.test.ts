import { describe, expect, it } from "vitest";

import { LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";
import {
  GP_EXTENSIONS,
  JUNK_FILE_RULES,
  LIBRARY_ACCEPT,
  MAX_LIBRARY_FILE_SIZE_BYTES,
  classifyLibraryFile,
  isJunkLibraryFile,
  normalizeOriginalFilename,
  precheckLibraryFile
} from "@/lib/library/library-file-classification";

describe("library-file-classification", () => {
  it("classifies every Guitar Pro extension regardless of case or reported MIME", () => {
    for (const ext of GP_EXTENSIONS) {
      for (const mime of ["", "application/octet-stream", "application/x-guitar-pro"]) {
        const result = classifyLibraryFile({ fileName: `Song${ext.toUpperCase()}`, mimeType: mime });
        expect(result).toEqual({
          materialType: "guitar_pro",
          mimeType: "application/octet-stream",
          extension: ext
        });
      }
    }
  });

  it("delegates non-GP files to the shared classifier unchanged", () => {
    expect(classifyLibraryFile({ fileName: "track.mp3", mimeType: "audio/mpeg" })?.materialType).toBe("audio");
    expect(classifyLibraryFile({ fileName: "sheet.pdf", mimeType: "application/pdf" })?.materialType).toBe("pdf");
    expect(classifyLibraryFile({ fileName: "diagram.png", mimeType: "image/png" })?.materialType).toBe("image");
    expect(classifyLibraryFile({ fileName: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBeNull();
    // A renamed extension cannot smuggle a file into the GP branch via MIME.
    expect(classifyLibraryFile({ fileName: "archive.zip", mimeType: "application/octet-stream" })).toBeNull();
  });

  it("does not classify dotfiles or extension-less names as Guitar Pro", () => {
    expect(classifyLibraryFile({ fileName: ".gp5", mimeType: "" })).toBeNull();
    expect(classifyLibraryFile({ fileName: "README", mimeType: "" })).toBeNull();
  });

  it("tolerates padded filenames (matches normalizeOriginalFilename's trim)", () => {
    expect(classifyLibraryFile({ fileName: "  Sweet Child.gp5 ", mimeType: "" })?.materialType).toBe("guitar_pro");
  });

  it("appends the GP extensions to the shared accept set", () => {
    expect(LIBRARY_ACCEPT).toBe(`${LEARNING_MATERIAL_ACCEPT},.gp3,.gp4,.gp5,.gpx,.gp`);
  });

  it("normalizeOriginalFilename trims and truncates to 255 characters", () => {
    expect(normalizeOriginalFilename("  Song.gp5  ")).toBe("Song.gp5");
    const long = `${"a".repeat(300)}.gp5`;
    expect(normalizeOriginalFilename(long)).toBe("a".repeat(255));
    expect(normalizeOriginalFilename(long)).toHaveLength(255);
  });

  it("flags OS/sync junk files, including junk nested in folder paths", () => {
    expect(isJunkLibraryFile(".DS_Store")).toBe(true);
    expect(isJunkLibraryFile("Thumbs.db")).toBe(true);
    expect(isJunkLibraryFile("THUMBS.DB")).toBe(true);
    expect(isJunkLibraryFile("desktop.ini")).toBe(true);
    expect(isJunkLibraryFile(".dropbox")).toBe(true);
    expect(isJunkLibraryFile("._Song.gp5")).toBe(true);
    expect(isJunkLibraryFile("Riffs/80s/.DS_Store")).toBe(true);
    expect(isJunkLibraryFile("Riffs\\80s\\Thumbs.db")).toBe(true);
    expect(isJunkLibraryFile("Song.gp5")).toBe(false);
    expect(isJunkLibraryFile("my.dropbox.notes.pdf")).toBe(false);
    expect(JUNK_FILE_RULES.length).toBe(5);
  });

  it("prechecks junk, unsupported, empty, oversize, and accepted files", () => {
    expect(precheckLibraryFile(".DS_Store", "", 12)).toEqual({ kind: "junk" });

    const unsupported = precheckLibraryFile("notes.docx", "", 1024);
    expect(unsupported.kind).toBe("skip");
    if (unsupported.kind === "skip") {
      expect(unsupported.code).toBe("unsupported_type");
      expect(unsupported.reason).toContain("Unsupported file type");
    }

    const empty = precheckLibraryFile("Song.gp5", "", 0);
    expect(empty).toMatchObject({ kind: "skip", code: "empty" });

    const oversize = precheckLibraryFile("Song.gp5", "", MAX_LIBRARY_FILE_SIZE_BYTES + 1);
    expect(oversize).toMatchObject({ kind: "skip", code: "too_large" });

    expect(precheckLibraryFile("Song.gp5", "", MAX_LIBRARY_FILE_SIZE_BYTES)).toEqual({ kind: "accept" });
    expect(precheckLibraryFile("track.mp3", "audio/mpeg", 2048)).toEqual({ kind: "accept" });
  });
});
