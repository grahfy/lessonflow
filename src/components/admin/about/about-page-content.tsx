import React, { type ReactElement } from "react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import type { AdminBuildInfo } from "@/lib/build-info-types";

type AdminAboutPageContentProps = {
  buildInfo: AdminBuildInfo;
};

function aboutMetaRow(label: string, value: ReactElement | string) {
  return (
    <div className="admin-about-meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Static admin-facing product and release metadata.
 */
export function AdminAboutPageContent({ buildInfo }: AdminAboutPageContentProps): ReactElement {
  return (
    <div className="admin-about-layout">
      <AdminCard className="admin-about-hero">
        <p className="admin-console-kicker">About LessonFlow</p>
        <h2>Release and developer information</h2>
        <p className="helper-text">
          This page gives admins a stable place to confirm the current application version and the project contact details used for escalation.
        </p>
        <div className="admin-manual-route-pills">
          <span className="admin-manual-pill">Version: {buildInfo.versionText}</span>
          <span className="admin-manual-pill">Developed: {buildInfo.developedYear}</span>
          <span className="admin-manual-pill">Created by: {buildInfo.createdBy}</span>
        </div>
      </AdminCard>

      <AdminCard className="admin-about-meta">
        <h3>Build metadata</h3>
        <dl className="admin-about-meta-list">
          {aboutMetaRow("Version", <code>{buildInfo.versionText}</code>)}
          {aboutMetaRow(buildInfo.source === "git" ? "Release tag" : "Fallback version", <code>{buildInfo.releaseLabel}</code>)}
          {aboutMetaRow("Commit", <code>{buildInfo.shortCommit}</code>)}
          {aboutMetaRow("Package version", <code>{buildInfo.packageVersion}</code>)}
          {aboutMetaRow("Source", buildInfo.source === "git" ? "Git metadata" : "package.json fallback")}
        </dl>
      </AdminCard>

      <AdminCard className="admin-about-meta">
        <h3>Project credits</h3>
        <dl className="admin-about-meta-list">
          {aboutMetaRow("Created by", buildInfo.createdBy)}
          {aboutMetaRow("Developed", buildInfo.developedYear)}
          {aboutMetaRow(
            "Contact",
            <a href={`mailto:${buildInfo.contactEmail}`} rel="noreferrer">
              {buildInfo.contactEmail}
            </a>
          )}
          {aboutMetaRow(
            "GitLab repository",
            <a href={buildInfo.repositoryUrl} target="_blank" rel="noreferrer">
              {buildInfo.repositoryUrl}
            </a>
          )}
          {aboutMetaRow(
            "GitLab wiki",
            <a href={buildInfo.wikiUrl} target="_blank" rel="noreferrer">
              {buildInfo.wikiUrl}
            </a>
          )}
        </dl>
      </AdminCard>
    </div>
  );
}
