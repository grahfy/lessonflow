# LessonFlow Release Notes: Version 1.1.0

Release date: March 12, 2026

This `1.1.0` release covers the user-facing and operator-facing changes shipped after `v1.0`, with a particular focus on release visibility inside the admin console and safer VPS deployment paths for non-git source installs.

Release range: `v1.0..v1.1.0`

## Highlights

- Adds a dedicated admin About page and footer build metadata so staff can confirm the live release and commit without opening deployment history.
- Extends `deploy/update.sh` and `deploy/deploy.sh` to support extracted archive or copied source trees as a first-class deployment source mode.
- Improves production provenance so archive-built hosts can still report real release metadata instead of a placeholder package version.
- Rejects stale or malformed Next-Action POSTs on page routes with a clear `400` response instead of surfacing misleading internal runtime errors.
- Refreshes the in-app manual into a cleaner reference-style operator guide with updated screenshots and summaries.

## Features

### Admin and Operator Experience

- Added `/admin/about` with release, commit, creator, repository, and wiki details.
- Added a shared admin footer build-info strip so version context stays visible across admin screens.
- Added a protected build-info API and server-side metadata loader for admin-facing release visibility.
- Updated the in-app manual and its repository source content so operators can navigate the handbook as article-style reference material.

### Deployment and Operations

- Added source-mode detection to `deploy.sh` so deployments can distinguish between a persistent git checkout and an extracted archive/copy source tree.
- Added archive-mode behavior to `update.sh`, including a reduced deploy-only menu, source-permission warnings, and no git-pull assumptions.
- Added deploy-mode reporting that now includes source mode, source path, and source detail alongside runtime layout detection.
- Added shell coverage for deploy-mode detection and archive-mode update flows.

## Fixes and Stability Improvements

- Fixed release metadata fallback so production hosts deployed from git archives can still show the correct release label and short commit in admin surfaces.
- Fixed the deploy Prisma refresh trigger so `package-lock.json` changes also count as dependency-level deploy work.
- Fixed a stale Next-Action request path by stopping unsupported POSTs to page routes before Next.js attempts invalid action lookup.
- Refreshed student portal imagery used in documentation and screenshot-backed operator guidance.

## Operations and Deployment

- `update.sh` remains the standard entrypoint for routine updates on git-backed hosts.
- Archive/copy installs are now supported by replacing the extracted source tree contents first and then running `./deploy/update.sh` from that tree.
- `deploy.sh --print-deploy-mode` now reports both runtime layout and source mode, making host-state diagnosis clearer.
- Admin release visibility now combines git tag data when available with deploy-generated metadata when a live release lacks `.git`.

## Upgrade Notes

- No new Prisma migrations were added in this release range.
- No new required environment keys were introduced in this release range.
- Do not use `--skip-deps` for the first `1.1.0` rollout because Prisma dependencies changed to `7.5.0`.
- Git-backed hosts should continue to use:

```bash
cd /var/www/lessonflow/current
sudo ./deploy/update.sh --branch main
```

- Archive/copy installs should replace the extracted source tree first, then run:

```bash
./deploy/update.sh
```

- After deployment, verify the release metadata at `/admin/about` or in the admin footer matches `v1.1.0`.

## Risk / Notes

- This release note intentionally excludes internal-only repo/process documentation commits even though they fall inside the raw git range.
- Archive mode skips git-only metadata capture during deployment, so source ownership and readability still need to be correct before the deploy starts.
- The operator manual and wiki were updated alongside the code changes so release notes, deploy docs, and in-app guidance remain aligned.
