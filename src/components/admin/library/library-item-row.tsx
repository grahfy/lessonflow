"use client";

import { useId, useRef, useState } from "react";
import NextImage from "next/image";
import {
  ChevronRight,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Music,
  Pencil,
  RefreshCw,
  Tags,
  Trash2,
  UserPlus,
  type LucideIcon
} from "lucide-react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { PracticeAudioPlayer } from "@/components/ui/practice-audio-player";
import type { LibraryItemRow as LibraryItem } from "@/lib/admin/use-library";
import styles from "./library.module.css";

interface LibraryItemRowProps {
  item: LibraryItem;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onEditTags: (item: LibraryItem) => void;
  onAssign: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onReplaceFile: (item: LibraryItem, file: File) => void;
}

/** The Artist tag doubles as the "artist" line on a track row. */
function artistOf(item: LibraryItem): string | null {
  return item.tags.find((tag) => tag.category === "Artist")?.value ?? null;
}

/** Non-artist tags shown as inline chips on the row (artist has its own line). */
function displayTags(item: LibraryItem) {
  return item.tags.filter((tag) => tag.category !== "Artist");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatLabel(item: LibraryItem): string {
  const subtype = item.mimeType.split("/")[1] || item.materialType;
  return subtype.toUpperCase();
}

function TypeIcon({ type }: { type: LibraryItem["materialType"] }) {
  if (type === "audio") return <Music size={16} />;
  if (type === "image") return <ImageIcon size={16} />;
  return <FileText size={16} />;
}

/** One tooltip-wrapped row action button. Shared by the expanded row's action bar. */
function RowActionButton({
  tooltip,
  icon: Icon,
  label,
  disabled,
  onClick
}: {
  tooltip: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={tooltip}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onClick}>
        <Icon size={13} style={{ marginRight: 4 }} /> {label}
      </button>
    </Tooltip>
  );
}

/**
 * One item in the library track list. Collapsed it reads like a setlist line
 * (icon · title · artist · facet chips · format/size); expanded it reveals the
 * inline preview (PracticeAudioPlayer for audio) and the management actions.
 */
export function LibraryItemRow({
  item,
  expanded,
  busy,
  onToggle,
  onEditTags,
  onAssign,
  onEdit,
  onDelete,
  onReplaceFile
}: LibraryItemRowProps) {
  const fileInputId = useId();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const artist = artistOf(item);
  const tags = displayTags(item);

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.rowHead}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`${styles.rowIcon} ${item.materialType === "audio" ? styles.rowIconAudio : ""}`}>
          <TypeIcon type={item.materialType} />
        </span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitleLine}>
            <span className={styles.rowTitle}>{item.title}</span>
            {artist ? <span className={styles.rowArtist}>{artist}</span> : null}
          </span>
          {tags.length > 0 ? (
            <span className={styles.rowTags}>
              {tags.map((tag) => (
                <span key={tag.id} className={styles.rowTag}>
                  {tag.value}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className={styles.rowMeta}>
          <span>{formatLabel(item)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(item.sizeBytes)}</span>
        </span>
        <ChevronRight
          size={16}
          className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className={styles.panel}>
          {item.description ? <p className={styles.panelDesc}>{item.description}</p> : null}

          {item.materialType === "audio" ? (
            <PracticeAudioPlayer src={item.previewUrl} className={styles.player} />
          ) : null}

          {item.materialType === "image" ? (
            imageFailed ? (
              <p className={styles.previewDoc}>Preview unavailable. Open the file directly.</p>
            ) : (
              <NextImage
                src={item.previewUrl}
                alt={item.title}
                width={420}
                height={160}
                unoptimized
                className={styles.previewImage}
                onError={() => setImageFailed(true)}
              />
            )
          ) : null}

          {item.materialType === "pdf" ? (
            <div className={styles.previewDoc}>
              <FileText size={16} />
              <span>PDF document ({formatBytes(item.sizeBytes)})</span>
            </div>
          ) : null}

          <div className={styles.rowActions}>
            <RowActionButton
              tooltip="Open the master file in a new tab."
              icon={Eye}
              label="Preview"
              onClick={() => window.open(item.previewUrl, "_blank")}
            />
            <Tooltip content="Download the master file.">
              <a href={item.downloadUrl} download className="btn btn-secondary btn-sm">
                <Download size={13} style={{ marginRight: 4 }} /> Download
              </a>
            </Tooltip>
            <RowActionButton tooltip="Edit the title or description." icon={Pencil} label="Edit" disabled={busy} onClick={() => onEdit(item)} />
            <RowActionButton
              tooltip="Add or remove typed tags."
              icon={Tags}
              label="Tags"
              onClick={() => onEditTags(item)}
            />
            <RowActionButton
              tooltip="Assign this item to students."
              icon={UserPlus}
              label="Assign"
              onClick={() => onAssign(item)}
            />
            <RowActionButton
              tooltip="Replace the master file. Every assignee streams the new file."
              icon={RefreshCw}
              label="Replace"
              disabled={busy}
              onClick={() => replaceInputRef.current?.click()}
            />
            <RowActionButton
              tooltip="Delete this item for everyone."
              icon={Trash2}
              label="Delete"
              disabled={busy}
              onClick={() => onDelete(item)}
            />
            <input
              id={fileInputId}
              ref={replaceInputRef}
              type="file"
              accept="application/pdf,audio/*,image/*"
              className="admin-visually-hidden-input"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onReplaceFile(item, file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
