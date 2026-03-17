#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { MANUAL_SCREENSHOTS, MANUAL_SECTION_MANIFEST } from "../src/lib/manual/content";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "Documentation", "assets");
const publicDir = path.join(projectRoot, "public", "documentation", "screenshots");
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const registryByFileName = new Map(MANUAL_SCREENSHOTS.map((screenshot) => [screenshot.fileName, screenshot]));
const registryById = new Map(MANUAL_SCREENSHOTS.map((screenshot) => [screenshot.id, screenshot]));

function listImageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && supportedImageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function resolveDocImagePath(target: string): string | null {
  const normalized = String(target || "").trim();
  const normalizedPath = normalized.replace(/^\.\/+/, "");

  if (normalizedPath.startsWith("assets/")) {
    return path.basename(normalizedPath);
  }

  if (normalizedPath.startsWith("Documentation/assets/")) {
    return path.basename(normalizedPath);
  }

  return null;
}

function collectMarkdownImageTargets(markdown: string): string[] {
  return Array.from(markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
}

function main() {
  const errors: string[] = [];
  const sourceFiles = listImageFiles(sourceDir);
  const publicFiles = listImageFiles(publicDir);
  const registryFiles = MANUAL_SCREENSHOTS.map((screenshot) => screenshot.fileName).sort((left, right) => left.localeCompare(right));
  const sectionUsage = new Map<string, Set<string>>();

  for (const screenshot of MANUAL_SCREENSHOTS) {
    if (!fs.existsSync(path.join(projectRoot, screenshot.documentationPath))) {
      errors.push(`Missing source screenshot: ${screenshot.documentationPath}`);
    }

    if (!fs.existsSync(path.join(projectRoot, "public", screenshot.publicPath.replace(/^\//, "")))) {
      errors.push(`Missing public screenshot: ${screenshot.publicPath}`);
    }
  }

  for (const section of MANUAL_SECTION_MANIFEST) {
    for (const screenshotId of section.screenshotIds) {
      if (!registryById.has(screenshotId)) {
        errors.push(`Section ${section.id} references unknown screenshot id: ${screenshotId}`);
        continue;
      }

      const sections = sectionUsage.get(screenshotId) || new Set<string>();
      sections.add(section.id);
      sectionUsage.set(screenshotId, sections);
    }
  }

  for (const screenshot of MANUAL_SCREENSHOTS) {
    if (!sectionUsage.has(screenshot.id)) {
      errors.push(`Registered screenshot is not assigned to any manual section: ${screenshot.id}`);
    }
  }

  for (const section of MANUAL_SECTION_MANIFEST) {
    const markdown = readFile(section.sourcePath);
    const imageTargets = collectMarkdownImageTargets(markdown);

    for (const target of imageTargets) {
      const registryFileName = resolveDocImagePath(target);
      const extension = path.extname(target).toLowerCase();

      if (!registryFileName) {
        if (supportedImageExtensions.has(extension)) {
          errors.push(`Manual chapter ${section.sourcePath} uses non-canonical image path: ${target}`);
        }
        continue;
      }

      if (!registryByFileName.has(registryFileName)) {
        errors.push(`Manual chapter ${section.sourcePath} references unregistered screenshot: ${target}`);
      }
    }
  }

  for (const fileName of sourceFiles) {
    if (!registryByFileName.has(fileName)) {
      errors.push(`Documentation/assets contains unregistered screenshot: ${fileName}`);
    }
  }

  const sourceSet = new Set(sourceFiles);
  const publicSet = new Set(publicFiles);
  const registrySet = new Set(registryFiles);

  for (const fileName of registryFiles) {
    if (!sourceSet.has(fileName)) {
      errors.push(`Registry file missing from Documentation/assets: ${fileName}`);
    }

    if (!publicSet.has(fileName)) {
      errors.push(`Registry file missing from public/documentation/screenshots: ${fileName}`);
    }
  }

  for (const fileName of publicFiles) {
    if (!registrySet.has(fileName)) {
      errors.push(`public/documentation/screenshots contains unregistered screenshot: ${fileName}`);
    }
  }

  if (sourceFiles.join("\n") !== publicFiles.join("\n")) {
    errors.push("Source and public screenshot folders do not contain the same filenames.");
  }

  if (errors.length > 0) {
    console.error("Manual screenshot validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${MANUAL_SCREENSHOTS.length} manual screenshots across ${MANUAL_SECTION_MANIFEST.length} manual sections.`);
}

main();
