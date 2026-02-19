import { PropsWithChildren, ReactNode } from "react";

type PanelLayoutProps = PropsWithChildren<{
  kicker: string;
  title: string;
  lead: string;
  visualLabel: string;
  visualClassName?: string;
  footerCopy: string;
  leadJustified?: boolean;
  actions?: ReactNode;
  secondary?: ReactNode;
}>;

import { SiteShell } from "@/components/site-shell";

export function PanelLayout({
  kicker,
  title,
  lead,
  visualLabel,
  visualClassName,
  footerCopy,
  leadJustified = false,
  actions,
  secondary,
  children
}: PanelLayoutProps) {
  return (
    <SiteShell footerCopy={footerCopy}>
      <main className="view" aria-label="Page Content" data-motion-item="view">
        <section className="panel-copy" data-motion-item="copy">
          <p className="kicker" data-motion-item="kicker">
            {kicker}
          </p>
          <h1 data-motion-item="title">{title}</h1>
          <p className={leadJustified ? "lead copy-justify" : "lead"} data-motion-item="lead">
            {lead}
          </p>
          {actions}
          {children}
          {secondary}
        </section>

        <section className="panel-visual" aria-label={`${visualLabel} visual`} data-motion-item="visual">
          <div className={`hero-image ${visualClassName || ""}`} role="img" aria-label={`${visualLabel} visual`} data-motion-item="hero" />
          <div className="film-strip" aria-hidden="true" data-motion-item="film-strip">
            <div className="thumb"></div>
            <div className="thumb"></div>
            <div className="thumb"></div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
