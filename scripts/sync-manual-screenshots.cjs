#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'Documentation', 'assets');
const targetDir = path.join(projectRoot, 'public', 'documentation', 'screenshots');

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyScreenshots() {
  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExtensions.has(ext)) continue;

    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    fs.copyFileSync(from, to);
    copied += 1;
  }

  console.log(`Synced ${copied} documentation screenshots to ${path.relative(projectRoot, targetDir)}`);
}

copyScreenshots();
