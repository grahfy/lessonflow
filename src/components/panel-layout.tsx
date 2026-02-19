import { PropsWithChildren, ReactNode } from "react";

type PanelLayoutProps = PropsWithChildren<{
  kicker: string;
  title: string;
  lead: string;
  visualLabel: string;
  visualClassName?: string;
  leadJustified?: boolean;
  actions?: ReactNode;
  secondary?: ReactNode;
}>;

export function PanelLayout({
  kicker,
  title,
  lead,
  visualLabel,
  visualClassName,
  leadJustified = false,
  actions,
  secondary,
  children
}: PanelLayoutProps) {
  return (
    <main className="view" aria-label="Page Content">
      <div className="view-stage" data-motion-stage="true">
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
          <div className={`hero-image ${visualClassName || ""}`} role="img" aria-label={`${visualLabel} visual`} />
          <div className="film-strip" aria-hidden="true">
            <div className="thumb"></div>
            <div className="thumb"></div>
            <div className="thumb"></div>
          </div>
        </section>
      </div>
    </main>
  );
}
