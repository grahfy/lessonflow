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
      <main className="view" aria-label="Page Content">
        <section className="panel-copy">
          <p className="kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className={leadJustified ? "lead copy-justify" : "lead"}>{lead}</p>
          {actions}
          {children}
          {secondary}
        </section>

        <section className="panel-visual" aria-label={`${visualLabel} visual`}>
          <div className={`hero-image ${visualClassName || ""}`} role="img" aria-label={`${visualLabel} visual`} />
          <div className="film-strip" aria-hidden="true">
            <div className="thumb"></div>
            <div className="thumb"></div>
            <div className="thumb"></div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
