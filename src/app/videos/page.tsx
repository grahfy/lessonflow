import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { VideosGridModal } from "@/components/videos-grid-modal";
import { buildPublicPageMetadata } from "@/lib/seo";
import { 
  PUBLIC_BRAND_NAME, 
  PRIMARY_SUBJECT,
  getSubjectLabel 
} from "@/lib/branding";
import { getContent } from "@/lib/cms";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Videos & Music | ${getSubjectLabel()} Performance Showcase`,
  path: "/videos",
  description:
    `Watch ${PRIMARY_SUBJECT.toLowerCase()} performance videos and explore original music written and performed by our team at ${PUBLIC_BRAND_NAME}.`
});

/**
 * Public media showcase page for teacher video and audio work.
 */
export default async function VideosPage() {
  const heroContent = await getContent("/videos", "hero", {
    kicker: "Videos & Music",
    title: `Watch and hear the sound behind the ${PRIMARY_SUBJECT.toLowerCase()} tuition.`,
    lead: `This page showcases our ${PRIMARY_SUBJECT.toLowerCase()} performance videos and original music. It is a quick way to get a feel for our musical voice and approach before booking your lessons.`,
    visualLabel: "Performance showcase",
    visualClassName: "teacher-hero"
  });

  const bodyContent = await getContent("/videos", "body", {
    helperText: "Original music showcased here is written, arranged, and performed by our teachers.",
    videos: [
      { id: "0M9ZXR2yw0A", title: "Video Showcase 1" },
      { id: "qPTGx0iQKoc", title: "Video Showcase 2" },
      { id: "OQiUAlJGfBM", title: "Video Showcase 3" }
    ]
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      viewClassName="view-videos-page"
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified
    >
      <p className="helper-text copy-justify" data-motion-item="videos-helper-text">
        {bodyContent.helperText}
      </p>

      <VideosGridModal videos={bodyContent.videos} />

      <div className="button-row" data-motion-item="videos-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="videos-action-book">
          Book {getSubjectLabel()} Tuition
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/teacher" data-motion-item="videos-action-teacher">
          Meet Your Teacher
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
