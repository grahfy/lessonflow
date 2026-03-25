"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                  alt=""
                  className="video-thumb-image"
                  loading="lazy"
                />
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
              <iframe
                title={activeVideo.title}
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.id}?autoplay=1`}
                className="video-embed"
                loading="eager"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
