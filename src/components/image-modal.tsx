"use client";

import { useCallback, useState } from "react";
import Image from "next/image";

import { AppDialog } from "@/components/ui/app-dialog";

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

      <AppDialog isOpen={isOpen} onClose={closeModal} size="media" ariaLabel={alt}>
        <div className="dialog-media-image-container">
          <Image src={src} alt={alt} fill className="dialog-media-image" sizes="90vw" />
        </div>
        {caption && <p className="dialog-media-caption">{caption}</p>}
      </AppDialog>
    </>
  );
}
