export interface AdminBuildInfo {
  versionText: string;
  releaseLabel: string;
  shortCommit: string;
  packageVersion: string;
  source: "git" | "deploy" | "package";
  developedYear: string;
  createdBy: string;
  repositoryUrl: string;
  wikiUrl: string;
  contactEmail: string;
}
