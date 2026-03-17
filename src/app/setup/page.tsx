import { redirect } from "next/navigation";

import { AdminAuthShell } from "@/components/admin-auth-shell";
import { SetupWizard } from "@/components/setup-wizard";
import { getSetupReadiness } from "@/lib/setup";
import {
  hasSetupAccessTokenConfigured,
  isValidSetupAccessToken,
  SETUP_ACCESS_TOKEN_QUERY_PARAM
} from "@/lib/setup-access";

type SetupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * First-run setup page for production bootstrapping.
 */
export default async function SetupPage({ searchParams }: SetupPageProps) {
  const readiness = await getSetupReadiness();
  if (readiness.completed) {
    redirect("/admin/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const setupTokenValue = resolvedSearchParams[SETUP_ACCESS_TOKEN_QUERY_PARAM];
  const setupAccessToken = Array.isArray(setupTokenValue) ? setupTokenValue[0] : setupTokenValue;
  const requiresProductionSetupToken = process.env.NODE_ENV === "production";
  const hasConfiguredSetupToken = hasSetupAccessTokenConfigured();
  const hasValidSetupToken = isValidSetupAccessToken(setupAccessToken);

  return (
    <AdminAuthShell footerCopy="First-run setup">
      <main className="view" aria-label="Setup Wizard" data-motion-item="setup-view">
        <section className="panel-copy" data-motion-item="setup-panel">
          <p className="kicker" data-motion-item="setup-kicker">
            Setup
          </p>
          <h1 data-motion-item="setup-title">LessonFlow Setup Wizard</h1>
          <p className="lead copy-justify" data-motion-item="setup-lead">
            Complete one-time initialization by passing environment checks and creating the first admin account.
          </p>
          {requiresProductionSetupToken && !hasConfiguredSetupToken ? (
            <p className="notice">
              Production setup is locked until `SETUP_ACCESS_TOKEN` is configured on the server. After setting it,
              reopen this page with `?setupToken=...`.
            </p>
          ) : requiresProductionSetupToken && !hasValidSetupToken ? (
            <p className="notice">
              Production setup requires the bootstrap token. Open this page with `?setupToken=...` using the value of
              `SETUP_ACCESS_TOKEN`.
            </p>
          ) : (
            <SetupWizard initialReadiness={readiness} setupAccessToken={setupAccessToken || null} />
          )}
        </section>
        <section className="panel-visual" aria-label="Setup Visual" data-motion-item="setup-visual">
          <div className="hero-image contact-hero" role="img" aria-label="Studio visual" data-motion-item="setup-hero" />
        </section>
      </main>
    </AdminAuthShell>
  );
}
