"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

import { Tooltip } from "@/components/admin/ui/tooltip";

type ImageModalProps = {
  src: string;
  alt: string;
  triggerText: string;
  caption?: string;
};

export function ImageModal({ src, alt, triggerText, caption }: ImageModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, closeModal]);

  return (
    <>
      <button
        ref={triggerRef}
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
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Tooltip content="Close image preview.">
              <button
                ref={closeRef}
                type="button"
                onClick={closeModal}
                className="modal-close"
                aria-label="Close"
              >
                ×
              </button>
            </Tooltip>
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
