"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import NextImage from "next/image";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderOpen,
  FileText,
  Music,
  Image as ImageIcon,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Download,
  Eye,
  Search,
  Copy,
  GripVertical,
  Library
} from "lucide-react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { GuitarProViewerDialog } from "@/components/ui/guitar-pro-viewer";
import { PracticeAudioPlayer } from "@/components/ui/practice-audio-player";
import { useTreeDrag } from "@/lib/materials/use-tree-drag";
import styles from "./unified-material-tree.module.css";

export interface TreeFolder {
  id: string;
  parentId: string | null;
  name: string;
  children: TreeFolder[];
}

export interface TreeFile {
  id: string;
  title: string;
  description: string | null;
  folderId: string | null;
  mimeType: string;
  // guitar_pro is representable (shared enum) but per-customer surfaces never
  // produce it; the type branches below fall through to plain download links.
  materialType: "audio" | "pdf" | "image" | "guitar_pro";
  sizeBytes: number;
  /** Shared display order within the folder. 0 = unpinned (sorts to the top). */
  sortOrder: number;
  /**
   * Set for a teacher-assigned shared library item (tree id `lib:<itemId>`).
   * Those rows are a shared master: rename/copy/delete/promote must not reach
   * them, but move/reorder must, so they stay placeable in the tree.
   */
  libraryItemId?: string | null;
  createdAt: string;
  previewUrl?: string;
  downloadUrl?: string;
  // Student metadata context
  bookingStartAt?: string | null;
  lessonMode?: "in_person" | "video" | null;
}

interface UnifiedMaterialTreeProps {
  folders: TreeFolder[];
  materials: TreeFile[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  isReadOnly?: boolean;
  materialsDeletingId?: string | null;
  onDeleteMaterial?: (id: string) => void;
  // Admin folder actions
  onCreateFolder?: (name: string, parentId: string | null) => void;
  onRenameFolder?: (folder: TreeFolder) => void;
  onDeleteFolder?: (folder: TreeFolder) => void;
  onMoveFolder?: (folder: TreeFolder) => void;
  onCopyFolder?: (folder: TreeFolder) => void;
  onMoveMaterial?: (material: TreeFile) => void;
  onRenameMaterial?: (material: TreeFile) => void;
  onCopyMaterial?: (material: TreeFile) => void;
  /** "Add to library" — promotes a per-customer material into the shared library. */
  onPromoteMaterial?: (material: TreeFile) => void;
  /**
   * Drag-drop move. Absent ⇒ drag-and-drop is off entirely and the move dialog
   * is the only path. Deliberately NOT keyed off `isReadOnly`: the student
   * surface stays read-only for folder CRUD while still dragging its own files.
   */
  onDropMaterial?: (materialId: string, folderId: string | null, orderedIds: string[]) => void;
  onDropFolder?: (folderId: string, parentId: string | null) => void;
  /**
   * Keyboard/AT ordering path. The drag grips are `aria-hidden` + `tabIndex={-1}`,
   * so on a surface without the Move-material dialog these two buttons are the
   * ONLY accessible way to reorder. Gated on this callback rather than
   * `!isReadOnly` — same reason `dndEnabled` keys off `onDropMaterial`.
   */
  onReorder?: (folderId: string | null, movedId: string, orderedIds: string[]) => void;
}

/** Recursively checks if a folder or any of its children match the search query. */
function matchesSearch(folder: TreeFolder, materials: TreeFile[], query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  
  if (folder.name.toLowerCase().includes(q)) return true;

  const folderFiles = materials.filter((m) => m.folderId === folder.id);
  if (
    folderFiles.some(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
    )
  ) {
    return true;
  }

  return folder.children.some((child) => matchesSearch(child, materials, query));
}

/** Recursively flattens and retrieves all folder IDs under a folder tree node. */
function getAllFolderIds(nodes: TreeFolder[]): string[] {
  const ids: string[] = [];
  const walk = (list: TreeFolder[]) => {
    for (const node of list) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}



export function UnifiedMaterialTree({
  folders,
  materials,
  currentFolderId,
  onNavigate,
  isReadOnly = false,
  materialsDeletingId = null,
  onDeleteMaterial,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onCopyFolder,
  onMoveMaterial,
  onRenameMaterial,
  onCopyMaterial,
  onPromoteMaterial,
  onDropMaterial,
  onDropFolder,
  onReorder
}: UnifiedMaterialTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    // Root is open by default
    __root__: true
  });
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [failedPreviewIds, setFailedPreviewIds] = useState<string[]>([]);
  const [openGpId, setOpenGpId] = useState<string | null>(null);

  // Expand all folders containing query matches when searching
  useEffect(() => {
    if (!searchQuery) return;
    const expandedMap: Record<string, boolean> = { __root__: true };
    const walk = (list: TreeFolder[]) => {
      for (const node of list) {
        if (matchesSearch(node, materials, searchQuery)) {
          expandedMap[node.id] = true;
        }
        walk(node.children);
      }
    };
    walk(folders);
    setExpandedFolders((prev) => ({ ...prev, ...expandedMap }));
  }, [searchQuery, folders, materials]);

  const handleToggleFolder = (folderId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleToggleFile = (fileId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedFiles((prev) => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  const handleExpandAll = () => {
    const allIds = getAllFolderIds(folders);
    const expandedMap: Record<string, boolean> = { __root__: true };
    for (const id of allIds) {
      expandedMap[id] = true;
    }
    setExpandedFolders(expandedMap);
  };

  const handleCollapseAll = () => {
    setExpandedFolders({ __root__: true });
    setExpandedFiles({});
  };

  // While searching, `filteredMaterials` drives each folder's file list, so a
  // rendered row's position is not its real position — hit-testing would move
  // the wrong thing. The search guard disables the whole gesture, not just the
  // highlight.
  const dndEnabled = !searchQuery && Boolean(onDropMaterial);

  // Polite live region: a reorder (drag OR button) otherwise completes with no
  // feedback at all for a screen-reader user.
  const [announcement, setAnnouncement] = useState("");

  /** Folder label for announcements. Root's visible label is "/", which reads badly. */
  const folderLabel = (folderId: string | null): string => {
    if (folderId === null) return "the top level";
    const find = (list: TreeFolder[]): TreeFolder | null => {
      for (const node of list) {
        if (node.id === folderId) return node;
        const hit = find(node.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(folders)?.name ?? "another folder";
  };

  const announceMove = (title: string, folderId: string | null, orderedIds: string[], movedId: string) => {
    const position = orderedIds.indexOf(movedId) + 1;
    setAnnouncement(`${title} moved to ${folderLabel(folderId)}, position ${position} of ${orderedIds.length}`);
  };

  /** The file's position within its folder's file order. */
  const reorderSiblings = (file: TreeFile) => {
    const ids = materials.filter((m) => m.folderId === file.folderId).map((m) => m.id);
    return { ids, index: ids.indexOf(file.id) };
  };

  const moveBy = (file: TreeFile, delta: -1 | 1) => {
    if (!onReorder) return;
    const { ids, index } = reorderSiblings(file);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    reordered.splice(index, 1);
    reordered.splice(next, 0, file.id);
    announceMove(file.title, file.folderId, reordered, file.id);
    onReorder(file.folderId, file.id, reordered);
  };

  const dnd = useTreeDrag({
    enabled: dndEnabled,
    rootRef: containerRef,
    scrollRef: viewportRef,
    folders,
    materials,
    onHoverFolder: (folderId) =>
      setExpandedFolders((prev) => (prev[folderId] ? prev : { ...prev, [folderId]: true })),
    onDrop: (item, resolved) => {
      if (item.kind === "file") {
        announceMove(item.label, resolved.folderId, resolved.orderedIds, item.id);
        onDropMaterial?.(item.id, resolved.folderId, resolved.orderedIds);
      } else {
        onDropFolder?.(item.id, resolved.folderId);
      }
    }
  });

  // Filter materials and folders by search query
  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materials;
    const q = searchQuery.toLowerCase();
    return materials.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [materials, searchQuery]);

  const isFolderVisible = (folder: TreeFolder): boolean => {
    if (!searchQuery) return true;
    return matchesSearch(folder, materials, searchQuery);
  };

  const isFileVisible = (file: TreeFile): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      file.title.toLowerCase().includes(q) ||
      !!(file.description && file.description.toLowerCase().includes(q))
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getFileIcon = (type: TreeFile["materialType"]) => {
    switch (type) {
      case "audio":
        return <Music className={`${styles.nodeIcon} ${styles.audioIcon}`} />;
      case "pdf":
        return <FileText className={`${styles.nodeIcon} ${styles.pdfIcon}`} />;
      case "image":
        return <ImageIcon className={`${styles.nodeIcon} ${styles.imageIcon}`} />;
      default:
        return <FileText className={`${styles.nodeIcon} ${styles.fileIcon}`} />;
    }
  };

  // Helper to render inline previews
  const renderInlinePreview = (file: TreeFile) => {
    // A `lib:` row has no /api/admin/learning-materials/{id} route, so the
    // fallback would build a URL that 404s. Its previewUrl is always set.
    const rawUrl = file.libraryItemId
      ? file.previewUrl ?? ""
      : file.previewUrl || `/api/admin/learning-materials/${file.id}`;
    const dlUrl = file.downloadUrl || `/api/admin/learning-materials/${file.id}`;

    return (
      <div className={styles.previewContainer} onClick={(e) => e.stopPropagation()}>
        {file.description ? (
          <p className={styles.previewDescription}>{file.description}</p>
        ) : null}

        {file.materialType === "audio" ? (
          <PracticeAudioPlayer src={rawUrl} className={styles.previewPlayer} size="large" />
        ) : null}

        {file.materialType === "image" ? (
          failedPreviewIds.includes(file.id) ? (
            <p className={styles.previewDescription}>Preview unavailable. Open the file directly.</p>
          ) : (
            <NextImage
              src={rawUrl}
              alt={file.title}
              width={400}
              height={140}
              unoptimized
              draggable={false}
              className={styles.previewImage}
              onError={() => setFailedPreviewIds((prev) => [...prev, file.id])}
            />
          )
        ) : null}

        {file.materialType === "pdf" ? (
          <div className={styles.previewDocInfo}>
            <FileText size={16} className={styles.pdfIcon} />
            <span>PDF Document ({formatBytes(file.sizeBytes)})</span>
          </div>
        ) : null}

        {file.materialType === "guitar_pro" ? (
          <div className={styles.previewDocInfo}>
            <FileText size={16} className={styles.fileIcon} />
            <span>Guitar Pro tab ({formatBytes(file.sizeBytes)})</span>
          </div>
        ) : null}

        <div className={styles.previewActions}>
          {file.materialType === "guitar_pro" ? (
            <Tooltip content="Open the interactive Guitar Pro viewer.">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpenGpId(file.id)}
              >
                <Eye size={13} style={{ marginRight: "4px" }} /> View
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Open file in a new browser tab.">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => window.open(rawUrl, "_blank")}
              >
                <Eye size={13} style={{ marginRight: "4px" }} /> Preview
              </button>
            </Tooltip>
          )}
          <Tooltip content="Download file directly to your device.">
            {/* draggable={false}: a natively dragged anchor writes DownloadURL
                into dataTransfer, which hijacks the pointer gesture. */}
            <a href={dlUrl} download draggable={false} className="btn btn-secondary btn-sm">
              <Download size={13} style={{ marginRight: "4px" }} /> Download
            </a>
          </Tooltip>
        </div>
      </div>
    );
  };

  // Recursive component to render folders
  const renderFolderNode = (folder: TreeFolder) => {
    if (!isFolderVisible(folder)) return null;

    const isExpanded = !!expandedFolders[folder.id];
    const isActive = currentFolderId === folder.id;
    const folderFiles = filteredMaterials.filter((m) => m.folderId === folder.id);
    const folderChildren = folder.children;
    const hasContents = folderChildren.length > 0 || folderFiles.length > 0;

    return (
      <div key={folder.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${isActive ? styles.activeFolder : ""} ${
            dnd.active && dnd.dropFolderId === folder.id ? styles.dropInto : ""
          }`}
          data-drop-id={folder.id}
          data-drop-kind="folder"
          onClick={() => {
            onNavigate(folder.id);
            if (hasContents) {
              handleToggleFolder(folder.id);
            }
          }}
        >
          {dndEnabled && onDropFolder ? (
            <button
              type="button"
              className={styles.dragHandle}
              // Pointer-only affordance: the keyboard/AT path is the Move
              // dialog. A focusable, opacity-0 grip on every row would add 50+
              // dead tab stops (Enter/Space do nothing here). aria-hidden alone
              // on a focusable element is itself a violation, so both.
              tabIndex={-1}
              aria-hidden="true"
              // pointerup on a child still fires the row's onClick (navigate +
              // collapse), so the grip must swallow the click like the action
              // clusters below do.
              onClick={(e) => e.stopPropagation()}
              {...dnd.handleProps({ kind: "folder", id: folder.id, label: folder.name })}
            >
              <GripVertical size={14} />
            </button>
          ) : null}

          {/* Chevron */}
          <div
            className={styles.chevronContainer}
            onClick={(e) => {
              if (hasContents) {
                handleToggleFolder(folder.id, e);
              } else {
                e.stopPropagation();
              }
            }}
          >
            {hasContents ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : null}
          </div>

          {/* Folder Icon */}
          {isExpanded ? (
            <FolderOpen className={`${styles.nodeIcon} ${styles.folderIcon}`} />
          ) : (
            <Folder className={`${styles.nodeIcon} ${styles.folderIcon}`} />
          )}

          {/* Folder Name */}
          <div className={styles.nodeContent}>
            <span className={styles.nodeTitle}>{folder.name}</span>
          </div>

          {/* Admin actions on hover */}
          {!isReadOnly && (
            <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
              {onCreateFolder && (
                <Tooltip content="Create folder inside this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`New folder in ${folder.name}`}
                    onClick={() => onCreateFolder("", folder.id)}
                  >
                    <Plus size={14} />
                  </button>
                </Tooltip>
              )}
              {onRenameFolder && (
                <Tooltip content="Rename this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`Rename folder ${folder.name}`}
                    onClick={() => onRenameFolder(folder)}
                  >
                    <Pencil size={14} />
                  </button>
                </Tooltip>
              )}
              {onMoveFolder && (
                <Tooltip content="Move this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`Move folder ${folder.name}`}
                    onClick={() => onMoveFolder(folder)}
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                </Tooltip>
              )}
              {onCopyFolder && (
                <Tooltip content="Copy this folder.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`Copy folder ${folder.name}`}
                    onClick={() => onCopyFolder(folder)}
                  >
                    <Copy size={14} />
                  </button>
                </Tooltip>
              )}
              {onDeleteFolder && (
                <Tooltip content="Delete this folder. Contents move to parent.">
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    aria-label={`Delete folder ${folder.name}`}
                    onClick={() => onDeleteFolder(folder)}
                  >
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {/* Children Render */}
        {isExpanded && hasContents && (
          <div className={styles.childrenContainer}>
            {folderChildren.map((child) => renderFolderNode(child))}
            {folderFiles.map((file) => renderFileNode(file))}
          </div>
        )}
      </div>
    );
  };

  // Renders a file node
  const renderFileNode = (file: TreeFile) => {
    if (!isFileVisible(file)) return null;

    const isExpanded = !!expandedFiles[file.id];
    const isDeleting = materialsDeletingId === file.id;

    // Formatting date
    const dateStr = new Date(file.createdAt).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    return (
      <div key={file.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${styles.activeFile}`}
          data-drop-id={file.id}
          data-drop-kind="file"
          onClick={() => handleToggleFile(file.id)}
        >
          {dndEnabled ? (
            <button
              type="button"
              className={styles.dragHandle}
              tabIndex={-1}
              aria-hidden="true"
              onClick={(e) => e.stopPropagation()}
              {...dnd.handleProps({ kind: "file", id: file.id, label: file.title })}
            >
              <GripVertical size={14} />
            </button>
          ) : null}

          {/* File Icon */}
          {getFileIcon(file.materialType)}

          {/* File Meta */}
          <div className={styles.nodeContent}>
            <span className={styles.nodeTitle}>{file.title}</span>
            <div className={styles.nodeMeta}>
              <span>{formatBytes(file.sizeBytes)}</span>
              <span className={styles.metaDivider}>·</span>
              <span>{dateStr}</span>
              {file.bookingStartAt && (
                <>
                  <span className={styles.metaDivider}>·</span>
                  <span className={styles.bookingChip}>
                    Lesson: {new Date(file.bookingStartAt).toLocaleDateString("en-AU")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions on hover */}
          <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
            {onReorder ? (
              <>
                <Tooltip content="Move this file up one position.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`Move ${file.title} up`}
                    disabled={reorderSiblings(file).index <= 0}
                    onClick={() => moveBy(file, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                </Tooltip>
                <Tooltip content="Move this file down one position.">
                  <button
                    type="button"
                    className={styles.actionBtn}
                    aria-label={`Move ${file.title} down`}
                    disabled={(() => {
                      const { index, ids } = reorderSiblings(file);
                      return index < 0 || index >= ids.length - 1;
                    })()}
                    onClick={() => moveBy(file, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </Tooltip>
              </>
            ) : null}
            {!isReadOnly && !file.libraryItemId && onRenameMaterial && (
              <Tooltip content="Rename file.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  aria-label="Rename material"
                  onClick={() => onRenameMaterial(file)}
                >
                  <Pencil size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && onMoveMaterial && (
              <Tooltip content="Move file to another folder.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  aria-label="Move material"
                  onClick={() => onMoveMaterial(file)}
                >
                  <ArrowRightLeft size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && !file.libraryItemId && onCopyMaterial && (
              <Tooltip content="Copy file.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  aria-label="Copy material"
                  onClick={() => onCopyMaterial(file)}
                >
                  <Copy size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && !file.libraryItemId && onPromoteMaterial && (
              <Tooltip content="Add a copy of this file to the shared library.">
                <button
                  type="button"
                  className={styles.actionBtn}
                  aria-label="Add material to library"
                  onClick={() => onPromoteMaterial(file)}
                >
                  <Library size={14} />
                </button>
              </Tooltip>
            )}
            {!isReadOnly && !file.libraryItemId && onDeleteMaterial && (
              <Tooltip content="Delete this file permanently.">
                <button
                  type="button"
                  disabled={isDeleting}
                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  aria-label="Delete material"
                  onClick={() => onDeleteMaterial(file.id)}
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Expandable Preview */}
        {isExpanded && renderInlinePreview(file)}
      </div>
    );
  };

  const rootFiles = filteredMaterials.filter((m) => m.folderId === null);
  const rootFolders = folders;
  const isRootActive = currentFolderId === null;
  const hasRootContents = rootFolders.length > 0 || rootFiles.length > 0;
  const isRootExpanded = !!expandedFolders.__root__;

  // Resolve the open Guitar Pro file from the FULL materials list (not the
  // filtered one) so the viewer's mount is driven solely by `openGpId` — a
  // search change or a "Collapse All" cannot unmount an open viewer.
  const openGpFile = openGpId ? materials.find((m) => m.id === openGpId) ?? null : null;

  return (
    <div className={styles.treeContainer} ref={containerRef}>
      <p className={styles.srStatus} aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* Search Input */}
      <div className={styles.searchBar}>
        <Search className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search files and folders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Toolbar */}
      <div className={styles.treeHeader}>
        <span className={styles.treeTitle}>Explorer</span>
        <div className={styles.treeToolbar}>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleExpandAll}
          >
            Expand All
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleCollapseAll}
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className={styles.treeViewport} ref={viewportRef}>
        {!hasRootContents && searchQuery ? (
          <p className={styles.emptyState}>No matches found for &quot;{searchQuery}&quot;</p>
        ) : (
          <div className={styles.nodeWrapper}>
            {/* Synthetic Root Folder Node */}
            <div
              className={`${styles.nodeRow} ${isRootActive ? styles.activeFolder : ""} ${
                dnd.active && dnd.dropFolderId === null ? styles.dropInto : ""
              }`}
              data-drop-id="__root__"
              data-drop-kind="root"
              onClick={() => {
                onNavigate(null);
                handleToggleFolder("__root__");
              }}
            >
              <div
                className={styles.chevronContainer}
                onClick={(e) => handleToggleFolder("__root__", e)}
              >
                {isRootExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {isRootExpanded ? (
                <FolderOpen className={`${styles.nodeIcon} ${styles.folderIcon}`} />
              ) : (
                <Folder className={`${styles.nodeIcon} ${styles.folderIcon}`} />
              )}
              <div className={styles.nodeContent}>
                <span className={styles.nodeTitle}>/</span>
              </div>
              {!isReadOnly && onCreateFolder && (
                <div className={styles.nodeActions} onClick={(e) => e.stopPropagation()}>
                  <Tooltip content="Create folder at root level.">
                    <button
                      type="button"
                      className={styles.actionBtn}
                      aria-label="New folder"
                      onClick={() => onCreateFolder("", null)}
                    >
                      <Plus size={14} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Root Children */}
            {isRootExpanded && (
              <div className={styles.childrenContainer}>
                {rootFolders.map((folder) => renderFolderNode(folder))}
                {rootFiles.map((file) => renderFileNode(file))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag ghost. Rendered inside the tree's own (relatively positioned)
          root rather than portalled or fixed: `.admin-card`'s backdrop-filter
          and the preview keyframes' transform both create fixed-position
          containing blocks, which would displace a fixed overlay. */}
      {dnd.ghost ? (
        <div className={styles.dragGhost} style={{ left: dnd.ghost.x, top: dnd.ghost.y }} aria-hidden="true">
          {dnd.ghost.label}
        </div>
      ) : null}

      {openGpFile ? (
        <GuitarProViewerDialog
          isOpen
          onClose={() => setOpenGpId(null)}
          src={
            openGpFile.libraryItemId
              ? openGpFile.previewUrl ?? ""
              : openGpFile.previewUrl || `/api/admin/learning-materials/${openGpFile.id}`
          }
          downloadUrl={openGpFile.downloadUrl || `/api/admin/learning-materials/${openGpFile.id}`}
          title={openGpFile.title}
        />
      ) : null}
    </div>
  );
}
