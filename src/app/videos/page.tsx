import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
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

      <div className="card-grid" data-motion-item="videos-grid">
        {youtubeEmbeds.map((video) => (
          <article className="info-card video-card" data-motion-item="video-card" key={video.id}>
            <h3>{video.title}</h3>
            <div className="video-embed-frame">
              <iframe
                title={video.title}
                src={`https://www.youtube-nocookie.com/embed/${video.id}`}
                className="video-embed"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </article>
        ))}
      </div>

      <section className="soundcloud-card" data-motion-item="soundcloud-section" aria-label="SoundCloud showcase">
        <h3>Original Guitar-Oriented Music</h3>
        <p className="helper-text">
          SoundCloud showcase featuring original guitar-oriented songs by Jon King.
        </p>
        <div className="soundcloud-embed-frame">
          <iframe
            title="Jon King SoundCloud"
            className="soundcloud-embed"
            scrolling="no"
            frameBorder="no"
            allow="autoplay"
            src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/jon-king-383799891&color=%230f3d63&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true"
          />
        </div>
      </section>

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
