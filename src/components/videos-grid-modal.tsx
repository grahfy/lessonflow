"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TweenLink } from "@/components/motion/tween-link";
import { Tooltip } from "@/components/admin/ui/tooltip";
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const activeVideo = useMemo(
    () => videos.find((video) => video.id === openVideoId) ?? null,
    [videos, openVideoId]
  );

  const closeModal = useCallback(() => {
    setOpenVideoId(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setConsent(readPublicCookieConsent());
  }, []);

  useEffect(() => {
    if (!activeVideo) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeVideo, closeModal]);

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
              ref={(el) => { if (video.id === openVideoId) triggerRef.current = el; }}
              onClick={() => {
                triggerRef.current = document.activeElement as HTMLButtonElement;
                setOpenVideoId(video.id);
              }}
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
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`${activeVideo.title} video popup`}
        >
          <div className="modal-content video-modal-content" onClick={(event) => event.stopPropagation()}>
            <Tooltip content="Close video.">
              <button ref={closeRef} type="button" onClick={closeModal} className="modal-close" aria-label="Close video">
                ×
              </button>
            </Tooltip>
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
          </div>
        </div>
      ) : null}
    </>
  );
}
