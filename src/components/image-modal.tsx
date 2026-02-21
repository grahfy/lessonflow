"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

type ImageModalProps = {
  src: string;
  alt: string;
  triggerText: string;
  caption?: string;
};

export function ImageModal({ src, alt, triggerText, caption }: ImageModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, closeModal]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="btn btn-secondary"
        data-motion-item="map-button"
      >
        {triggerText}
      </button>

      {isOpen && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          onKeyDown={(e) => e.key === "Escape" && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <div className="modal-content">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeModal();
              }}
              className="modal-close"
              aria-label="Close"
            >
              ×
            </button>
            <div className="modal-image-container">
              <Image src={src} alt={alt} fill className="modal-image" sizes="90vw" />
            </div>
            {caption && <p className="modal-caption">{caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}
