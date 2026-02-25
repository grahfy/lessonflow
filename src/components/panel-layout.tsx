import { PropsWithChildren, ReactNode } from "react";

type PanelLayoutProps = PropsWithChildren<{
  kicker: string;
  title: string;
  lead: string;
  viewClassName?: string;
  visualLabel?: string;
  visualClassName?: string;
  leadJustified?: boolean;
  actions?: ReactNode;
  secondary?: ReactNode;
  visualContent?: ReactNode;
  hideVisual?: boolean;
}>;

export function PanelLayout({
  kicker,
  title,
  lead,
  viewClassName,
  visualLabel = "Section",
  visualClassName,
  leadJustified = false,
  actions,
  secondary,
  visualContent,
  hideVisual = false,
  children
}: PanelLayoutProps) {
  return (
    <main className={viewClassName ? `view ${viewClassName}` : "view"} aria-label="Page Content">
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

        {!hideVisual && (
          <section className="panel-visual" aria-label={`${visualLabel} visual`} data-motion-item="visual">
            {visualContent ? (
              visualContent
            ) : (
              <div className={`hero-image ${visualClassName || ""}`} role="img" aria-label={`${visualLabel} visual`} />
            )}
          </section>
        )}
      </div>
    </main>
  );
}
