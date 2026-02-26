import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { VideosGridModal } from "@/components/videos-grid-modal";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Videos & Music | Jon King Guitar Showcase",
  path: "/videos",
  description:
    "Watch guitar performance videos featuring Jon King and explore original guitar-oriented music written, arranged, performed, mixed, and mastered by Jon King."
});

/**
 * Public media showcase page for Jon King's video and audio work.
 *
 * This page supports the marketing site by giving visitors a quick way to hear and see Jon's
 * playing style before booking guitar tuition.
 */
export default function VideosPage() {
  const youtubeEmbeds = [
    { id: "0M9ZXR2yw0A", title: "Jon King Video Showcase 1" },
    { id: "qPTGx0iQKoc", title: "Jon King Video Showcase 2" },
    { id: "VM8UmR9Atgo", title: "Jon King Video Showcase 3" }
  ] as const;

  return (
    <PanelLayout
      kicker="Videos & Music"
      title="Watch Jon King play and hear the sound behind the tuition."
      lead="This page showcases Jon King’s guitar performance videos and original guitar-oriented music. It is a quick way to get a feel for his playing, musical voice, and production approach before booking guitar tuition."
      viewClassName="view-videos-page"
      visualLabel="Performance showcase"
      visualClassName="teacher-hero"
      leadJustified
    >
      <p className="helper-text" data-motion-item="videos-helper-text">
        Original music on SoundCloud is written, arranged, performed, mixed, and mastered by Jon King.
      </p>

      <VideosGridModal videos={youtubeEmbeds} />

      <div className="button-row" data-motion-item="videos-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="videos-action-book">
          Book Guitar Tuition
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/teacher" data-motion-item="videos-action-teacher">
          More About Jon King
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
