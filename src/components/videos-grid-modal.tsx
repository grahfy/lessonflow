"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TweenLink } from "@/components/motion/tween-link";
import { AppDialog } from "@/components/ui/app-dialog";
import {
  hasPublicCookieConsentForOptionalFeatures,
  type PublicCookieConsent,
  readPublicCookieConsent,
  writePublicCookieConsent
} from "@/lib/public-cookie-consent";

type VideoItem = {
  id: string;
  title: string;
};

type VideosGridModalProps = {
  videos: readonly VideoItem[];
};

/**
 * Renders compact video cards that open the selected YouTube video in a popup modal.
 *
 * This keeps the marketing page layout compact while still allowing full-size playback.
 */
export function VideosGridModal({ videos }: VideosGridModalProps) {
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [consent, setConsent] = useState<PublicCookieConsent>("unknown");

  const activeVideo = useMemo(
    () => videos.find((video) => video.id === openVideoId) ?? null,
    [videos, openVideoId]
  );

  const closeModal = useCallback(() => {
    setOpenVideoId(null);
  }, []);

  useEffect(() => {
    setConsent(readPublicCookieConsent());
  }, []);

  const canPlayVideo = consent !== "unknown" && hasPublicCookieConsentForOptionalFeatures();
  const canLoadRemoteVideoAssets = canPlayVideo;

  function handleAcceptOptionalCookies() {
    writePublicCookieConsent("accepted");
    setConsent("accepted");
  }

  return (
    <>
      <div className="card-grid" data-motion-item="videos-grid">
        {videos.map((video) => (
          <article className="info-card video-card" data-motion-item="video-card" key={video.id}>
            <h3>{video.title}</h3>
            <button
              type="button"
              className="video-launch-button"
              onClick={() => setOpenVideoId(video.id)}
              aria-label={`Open ${video.title} video popup`}
            >
              <div className="video-embed-frame" aria-hidden="true">
                {canLoadRemoteVideoAssets ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                    alt=""
                    className="video-thumb-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="video-thumb-placeholder">
                    <span className="video-thumb-placeholder-mark" aria-hidden="true">
                      ▶
                    </span>
                  </div>
                )}
                <span className="video-thumb-overlay">Play Video</span>
              </div>
            </button>
          </article>
        ))}
      </div>

      {activeVideo ? (
        <AppDialog
          isOpen
          onClose={closeModal}
          size="media"
          ariaLabel={`${activeVideo.title} video popup`}
        >
          <div className="video-modal-frame">
            {canPlayVideo ? (
              <iframe
                title={activeVideo.title}
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.id}?autoplay=1`}
                className="video-embed"
                loading="eager"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="video-consent-card">
                <p className="video-consent-kicker">Consent required</p>
                <h3>Accept optional cookies to play this video.</h3>
                <p>
                  This player loads YouTube, which may set or use non-essential cookies. You can review the
                  details in our <TweenLink href="/privacy">Privacy Policy</TweenLink>.
                </p>
                <div className="video-consent-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Close
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleAcceptOptionalCookies}>
                    Accept optional cookies
                  </button>
                </div>
              </div>
            )}
          </div>
        </AppDialog>
      ) : null}
    </>
  );
}
