# Release Maintainer Checklist

Use this checklist when preparing a GitLab release for LessonFlow.

## Before Tagging / Publishing

1. Confirm the public branch no longer tracks local-only AI, planning, or scratch material.
2. Review [`CHANGELOG.md`](../CHANGELOG.md) and the detailed release notes in [`release-notes-v1.0.md`](release-notes-v1.0.md).
3. Verify `.env.example` reflects all required production variables and any newly introduced options.
4. Confirm Prisma migrations under `prisma/migrations/` are present and documented in release notes when relevant.
5. Confirm `deploy/deploy.sh` and `deploy/update.sh` still reflect the supported release-directory deploy model.
6. Refresh operator docs if workflow, settings, deploy, or manual behavior changed.
7. Refresh manual screenshots if the UI changed enough to invalidate existing captures.

## Verification

1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run `bash tests/deploy-sudo-dry-run.sh`.
4. Run `bash tests/deploy-mode-detection.sh`.
5. Run any feature-specific tests affected by the release.

## GitLab Release Page

Include:

1. Release summary and highlights.
2. Upgrade notes, including migrations and environment changes.
3. Required environment keys and any new optional operational settings.
4. Deploy/update reminder that the supported production model is timestamped releases under `/var/www/lessonflow/releases` with `/var/www/lessonflow/current` as the live symlink.
5. Rollback reminder pointing operators to [`deploy/README.md`](../deploy/README.md).
6. Links to the operator manual and detailed release notes.

## After Publishing

1. Verify the GitLab release links resolve correctly.
2. Verify source archives do not expose internal ignored material.
3. If the release was deployed, confirm the host reports `release-directory` mode via `sudo ./deploy/deploy.sh --print-deploy-mode`.
